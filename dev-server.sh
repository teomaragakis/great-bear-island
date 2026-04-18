#!/usr/bin/env bash

set -euo pipefail

PORT="${1:-8000}"

echo "Serving Great Bear Island at http://localhost:${PORT}"
exec python3 -m http.server "${PORT}"
