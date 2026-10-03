-- Perfil etário do município x alternância de poder e idade dos prefeitos eleitos.
-- A mediana de referência é a dos municípios carregados (as UFs do escopo).
WITH mediana_escopo AS (
    SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY idade_mediana) AS valor
    FROM municipio
),
perfil AS (
    SELECT m.cod_tse,
           CASE WHEN m.idade_mediana >= mn.valor THEN 'Mais velho'
                ELSE 'Mais jovem' END AS perfil_etario
    FROM municipio m CROSS JOIN mediana_escopo mn
    WHERE m.idade_mediana IS NOT NULL
),
prefeitos AS (
    SELECT v.ue AS cod_tse, v.ano, v.id_partido, v.titulo_eleitoral, v.idade_posse,
           LAG(v.id_partido)       OVER w AS partido_anterior,
           LAG(v.titulo_eleitoral) OVER w AS prefeito_anterior
    FROM vw_candidatura v
    WHERE v.cargo = 'PREFEITO' AND v.eleito
    WINDOW w AS (PARTITION BY v.ue ORDER BY v.ano)
)
SELECT pf.perfil_etario,
       COUNT(DISTINCT pr.cod_tse)                                AS municipios,
       ROUND(AVG(pr.idade_posse), 1)                             AS idade_media_eleitos,
       ROUND(100.0 * COUNT(*) FILTER (WHERE pr.id_partido <> pr.partido_anterior)
             / NULLIF(COUNT(pr.partido_anterior), 0), 2)         AS alternancia_partido_pct,
       ROUND(100.0 * COUNT(*) FILTER (WHERE pr.titulo_eleitoral <> pr.prefeito_anterior)
             / NULLIF(COUNT(pr.prefeito_anterior), 0), 2)        AS alternancia_pessoa_pct
FROM prefeitos pr
JOIN perfil pf ON pf.cod_tse = pr.cod_tse
WHERE pr.ano IN (2020, 2024)
GROUP BY pf.perfil_etario;
