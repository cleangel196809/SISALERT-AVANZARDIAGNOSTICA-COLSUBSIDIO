#!/usr/bin/env bash
# Levanta (o reutiliza) un Postgres temporal para pruebas: puerto 5433, usuario/db/clave "sisalert".
# Uso: bash tests/start-test-db.sh   |   bash tests/start-test-db.sh stop
set -euo pipefail
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/tmp/sisalert-pgdata}"
PORT="${PGPORT_TEST:-5433}"
RUNAS=""
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  RUNAS="su postgres -s /bin/bash -c"
fi
run() { if [ -n "$RUNAS" ]; then $RUNAS "$*"; else bash -c "$*"; fi; }

if [ "${1:-}" = "stop" ]; then
  run "$PGBIN/pg_ctl -D $PGDATA stop -m fast" || true
  exit 0
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"
  [ -n "$RUNAS" ] && chown postgres "$PGDATA"
  run "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8 >/dev/null"
fi
if ! run "$PGBIN/pg_isready -h 127.0.0.1 -p $PORT" >/dev/null 2>&1; then
  run "$PGBIN/pg_ctl -D $PGDATA -o '-p $PORT -k /tmp -c listen_addresses=127.0.0.1' -l $PGDATA/server.log -w start"
fi
PSQL="$PGBIN/psql -h 127.0.0.1 -p $PORT -U postgres -tAc"
run "$PSQL \"SELECT 1 FROM pg_roles WHERE rolname='sisalert'\"" | grep -q 1 || run "$PSQL \"CREATE ROLE sisalert LOGIN SUPERUSER PASSWORD 'sisalert'\""
run "$PSQL \"SELECT 1 FROM pg_database WHERE datname='sisalert'\"" | grep -q 1 || run "$PSQL \"CREATE DATABASE sisalert OWNER sisalert\""
echo "Postgres de pruebas listo: postgres://sisalert:sisalert@127.0.0.1:$PORT/sisalert"
