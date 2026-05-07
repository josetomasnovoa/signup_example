# Kanal — production deploy on Fly.io (free tier)

The fastest path to two phones hitting `https://kanal-web.fly.dev/chat/triage`.
No custom domain required for the first phase — Fly.io gives free
`*.fly.dev` subdomains automatically. Cloudflare comes later.

---

## TL;DR — copy-paste deploy

You need three accounts, all free, all sign-up-in-2-minutes:

| Provider | What for | URL |
|----------|----------|-----|
| Fly.io | Hosts the 3 apps | https://fly.io |
| Neon | Postgres 16 | https://neon.tech |
| Upstash | Redis 7 | https://upstash.com |

Then, from your laptop, with the `kanal/` directory as cwd:

```bash
# 1. Install + auth (one-time)
curl -L https://fly.io/install.sh | sh   # → flyctl
flyctl auth login

# 2. Export connection strings (paste from Neon + Upstash dashboards)
export DATABASE_URL='postgres://kanal:...@<neon-host>/kanal?sslmode=require'
export REDIS_URL='rediss://default:...@<upstash-host>:6379'

# 3. (Optional) bring your own AI keys for the metered path
# export ANTHROPIC_API_KEY='sk-ant-…'
# export GOOGLE_API_KEY='…'

# 4. Run the script — provisions DB + secrets + deploys 3 apps
./infra/scripts/deploy.sh
```

The script:
1. Verifies `flyctl` + `pnpm` are installed and you're logged in.
2. Generates a 32-byte `KANAL_KMS_KEY` (prints it once — save it).
3. Applies Drizzle migrations and the post-migrate RLS SQL against your DB.
4. Seeds the demo tenant + inbox + a `kn_test_…` API key (printed at the
   end).
5. Creates 3 Fly apps: `kanal-api`, `kanal-worker`, `kanal-web`.
6. Sets the runtime secrets on each app.
7. Builds + deploys each app via `flyctl deploy --remote-only`.

When it finishes you can hand both phones the same URL:

> **https://kanal-web.fly.dev/chat/triage**

Each phone types a name, sends messages, and the web app proxies to the
API. The worker classifies and fans out to the seeded webhook destination.

---

## Sizing — free tier

We trimmed every machine to **shared-cpu-1x / 256MB** (`NODE_OPTIONS=--max-old-space-size=192` to keep V8 heap under control). The MCP server is **not deployed** in this phase to stay within the 3-machine free quota. Add it back when you need Claude Desktop integration:

```bash
flyctl apps create kanal-mcp --org personal
flyctl secrets set -a kanal-mcp KANAL_API_URL='https://kanal-api.fly.dev'
flyctl deploy -c infra/fly/mcp.fly.toml -a kanal-mcp --remote-only
```

| App | Why always-on | Memory |
|-----|---------------|--------|
| kanal-api | Receives webhook + chat traffic; can't auto-stop | 256MB |
| kanal-worker | Holds BullMQ subscriptions + meter:ai cron | 256MB |
| kanal-web | Auto-stops when idle (cold start ~1s) | 256MB |

Expected monthly cost while in free tier: **$0**, though Fly.io now
typically asks for a card. Past the trial you'd pay ~$5/mo for these 3.

---

## Provisioning — step by step (if the script fails)

### Postgres (Neon)

1. Create a Neon project. Copy the **connection string** (starts with
   `postgres://`). Put it in `DATABASE_URL`.
2. In the Neon SQL editor, grant the migration role `BYPASSRLS` so it can
   bypass `FORCE ROW LEVEL SECURITY` to apply structural changes:

   ```sql
   ALTER ROLE <neon-owner-role> WITH BYPASSRLS;
   ```

3. Apply migrations + seed (the `deploy.sh` script does this):

   ```bash
   DATABASE_URL=... pnpm --filter @kanal/db db:apply
   DATABASE_URL=... pnpm --filter @kanal/db db:seed-dev
   ```

   The seed prints a `kn_test_…` API key. Save it; it's the bearer the web
   app uses for server-side calls.

### Redis (Upstash)

1. Create an Upstash Redis database in the same region as your Fly apps
   (e.g. `iad`, `lax`, `fra`).
2. Copy the **TLS** connection string (`rediss://...`). Put it in
   `REDIS_URL`.

### Fly.io secrets — manual fallback

If you want to set secrets one app at a time:

```bash
KMS=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')

flyctl secrets set -a kanal-api \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  KANAL_KMS_KEY="$KMS"

flyctl secrets set -a kanal-worker \
  DATABASE_URL="$DATABASE_URL" \
  REDIS_URL="$REDIS_URL" \
  KANAL_KMS_KEY="$KMS"
  # Optional: ANTHROPIC_API_KEY, GOOGLE_API_KEY

flyctl secrets set -a kanal-web \
  KANAL_API_URL='https://kanal-api.fly.dev' \
  KANAL_API_KEY='kn_test_...' \
  KANAL_PUBLIC_INBOX_SLUGS='triage'
```

---

## Verifying it works

```bash
# Liveness (always 200 if process up):
curl https://kanal-api.fly.dev/health

# Readiness (200 only if DB + Redis reachable):
curl https://kanal-api.fly.dev/ready

# Open the chat in a browser:
open https://kanal-web.fly.dev/chat/triage

# After phones send messages, list them:
curl -H "authorization: Bearer $KANAL_API_KEY" \
  https://kanal-api.fly.dev/v1/inboxes/00000000-0000-0000-0000-00000000beef/messages \
  | jq '.messages[] | {sender: .sender.name, text: .contentText, status, ai: .aiClassification}'
```

---

## Switching to your own domain (when you're ready)

Whenever you have a Cloudflare-managed domain ready, run:

```bash
./infra/scripts/add-custom-domain.sh kanaltest.com
```

It issues TLS certs for `api.<domain>`, `app.<domain>`, and `mcp.<domain>`
(if MCP is deployed) and updates the web app's `KANAL_API_URL` secret.

The script prints the DNS records you need to add at Cloudflare. If you
export `CF_API_TOKEN` (with `Zone.Read` + `DNS:Edit` on the zone) and
`CF_ZONE_ID`, the script creates the CNAMEs automatically.

After DNS propagates (usually < 5 min on Cloudflare), the certs activate
automatically — no redeploy needed.

---

## Troubleshooting

**Web app can't reach API:** the web sees `KANAL_API_URL` from secrets, not
from this README. Verify with `flyctl secrets list -a kanal-web`. If
the URL is wrong, `flyctl secrets set -a kanal-web KANAL_API_URL=...`
and the app restarts automatically.

**Worker not processing messages:** `flyctl logs -a kanal-worker` and
look for `worker started` and `ingest:processed` lines. If you see
`ECONNREFUSED 6379`, your `REDIS_URL` is wrong.

**`/ready` returns 503:** the body has per-check booleans + an `errors`
map. Most common: `db: false` (Neon connection) or `redis: false`
(Upstash). Check secrets first.

**OOM on free tier:** open the app's metrics in the Fly dashboard. If RSS
hovers near 240MB and crashes, you're hitting the 256MB cap. Either bump
to `512mb` (`memory = "512mb"` in the fly.toml; ~$2/mo per app) or reduce
worker concurrency in `apps/worker/src/index.ts`.

**Re-running deploy.sh:** the script is idempotent. Re-running it will
mint a new API key (the old one keeps working), re-stage secrets, and
push fresh images.
