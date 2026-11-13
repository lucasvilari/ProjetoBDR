-- Quem é eleito tem a idade de quem vota? Por município, a idade média de quem foi votar (1º turno) e a dos eleitos
-- do cargo, na mesma eleição. O TSE dá a idade de quem votou em faixas: cada faixa conta pelo meio (16 anos vale 16,5;
-- 21 a 24 anos vale 23; 100 anos ou mais vale 101), com peso pelo comparecimento.
WITH votantes AS (
    SELECT pc.cod_eleicao, pc.cod_tse,
           SUM(pc.comparecimento * CASE
                 WHEN pc.faixa_etaria ~ '^[0-9]+ anos$' THEN SUBSTRING(pc.faixa_etaria FROM '^[0-9]+')::NUMERIC + 0.5
                 WHEN pc.faixa_etaria ~ ' a ' THEN (SUBSTRING(pc.faixa_etaria FROM '^[0-9]+')::NUMERIC
                                                    + SUBSTRING(pc.faixa_etaria FROM ' a ([0-9]+)')::NUMERIC + 1) / 2
                 ELSE 101 END) / NULLIF(SUM(pc.comparecimento), 0) AS idade_votantes,
           SUM(pc.comparecimento) AS votantes
    FROM perfil_comparecimento pc
    WHERE pc.turno = 1 AND pc.faixa_etaria ~ '^[0-9]'
    GROUP BY pc.cod_eleicao, pc.cod_tse
),
eleitos AS (
    SELECT v.cod_eleicao, v.ue AS cod_tse, AVG(v.idade_posse) AS idade_eleitos, COUNT(*) AS eleitos
    FROM vw_candidatura v
    WHERE v.eleito AND v.idade_posse > 0 AND v.ano = :ano AND v.cargo = :'cargo'
    GROUP BY v.cod_eleicao, v.ue
)
SELECT e.cod_tse,
       ROUND(vt.idade_votantes, 2)                    AS idade_votantes,
       vt.votantes,
       ROUND(e.idade_eleitos, 2)                      AS idade_eleitos,
       e.eleitos,
       ROUND(e.idade_eleitos - vt.idade_votantes, 2)  AS diferenca
FROM eleitos e
JOIN votantes vt ON vt.cod_eleicao = e.cod_eleicao AND vt.cod_tse = e.cod_tse
ORDER BY diferenca DESC;
