-- Sucesso eleitoral conforme a dependência de recursos públicos (FEFC + Fundo Partidário)
WITH financiamento AS (
    SELECT r.sq_candidato,
           SUM(r.valor)                                            AS receita_total,
           SUM(r.valor) FILTER (WHERE UPPER(r.fonte) LIKE 'FUNDO%') AS receita_publica
    FROM receita r
    GROUP BY r.sq_candidato
),
classificado AS (
    SELECT v.ano, v.cargo, v.eleito,
           COALESCE(f.receita_publica, 0) / NULLIF(f.receita_total, 0) AS parcela_publica
    FROM vw_candidatura v
    JOIN financiamento f ON f.sq_candidato = v.sq_candidato
    WHERE v.ano IN (2018, 2020, 2022, 2024)
      AND f.receita_total > 0
)
SELECT ano,
       cargo,
       CASE
           WHEN parcela_publica >= 0.75 THEN '1. 75% ou mais público'
           WHEN parcela_publica >= 0.50 THEN '2. 50% a 75% público'
           WHEN parcela_publica >= 0.25 THEN '3. 25% a 50% público'
           ELSE                              '4. Menos de 25% público'
       END                                                          AS dependencia,
       COUNT(*)                                                     AS candidatos,
       COUNT(*) FILTER (WHERE eleito)                               AS eleitos,
       ROUND(100.0 * COUNT(*) FILTER (WHERE eleito) / COUNT(*), 2)  AS taxa_sucesso_pct
FROM classificado
GROUP BY ano, cargo, dependencia
ORDER BY ano, cargo, dependencia;
