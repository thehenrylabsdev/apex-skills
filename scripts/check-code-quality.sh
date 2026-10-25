#!/usr/bin/env bash
set -euo pipefail

echo "=== [1/4] ESLint (Strict Zero-Warning Gate) ==="
npx eslint . --max-warnings 0

echo "=== [2/4] TypeScript Compiler (Strict Typecheck Gate) ==="
npx tsc --noEmit

echo "=== [3/4] Automated Unit & Integration Test Suite ==="
npm test

echo "=== [4/4] 4-Tier Skill Catalog & Routing Validator ==="
npm run validate

echo "=== ALL QUALITY GATES PASSED WITH ZERO ERRORS AND ZERO WARNINGS ==="
