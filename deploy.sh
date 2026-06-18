#!/usr/bin/env bash
# One-shot deploy: Modal backend + Cloudflare Pages frontend.
# Run from project root: ./deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# --- Colors ---
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

info()  { echo "${CYAN}▸${RESET} $*"; }
ok()    { echo "${GREEN}✓${RESET} $*"; }
warn()  { echo "${YELLOW}!${RESET} $*"; }
fail()  { echo "${RED}✗${RESET} $*" >&2; exit 1; }

# --- Pre-flight ---
[[ -d modal-backend ]] || fail "modal-backend/ not found. Run from $ROOT"
command -v modal >/dev/null   || fail "modal CLI not installed. Run: pip install modal && modal setup"
command -v npm >/dev/null    || fail "npm not installed. Install Node.js first"

echo
echo "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo "${BOLD}  Qwen3-TTS Neural Voice Studio — Deploy${RESET}"
echo "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo

# --- Modal auth ---
if ! modal token list >/dev/null 2>&1; then
  warn "Modal not authenticated. Opening browser..."
  modal setup
fi
ok "Modal authenticated"

# --- Deploy backend ---
info "Deploying Modal backend (first build ~10 min, cached builds ~30s)..."
cd modal-backend
modal deploy app.py 2>&1 | tee /tmp/modal-deploy.log

# Extract the URL from the deploy log
MODAL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+--qwen3-tts-fastapi-app\.modal\.run' /tmp/modal-deploy.log | head -1)
[[ -z "$MODAL_URL" ]] && fail "could not parse Modal URL from deploy output. Check /tmp/modal-deploy.log"

ok "Modal deployed: $MODAL_URL"
echo

# --- Health check ---
info "Health check..."
for i in 1 2 3 4 5; do
  if curl -sf "${MODAL_URL}/health" >/dev/null; then
    ok "Backend healthy"
    break
  fi
  warn "Health check failed (attempt $i/5). Retrying in 5s..."
  sleep 5
  if [[ $i -eq 5 ]]; then fail "backend health check never passed. Visit ${MODAL_URL}/health in a browser."; fi
done

# --- Deploy frontend ---
info "Building frontend with VITE_API_URL=${MODAL_URL}..."
cd "$ROOT"

# Allow env var override
if [[ -z "${VITE_API_URL:-}" ]]; then
  VITE_API_URL="$MODAL_URL"
fi

# Check if wrangler is authenticated
if ! npx wrangler whoami >/dev/null 2>&1; then
  warn "Cloudflare not authenticated. Opening browser..."
  npx wrangler login
fi

# Update wrangler.toml with the URL so future deploys have it baked in
if grep -q '^VITE_API_URL' wrangler.toml; then
  sed -i.bak "s|^VITE_API_URL = .*|VITE_API_URL = \"${VITE_API_URL}\"|" wrangler.toml
  rm -f wrangler.toml.bak
  ok "Updated wrangler.toml VITE_API_URL"
fi

info "Deploying to Cloudflare Pages..."
npm run build
npx wrangler pages deploy dist --project-name=qwen3-tts-webui --commit-dirty=true 2>&1 | tail -20

CF_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.pages\.dev' /tmp/wrangler-deploy.log 2>/dev/null | head -1)
CF_URL="${CF_URL:-https://qwen3-tts-webui.pages.dev}"

echo
echo "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo "${GREEN}${BOLD}  DEPLOY COMPLETE${RESET}"
echo "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo
echo "  Modal API:  ${CYAN}${MODAL_URL}${RESET}"
echo "  Web UI:     ${CYAN}${CF_URL}${RESET}"
echo
echo "  Next: open the Web UI and paste the Modal URL in ⚙ Settings"
echo "  (it's already baked in via VITE_API_URL, but Settings allows override)"
echo
