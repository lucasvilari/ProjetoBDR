#!/usr/bin/env bash
# Executa as 18 consultas da seção 6 e grava as evidências da seção 6.11:
#   evidencias/ev_<consulta>.txt  sessão do psql (ambiente, comando, resultado, tempo)
#   evidencias/ev_<consulta>.csv  resultado completo
#   evidencias/ev_<consulta>.png  print da sessão (gerado por print_sessao.py)
#   evidencias/quadro.csv         linhas e tempo de cada consulta, para o quadro 6.11.3
# Uso: ./evidencias.sh   (a partir da pasta banco, com o banco já carregado)
set -euo pipefail
cd "$(dirname "$0")"
BANCO="${BANCO:-eleicoes}"
mkdir -p evidencias

# Político da pergunta 10: identificado pelo título, escolhido pelo nome.
POLITICO="LUIZ INÁCIO LULA DA SILVA"
titulo() { echo "SELECT titulo_eleitoral FROM politico WHERE nome = :'nome';" | psql -X -At -d "$BANCO" -v nome="$1"; }
TITULO=$(titulo "$POLITICO")
# Trajetória ideológica (acréscimo): uma carreira com trocas de partido.
POLITICO2="MARIA OSMARINA MARINA DA SILVA VAZ DE LIMA"
TITULO2=$(titulo "$POLITICO2")

# consulta | parâmetros nome=valor separados por ';' (sem aspas: o SQL usa :'var') | anotação
CONSULTAS=(
  "p01_custo_cadeira||"
  "p02_taxa_por_patrimonio|cargo=DEPUTADO FEDERAL|cargo = DEPUTADO FEDERAL"
  "p03a_indices_municipio|cod_tse=12190|município = Teresina (12190)"
  "p03b_partidos_municipio|cod_tse=12190|município = Teresina (12190)"
  "p03c_indices_por_partido|ano=2024|ano = 2024"
  "p04a_escolaridade_sucesso||"
  "p04b_escolaridade_municipio|ano=2024;cargo=VEREADOR|ano = 2024, cargo = VEREADOR"
  "p05_eleitos_legenda|sigla=PT|partido = PT"
  "p06a_alternancia||"
  "p06b_jovem_vota_jovem|ano=2024;cargo=VEREADOR|ano = 2024, cargo = VEREADOR"
  "p07_vies_ideologico|nivel=uf|nível = UF"
  "p07b_ideologia_coligacoes|ano=2024;sigla=|ano = 2024, todos os partidos"
  "p08_dependencia_publica||"
  "p09a_gasto_por_tipo|ano=2024;sq_candidato=|ano = 2024, todos os candidatos"
  "p09b_nuvem_palavras|ano=2024;sq_candidato=|ano = 2024, todos os candidatos"
  "p10a_linha_do_tempo|titulo=$TITULO|político = $POLITICO"
  "p10b_resumo_carreira|titulo=$TITULO|político = $POLITICO"
  "p10c_trajetoria_ideologica|titulo=$TITULO2|político = $POLITICO2"
)

echo "consulta,arquivo_sql,parametros,linhas,tempo_s,executado_em" > evidencias/quadro.csv
for item in "${CONSULTAS[@]}"; do
  IFS='|' read -r nome params anotacao <<< "$item"
  ev="evidencias/ev_${nome}"
  vars=()
  IFS=';' read -r -a pares <<< "$params"
  for p in "${pares[@]}"; do [ -n "$p" ] && vars+=(-v "$p"); done
  echo ">> $nome ${anotacao:+($anotacao)}"

  # 1. sessão: ambiente, comando e resultado (base do print)
  psql -X -d "$BANCO" -v ON_ERROR_STOP=1 "${vars[@]}" > "$ev.txt" 2>&1 <<SQL
\pset pager off
\echo '-- consulta: sql/${nome}.sql'
\echo '-- parâmetros: ${anotacao:-nenhum}'
SELECT version() AS servidor, current_database() AS banco, now()::timestamp(0) AS executado_em;
\timing on
\set ECHO queries
\i sql/${nome}.sql
SQL

  # o título eleitoral é dado pessoal: não fica gravado na evidência, que vai para o repositório
  for t in "$TITULO" "$TITULO2"; do
    [ -n "$t" ] && sed -i "s/$t/<título eleitoral omitido>/g" "$ev.txt"
  done

  # 2. resultado completo em CSV, pela visão de mesmo nome (descartada ao fim da sessão)
  consulta=$(sed -e '$ s/;[[:space:]]*$//' "sql/${nome}.sql")
  psql -X -q -d "$BANCO" -v ON_ERROR_STOP=1 "${vars[@]}" <<SQL
CREATE TEMP VIEW vw_${nome} AS
${consulta};
\copy (SELECT * FROM vw_${nome}) TO '${ev}.csv' CSV HEADER
SQL

  linhas=$(( $(wc -l < "$ev.csv") - 1 ))
  # o psql escreve o tempo no formato do locale (vírgula decimal em pt_BR)
  tempo=$(grep -oP '^Time: \K[0-9.,]+(?= ms)' "$ev.txt" | tail -1 | tr ',' '.' | LC_ALL=C awk '{printf "%.2f", $1/1000}' || true)
  quando=$(grep -oP '\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}' "$ev.txt" | head -1 || true)
  echo "${nome},${nome}.sql,\"${anotacao}\",${linhas},${tempo},${quando}" >> evidencias/quadro.csv
  echo "   ${linhas} linhas em ${tempo} s"
done

PY=.venv/bin/python; [ -x "$PY" ] || PY=python3
"$PY" print_sessao.py evidencias/ev_*.txt
