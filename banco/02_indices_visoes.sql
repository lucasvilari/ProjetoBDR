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

-- Deflator IPCA para converter PIB nominal a preços constantes de 2022.
-- Cada linha diz por quanto multiplicar o valor do ano para obter R$ de 2022.
-- Fontes: IBGE/IPCA acumulado no ano (https://sidra.ibge.gov.br/tabela/1737).
CREATE VIEW vw_deflator_ipca AS
SELECT * FROM (VALUES
    (2010::smallint, 2.0262::numeric),
    (2011::smallint, 1.9025::numeric),
    (2012::smallint, 1.7975::numeric),
    (2013::smallint, 1.6972::numeric),
    (2014::smallint, 1.5949::numeric),
    (2015::smallint, 1.4413::numeric),
    (2016::smallint, 1.3560::numeric),
    (2017::smallint, 1.3171::numeric),
    (2018::smallint, 1.2695::numeric),
    (2019::smallint, 1.2170::numeric),
    (2020::smallint, 1.1643::numeric),
    (2021::smallint, 1.0579::numeric),
    (2022::smallint, 1.0000::numeric),
    (2023::smallint, 0.9559::numeric)
) AS t(ano, deflator);

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

-- Taxa de homicídios de cada município em cada ano do Atlas (2000 a 2024). O Atlas não publica
-- taxa zero: município sem homicídio no ano simplesmente não tem linha (nenhum dos 18 mil valores
-- carregados é zero, e os ausentes são, em média, os municípios menores, em número parecido com o de
-- municípios sem nenhuma morte que a população de cada UF faria esperar). Por isso o ausente entra
-- como taxa 0, com sem_registro verdadeiro. taxa_3a é a média dos últimos 3 anos (2 antes e o
-- próprio), que suaviza a oscilação dos municípios pequenos, onde uma morte muda a taxa.
CREATE VIEW vw_homicidio_anual AS
SELECT g.cod_tse, g.ano, g.taxa, g.sem_registro,
       ROUND(AVG(g.taxa) OVER (PARTITION BY g.cod_tse ORDER BY g.ano
                               RANGE BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS taxa_3a
FROM (
    SELECT m.cod_tse, a.ano, COALESCE(h.taxa, 0) AS taxa, h.taxa IS NULL AS sem_registro
    FROM municipio m
    CROSS JOIN (SELECT generate_series(MIN(ano)::int, MAX(ano)::int)::smallint AS ano FROM homicidio_municipio) a
    LEFT JOIN homicidio_municipio h ON h.cod_tse = m.cod_tse AND h.ano = a.ano
) g;

-- Tudo por município/ano, de 2010 em diante (os anos do PIB e da população). Junção à esquerda
-- e não completa: assim o banco filtra por município dentro da média móvel, que é bem mais rápido.
CREATE VIEW vw_indicador_municipio AS
SELECT i.cod_tse, i.ano,
       i.pib, i.populacao, i.pib_per_capita,
       ROUND(i.pib_per_capita * COALESCE(d.deflator, 1), 2) AS pib_per_capita_real,
       h.taxa AS taxa_homicidios, h.taxa_3a AS taxa_homicidios_3a,
       s.pct_agro, s.pct_industria, s.pct_servicos, s.pct_adm_publica, s.setor_dominante,
       h.sem_registro AS homicidio_sem_registro,
       ef.pessoal_ocupado AS empregos_formais,
       ROUND(1000.0 * ef.pessoal_ocupado / NULLIF(i.populacao, 0), 1) AS empregos_por_mil_hab,
       san.pct_agua_rede, san.pct_esgoto_adequado, san.ano AS ano_saneamento
FROM indicador_anual i
LEFT JOIN vw_deflator_ipca d ON d.ano = i.ano
LEFT JOIN vw_homicidio_anual h ON h.cod_tse = i.cod_tse AND h.ano = i.ano
LEFT JOIN vw_estrutura_setorial s ON s.cod_tse = i.cod_tse AND s.ano = i.ano
LEFT JOIN emprego_formal ef ON ef.cod_tse = i.cod_tse AND ef.ano = i.ano
LEFT JOIN LATERAL (
    SELECT sc.pct_agua_rede, sc.pct_esgoto_adequado, sc.ano
    FROM saneamento_censo sc
    WHERE sc.cod_tse = i.cod_tse
    ORDER BY ABS(sc.ano - i.ano)
    LIMIT 1
) san ON TRUE;

-- Por UF: PIB e população somados; taxa de homicídios ponderada pela população dos municípios
-- (os sem registro entram como taxa zero, então a taxa da UF é o total de mortes sobre a população).
CREATE VIEW vw_indicador_uf AS
SELECT m.uf, v.ano,
       SUM(v.pib) AS pib,
       SUM(v.populacao) AS populacao,
       SUM(v.pib) / NULLIF(SUM(v.populacao), 0) AS pib_per_capita,
       SUM(v.pib_per_capita_real * v.populacao)
           / NULLIF(SUM(v.populacao), 0) AS pib_per_capita_real,
       SUM(v.taxa_homicidios * v.populacao)
           / NULLIF(SUM(v.populacao) FILTER (WHERE v.taxa_homicidios IS NOT NULL), 0) AS taxa_homicidios,
       SUM(v.empregos_formais) AS empregos_formais,
       ROUND(1000.0 * SUM(v.empregos_formais) / NULLIF(SUM(v.populacao), 0), 1) AS empregos_por_mil_hab,
       MAX(p.taxa_desocupacao) AS taxa_desocupacao,
       MAX(p.taxa_informalidade) AS taxa_informalidade,
       ROUND(AVG(v.pct_agua_rede) FILTER (WHERE v.pct_agua_rede IS NOT NULL), 2) AS pct_agua_rede,
       ROUND(AVG(v.pct_esgoto_adequado) FILTER (WHERE v.pct_esgoto_adequado IS NOT NULL), 2) AS pct_esgoto_adequado
FROM vw_indicador_municipio v
JOIN municipio m USING (cod_tse)
LEFT JOIN pnad_emprego_uf p ON p.uf = m.uf AND p.ano = v.ano
GROUP BY m.uf, v.ano;

-- Prefeito eleito: indicador no ano da eleição x último ano disponível dentro do mandato
-- (ano_eleicao + 1 a + 4). PIB e homicídios têm cada um o seu "último ano", porque a
-- publicação deles não termina no mesmo ano. A taxa de homicídios é a média de 3 anos.
-- Mostra o que mudou durante o mandato, não que o prefeito causou a mudança.
CREATE VIEW vw_retrospecto_prefeito AS
SELECT c.sq_candidato, c.titulo_eleitoral, c.id_partido, c.ano AS ano_eleicao, m.cod_tse, m.uf,
       ini.pib_per_capita_real AS pib_pc_inicio,
       fp.ano                  AS ano_fim_pib,
       fp.pib_per_capita_real  AS pib_pc_fim,
       ROUND(100 * (fp.pib_per_capita_real / NULLIF(ini.pib_per_capita_real, 0) - 1), 1) AS var_pib_pc_pct,
       ini.taxa_homicidios_3a AS homicidios_inicio,
       fh.ano                 AS ano_fim_homicidios,
       fh.taxa_homicidios_3a  AS homicidios_fim,
       fh.taxa_homicidios_3a - ini.taxa_homicidios_3a AS var_homicidios,
       ini.empregos_por_mil_hab AS empregos_inicio,
       fe.ano                   AS ano_fim_empregos,
       fe.empregos_por_mil_hab  AS empregos_fim,
       ROUND(fe.empregos_por_mil_hab - ini.empregos_por_mil_hab, 1) AS var_empregos,
       pat.patrimonio           AS patrimonio_eleicao,
       pat_ant.patrimonio       AS patrimonio_anterior,
       pat_ant.ano              AS ano_patrimonio_anterior,
       ROUND(100 * (pat.patrimonio / NULLIF(pat_ant.patrimonio, 0) - 1), 1) AS var_patrimonio_pct
FROM vw_candidatura c
JOIN municipio m ON m.cod_tse = c.ue
LEFT JOIN vw_indicador_municipio ini ON ini.cod_tse = m.cod_tse AND ini.ano = c.ano
LEFT JOIN LATERAL (
    SELECT f.ano, f.pib_per_capita_real FROM vw_indicador_municipio f
    WHERE f.cod_tse = m.cod_tse AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.pib_per_capita_real IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fp ON TRUE
LEFT JOIN LATERAL (
    SELECT f.ano, f.taxa_homicidios_3a FROM vw_indicador_municipio f
    WHERE f.cod_tse = m.cod_tse AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.taxa_homicidios_3a IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fh ON TRUE
LEFT JOIN LATERAL (
    SELECT f.ano, f.empregos_por_mil_hab FROM vw_indicador_municipio f
    WHERE f.cod_tse = m.cod_tse AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.empregos_por_mil_hab IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fe ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(b.valor) AS patrimonio
    FROM bem b WHERE b.sq_candidato = c.sq_candidato
    HAVING COUNT(*) > 0
) pat ON TRUE
LEFT JOIN LATERAL (
    SELECT e2.ano, SUM(b2.valor) AS patrimonio
    FROM candidatura c2
    JOIN eleicao e2 ON e2.cod_eleicao = c2.cod_eleicao
    JOIN bem b2 ON b2.sq_candidato = c2.sq_candidato
    WHERE c2.titulo_eleitoral = c.titulo_eleitoral
      AND c2.cargo = 'PREFEITO'
      AND e2.ano < c.ano
    GROUP BY e2.ano
    ORDER BY e2.ano DESC LIMIT 1
) pat_ant ON TRUE
WHERE c.eleito AND c.cargo = 'PREFEITO';

-- Governador eleito: mesma leitura, sobre os indicadores agregados da UF (candidatura.ue = sigla da UF).
CREATE VIEW vw_retrospecto_governador AS
SELECT c.sq_candidato, c.titulo_eleitoral, c.id_partido, c.ano AS ano_eleicao, c.ue AS uf,
       ini.pib_per_capita_real AS pib_pc_inicio,
       fp.ano                  AS ano_fim_pib,
       fp.pib_per_capita_real  AS pib_pc_fim,
       ROUND(100 * (fp.pib_per_capita_real / NULLIF(ini.pib_per_capita_real, 0) - 1), 1) AS var_pib_pc_pct,
       ini.taxa_homicidios AS homicidios_inicio,
       fh.ano              AS ano_fim_homicidios,
       fh.taxa_homicidios  AS homicidios_fim,
       fh.taxa_homicidios - ini.taxa_homicidios AS var_homicidios,
       ini.empregos_por_mil_hab AS empregos_inicio,
       fe.ano                   AS ano_fim_empregos,
       fe.empregos_por_mil_hab  AS empregos_fim,
       ROUND(fe.empregos_por_mil_hab - ini.empregos_por_mil_hab, 1) AS var_empregos,
       ini.taxa_desocupacao AS desocupacao_inicio,
       fd.ano               AS ano_fim_desocupacao,
       fd.taxa_desocupacao  AS desocupacao_fim,
       ROUND(fd.taxa_desocupacao - ini.taxa_desocupacao, 1) AS var_desocupacao,
       ini.taxa_informalidade AS informalidade_inicio,
       fi.ano                 AS ano_fim_informalidade,
       fi.taxa_informalidade   AS informalidade_fim,
       ROUND(fi.taxa_informalidade - ini.taxa_informalidade, 1) AS var_informalidade,
       pat.patrimonio           AS patrimonio_eleicao,
       pat_ant.patrimonio       AS patrimonio_anterior,
       pat_ant.ano              AS ano_patrimonio_anterior,
       ROUND(100 * (pat.patrimonio / NULLIF(pat_ant.patrimonio, 0) - 1), 1) AS var_patrimonio_pct
FROM vw_candidatura c
LEFT JOIN vw_indicador_uf ini ON ini.uf = c.ue AND ini.ano = c.ano
LEFT JOIN LATERAL (
    SELECT f.ano, f.pib_per_capita_real FROM vw_indicador_uf f
    WHERE f.uf = c.ue AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.pib_per_capita_real IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fp ON TRUE
LEFT JOIN LATERAL (
    SELECT f.ano, f.taxa_homicidios FROM vw_indicador_uf f
    WHERE f.uf = c.ue AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.taxa_homicidios IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fh ON TRUE
LEFT JOIN LATERAL (
    SELECT f.ano, f.empregos_por_mil_hab FROM vw_indicador_uf f
    WHERE f.uf = c.ue AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.empregos_por_mil_hab IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fe ON TRUE
LEFT JOIN LATERAL (
    SELECT f.ano, f.taxa_desocupacao FROM vw_indicador_uf f
    WHERE f.uf = c.ue AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.taxa_desocupacao IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fd ON TRUE
LEFT JOIN LATERAL (
    SELECT f.ano, f.taxa_informalidade FROM vw_indicador_uf f
    WHERE f.uf = c.ue AND f.ano BETWEEN c.ano + 1 AND c.ano + 4 AND f.taxa_informalidade IS NOT NULL
    ORDER BY f.ano DESC LIMIT 1
) fi ON TRUE
LEFT JOIN LATERAL (
    SELECT SUM(b.valor) AS patrimonio
    FROM bem b WHERE b.sq_candidato = c.sq_candidato
    HAVING COUNT(*) > 0
) pat ON TRUE
LEFT JOIN LATERAL (
    SELECT e2.ano, SUM(b2.valor) AS patrimonio
    FROM candidatura c2
    JOIN eleicao e2 ON e2.cod_eleicao = c2.cod_eleicao
    JOIN bem b2 ON b2.sq_candidato = c2.sq_candidato
    WHERE c2.titulo_eleitoral = c.titulo_eleitoral
      AND c2.cargo = 'GOVERNADOR'
      AND e2.ano < c.ano
    GROUP BY e2.ano
    ORDER BY e2.ano DESC LIMIT 1
) pat_ant ON TRUE
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
