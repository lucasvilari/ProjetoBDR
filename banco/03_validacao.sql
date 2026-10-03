-- =============================================================================
-- Validação da carga. Executar com: psql -d eleicoes -f 03_validacao.sql
-- =============================================================================
\pset pager off

\echo '== 1. Linhas por tabela'
SELECT 'eleicao' AS tabela, count(*) FROM eleicao UNION ALL
SELECT 'vaga', count(*) FROM vaga UNION ALL
SELECT 'politico', count(*) FROM politico UNION ALL
SELECT 'partido', count(*) FROM partido UNION ALL
SELECT 'ideologia_partido', count(*) FROM ideologia_partido UNION ALL
SELECT 'ideologia_coligacao', count(*) FROM ideologia_coligacao UNION ALL
SELECT 'candidatura', count(*) FROM candidatura UNION ALL
SELECT 'bem', count(*) FROM bem UNION ALL
SELECT 'receita', count(*) FROM receita UNION ALL
SELECT 'despesa', count(*) FROM despesa UNION ALL
SELECT 'municipio', count(*) FROM municipio UNION ALL
SELECT 'idhm_municipio', count(*) FROM idhm_municipio UNION ALL
SELECT 'indicador_anual', count(*) FROM indicador_anual UNION ALL
SELECT 'apuracao', count(*) FROM apuracao UNION ALL
SELECT 'perfil_comparecimento', count(*) FROM perfil_comparecimento UNION ALL
SELECT 'votos_cand', count(*) FROM votos_cand UNION ALL
SELECT 'votos_part', count(*) FROM votos_part;

\echo '== 2. Eleitos x vagas por ano e cargo (devem coincidir, salvo eleições anuladas)'
SELECT v.ano, v.cargo, count(*) FILTER (WHERE v.eleito) AS eleitos,
       (SELECT sum(qt_vagas) FROM vaga g JOIN eleicao e USING (cod_eleicao)
         WHERE e.ano = v.ano AND g.cargo = v.cargo) AS vagas
FROM vw_candidatura v
WHERE v.ano >= 2018 AND v.cargo IN ('PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL',
                                    'DEPUTADO ESTADUAL', 'PREFEITO', 'VEREADOR')
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 3. Receitas e despesas carregadas x total dos CSVs no escopo (diferença = candidatura não carregada)'
WITH csv AS (SELECT ano, sum(valor) FILTER (WHERE tabela = 'receita') AS receitas_csv,
                         sum(valor) FILTER (WHERE tabela = 'despesa') AS despesas_csv
             FROM carga.total_csv GROUP BY ano),
rec AS (SELECT v.ano, sum(r.valor) AS total FROM receita r JOIN vw_candidatura v USING (sq_candidato) GROUP BY 1),
des AS (SELECT v.ano, sum(d.valor) AS total FROM despesa d JOIN vw_candidatura v USING (sq_candidato) GROUP BY 1)
SELECT c.ano,
       round(rec.total) AS receitas_banco, round(100 * rec.total / c.receitas_csv, 3) AS pct_receitas,
       round(des.total) AS despesas_banco, round(100 * des.total / c.despesas_csv, 3) AS pct_despesas
FROM csv c JOIN rec USING (ano) JOIN des USING (ano) ORDER BY 1;

\echo '== 4. Votos válidos: apuração x soma dos votos de partido (nominais + legenda), 1º turno'
SELECT e.ano, a.cargo,
       sum(a.aptos - a.abstencoes - a.brancos - a.nulos) AS validos_apuracao,
       (SELECT sum(p.votos_nominais + p.votos_legenda) FROM votos_part p JOIN eleicao ep USING (cod_eleicao)
         WHERE ep.ano = e.ano AND p.cargo = a.cargo AND p.turno = 1) AS validos_partidos
FROM apuracao a JOIN eleicao e USING (cod_eleicao)
WHERE a.turno = 1 AND a.cargo IN ('DEPUTADO FEDERAL', 'VEREADOR', 'PRESIDENTE', 'PREFEITO')
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 5. Votos nominais: votos_cand x votos_part, 1º turno, cargos proporcionais'
SELECT e.ano, c.cargo, sum(vc.votos) AS nominais_candidatos,
       (SELECT sum(p.votos_nominais) FROM votos_part p JOIN eleicao ep USING (cod_eleicao)
         WHERE ep.ano = e.ano AND p.cargo = c.cargo AND p.turno = 1) AS nominais_partidos
FROM votos_cand vc JOIN candidatura c USING (sq_candidato) JOIN eleicao e ON e.cod_eleicao = c.cod_eleicao
WHERE vc.turno = 1 AND c.cargo IN ('DEPUTADO FEDERAL', 'VEREADOR')
GROUP BY 1, 2 ORDER BY 1, 2;

\echo '== 6. Comparecimento: perfil x apuração (1º turno, eleição com prefeito ou presidente)'
SELECT e.ano,
       (SELECT sum(aptos) FROM apuracao a WHERE a.cod_eleicao = e.cod_eleicao AND a.turno = 1
          AND a.cargo IN ('PREFEITO', 'PRESIDENTE')) AS aptos_apuracao,
       (SELECT sum(aptos) FROM perfil_comparecimento p WHERE p.cod_eleicao = e.cod_eleicao AND p.turno = 1) AS aptos_perfil
FROM eleicao e WHERE e.cod_eleicao IN (295, 426, 544, 619) ORDER BY 1;

\echo '== 7. Cobertura dos atributos derivados e opcionais nas candidaturas'
SELECT e.ano, count(*) AS candidaturas,
       round(100.0 * count(c.idade_posse) / count(*), 1)  AS pct_idade,
       round(100.0 * count(c.escolaridade) / count(*), 1) AS pct_escolaridade,
       round(100.0 * count(*) FILTER (WHERE c.reeleicao) / count(*), 1) AS pct_reeleicao
FROM candidatura c JOIN eleicao e USING (cod_eleicao) GROUP BY 1 ORDER BY 1;

\echo '== 8. Descartes registrados na carga (o registro mais recente de cada etapa refeita)'
SELECT etapa, detalhe, linhas
FROM (SELECT DISTINCT ON (etapa, detalhe) * FROM carga.log ORDER BY etapa, detalhe, id DESC) ult
WHERE etapa LIKE '%descarte' AND linhas > 0 ORDER BY id;
