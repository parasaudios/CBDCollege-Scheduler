#!/usr/bin/env bash
# Cross-check the ported roster engine (src/lib/rosterCompute.ts) against the REAL
# web-app functions in ../../index.html, over a battery of dates/scenarios.
#
#   ./run.sh
#
# Needs Playwright available to node. In the Claude Code web sandbox it's global,
# so this script points NODE_PATH at it if not already importable.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MOBILE="$(cd "$HERE/../.." && pwd)"
TSC="$MOBILE/node_modules/typescript/bin/tsc"

# Playwright lives in the global module dir in the sandbox.
if [ -d /opt/node22/lib/node_modules/playwright ] && [ -z "${NODE_PATH:-}" ]; then
  export NODE_PATH=/opt/node22/lib/node_modules
fi

echo "==> Compiling engine to .engine/"
rm -rf "$HERE/.engine"
mkdir -p "$HERE/.engine"
# Compile from a temp dir OUTSIDE the mobile tree, so tsc doesn't pick up the
# project tsconfig.json (which errors when files are passed on the command line).
SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT
cp "$MOBILE/src/lib/rosterCompute.ts" "$MOBILE/src/lib/types.ts" "$SRC/"
( cd "$SRC" && node "$TSC" rosterCompute.ts types.ts \
    --outDir "$HERE/.engine" --module esnext --target es2020 \
    --moduleResolution node --skipLibCheck --ignoreDeprecations 6.0 )
echo '{"type":"module"}' > "$HERE/.engine/package.json"

echo "==> Step 1: capturing web outputs"
node "$HERE/xcheck_web.js"

echo "==> Step 2: diffing engine vs web"
node "$HERE/xcheck_node.mjs"
