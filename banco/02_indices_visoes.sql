-- =============================================================================
-- Índices, visões e função de apoio usados pelas consultas de sql/.
-- Executado depois da carga.
-- =============================================================================

CREATE INDEX idx_candidatura_eleicao  ON candidatura (cod_eleicao, cargo, ue);
CREATE INDEX idx_candidatura_politico ON candidatura (titulo_eleitoral);
CREATE INDEX idx_receita_candidato    ON receita (sq_candidato);
CREATE INDEX idx_despesa_candidato    ON despesa (sq_candidato);
CREATE INDEX idx_votos_cand_mun       ON votos_cand (cod_tse);
CREATE INDEX idx_votos_part_mun       ON votos_part (cod_tse, cod_eleicao);

-- Visões e funções de apoio usadas pelas consultas

CREATE VIEW vw_candidatura AS
SELECT c.*,
       e.ano,
       e.abrangencia,
       c.situacao_final IN ('ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA') AS eleito
FROM candidatura c
JOIN eleicao e ON e.cod_eleicao = c.cod_eleicao;

CREATE VIEW vw_patrimonio AS
SELECT c.sq_candidato,
       COALESCE(SUM(b.valor), 0) AS patrimonio_total
FROM candidatura c
LEFT JOIN bem b ON b.sq_candidato = c.sq_candidato
GROUP BY c.sq_candidato;

CREATE VIEW vw_qt_mandatos AS
SELECT p.titulo_eleitoral,
       COUNT(v.sq_candidato) FILTER (WHERE v.eleito) AS qt_mandatos
FROM politico p
LEFT JOIN vw_candidatura v ON v.titulo_eleitoral = p.titulo_eleitoral
GROUP BY p.titulo_eleitoral;

-- Retrospecto do mandato (pergunta 11) ----------------------------------------------

-- Participação de cada setor no valor adicionado e o setor que domina, por município/ano.
CREATE VIEW vw_estrutura_setorial AS
SELECT i.cod_tse, i.ano, v.vab_total,
       ROUND(100 * i.vab_agropecuaria / v.vab_total, 1) AS pct_agro,
       ROUND(100 * i.vab_industria    / v.vab_total, 1) AS pct_industria,
       ROUND(100 * i.vab_servicos     / v.vab_total, 1) AS pct_servicos,
       ROUND(100 * i.vab_adm_publica  / v.vab_total, 1) AS pct_adm_publica,
       d.setor AS setor_dominante
FROM indicador_anual i
CROSS JOIN LATERAL (
    SELECT NULLIF(COALESCE(i.vab_agropecuaria, 0) + COALESCE(i.vab_industria, 0)
                  + COALESCE(i.vab_servicos, 0) + COALESCE(i.vab_adm_publica, 0), 0) AS vab_total
) v
CROSS JOIN LATERAL (
    SELECT t.setor
    FROM (VALUES ('AGROPECUÁRIA', i.vab_agropecuaria), ('INDÚSTRIA', i.vab_industria),
                 ('SERVIÇOS', i.vab_servicos), ('ADMINISTRAÇÃO PÚBLICA', i.vab_adm_publica)) t (setor, val)
    ORDER BY t.val DESC NULLS LAST
    LIMIT 1
) d
WHERE v.vab_total IS NOT NULL;

-- Tudo por município/ano. Os homicídios começam em 2000 e o PIB em 2010, por isso a
-- junção é completa. taxa_homicidios_3a é a média dos últimos 3 anos (2 antes e o
-- próprio), que suaviza a oscilação dos municípios pequenos, onde uma morte muda a taxa.
CREATE VIEW vw_indicador_municipio AS
SELECT cod_tse, ano, pib, populacao, pib_per_capita, taxa_homicidios,
       CASE WHEN ano <= (SELECT MAX(ano) FROM homicidio_municipio)   -- sem dado, sem média: não inventa anos futuros
            THEN ROUND(AVG(taxa_homicidios) OVER (PARTITION BY cod_tse ORDER BY ano
                                                  RANGE BETWEEN 2 PRECEDING AND CURRENT ROW), 2) END AS taxa_homicidios_3a,
       pct_agro, pct_industria, pct_servicos, pct_adm_publica, setor_dominante
