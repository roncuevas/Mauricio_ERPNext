#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env.erpnext.local ]]; then cp .env.erpnext.example .env.erpnext.local; fi
set -a
source .env.erpnext.local
set +a
compose=(docker compose --env-file .env.erpnext.local -f docker-compose.erpnext.yml)
"${compose[@]}" up -d
scripts/erpnext-seed.py
