# Kanal — production deploy on Fly.io

This is the runbook for the first deploy. Designed for the two-phone test:
each phone opens `https://app.<domain>/chat/triage`, types a message, and it
flows through the full pipeline (API → BullMQ → worker → rules → AI →
destinations) on production infrastructure.

## Provider accounts you need

| Provider | Why | Where |
|----------|-----|-------|
| Fly.io | Hosts the 4 apps (API, worker, MCP, web) | https://fly.io |
| Neon | Postgres 16 (free tier OK) | https://neon.tech |
| Upstash | Redis 7 (free tier OK) | https://upstash.com |
| Anthropic / Google | Optional: needed only if you set `aiEnabled: true` on a metered inbox. BYOK works without these. | https://console.anthropic.com / https://aistudio.google.com |
| DNS | The domain you own | wherever you bought it |

Sign up for the first three before continuing.

## One-time provisioning

### 1. Postgres (Neon)

1. Create a Neon project → copy the **`postgres://kanal_owner:...`-style** connection string.
2. Open the SQL editor and grant the migration role `BYPASSRLS`:
   ```sql
   ALTER ROLE <neon-owner> BYPASSRLS;
   ```
3. From your laptop, with `DATABASE_URL` set to that string:
   ```bash
   pnpm --filter @kanal/db db:apply
   pnpm --filter @kanal/db db:seed-dev   # creates the demo tenant + inbox + a kn_test_ key
   ```
   The seed prints an API key — **save it**, it's the bearer token the web app uses for
   server-side calls.
4. Now create the **runtime role** that the apps will actually connect as:
   ```sql
   -- Already created by 0002_rls_force.sql, but verify:
   SELECT rolname FROM pg_roles WHERE rolname = 'kanal_app';
   ALTER ROLE kanal_app WITH PASSWORD 'pick-something-random';
   ```
   Build the runtime URL:
   `postgres://kanal_app:<pwd>@<neon-host>/<db>?sslmode=require`.

### 2. Redis (Upstash)

1. Create an Upstash Redis database in the same region as your Fly apps (e.g.
   `iad`).
2. Copy the **TLS** connection string (starts with `rediss://`). Both API and
   worker use the same Redis URL.

### 3. Fly.io apps

```bash
flyctl auth login
flyctl apps create kanal-api
flyctl apps create kanal-worker
flyctl apps create kanal-mcp
flyctl apps create kanal-web
```

### 4. Secrets per app

```bash
# Generate a 32-byte KMS master key (production: replace with real KMS later)
KMS=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# API
flyctl secrets set -a kanal-api \
  DATABASE_URL='postgres://kanal_app:<pwd>@<neon-host>/<db>?sslmode=require' \
  REDIS_URL='rediss://default:<token>@<upstash-host>:6379' \
  KANAL_KMS_KEY="$KMS"

# Worker (same DB + Redis + KMS, plus optional metered AI keys)
flyctl secrets set -a kanal-worker \
  DATABASE_URL='postgres://kanal_app:<pwd>@<neon-host>/<db>?sslmode=require' \
  REDIS_URL='rediss://default:<token>@<upstash-host>:6379' \
  KANAL_KMS_KEY="$KMS" \
  ANTHROPIC_API_KEY='sk-ant-…'   # optional
  # GOOGLE_API_KEY='…'           # optional

# MCP
flyctl secrets set -a kanal-mcp \
  KANAL_API_URL='https://api.<your-domain>'

# Web — uses an admin API key (single-tenant for the first phase)
flyctl secrets set -a kanal-web \
  KANAL_API_URL='https://api.<your-domain>' \
  KANAL_API_KEY='kn_live_<the-one-you-minted-in-step-1>' \
  KANAL_PUBLIC_INBOX_SLUGS='triage'
```

### 5. Deploy

From the repo root, with **the `kanal/` directory as cwd**:

```bash
flyctl deploy -c infra/fly/api.fly.toml      -a kanal-api --remote-only
flyctl deploy -c infra/fly/worker.fly.toml   -a kanal-worker --remote-only
flyctl deploy -c infra/fly/mcp.fly.toml      -a kanal-mcp --remote-only
flyctl deploy -c infra/fly/web.fly.toml      -a kanal-web --remote-only
```

You can also push to GitHub and trigger `Actions → Deploy` with target `all`
once you've added `FLY_API_TOKEN` to repo secrets.

### 6. Custom domain + TLS

Map subdomains to apps:

```bash
flyctl certs create -a kanal-api  api.<your-domain>
flyctl certs create -a kanal-mcp  mcp.<your-domain>
flyctl certs create -a kanal-web  app.<your-domain>
```

Each command prints DNS records (typically a CNAME to `<app>.fly.dev`).
Set them in your registrar; certificates issue automatically once DNS
propagates.

### 7. Smoke from a phone

1. Open `https://app.<your-domain>/chat/triage` on each phone.
2. (Optional) Type your name in the top-right. It's saved per-phone.
3. Type a message and hit send. You should see "sent" within ~1s.
4. From your laptop:
   ```bash
   curl -H "authorization: Bearer $KEY" \
     https://api.<your-domain>/v1/inboxes/<inbox-id>/messages
   ```
   You should see both phones' messages with `status: processed` and any
   AI classification populated.

## Updating

After making changes locally:

```bash
git push origin claude/multi-channel-inbox-system-JfVSp
# Then in GitHub: Actions → Deploy → Run workflow → target=all
```

Or one app at a time from your laptop:

```bash
flyctl deploy -c infra/fly/web.fly.toml -a kanal-web --remote-only
```

## Cost ceiling for the test

- Fly.io: 3 free shared-cpu-1x machines (256MB) cover the MCP + web; API
  and worker each ~$2/mo on shared-cpu-1x 512MB.
- Neon: free tier (3GB storage).
- Upstash: free tier (10K commands/day) — fine for two phones.
- Anthropic / Google: pay-per-token; under $1 for any reasonable test
  volume.

Total for the first week: **under $10**.
