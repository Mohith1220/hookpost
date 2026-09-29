#!/usr/bin/env bash
# Render every Hookpost email to static HTML + plain text for review.
# Usage: scripts/email-previews/render.sh [out-dir]   (default: tmp/email-previews)
# Sends nothing. Bundled with esbuild so the @hookpost/* path aliases resolve.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT="${1:-tmp/email-previews}"
BUNDLE="$(mktemp -t hookpost-email-previews).js"
node_modules/.bin/esbuild scripts/email-previews/render-email-previews.ts \
  --bundle --platform=node --format=cjs --target=node18 --log-level=warning \
  --outfile="$BUNDLE"
node "$BUNDLE" "$OUT"
rm -f "$BUNDLE"
