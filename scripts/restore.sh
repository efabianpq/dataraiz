#!/usr/bin/env bash
#
# restore.sh — Restaura un respaldo de DataRaíz generado por backup.sh.
#
# ¡ATENCIÓN! Esta operación SOBRESCRIBE los datos actuales: el volcado se
# generó con `pg_dump --clean --if-exists`, así que primero elimina (DROP) los
# objetos existentes y luego los recrea con los datos del respaldo. Haz un
# backup.sh antes si quieres conservar el estado actual.
#
# Uso:
#   ./scripts/restore.sh backups/dataraiz_20260611_120000.sql.gz
#
# Pasos que realiza:
#   1. Verifica que el archivo exista y sea un gzip válido.
#   2. Pide confirmación explícita (saltable con FORCE=1).
#   3. Descomprime y aplica el SQL dentro del contenedor `db` vía psql.
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <archivo.sql.gz>" >&2
  echo "Ejemplo: $0 backups/dataraiz_20260611_120000.sql.gz" >&2
  exit 1
fi

FILE="$1"
if [[ ! -f "$FILE" ]]; then
  echo "[restore] ERROR: no existe el archivo '$FILE'" >&2
  exit 1
fi
if ! gzip -t "$FILE" 2>/dev/null; then
  echo "[restore] ERROR: '$FILE' no es un gzip válido" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
DB_USER="${POSTGRES_USER:-dataraiz}"
DB_NAME="${POSTGRES_DB:-dataraiz_db}"

echo "[restore] Se RESTAURARÁ '$FILE' sobre la base '$DB_NAME'."
echo "[restore] Esto SOBRESCRIBE los datos actuales."
if [[ "${FORCE:-0}" != "1" ]]; then
  read -r -p "¿Continuar? (escribe 'si'): " CONFIRM
  if [[ "$CONFIRM" != "si" ]]; then
    echo "[restore] Cancelado."
    exit 0
  fi
fi

echo "[restore] Restaurando…"
# ON_ERROR_STOP=1 aborta ante el primer error de SQL; -T desactiva el TTY.
gunzip -c "$FILE" \
  | docker compose exec -T db \
      psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME"

echo "[restore] OK — base '$DB_NAME' restaurada desde '$FILE'."
echo "[restore] Sugerencia: reinicia el backend con 'docker compose restart backend'."
