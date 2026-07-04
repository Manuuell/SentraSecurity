#!/bin/sh
# Entrypoint del contenedor de la API: prepara la BD (migraciones) y arranca uvicorn.
set -e

python -m server.db_bootstrap
exec uvicorn server.main:app --host 0.0.0.0 --port 8000
