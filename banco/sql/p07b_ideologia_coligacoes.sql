-- Posição dos partidos segundo os especialistas e segundo as coligações para prefeito.
-- concordancia: correlação de Spearman entre as duas ordens no ano (1 = mesma ordem).
-- espectro_camara: posição do partido nas votações da Câmara (-100 a +100), para comparação.
-- Parâmetros opcionais: ano e sigla ('' = todos).
WITH notas AS (
    SELECT ic.ano,
           pa.sigla,
           ic.coligacoes,
           vi.nota_especialistas,
           vi.nota_herdada,
           ic.nota AS nota_coligacoes,
           vi.espectro_camara
    FROM ideologia_coligacao ic
    JOIN partido pa               ON pa.id_partido = ic.id_partido
    JOIN vw_ideologia_partido vi  ON vi.id_partido = ic.id_partido AND vi.ano = ic.ano
),
ordens AS (
    SELECT n.*,
           RANK() OVER (PARTITION BY ano ORDER BY nota_especialistas) AS ordem_esp,
           RANK() OVER (PARTITION BY ano ORDER BY nota_coligacoes)    AS ordem_col
    FROM notas n
    WHERE nota_especialistas IS NOT NULL
)
SELECT n.ano,
       n.sigla,
       n.coligacoes,
       n.nota_especialistas,
       n.nota_herdada,
       n.nota_coligacoes,
       n.nota_coligacoes - n.nota_especialistas              AS diferenca,
       n.espectro_camara,
       ROUND(c.concordancia::NUMERIC, 2)                     AS concordancia
FROM notas n
JOIN (SELECT ano, CORR(ordem_esp, ordem_col) AS concordancia
      FROM ordens GROUP BY ano) c ON c.ano = n.ano
WHERE (:'ano' = '' OR n.ano = NULLIF(:'ano', '')::SMALLINT)
  AND (:'sigla' = '' OR n.sigla = :'sigla')
ORDER BY n.ano, n.nota_coligacoes;
