-- Eleitos de um partido por votos de legenda (votação nominal abaixo do quociente eleitoral)
WITH validos AS (
    SELECT a.cod_eleicao, a.cargo,
           CASE e.abrangencia WHEN 'MUNICIPAL' THEN a.cod_tse ELSE m.uf::VARCHAR END AS ue,
           SUM(a.validos) AS votos_validos
    FROM apuracao a
    JOIN eleicao e   ON e.cod_eleicao = a.cod_eleicao
    JOIN municipio m ON m.cod_tse = a.cod_tse
    WHERE a.turno = 1
      AND a.cargo IN ('VEREADOR', 'DEPUTADO ESTADUAL', 'DEPUTADO FEDERAL', 'DEPUTADO DISTRITAL')
    GROUP BY 1, 2, 3
),
quociente AS (
    SELECT va.cod_eleicao, va.cargo, va.ue, va.votos_validos, vg.qt_vagas,
           CEIL(va.votos_validos::NUMERIC / vg.qt_vagas - 0.5) AS quociente_eleitoral
    FROM validos va
    JOIN vaga vg ON vg.cod_eleicao = va.cod_eleicao AND vg.cargo = va.cargo AND vg.ue = va.ue
),
nominais AS (
    SELECT sq_candidato, SUM(votos) AS votos_nominais
    FROM votos_cand
    WHERE turno = 1
    GROUP BY sq_candidato
)
SELECT c.ano,
       c.cargo,
       pa.sigla,
       COUNT(*)                                                     AS eleitos_proporcional,
       COUNT(*) FILTER (WHERE n.votos_nominais < q.quociente_eleitoral) AS eleitos_por_legenda,
       ROUND(100.0 * COUNT(*) FILTER (WHERE n.votos_nominais < q.quociente_eleitoral)
             / COUNT(*), 2)                                         AS pct_por_legenda
FROM vw_candidatura c
JOIN partido pa  ON pa.id_partido = c.id_partido
JOIN quociente q ON q.cod_eleicao = c.cod_eleicao AND q.cargo = c.cargo AND q.ue = c.ue
JOIN nominais n  ON n.sq_candidato = c.sq_candidato
WHERE c.situacao_final IN ('ELEITO POR QP', 'ELEITO POR MÉDIA')
  AND c.ano IN (2018, 2020, 2022, 2024)
  AND pa.sigla = :'sigla'
GROUP BY c.ano, c.cargo, pa.sigla
ORDER BY c.ano, c.cargo;
