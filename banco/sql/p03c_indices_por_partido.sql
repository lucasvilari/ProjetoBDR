-- Médias dos índices dos municípios agrupados pelo partido do prefeito eleito
WITH prefeito AS (
    SELECT v.ano, v.ue AS cod_tse, v.id_partido
    FROM vw_candidatura v
    WHERE v.cargo = 'PREFEITO' AND v.eleito AND v.ano = :ano
),
indices AS (
    SELECT p.cod_tse, p.id_partido,
           (SELECT i.pib_per_capita FROM indicador_anual i
             WHERE i.cod_tse = p.cod_tse AND i.ano <= p.ano AND i.pib_per_capita IS NOT NULL
             ORDER BY i.ano DESC LIMIT 1) AS pib_per_capita,
           (SELECT h.idhm FROM idhm_municipio h
             WHERE h.cod_tse = p.cod_tse ORDER BY h.ano DESC LIMIT 1) AS idhm,
           (SELECT 100.0 * SUM(a.brancos + a.nulos + a.abstencoes) / NULLIF(SUM(a.aptos), 0)
              FROM apuracao a JOIN eleicao e ON e.cod_eleicao = a.cod_eleicao
             WHERE a.cod_tse = p.cod_tse AND e.ano = p.ano
               AND a.turno = 1 AND a.cargo = 'PREFEITO') AS isentos_pct
    FROM prefeito p
)
SELECT pa.sigla,
       COUNT(*)                          AS prefeituras,
       ROUND(AVG(pib_per_capita), 2)     AS pib_per_capita_medio,
       ROUND(AVG(idhm), 3)               AS idhm_medio,
       ROUND(AVG(isentos_pct), 2)        AS isentos_pct_medio
FROM indices i
JOIN partido pa ON pa.id_partido = i.id_partido
GROUP BY pa.sigla
ORDER BY prefeituras DESC;
