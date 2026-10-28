#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env.erpnext.local ]]; then cp .env.erpnext.example .env.erpnext.local; fi
docker compose --env-file .env.erpnext.local -f docker-compose.erpnext.yml down -v --remove-orphans
scripts/erpnext-up.sh
