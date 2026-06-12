#!/usr/bin/env bash
#
# backup.sh — Respaldo comprimido de la base de datos PostgreSQL/PostGIS de
# DataRaíz.
#
# Ejecuta `pg_dump` DENTRO del contenedor `db` (no requiere tener psql en el
# host) y guarda un volcado SQL plano comprimido con gzip en `backups/`. El
# volcado incluye el esquema y los datos de todas las tablas; al restaurarlo
# sobre una base limpia se recrean también las migraciones ya aplicadas.
#
# Uso:
#   ./scripts/backup.sh                 # crea backups/dataraiz_<fecha>.sql.gz
#   BACKUP_DIR=/ruta ./scripts/backup.sh
#
set -euo pipefail

# Raíz del repositorio (este script vive en scripts/).
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Credenciales desde .env (con valores por defecto del entorno de desarrollo).
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
DB_USER="${POSTGRES_USER:-dataraiz}"
DB_NAME="${POSTGRES_DB:-dataraiz_db}"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/dataraiz_${STAMP}.sql.gz"

echo "[backup] Volcando $DB_NAME (usuario $DB_USER) → $OUT"

# -T: sin TTY (necesario para piping). pg_dump --clean --if-exists permite
# restaurar sobre una base existente sin choques con objetos previos.
docker compose exec -T db \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip -9 > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[backup] OK — $OUT ($SIZE)"

# Verificación mínima: el archivo no está vacío y descomprime sin error.
if gzip -t "$OUT" 2>/dev/null && [[ -s "$OUT" ]]; then
  echo "[backup] Verificación de integridad gzip: OK"
else
  echo "[backup] ERROR: el archivo de respaldo está corrupto o vacío" >&2
  exit 1
fi
