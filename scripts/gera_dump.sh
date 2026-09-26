#!/usr/bin/env bash
# Gera um dump comprimido do banco carregado, para publicar como Release do GitHub.
# Quem baixar o dump não precisa do crawler nem dos 31 GB de CSV: basta restaurá-lo.
# Uso: scripts/gera_dump.sh [arquivo]   (padrão: eleicoes.dump)
set -euo pipefail
BANCO="${BANCO:-eleicoes}"
SAIDA="${1:-eleicoes.dump}"
pg_dump -Fc -Z 9 --no-owner --no-privileges --exclude-schema=stg -d "$BANCO" -f "$SAIDA"
ls -lh "$SAIDA"
