-- Resumo da sobrevivência da carreira
SELECT p.nome,
       MIN(v.ano)                                                   AS primeira_candidatura,
       MAX(v.ano)                                                   AS ultima_candidatura,
       MAX(v.ano) - MIN(v.ano)                                      AS anos_de_carreira,
       COUNT(*)                                                     AS participacoes,
       COUNT(*) FILTER (WHERE v.eleito)                             AS vitorias,
       COUNT(*) FILTER (WHERE NOT v.eleito)                         AS derrotas,
       COUNT(*) FILTER (WHERE v.eleito AND v.reeleicao)             AS reeleicoes,
       COUNT(DISTINCT v.cargo)                                      AS cargos_diferentes,
       COUNT(DISTINCT v.id_partido)                                 AS partidos_diferentes,
       ROUND(100.0 * COUNT(*) FILTER (WHERE v.eleito) / COUNT(*), 2) AS taxa_vitoria_pct
FROM politico p
JOIN vw_candidatura v ON v.titulo_eleitoral = p.titulo_eleitoral
WHERE p.titulo_eleitoral = :'titulo'
GROUP BY p.nome;
