#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$ROOT_DIR}"

if [[ ! -d "$TARGET" ]]; then
  echo "Local depth scan needs a directory. Got: ${TARGET}" >&2
  exit 1
fi
TARGET="$(cd "$TARGET" && pwd)"
if [[ ! -d "$TARGET/.git" ]]; then
  echo "Local depth scan needs a git checkout at ${TARGET} so gitleaks can read history." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the local depth scan. npx apex-skills scan still runs without Docker." >&2
  exit 1
fi

export SCAN_ROOT="$TARGET"
compose=(docker compose -f "${ROOT_DIR}/docker-compose.quality.yml" --project-directory "${ROOT_DIR}")

run_service() {
  local name="$1"
  echo "=== ${name} ==="
  "${compose[@]}" run --rm -T "${name}"
}

run_service gitleaks
run_service semgrep
run_service trivy
echo "=== local depth scan passed ==="
