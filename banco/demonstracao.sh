#!/usr/bin/env bash
# Roteiro de demonstração da carga para a apresentação (cerca de 10 minutos).
#
# Cada passo mostra um texto de apoio para a fala, exibe o comando e só então o
# executa. Enter avança; q + Enter encerra.
#
#   ./demonstracao.sh              apresentação, com pausas
#   ./demonstracao.sh --ensaio     roda tudo de uma vez, sem pausas (para ensaiar)
#   ./demonstracao.sh --passo 3    começa do passo 3
#
# O passo 2 roda uma etapa real da carga (recarrega a tabela apuracao, ~30 s).
# É seguro repetir: a etapa apaga e regrava só aquela tabela.
set -uo pipefail
cd "$(dirname "$0")"

BANCO="${BANCO:-eleicoes}"
DADOS="../crawler/dados"
PAUSA=1; INICIO=1
while [ $# -gt 0 ]; do
  case "$1" in
    --ensaio) PAUSA=0 ;;
    --passo) INICIO="$2"; shift ;;
    *) echo "opção desconhecida: $1"; exit 2 ;;
  esac
  shift
done

if [ -t 1 ]; then
  N=$'\e[1m'; D=$'\e[2m'; C=$'\e[36m'; A=$'\e[33m'; R=$'\e[0m'
else
  N=''; D=''; C=''; A=''; R=''
fi

passo() {                       # passo <número> <título>
  printf '\n%s━━━ Passo %s de 5 · %s ━━━%s\n' "$N" "$1" "$2" "$R"
}
fala() {                        # texto de apoio para quem apresenta
  printf '%s%s%s\n' "$D" "$*" "$R" | fold -s -w 100
}
pausa() {
  [ "$PAUSA" = 1 ] || return 0
  printf '\n%s[Enter para continuar · q para sair]%s ' "$A" "$R"
  read -r resp
  [ "$resp" = q ] && exit 0
}
roda() {                        # mostra o comando e o executa
  printf '\n%s$ %s%s\n' "$C" "$1" "$R"
  bash -c "$1"
}
sql() {                         # mostra e executa uma consulta no banco
  printf '\n%s%s%s\n' "$C" "$1" "$R"
  psql -X -q -d "$BANCO" -P pager=off -P null='—' -c "$1"
}

# ---------------------------------------------------------------------------
if [ "$INICIO" -le 1 ]; then
passo 1 "O ponto de partida"
fala "O crawler baixou os arquivos do TSE, do IBGE, do Atlas e do survey de ideologia. São 31 GB de CSV,"
fala "organizados por fonte, tipo e ano. A carga transforma isso nas 16 tabelas do modelo relacional."
roda "du -sh $DADOS/tse/* | sort -h"
sql "SELECT t.relname AS tabela, to_char(c.linhas, 'FM999G999G999') AS linhas,
            pg_size_pretty(pg_total_relation_size(t.relid)) AS tamanho
     FROM pg_stat_user_tables t,
          LATERAL (SELECT (xpath('/row/n/text()', query_to_xml('SELECT count(*) AS n FROM ' || t.relname, false, true, '')))[1]::text::bigint AS linhas) c
     WHERE t.schemaname = 'public'
     ORDER BY pg_total_relation_size(t.relid) DESC"
pausa
fi

# ---------------------------------------------------------------------------
if [ "$INICIO" -le 2 ]; then
passo 2 "A carga ao vivo"
fala "Cada CSV é copiado sem transformação (COPY) para uma tabela de preparo, com tudo como texto."
fala "A limpeza e a gravação no modelo são feitas em SQL. Vou rodar uma etapa real: os arquivos-base"
fala "são preparados e a tabela de apuração é recarregada. Repare que cada descarte aparece com o motivo."
roda ".venv/bin/python carga.py --etapas preparo,apuracao,limpeza"
pausa
fi

# ---------------------------------------------------------------------------
if [ "$INICIO" -le 3 ]; then
passo 3 "Do arquivo bruto à tabela"
fala "Primeiro problema encontrado nos dados: no arquivo de despesas, o SQ_DESPESA identifica o documento,"
fala "não o item. Esta nota fiscal de um candidato a deputado federal em 2022 ocupa três linhas no CSV:"
roda "command grep -a -F ';46029831;' $DADOS/tse/despesas_contratadas_candidatos/2022/despesas_contratadas_candidatos_2022_BRASIL.csv \\
  | iconv -f latin1 -t utf8 | cut -d';' -f49,50,52,53"