FROM (
    SELECT COALESCE(i.cod_tse, h.cod_tse) AS cod_tse, COALESCE(i.ano, h.ano) AS ano,
           i.pib, i.populacao, i.pib_per_capita, h.taxa AS taxa_homicidios,
           s.pct_agro, s.pct_industria, s.pct_servicos, s.pct_adm_publica, s.setor_dominante
    FROM indicador_anual i
    FULL JOIN homicidio_municipio h ON h.cod_tse = i.cod_tse AND h.ano = i.ano
    LEFT JOIN vw_estrutura_setorial s ON s.cod_tse = i.cod_tse AND s.ano = i.ano
) x;

-- Por UF: PIB e população somados; taxa de homicídios ponderada pela população dos
-- municípios que têm taxa no ano (o Atlas não publica todos os municípios todos os anos).
CREATE VIEW vw_indicador_uf AS
SELECT m.uf, v.ano,
       SUM(v.pib) AS pib,
       SUM(v.populacao) AS populacao,
       SUM(v.pib) / NULLIF(SUM(v.populacao), 0) AS pib_per_capita,
       SUM(v.taxa_homicidios * v.populacao)
           / NULLIF(SUM(v.populacao) FILTER (WHERE v.taxa_homicidios IS NOT NULL), 0) AS taxa_homicidios
FROM vw_indicador_municipio v
JOIN municipio m USING (cod_tse)
GROUP BY m.uf, v.ano;

-- Prefeito eleito: indicador no ano da eleição x último ano disponível dentro do mandato
-- (ano_eleicao + 1 a + 4). PIB e homicídios têm cada um o seu "último ano", porque a
-- publicação deles não termina no mesmo ano. A taxa de homicídios é a média de 3 anos.
-- Mostra o que mudou durante o mandato, não que o prefeito causou a mudança.
CREATE VIEW vw_retrospecto_prefeito AS
SELECT c.sq_candidato, c.titulo_eleitoral, c.id_partido, c.ano AS ano_eleicao, m.cod_tse, m.uf,
       ini.pib_per_capita AS pib_pc_inicio,
       fp.ano             AS ano_fim_pib,
       fp.pib_per_capita  AS pib_pc_fim,
       ROUND(100 * (fp.pib_per_capita / NULLIF(ini.pib_per_capita, 0) - 1), 1) AS var_pib_pc_pct,
       ini.taxa_homicidios_3a AS homicidios_inicio,
       fh.ano                 AS ano_fim_homicidios,
       fh.taxa_homicidios_3a  AS homicidios_fim,
       fh.taxa_homicidios_3a - ini.taxa_homicidios_3a AS var_homicidios
