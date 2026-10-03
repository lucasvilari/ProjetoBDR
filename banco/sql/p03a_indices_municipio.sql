-- Índices de um município em cada eleição de 2018 a 2024
SELECT m.nome,
       m.uf,
       e.ano,
       pib.ano_referencia                                          AS ano_pib,
       pib.pib_per_capita,
       idh.idhm,
       pop.populacao,
       ap.aptos,
       ROUND(ap.aptos::NUMERIC / NULLIF(pop.populacao, 0), 4)      AS eleitores_por_populacao,
       ap.brancos + ap.nulos + ap.abstencoes                       AS isentos,
       ROUND(100.0 * (ap.brancos + ap.nulos + ap.abstencoes)
             / NULLIF(ap.aptos, 0), 2)                             AS isentos_pct
FROM municipio m
CROSS JOIN eleicao e
JOIN LATERAL (
    SELECT SUM(a.aptos) AS aptos, SUM(a.abstencoes) AS abstencoes,
           SUM(a.brancos) AS brancos, SUM(a.nulos) AS nulos
    FROM apuracao a
    WHERE a.cod_eleicao = e.cod_eleicao
      AND a.cod_tse = m.cod_tse
      AND a.turno = 1
      AND a.cargo = CASE e.abrangencia WHEN 'MUNICIPAL' THEN 'PREFEITO' ELSE 'PRESIDENTE' END
) ap ON ap.aptos IS NOT NULL
LEFT JOIN LATERAL (
    SELECT i.ano AS ano_referencia, i.pib_per_capita
    FROM indicador_anual i
    WHERE i.cod_tse = m.cod_tse AND i.ano <= e.ano AND i.pib_per_capita IS NOT NULL
    ORDER BY i.ano DESC
    LIMIT 1
) pib ON TRUE
LEFT JOIN LATERAL (
    SELECT i.populacao
    FROM indicador_anual i
    WHERE i.cod_tse = m.cod_tse AND i.ano <= e.ano AND i.populacao IS NOT NULL
    ORDER BY i.ano DESC
    LIMIT 1
) pop ON TRUE
LEFT JOIN LATERAL (
    SELECT h.idhm
    FROM idhm_municipio h
    WHERE h.cod_tse = m.cod_tse AND h.ano <= e.ano
    ORDER BY h.ano DESC
    LIMIT 1
) idh ON TRUE
WHERE m.cod_tse = :'cod_tse'
  AND e.ano IN (2018, 2020, 2022, 2024)
ORDER BY e.ano;
