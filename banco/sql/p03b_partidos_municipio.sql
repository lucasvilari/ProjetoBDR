-- Partidos mais vitoriosos no município (eleitos locais e votos totais)
WITH eleitos AS (
    SELECT v.ano, v.id_partido, COUNT(*) AS qt_eleitos
    FROM vw_candidatura v
    WHERE v.ue = :'cod_tse' AND v.eleito
    GROUP BY v.ano, v.id_partido
),
votos AS (
    SELECT e.ano, vp.id_partido,
           SUM(vp.votos_nominais + vp.votos_legenda) AS votos
    FROM votos_part vp
    JOIN eleicao e ON e.cod_eleicao = vp.cod_eleicao
    WHERE vp.cod_tse = :'cod_tse' AND vp.turno = 1
    GROUP BY e.ano, vp.id_partido
)
SELECT vo.ano,
       pa.sigla,
       COALESCE(el.qt_eleitos, 0) AS eleitos_no_municipio,
       vo.votos,
       ROUND(100.0 * vo.votos / SUM(vo.votos) OVER (PARTITION BY vo.ano), 2) AS pct_votos,
       RANK() OVER (PARTITION BY vo.ano ORDER BY vo.votos DESC)            AS posicao
FROM votos vo
JOIN partido pa ON pa.id_partido = vo.id_partido
LEFT JOIN eleitos el ON el.ano = vo.ano AND el.id_partido = vo.id_partido
ORDER BY vo.ano, posicao;
