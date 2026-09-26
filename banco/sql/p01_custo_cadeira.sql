-- Custo de uma cadeira por ano e cargo (despesas contratadas)
WITH gasto AS (
    SELECT sq_candidato, SUM(valor) AS total
    FROM despesa
    GROUP BY sq_candidato
),
cadeiras AS (
    SELECT e.ano, vg.cargo, SUM(vg.qt_vagas) AS vagas
    FROM vaga vg
    JOIN eleicao e ON e.cod_eleicao = vg.cod_eleicao
    GROUP BY e.ano, vg.cargo
)
SELECT v.ano,
       v.cargo,
       k.vagas,
       COUNT(*) FILTER (WHERE v.eleito)                         AS eleitos,
       SUM(COALESCE(g.total, 0))                                AS gasto_todos_candidatos,
       SUM(COALESCE(g.total, 0)) FILTER (WHERE v.eleito)        AS gasto_eleitos,
       ROUND(SUM(COALESCE(g.total, 0)) / k.vagas, 2)            AS custo_cadeira_disputa,
       ROUND(AVG(COALESCE(g.total, 0)) FILTER (WHERE v.eleito), 2) AS custo_medio_por_eleito
FROM vw_candidatura v
JOIN cadeiras k ON k.ano = v.ano AND k.cargo = v.cargo
LEFT JOIN gasto g ON g.sq_candidato = v.sq_candidato
WHERE v.ano IN (2018, 2020, 2022, 2024)
GROUP BY v.ano, v.cargo, k.vagas
ORDER BY v.ano, custo_medio_por_eleito DESC NULLS LAST;
