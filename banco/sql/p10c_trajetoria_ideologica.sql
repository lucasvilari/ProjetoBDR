-- Trajetória ideológica de um político: a nota dos especialistas para o partido de
-- cada candidatura e o deslocamento em relação à candidatura anterior. A nota das
-- coligações fica de fora: antes de 2020 ela não acompanha a ideologia (p07b).
-- espectro_camara: posição do partido nas votações da Câmara (-100 a +100).
WITH trajetoria AS (
    SELECT v.ano,
           v.cargo,
           pa.sigla,
           vi.nota_especialistas,
           vi.nota_herdada,
           vi.espectro_camara
    FROM vw_candidatura v
    JOIN partido pa               ON pa.id_partido = v.id_partido
    LEFT JOIN vw_ideologia_partido vi ON vi.id_partido = v.id_partido AND vi.ano = v.ano
    WHERE v.titulo_eleitoral = :'titulo'
)
SELECT ano,
       cargo,
       sigla,
       sigla IS DISTINCT FROM LAG(sigla) OVER w AND LAG(sigla) OVER w IS NOT NULL AS trocou_partido,
       nota_especialistas,
       nota_herdada,
       nota_especialistas - LAG(nota_especialistas) OVER w                       AS deslocamento,
       espectro_camara,
       ROUND(AVG(nota_especialistas) OVER (), 2)                                 AS media_carreira,
       MAX(nota_especialistas) OVER () - MIN(nota_especialistas) OVER ()         AS amplitude_carreira
FROM trajetoria
WINDOW w AS (ORDER BY ano, cargo)
ORDER BY ano, cargo;
