-- Escolaridade do candidato x chance de eleição (2022 e 2024)
SELECT ano,
       escolaridade,
       COUNT(*)                                                    AS candidatos,
       COUNT(*) FILTER (WHERE eleito)                              AS eleitos,
       ROUND(100.0 * COUNT(*) FILTER (WHERE eleito) / COUNT(*), 2) AS taxa_sucesso_pct
FROM vw_candidatura
WHERE ano IN (2022, 2024)
  AND escolaridade IS NOT NULL
GROUP BY ano, escolaridade
ORDER BY ano, nivel_escolaridade(escolaridade);
