-- Viés ideológico ponderado pelos votos, por região/UF/município, ao longo do tempo.
-- indice_camara: a mesma média com a posição dos partidos nas votações da Câmara
-- (-100 a +100); cobertura_camara_pct: parcela dos votos de partidos com essa posição.
WITH votos AS (
    SELECT e.ano, vp.id_partido,
           CASE :'nivel' WHEN 'regiao' THEN m.regiao
                         WHEN 'uf'     THEN m.uf
                         ELSE m.nome || ' (' || m.uf || ')' END AS territorio,
           SUM(vp.votos_nominais + vp.votos_legenda) AS votos
    FROM votos_part vp
    JOIN eleicao e   ON e.cod_eleicao = vp.cod_eleicao
    JOIN municipio m ON m.cod_tse = vp.cod_tse
    WHERE vp.turno = 1
      AND vp.cargo IN ('VEREADOR', 'DEPUTADO FEDERAL')
      AND e.ano IN (2018, 2020, 2022, 2024)
    GROUP BY 1, 2, 3
),
com_nota AS (
    SELECT v.*, ip.nota, vi.espectro_camara AS espectro
    FROM votos v
    JOIN LATERAL (
        SELECT i.nota FROM ideologia_partido i
        WHERE i.id_partido = v.id_partido
        ORDER BY ABS(i.ano_survey - v.ano), i.ano_survey DESC
        LIMIT 1
    ) ip ON TRUE
    LEFT JOIN vw_ideologia_partido vi ON vi.id_partido = v.id_partido AND vi.ano = v.ano
)
SELECT ano,
       territorio,
       ROUND(SUM(votos * nota) / SUM(votos), 2) AS indice_ideologico,
       CASE
           WHEN SUM(votos * nota) / SUM(votos) < 3.5 THEN 'Esquerda'
           WHEN SUM(votos * nota) / SUM(votos) < 4.5 THEN 'Centro-esquerda'
           WHEN SUM(votos * nota) / SUM(votos) < 5.5 THEN 'Centro'
           WHEN SUM(votos * nota) / SUM(votos) < 6.5 THEN 'Centro-direita'
           ELSE 'Direita'
       END AS classificacao,
       ROUND(SUM(votos * espectro) / NULLIF(SUM(votos) FILTER (WHERE espectro IS NOT NULL), 0), 1)
                                                         AS indice_camara,
       ROUND(100.0 * SUM(votos) FILTER (WHERE espectro IS NOT NULL) / SUM(votos), 1)
                                                         AS cobertura_camara_pct
FROM com_nota
GROUP BY ano, territorio
ORDER BY territorio, ano;
