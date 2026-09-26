-- Jovem vota no jovem? Parcela de eleitores até 34 anos x idade média ponderada pelos votos
WITH jovens AS (
    SELECT pc.cod_eleicao, pc.cod_tse,
           100.0 * SUM(pc.comparecimento) FILTER (
                   WHERE SUBSTRING(pc.faixa_etaria FROM '^[0-9]+')::INT < 35)
                 / NULLIF(SUM(pc.comparecimento), 0) AS pct_votantes_jovens
    FROM perfil_comparecimento pc
    WHERE pc.turno = 1 AND pc.faixa_etaria ~ '^[0-9]'
    GROUP BY pc.cod_eleicao, pc.cod_tse
),
idade_voto AS (
    SELECT v.cod_eleicao, vc.cod_tse,
           SUM(vc.votos * v.idade_posse)::NUMERIC
             / NULLIF(SUM(vc.votos), 0) AS idade_media_votada
    FROM votos_cand vc
    JOIN vw_candidatura v ON v.sq_candidato = vc.sq_candidato
    WHERE vc.turno = 1 AND v.idade_posse > 0 AND v.ano = :ano AND v.cargo = :'cargo'
    GROUP BY v.cod_eleicao, vc.cod_tse
)
SELECT NTILE(5) OVER (ORDER BY j.pct_votantes_jovens) AS quintil_juventude,
       j.cod_tse,
       ROUND(j.pct_votantes_jovens, 2) AS pct_votantes_ate_34,
       ROUND(i.idade_media_votada, 1)  AS idade_media_votada
FROM jovens j
JOIN idade_voto i ON i.cod_eleicao = j.cod_eleicao AND i.cod_tse = j.cod_tse
ORDER BY quintil_juventude;