fala "Tipo e fornecedor nunca variam dentro de um documento, então a carga soma os itens e mantém a"
fala "chave primária do dossiê. 3.000 + 1.250 + 200 = 4.450:"
sql "SELECT sq_despesa, tipo, descricao, valor FROM despesa WHERE sq_despesa = 46029831"
pausa
fala "Segundo problema: antes de 2018 o SQ_CANDIDATO não identifica a candidatura (em 2000, 399 mil"
fala "candidaturas têm só 3.131 valores distintos). Nessas eleições a carga gera um identificador"
fala "negativo. O político é ligado entre eleições pelo título eleitoral:"
sql "SELECT e.ano, c.cargo, c.ue, pa.sigla, c.situacao_final, c.reeleicao, c.sq_candidato
     FROM candidatura c JOIN eleicao e USING (cod_eleicao) JOIN partido pa USING (id_partido)
     JOIN politico p USING (titulo_eleitoral)
     WHERE p.nome = 'LUIZ INÁCIO LULA DA SILVA' ORDER BY e.ano"
fala "Se perguntarem pelas linhas sem situação: em 2006 o próprio arquivo do TSE não traz o resultado da"
fala "eleição presidencial; em 2018 a candidatura foi indeferida antes da eleição."
pausa
fi

# ---------------------------------------------------------------------------
if [ "$INICIO" -le 4 ]; then
passo 4 "Nada some sem explicação"
fala "Cada etapa grava na tabela carga.log o que leu, gravou e descartou. Linhas gravadas por tabela:"
sql "WITH ult AS (SELECT DISTINCT ON (etapa, detalhe) * FROM carga.log ORDER BY etapa, detalhe, id DESC)
     SELECT etapa AS tabela, to_char(sum(linhas), 'FM999G999G999') AS linhas_gravadas,
            round(sum(segundos) / 60, 1) AS minutos
     FROM ult
     WHERE etapa IN ('municipio', 'idhm_municipio', 'indicador_anual', 'eleicao', 'partido', 'politico',
                     'candidatura', 'vaga', 'ideologia_partido', 'apuracao', 'votos_part', 'bem', 'receita',
                     'despesa', 'votos_cand', 'perfil_comparecimento')
     GROUP BY etapa ORDER BY min(id)"
pausa
fala "E o que ficou de fora, com o motivo:"
sql "WITH ult AS (SELECT DISTINCT ON (etapa, detalhe) * FROM carga.log ORDER BY etapa, detalhe, id DESC)
     SELECT replace(etapa, ' descarte', '') AS tabela,
            regexp_replace(detalhe, '^[0-9]{4}: ', '') AS motivo,
            to_char(sum(linhas), 'FM999G999G999') AS linhas
     FROM ult WHERE etapa LIKE '%descarte' AND linhas > 0
     GROUP BY 1, 2 ORDER BY 1, sum(linhas) DESC"
pausa
fi

# ---------------------------------------------------------------------------
if [ "$INICIO" -le 5 ]; then
passo 5 "A carga está certa?"
fala "Três conferências contra a realidade. Primeiro: eleitos coincidem com as cadeiras em disputa."
sql "SELECT v.ano, v.cargo, count(*) FILTER (WHERE v.eleito) AS eleitos,
            (SELECT sum(qt_vagas) FROM vaga g JOIN eleicao e USING (cod_eleicao)
              WHERE e.ano = v.ano AND g.cargo = v.cargo) AS vagas
     FROM vw_candidatura v
     WHERE v.ano IN (2018, 2022) AND v.cargo IN ('PRESIDENTE', 'GOVERNADOR', 'SENADOR', 'DEPUTADO FEDERAL', 'DEPUTADO ESTADUAL')
     GROUP BY 1, 2 ORDER BY 1, 2"
pausa
fala "Segundo: receitas e despesas no banco somam quase 100% do total dos CSVs do TSE. O que falta é de"
fala "candidaturas de eleições suplementares, que o dicionário exclui."
sql "WITH csv (ano, receitas, despesas) AS (VALUES
         (2018, 3339823579, 3160962463), (2020, 6324104417, 3229822855),
         (2022, 6636139109, 6364168204), (2024, 7042259476, 6401532500)),
     rec AS (SELECT v.ano, sum(r.valor) t FROM receita r JOIN vw_candidatura v USING (sq_candidato) GROUP BY 1),
     des AS (SELECT v.ano, sum(d.valor) t FROM despesa d JOIN vw_candidatura v USING (sq_candidato) GROUP BY 1)
     SELECT c.ano, round(100 * rec.t / c.receitas, 2) AS pct_receitas, round(100 * des.t / c.despesas, 2) AS pct_despesas
     FROM csv c JOIN rec USING (ano) JOIN des USING (ano) ORDER BY 1"
pausa
fala "Terceiro: a carga serve às perguntas. A pergunta 5 (eleitos por votos de legenda) rodava em 13,5"
fala "minutos com o SQL original; com os votos válidos oficiais e a correção de tipo, leva segundos:"
printf '\n%s$ psql -v sigla=PT -f sql/p05_eleitos_legenda.sql%s\n' "$C" "$R"
{ echo '\timing on'; cat sql/p05_eleitos_legenda.sql; } | psql -X -q -d "$BANCO" -P pager=off -v sigla=PT
fala ""
fala "Fim da demonstração. O modelo completo, com o D.E.R. e as 16 tabelas, está na página HTML."
fi
