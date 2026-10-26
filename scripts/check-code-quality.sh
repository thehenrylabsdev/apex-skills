#!/usr/bin/env bash
set -euo pipefail

echo "=== [1/5] ESLint (Strict Zero-Warning Gate) ==="
npx eslint . --max-warnings 0

echo "=== [2/5] TypeScript Compiler (Strict Typecheck Gate) ==="
npx tsc --noEmit

echo "=== [3/5] Automated Unit & Integration Test Suite ==="
npm test

echo "=== [4/5] 4-Tier Skill Catalog & Routing Validator ==="
npm run validate

echo "=== [5/5] Canonical Reuse Audit ==="
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  BASE="$(git merge-base HEAD origin/main)"
else
  BASE="HEAD"
fi
node dist/src/cli.js reuse audit --base "$BASE"

echo "=== ALL QUALITY GATES PASSED WITH ZERO ERRORS AND ZERO WARNINGS ==="
