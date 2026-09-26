-- Escolaridade de quem votou x escolaridade de quem recebeu os votos, por município
WITH eleitorado AS (
    SELECT pc.cod_eleicao, pc.cod_tse,
           SUM(pc.comparecimento * nivel_escolaridade(pc.escolaridade))::NUMERIC
             / NULLIF(SUM(pc.comparecimento)
                      FILTER (WHERE nivel_escolaridade(pc.escolaridade) IS NOT NULL), 0)
             AS nivel_medio_eleitor
    FROM perfil_comparecimento pc
    WHERE pc.turno = 1
    GROUP BY pc.cod_eleicao, pc.cod_tse
),
votados AS (
    SELECT v.cod_eleicao, vc.cod_tse,
           SUM(vc.votos * nivel_escolaridade(v.escolaridade))::NUMERIC
             / NULLIF(SUM(vc.votos)
                      FILTER (WHERE nivel_escolaridade(v.escolaridade) IS NOT NULL), 0)
             AS nivel_medio_votado,
           AVG(nivel_escolaridade(v.escolaridade))
             FILTER (WHERE v.eleito) AS nivel_medio_eleitos
    FROM votos_cand vc
    JOIN vw_candidatura v ON v.sq_candidato = vc.sq_candidato
    WHERE vc.turno = 1 AND v.ano = :ano AND v.cargo = :'cargo'
    GROUP BY v.cod_eleicao, vc.cod_tse
),
base AS (
    SELECT el.cod_tse, el.nivel_medio_eleitor, vo.nivel_medio_votado, vo.nivel_medio_eleitos,
           NTILE(5) OVER (ORDER BY el.nivel_medio_eleitor) AS quintil_escolaridade
    FROM eleitorado el
    JOIN votados vo ON vo.cod_eleicao = el.cod_eleicao AND vo.cod_tse = el.cod_tse
)
SELECT quintil_escolaridade,
       COUNT(*)                            AS municipios,
       ROUND(AVG(nivel_medio_eleitor), 2)  AS nivel_eleitorado,
       ROUND(AVG(nivel_medio_votado), 2)   AS nivel_votado,
       ROUND(AVG(nivel_medio_eleitos), 2)  AS nivel_eleitos,
       ROUND(CORR(nivel_medio_eleitor, nivel_medio_votado)::NUMERIC, 3) AS correlacao
FROM base
GROUP BY ROLLUP (quintil_escolaridade)
ORDER BY quintil_escolaridade NULLS LAST;
