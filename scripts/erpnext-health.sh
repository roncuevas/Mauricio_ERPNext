#!/usr/bin/env bash
set -euo pipefail

url="${ERP_URL:-http://localhost:8080}/api/method/ping"
curl --fail --silent --show-error --connect-timeout 5 "$url" >/dev/null
echo "ERPNext saludable: $url"
