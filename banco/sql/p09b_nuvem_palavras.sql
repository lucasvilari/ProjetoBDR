-- Palavras para a nuvem: frequência e valor associado nas descrições das despesas
WITH palavras AS (
    SELECT d.valor,
           REGEXP_SPLIT_TO_TABLE(LOWER(d.descricao), '[^a-zà-ú0-9]+') AS palavra
    FROM despesa d
    JOIN vw_candidatura v ON v.sq_candidato = d.sq_candidato
    WHERE v.ano = :ano
      AND (:'sq_candidato' = '' OR v.sq_candidato = NULLIF(:'sq_candidato', '')::BIGINT)
),
stopwords (palavra) AS (
    VALUES ('de'), ('da'), ('do'), ('das'), ('dos'), ('e'), ('a'), ('o'), ('as'), ('os'),
           ('em'), ('para'), ('com'), ('por'), ('no'), ('na'), ('nos'), ('nas'), ('um'),
           ('uma'), ('ref'), ('referente'), ('servico'), ('servicos'),
           ('serviço'), ('serviços')
)
SELECT p.palavra,
       COUNT(*)      AS frequencia,
       SUM(p.valor)  AS valor_associado
FROM palavras p
WHERE LENGTH(p.palavra) > 2
  AND p.palavra !~ '^[0-9]+$'
  AND NOT EXISTS (SELECT 1 FROM stopwords s WHERE s.palavra = p.palavra)
GROUP BY p.palavra
ORDER BY frequencia DESC
LIMIT 100;
