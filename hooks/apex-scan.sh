#!/bin/sh
set -u
ROOT=$(pwd)
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  ROOT=$CLAUDE_PROJECT_DIR
fi
CLI=""
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" ]; then
  CLI="${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js"
elif [ -n "${CURSOR_PLUGIN_ROOT:-}" ] && [ -f "${CURSOR_PLUGIN_ROOT}/dist/src/cli.js" ]; then
  CLI="${CURSOR_PLUGIN_ROOT}/dist/src/cli.js"
elif [ -f "$ROOT/dist/src/cli.js" ] && [ -f "$ROOT/src/scan-cli.ts" ]; then
  CLI="$ROOT/dist/src/cli.js"
elif [ -f "$ROOT/node_modules/apex-skills/dist/src/cli.js" ]; then
  CLI="$ROOT/node_modules/apex-skills/dist/src/cli.js"
fi
if [ -n "$CLI" ]; then
  exec node "$CLI" scan --hook
fi
if command -v apex-skills >/dev/null 2>&1; then
  exec apex-skills scan --hook
fi
exec npx --no-install apex-skills scan --hook
