# Kanal

Multi-channel inbox SaaS (multi-tenant, Node.js + TypeScript).

A user can pipe information into a "kanal" (inbox) from WhatsApp, email, web,
direct API or MCP, configure rules and AI to process it, and fan it out to
arbitrary destinations (Notion, Slack, webhooks, other MCP servers, ...).

> **Status:** scaffold. Architecture is locked; vertical implementations land
> behind the shared packages and apps in this monorepo.

## Layout

```
kanal/
├── apps/
│   ├── api/          # Fastify HTTP API (REST + OpenAPI 3.1)
│   ├── worker/       # BullMQ pipelines: ingest + per-destination
│   └── mcp-server/   # MCP server exposing inbox.* tools
├── packages/
│   ├── ai/           # LLMProvider abstraction + model registry (Claude + Gemini)
│   ├── db/           # Drizzle schema (Postgres + RLS)
│   ├── observability/# pino logger w/ secret redaction
│   ├── rules/        # DSL Zod schema (CEL predicates + named transforms)
│   └── shared/       # envelopes, errors, scopes
├── infra/docker/     # local dev compose (Postgres + Redis)
└── .github/workflows # CI: typecheck, test, build, format-check
```

## Local dev

```bash
# 1. Start dependencies
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Install workspace
pnpm install

# 3. Run pieces
pnpm --filter @kanal/api dev          # API on :3001
pnpm --filter @kanal/worker dev       # Worker against local Redis
pnpm --filter @kanal/mcp-server dev   # MCP over stdio
```

## AI models

`@kanal/ai` ships a single source of truth for offered models in
`packages/ai/src/models.ts`. Initial catalogue:

| Provider  | ID                              | Tier     | Context | Notes                  |
|-----------|---------------------------------|----------|---------|------------------------|
| Anthropic | `anthropic:claude-opus-4-7`     | top      | 200k    | Heavy reasoning        |
| Anthropic | `anthropic:claude-sonnet-4-6`   | balanced | 200k    | Default for generation |
| Anthropic | `anthropic:claude-haiku-4-5`    | fast     | 200k    | Default classify/extract |
| Google    | `google:gemini-2.5-pro`         | top      | 1M      | Multimodal (incl. video) |
| Google    | `google:gemini-2.5-flash`       | balanced | 1M      | Latest Flash           |
| Google    | `google:gemini-2.5-flash-lite`  | cheap    | 1M      | High-volume classify   |
| Google    | `google:gemini-2.0-flash`       | legacy   | 1M      | Deprecated, kept for compat |

Adding a model = appending one row. UI dropdowns, billing tier mapping and
rules-engine capability validation all read from the registry.

BYOK is supported per provider; metered usage maps to a small set of
Stripe-priced tiers (top / balanced / fast / cheap), so adding a model never
requires creating new Stripe products.

## CI

`.github/workflows/ci.yml` runs `pnpm typecheck && pnpm test && pnpm build`
plus `pnpm format:check` against the `kanal/` working directory.
