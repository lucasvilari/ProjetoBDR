-- Linha do tempo da carreira de um político
SELECT v.ano,
       v.cargo,
       v.ue,
       pa.sigla,
       v.situacao_final,
       v.reeleicao,
       CASE
           WHEN v.eleito AND v.reeleicao                    THEN 'Reeleito'
           WHEN v.eleito                                    THEN 'Vitória'
           WHEN v.situacao_final IN ('NÃO ELEITO', 'SUPLENTE') THEN 'Derrota'
           ELSE 'Candidatura não concluída'
       END AS resultado
FROM vw_candidatura v
JOIN partido pa ON pa.id_partido = v.id_partido
WHERE v.titulo_eleitoral = :'titulo'
ORDER BY v.ano;
