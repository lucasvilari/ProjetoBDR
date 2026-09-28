-- Políticos com mais mandatos numa UF (eleições vencidas de 1998 a 2024).
-- Uso: psql -d eleicoes -v uf=PI -f banco/sql/extras/mandatos_uf.sql
WITH mandatos AS (
    SELECT v.titulo_eleitoral, v.ano, v.cargo
    FROM vw_candidatura v
    WHERE v.eleito
      AND (v.ue = :'uf'
           OR v.ue IN (SELECT cod_tse::text FROM municipio WHERE uf = :'uf'))
      AND v.cargo <> 'VEREADOR'          -- apague esta linha para incluir vereadores
)
SELECT p.nome,
       count(*)                                                 AS mandatos,
       min(m.ano) || '–' || max(m.ano)                          AS periodo,
       string_agg(m.cargo || ' ' || m.ano, ', ' ORDER BY m.ano) AS carreira
FROM mandatos m
JOIN politico p USING (titulo_eleitoral)
GROUP BY p.titulo_eleitoral, p.nome
ORDER BY mandatos DESC, min(m.ano), p.nome
LIMIT 10;
