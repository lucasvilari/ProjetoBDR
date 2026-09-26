-- Distribuição do gasto por tipo de despesa
SELECT d.tipo,
       COUNT(*)                                                 AS lancamentos,
       SUM(d.valor)                                             AS valor_total,
       ROUND(100.0 * SUM(d.valor) / SUM(SUM(d.valor)) OVER (), 2) AS pct_do_gasto
FROM despesa d
JOIN vw_candidatura v ON v.sq_candidato = d.sq_candidato
WHERE v.ano = :ano
  AND (:'sq_candidato' = '' OR v.sq_candidato = NULLIF(:'sq_candidato', '')::BIGINT)
GROUP BY d.tipo
ORDER BY valor_total DESC;
