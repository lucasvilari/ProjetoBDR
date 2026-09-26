-- Extrai do catálogo do PostgreSQL a estrutura do banco em JSON, para a página
-- modelo_relacional.html: colunas, chaves, restrições, visões e índices.
-- Uso (pela pasta docs/modelo): python3 gera_pagina.py --atualizar
WITH cols AS (
  SELECT c.table_name, json_agg(json_build_object(
           'nome', c.column_name,
           'tipo', CASE WHEN c.data_type = 'character varying' THEN 'VARCHAR(' || c.character_maximum_length || ')'
                        WHEN c.data_type = 'character' THEN 'CHAR(' || c.character_maximum_length || ')'
                        WHEN c.data_type = 'numeric' THEN 'NUMERIC(' || c.numeric_precision || ',' || c.numeric_scale || ')'
                        ELSE upper(c.data_type) END,
           'nulo', c.is_nullable = 'YES',
           'gerada', c.generation_expression,
           'padrao', c.column_default
         ) ORDER BY c.ordinal_position) AS colunas
  FROM information_schema.columns c WHERE c.table_schema = 'public' GROUP BY c.table_name),
pk AS (
  SELECT tc.table_name, json_agg(k.column_name ORDER BY k.ordinal_position) AS pk
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage k USING (constraint_schema, constraint_name)
  WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY' GROUP BY tc.table_name),
uq AS (
  SELECT tc.table_name, json_agg(k.column_name ORDER BY k.ordinal_position) AS uq
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage k USING (constraint_schema, constraint_name)
  WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE' GROUP BY tc.table_name),
fk AS (
  SELECT cl.relname AS table_name, json_agg(json_build_object(
           'colunas', (SELECT json_agg(a.attname ORDER BY u.ord) FROM unnest(co.conkey) WITH ORDINALITY u(n, ord)
                       JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = u.n),
           'ref', rf.relname,
           'cascata', co.confdeltype = 'c')) AS fks
  FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid JOIN pg_class rf ON rf.oid = co.confrelid
  WHERE co.contype = 'f' AND cl.relnamespace = 'public'::regnamespace GROUP BY cl.relname),
ck AS (
  SELECT cl.relname AS table_name, json_agg(pg_get_constraintdef(co.oid)) AS checks
  FROM pg_constraint co JOIN pg_class cl ON cl.oid = co.conrelid
  WHERE co.contype = 'c' AND cl.relnamespace = 'public'::regnamespace GROUP BY cl.relname),
n AS (
  SELECT relname AS table_name, n_live_tup AS linhas, pg_total_relation_size(relid) AS bytes
  FROM pg_stat_user_tables WHERE schemaname = 'public')
SELECT json_build_object(
  'tabelas', (SELECT json_object_agg(t.table_name, json_build_object('colunas', cols.colunas, 'pk', pk.pk, 'uq', uq.uq,
                'fks', COALESCE(fk.fks, '[]'), 'checks', COALESCE(ck.checks, '[]'), 'linhas', n.linhas, 'bytes', n.bytes))
              FROM information_schema.tables t JOIN cols USING (table_name) LEFT JOIN pk USING (table_name)
              LEFT JOIN uq USING (table_name) LEFT JOIN fk USING (table_name) LEFT JOIN ck USING (table_name)
              LEFT JOIN n USING (table_name)
              WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'),
  'visoes', (SELECT json_object_agg(viewname, pg_get_viewdef(viewname::regclass, true)) FROM pg_views WHERE schemaname = 'public'),
  'indices', (SELECT json_agg(json_build_object('nome', indexname, 'tabela', tablename, 'def', indexdef))
              FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%'),
  'tamanho', pg_size_pretty(pg_database_size(current_database())));
