#!/usr/bin/env bash
# Cria o banco a partir de um dump gerado por gera_dump.sh.
# Requer PostgreSQL 16 ou mais recente e um papel (usuário do banco) que possa criar bancos.
#
# Uso: scripts/restaura_dump.sh eleicoes.dump
#      BANCO=outro_nome scripts/restaura_dump.sh eleicoes.dump
# A conexão segue as variáveis padrão do PostgreSQL (PGHOST, PGPORT, PGUSER, PGPASSWORD).
set -euo pipefail
BANCO="${BANCO:-eleicoes}"
DUMP="${1:-}"
VERSAO_MINIMA=16

erro() {                                  # erro <mensagem> [como resolver...]
  printf '\nErro: %s\n' "$1" >&2
  shift
  [ $# -gt 0 ] && printf '\nComo resolver:\n' >&2 && printf '  %s\n' "$@" >&2
  exit 1
}

# 1. Programas do PostgreSQL
for prog in psql createdb pg_restore; do
  command -v "$prog" >/dev/null ||
    erro "o programa '$prog' não foi encontrado; o PostgreSQL não está instalado ou não está no PATH." \
         "Ubuntu/Mint:  sudo apt install postgresql" \
         "Outros sistemas: https://www.postgresql.org/download/"
done

# 2. Arquivo do dump
[ -n "$DUMP" ] || erro "informe o arquivo do dump." "scripts/restaura_dump.sh eleicoes.dump"
[ -f "$DUMP" ] || erro "o arquivo '$DUMP' não existe." "Baixe o eleicoes.dump na página de Releases do repositório."

# 3. Conexão e papel. Conecta no banco "postgres", que existe em toda instalação.
papel="${PGUSER:-$USER}"
if ! saida=$(psql -X -At -d postgres -c 'SELECT 1' 2>&1); then
  case "$saida" in
    *"role \"$papel\" does not exist"*|*"papel \"$papel\" não existe"*)
      erro "o PostgreSQL não tem um papel (usuário do banco) chamado '$papel'." \
           "Crie o papel com permissão para criar bancos:" \
           "  sudo -u postgres createuser --createdb $papel" ;;
    *"password authentication failed"*|*"autenticação do tipo senha falhou"*|*"no password supplied"*|*"fe_sendauth"*)
      erro "a senha do papel '$papel' foi recusada ou não foi informada." \
           "Informe a senha na variável PGPASSWORD (e o usuário em PGUSER, se não for '$papel'):" \
           "  PGUSER=postgres PGPASSWORD=a-senha scripts/restaura_dump.sh $DUMP" ;;
    *"Peer authentication failed"*|*"autenticação do tipo peer falhou"*)
      erro "a conexão local exige que o papel tenha o mesmo nome do seu usuário do sistema ($USER)." \
           "Crie um papel com o seu nome:  sudo -u postgres createuser --createdb $USER" \
           "ou conecte pela rede com senha:  PGHOST=localhost PGUSER=$papel PGPASSWORD=... scripts/restaura_dump.sh $DUMP" ;;
    *"Connection refused"*|*"Conexão recusada"*|*"No such file or directory"*|*"inexistente"*|*"Is the server running"*|*"could not connect"*|*"não foi possível conectar"*)
      erro "o servidor PostgreSQL não está respondendo." \
           "Ubuntu/Mint:  sudo systemctl start postgresql" ;;
    *)
      erro "não foi possível conectar ao PostgreSQL: $saida" ;;
  esac
fi

# 4. Versão do servidor: um dump do PostgreSQL 16 não restaura em versões anteriores
versao=$(psql -X -At -d postgres -c 'SHOW server_version_num')
[ "$((versao / 10000))" -ge "$VERSAO_MINIMA" ] ||
  erro "o servidor é o PostgreSQL $((versao / 10000)); o dump exige o $VERSAO_MINIMA ou mais recente." \
       "Instale o PostgreSQL $VERSAO_MINIMA: https://www.postgresql.org/download/"

# 5. Permissão para criar bancos
pode=$(psql -X -At -d postgres -c 'SELECT rolcreatedb OR rolsuper FROM pg_roles WHERE rolname = current_user')
[ "$pode" = t ] ||
  erro "o papel '$papel' não tem permissão para criar bancos." \
       "Dê a permissão:  sudo -u postgres psql -c 'ALTER ROLE \"$papel\" CREATEDB'"

# 6. O banco ainda não pode existir
existe=$(psql -X -At -d postgres -v banco="$BANCO" <<< "SELECT count(*) FROM pg_database WHERE datname = :'banco';")
[ "$existe" = 0 ] ||
  erro "já existe um banco chamado '$BANCO'." \
       "Para restaurar com outro nome:  BANCO=eleicoes2 scripts/restaura_dump.sh $DUMP" \
       "Para substituir o existente (apaga os dados dele):  dropdb $BANCO"

# 7. Restauração
echo "Restaurando $DUMP no banco '$BANCO' (papel '$papel')..."
createdb "$BANCO"
pg_restore --no-owner --no-privileges -j "$(nproc 2>/dev/null || echo 2)" -d "$BANCO" "$DUMP"
psql -X -q -d "$BANCO" -c 'ANALYZE'
psql -X -d "$BANCO" -c "SELECT count(*) AS tabelas FROM pg_tables WHERE schemaname = 'public'"
echo "Pronto. Para conferir os dados:  psql -d $BANCO -f banco/03_validacao.sql"