FROM vw_candidatura c
JOIN municipio m ON m.cod_tse = c.ue
LEFT JOIN vw_indicador_municipio ini ON ini.cod_tse = m.cod_tse AND ini.ano = c.ano
LEFT JOIN LATERAL (
    SELECT f.ano, f.pib_per_capita FROM vw_indicador_municipio f
    WHERE f.cod_tse = m.cod_tse AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.pib_per_capita IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fp ON TRUE
LEFT JOIN LATERAL (
    SELECT f.ano, f.taxa_homicidios_3a FROM vw_indicador_municipio f
    WHERE f.cod_tse = m.cod_tse AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.taxa_homicidios_3a IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fh ON TRUE
WHERE c.eleito AND c.cargo = 'PREFEITO';

-- Governador eleito: mesma leitura, sobre os indicadores agregados da UF (candidatura.ue = sigla da UF).
CREATE VIEW vw_retrospecto_governador AS
SELECT c.sq_candidato, c.titulo_eleitoral, c.id_partido, c.ano AS ano_eleicao, c.ue AS uf,
       ini.pib_per_capita AS pib_pc_inicio,
       fp.ano             AS ano_fim_pib,
       fp.pib_per_capita  AS pib_pc_fim,
       ROUND(100 * (fp.pib_per_capita / NULLIF(ini.pib_per_capita, 0) - 1), 1) AS var_pib_pc_pct,
       ini.taxa_homicidios AS homicidios_inicio,
       fh.ano              AS ano_fim_homicidios,
       fh.taxa_homicidios  AS homicidios_fim,
       fh.taxa_homicidios - ini.taxa_homicidios AS var_homicidios
FROM vw_candidatura c
LEFT JOIN vw_indicador_uf ini ON ini.uf = c.ue AND ini.ano = c.ano
LEFT JOIN LATERAL (
    SELECT f.ano, f.pib_per_capita FROM vw_indicador_uf f
    WHERE f.uf = c.ue AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.pib_per_capita IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fp ON TRUE
LEFT JOIN LATERAL (
    SELECT f.ano, f.taxa_homicidios FROM vw_indicador_uf f
    WHERE f.uf = c.ue AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.taxa_homicidios IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fh ON TRUE
WHERE c.eleito AND c.cargo = 'GOVERNADOR';

CREATE FUNCTION nivel_escolaridade(texto VARCHAR) RETURNS SMALLINT
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE UPPER(texto)
        WHEN 'ANALFABETO'                    THEN 0
        WHEN 'LÊ E ESCREVE'                  THEN 1
        WHEN 'ENSINO FUNDAMENTAL INCOMPLETO' THEN 2
        WHEN 'ENSINO FUNDAMENTAL COMPLETO'   THEN 3
        WHEN 'ENSINO MÉDIO INCOMPLETO'       THEN 4
        WHEN 'ENSINO MÉDIO COMPLETO'         THEN 5
        WHEN 'SUPERIOR INCOMPLETO'           THEN 6
        WHEN 'SUPERIOR COMPLETO'             THEN 7
    END::SMALLINT
$$;

-- Nota de cada partido em cada ano de eleição, pelas três réguas.
-- Especialistas: a edição do survey mais próxima do ano. Os partidos renomeados
-- que mantiveram o número (PMDB -> MDB, PFL -> DEM etc.) herdam a nota do nome
-- atual; nesse caso nota_herdada é verdadeiro. Coligações: a nota do próprio ano,
-- nas eleições municipais, ou a média das duas municipais vizinhas, nas gerais.
-- Câmara: a posição média do partido nas votações nominais da Câmara (uma só
-- medição, de -100 a +100); os nomes antigos de partidos que hoje estão na Câmara
-- com o mesmo número (PMDB -> MDB, PRB -> REPUBLICANOS etc.) recebem a do nome atual.
CREATE VIEW vw_ideologia_partido AS
SELECT pa.id_partido,
       a.ano,
       esp.nota       AS nota_especialistas,
       esp.herdada    AS nota_herdada,
       col.nota       AS nota_coligacoes,
       cam.espectro   AS espectro_camara
FROM partido pa
CROSS JOIN generate_series(1998, 2026, 2) AS a (ano)
LEFT JOIN LATERAL (
    SELECT i.nota, i.id_partido <> pa.id_partido AS herdada
    FROM ideologia_partido i
    JOIN partido pi ON pi.id_partido = i.id_partido
    WHERE i.id_partido = pa.id_partido
       OR (pi.numero = pa.numero
           AND pa.sigla IN ('PMDB', 'PFL', 'PPB', 'PRN', 'PSN', 'PSDC', 'PT DO B', 'PTN', 'PEN'))
    ORDER BY i.id_partido <> pa.id_partido, ABS(i.ano_survey - a.ano), i.ano_survey DESC
    LIMIT 1
) esp ON TRUE
LEFT JOIN LATERAL (
    SELECT ROUND(AVG(ic.nota), 2) AS nota
    FROM ideologia_coligacao ic
    WHERE ic.id_partido = pa.id_partido
      AND ABS(ic.ano - a.ano) <= 2
) col ON TRUE
LEFT JOIN LATERAL (
    SELECT pi.espectro_camara AS espectro
    FROM partido pi
    WHERE pi.espectro_camara IS NOT NULL
      AND (pi.id_partido = pa.id_partido
           OR (pi.numero = pa.numero
               AND (pa.sigla, pi.sigla) IN (VALUES ('PMDB', 'MDB'), ('PPB', 'PP'), ('PRB', 'REPUBLICANOS'),
                                                   ('PR', 'PL'), ('PPS', 'CIDADANIA'), ('PTN', 'PODE'),
                                                   ('PT DO B', 'AVANTE'), ('SD', 'SOLIDARIEDADE'))))
    ORDER BY pi.id_partido <> pa.id_partido
    LIMIT 1
) cam ON TRUE;
