#!/bin/sh
# Runs once, on an empty data directory (docker-entrypoint-initdb.d).
# kaptan_owner (POSTGRES_USER) owns the schema and runs migrations, the seed and the demo reset.
# kaptan_app is what the API connects as: audit.audit_log is INSERT/SELECT only for it.
# kaptan_test is the database the integration tests migrate and seed (never the dev database).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_pw="$KAPTAN_APP_PASSWORD" -v db="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE kaptan_app LOGIN PASSWORD %L', :'app_pw')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'kaptan_app') \gexec
CREATE DATABASE kaptan_test;
GRANT CONNECT ON DATABASE :"db" TO kaptan_app;
GRANT CONNECT ON DATABASE kaptan_test TO kaptan_app;
SQL
