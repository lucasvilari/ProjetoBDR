-- Taxa de sucesso por faixa de patrimônio declarado
SELECT ano,
       faixa,
       COUNT(*)                                                    AS candidatos,
       COUNT(*) FILTER (WHERE eleito)                              AS eleitos,
       ROUND(100.0 * COUNT(*) FILTER (WHERE eleito) / COUNT(*), 2) AS taxa_sucesso_pct
FROM (
    SELECT v.ano,
           v.eleito,
           CASE
               WHEN p.patrimonio_total = 0        THEN '1. Sem bens declarados'
               WHEN p.patrimonio_total < 100000   THEN '2. Até R$ 100 mil'
               WHEN p.patrimonio_total < 500000   THEN '3. R$ 100 mil a R$ 500 mil'
               WHEN p.patrimonio_total < 1000000  THEN '4. R$ 500 mil a R$ 1 milhão'
               WHEN p.patrimonio_total < 5000000  THEN '5. R$ 1 milhão a R$ 5 milhões'
               ELSE                                    '6. Acima de R$ 5 milhões'
           END AS faixa
    FROM vw_candidatura v
    JOIN vw_patrimonio p ON p.sq_candidato = v.sq_candidato
    WHERE v.ano IN (2018, 2020, 2022, 2024)
      AND v.cargo = :'cargo'
) t
GROUP BY ano, faixa
ORDER BY ano, faixa;
