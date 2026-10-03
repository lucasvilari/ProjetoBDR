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

-- Nota de cada partido em cada ano de eleição, pelas duas réguas.
-- Especialistas: a edição do survey mais próxima do ano. Os partidos renomeados
-- que mantiveram o número (PMDB -> MDB, PFL -> DEM etc.) herdam a nota do nome
-- atual; nesse caso nota_herdada é verdadeiro. Coligações: a nota do próprio ano,
-- nas eleições municipais, ou a média das duas municipais vizinhas, nas gerais.
CREATE VIEW vw_ideologia_partido AS
SELECT pa.id_partido,
       a.ano,
       esp.nota       AS nota_especialistas,
       esp.herdada    AS nota_herdada,
       col.nota       AS nota_coligacoes
FROM partido pa
CROSS JOIN generate_series(1998, 2024, 2) AS a (ano)
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
) col ON TRUE;
