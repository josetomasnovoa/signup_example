#!/usr/bin/env bash
# Kanal — single-command deploy to Fly.io free tier.
#
# Prerequisites (one-time, the script verifies them):
#   1. flyctl installed: https://fly.io/docs/flyctl/install/ + `flyctl auth login`
#   2. pnpm installed (any recent version)
#   3. Neon project created → DATABASE_URL exported
#   4. Upstash Redis created → REDIS_URL exported
#
# Run from the kanal/ directory:
#
#   export DATABASE_URL='postgres://kanal:...@neon-host/kanal?sslmode=require'
#   export REDIS_URL='rediss://default:...@upstash-host:6379'
#   ./infra/scripts/deploy.sh
#
# What it does:
#   1. Verifies flyctl auth + required env vars
#   2. Generates KANAL_KMS_KEY if you haven't set one
#   3. Applies Drizzle migrations + RLS post-migrate against your DB
#   4. Seeds the demo tenant + inbox + a kn_test_… API key
#   5. Creates the 3 Fly apps (idempotent — fails silently if exist)
#   6. Sets the runtime secrets on each app
#   7. Builds + deploys api → worker → web
#
# After it finishes, the chat page is at:
#   https://kanal-web.fly.dev/chat/triage

set -euo pipefail

cd "$(dirname "$0")/../.."  # cwd = kanal/

red()  { printf '\033[31m%s\033[0m\n' "$*" >&2; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }

# ── 1. Sanity ────────────────────────────────────────────────────────────
bold "[1/7] Sanity checks"
if ! command -v flyctl >/dev/null 2>&1; then
  red "flyctl not found. Install with: curl -L https://fly.io/install.sh | sh"
  exit 1
fi
if ! flyctl auth whoami >/dev/null 2>&1; then
  red "Not logged into Fly.io. Run: flyctl auth login"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  red "pnpm not found. Install with: corepack enable && corepack prepare pnpm@9.12.0 --activate"
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  red "DATABASE_URL not set. Get one from Neon and export it."
  exit 1
fi
if [[ -z "${REDIS_URL:-}" ]]; then
  red "REDIS_URL not set. Get one from Upstash and export it."
  exit 1
fi
if [[ -z "${KANAL_KMS_KEY:-}" ]]; then
  KANAL_KMS_KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  green "Generated a fresh KANAL_KMS_KEY (save it; you need it on every deploy):"
  echo "  $KANAL_KMS_KEY"
fi
green "OK"

# ── 2. Migrate + seed ────────────────────────────────────────────────────
bold "[2/7] Apply Drizzle migrations + RLS policies"
pnpm install --frozen-lockfile
DATABASE_URL="$DATABASE_URL" pnpm --filter @kanal/db --silent db:apply
green "OK"

bold "[3/7] Seed demo tenant + inbox (idempotent — re-runs mint a fresh API key)"
SEED_OUTPUT="$(DATABASE_URL="$DATABASE_URL" pnpm --filter @kanal/db --silent db:seed-dev 2>&1 || true)"
echo "$SEED_OUTPUT"
KANAL_API_KEY="$(echo "$SEED_OUTPUT" | sed -n 's/^api_key:[[:space:]]*//p' | tail -n1)"
if [[ -z "$KANAL_API_KEY" ]]; then
  red "Could not parse api_key from seed output. Check the seed log above."
  exit 1
fi
green "API key minted: ${KANAL_API_KEY:0:16}…"

# ── 4. Create Fly apps ───────────────────────────────────────────────────
bold "[4/7] Create Fly apps (idempotent)"
for app in kanal-api kanal-worker kanal-web; do
  if flyctl status -a "$app" >/dev/null 2>&1; then
    echo "  $app exists, skipping"
  else
    flyctl apps create "$app" --org personal
  fi
done
green "OK"

# ── 5. Secrets ───────────────────────────────────────────────────────────
bold "[5/7] Set secrets on each app"
flyctl secrets set -a kanal-api \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  KANAL_KMS_KEY="$KANAL_KMS_KEY" --stage

flyctl secrets set -a kanal-worker \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  KANAL_KMS_KEY="$KANAL_KMS_KEY" \
  ${ANTHROPIC_API_KEY:+ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"} \
  ${GOOGLE_API_KEY:+GOOGLE_API_KEY="$GOOGLE_API_KEY"} --stage

flyctl secrets set -a kanal-web \
  KANAL_API_URL='https://kanal-api.fly.dev' \
  KANAL_API_KEY="$KANAL_API_KEY" \
  KANAL_PUBLIC_INBOX_SLUGS='triage' --stage
green "OK"

# ── 6. Deploy ────────────────────────────────────────────────────────────
bold "[6/7] Deploy (parallel-safe order: api → worker → web)"
flyctl deploy -c infra/fly/api.fly.toml    -a kanal-api    --remote-only
flyctl deploy -c infra/fly/worker.fly.toml -a kanal-worker --remote-only
flyctl deploy -c infra/fly/web.fly.toml    -a kanal-web    --remote-only

# ── 7. Done ──────────────────────────────────────────────────────────────
bold "[7/7] Done"
green "Chat URL for both phones:"
echo "    https://kanal-web.fly.dev/chat/triage"
echo
green "API health check:"
echo "    curl https://kanal-api.fly.dev/health"
echo "    curl https://kanal-api.fly.dev/ready"
echo
green "Inspect messages:"
cat <<EOF
    curl -H "authorization: Bearer $KANAL_API_KEY" \\
      https://kanal-api.fly.dev/v1/inboxes/00000000-0000-0000-0000-00000000beef/messages
EOF
