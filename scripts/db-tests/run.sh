#!/usr/bin/env bash
# Tests serveur : reconstruit une base PostgreSQL VIERGE à partir de toutes
# les migrations (supabase/migrations), puis joue les scénarios de
# supabase/validations/*_local.sql. Échoue au moindre « ok = f » / FAIL.
#
# Connexion : variables PG* habituelles (PGHOST, PGPORT, PGUSER, PGPASSWORD).
# Base créée puis supprimée : $DB_TESTS_NAME (défaut atelierflow_tests).
# Jamais contre la production : la base est détruite et recréée.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${DB_TESTS_NAME:-atelierflow_tests}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

psql_admin() { psql -X -q -v ON_ERROR_STOP=1 -d postgres "$@"; }
psql_db() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

echo "▸ Base de test « $DB » (recréée)"
psql_admin -c "drop database if exists \"$DB\" with (force)" >/dev/null
psql_admin -c "create database \"$DB\"" >/dev/null
psql_db -f "$ROOT/scripts/db-tests/auth_shim.sql" >/dev/null

echo "▸ Migrations"
for m in "$ROOT"/supabase/migrations/*.sql; do
  psql_db -f "$m" >/dev/null 2>"$OUT/err" || { echo "✗ $(basename "$m")"; cat "$OUT/err"; exit 1; }
  echo "  ✓ $(basename "$m")"
done

# « critical » est autonome ; les suivants partagent l'atelier créé par
# invitations (rendez-vous, fichiers, attaques et abonnements s'y appuient).
SUITES=(critical invitations appointments files security_attacks subscriptions)
failed=0
echo "▸ Scénarios"
for s in "${SUITES[@]}"; do
  f="$ROOT/supabase/validations/${s}_local.sql"
  if ! psql_db -P pager=off -f "$f" >"$OUT/$s.log" 2>&1; then
    echo "  ✗ $s (erreur SQL)"; cat "$OUT/$s.log"; failed=1; continue
  fi
  if [ "$s" = invitations ]; then
    psql_db -P pager=off -c "select step, status, detail from _i_results order by seq" >>"$OUT/$s.log"
  fi
  bad=$(grep -E '\| f *$|\| FAIL *\|' "$OUT/$s.log" || true)
  total=$(grep -cE '\| (t|f) *$|\| (PASS|FAIL) *\|' "$OUT/$s.log" || true)
  if [ -n "$bad" ] || [ "$total" -eq 0 ]; then
    echo "  ✗ $s"; cat "$OUT/$s.log"; failed=1
  else
    echo "  ✓ $s ($total vérifications)"
  fi
done

psql_admin -c "drop database if exists \"$DB\" with (force)" >/dev/null
[ "$failed" -eq 0 ] && echo "✔ Tous les scénarios serveur passent." || { echo "✘ Échecs ci-dessus."; exit 1; }
