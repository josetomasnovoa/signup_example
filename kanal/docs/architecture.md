# Plan: Sistema SaaS de Buzón Multi-Canal

## Contexto

El usuario quiere construir un producto SaaS multi-tenant donde un usuario envía información a un "buzón" desde múltiples canales (WhatsApp, email, web, API, MCP), y el sistema la procesa según reglas configurables y la entrega a destinos arbitrarios (Notion, Slack, webhooks, otros servidores MCP, etc.). Requisitos clave: APIs REST + servidor MCP propio, capa IA opcional cobrable (BYOK o pay-per-use), documentación completa, escalable y mantenible.

Decisiones tomadas con el usuario:
- **Alcance**: producto completo de una vez (no por fases).
- **Modelo**: SaaS multi-tenant.
- **Stack**: Node.js + TypeScript.
- **Greenfield**: ignorar el repo `signup_example` existente.

Nombre tentativo del producto: **Kanal** (cambiable en cualquier momento, no afecta arquitectura).

---

## Decisiones de Stack (locked)

| Área | Decisión | Razón corta |
|---|---|---|
| HTTP API | **Fastify** + `fastify-type-provider-zod` | OpenAPI 3.1 auto-generado, ~3x throughput de NestJS, menos ceremonia. |
| ORM / DB | **Postgres 16 + Drizzle** | SQL-first, mejores tipos para filtros multi-tenant que Prisma. |
| Vector | **pgvector** en el mismo Postgres | Una sola DB; saltar a Pinecone solo si pasamos 10M chunks. |
| Cola/jobs | **BullMQ + Redis 7** | Nativo TS, retries, repeatable jobs, sandboxed processors. |
| Object storage | **Cloudflare R2** (S3-compat) | Sin egress fees. |
| Auth usuarios | **Clerk** | No reinventar SSO/MFA/social. |
| Auth API | **API keys propias** `kn_live_…` (hash en DB, scopes) | Estándar para SaaS. |
| Payments | **Stripe** (Products + Prices + usage_records) | Estándar. |
| Email inbound | **Postmark Inbound** | Mejor parser, menor latencia que SES. |
| WhatsApp | **Meta Cloud API** + adapter Twilio detrás de `WhatsAppDriver` | First-party, evitamos lock-in. |
| MCP | **`@modelcontextprotocol/sdk`** (server + client) | Oficial. |
| Frontend | **Next.js 15 (App Router) + shadcn/ui + Tailwind v4** | Industry default. |
| Deploy | **Fly.io** (apps) + **Neon** (PG) + **Upstash** (Redis) | Multi-región sin K8s; saltar a ECS al cruzar ~$15k MRR. |
| CI | **GitHub Actions** + Turborepo remote cache | Free, integrado. |
| Observabilidad | **OpenTelemetry → Grafana Cloud** (Tempo+Loki+Mimir) | Open standards, una factura. |
| Monorepo | **pnpm workspaces + Turborepo** | Lockfile rápido, task graph. |
| Tests | **Vitest + Testcontainers + Playwright + Pact** | Un runner para todo. |
| Docs | **Mintlify** + OpenAPI auto-publicado | MDX + búsqueda. |
| AI providers | **`@anthropic-ai/sdk` + `@google/genai` directos** detrás de `LLMProvider` (worker). **Vercel AI SDK solo en `apps/web`** para streaming UI. | Control fino server-side y metering por provider; UI se queda con DX de Vercel. |

---

## Arquitectura Lógica

```
[WhatsApp] [Email/Postmark] [API /v1/messages] [Web upload] [MCP server]
      \         |                |                  |             /
       \________v________________v__________________v____________/
                    INGESTION EDGE (cada adapter normaliza a InboundMessage)
                                       │
                            Fastify API Gateway
                            (auth, rate-limit, sig verify, tenant ctx)
                                       │ enqueue
                                       ▼
                            Redis · BullMQ queue: ingest
                                       │
                                       ▼
                  WORKER · PROCESSOR PIPELINE
                  1. persist Message + Attachments (R2)
                  2. PII redaction (opcional)
                  3. Rules engine (match → transform → route)
                  4. AI step (opcional, BYOK o metered)
                  5. Fan-out DeliveryAttempts a destinations
                  6. Audit log + métricas + traces
                                       │
                            queues: deliver:<kind>  (retry + DLQ)
                                       │
       ┌──────────┬──────────┬──────────┼──────────┬──────────┬──────────┐
       ▼          ▼          ▼          ▼          ▼          ▼          ▼
   Webhook    Notion     Drive      Slack      GitHub     MCP-client    ...
                                                          (consume MCPs externos)

Cross-cutting: OTel traces extremo a extremo · meter:ai cron → Stripe usage_records
              · audit_log append-only · notifications worker
```

Una sola trace por mensaje: spans `ingest.<channel>` → `process.persist` → `process.rules` → `process.ai` → `deliver.<kind>`.

---

## Estructura del Monorepo

```
kanal/
├── apps/
│   ├── api/            # Fastify HTTP API (REST + GraphQL para web)
│   ├── worker/         # BullMQ workers: ingest + per-destination + meter:ai
│   ├── mcp-server/     # MCP server (Streamable HTTP + stdio bridge)
│   ├── web/            # Next.js 15 dashboard
│   └── docs/           # Mintlify
├── packages/
│   ├── db/             # Drizzle schema + migrations + RLS
│   ├── shared/         # Zod schemas, errors, envelopes, tenant ctx
│   ├── rules/          # DSL parser + executor (CEL + ops + isolated-vm)
│   ├── ai/             # LLMProvider + BYOK/KMS + metering
│   ├── channels/       # Source adapters (WhatsApp, email, api, web, mcp)
│   ├── destinations/   # Sink adapters (Notion, Slack, webhook, mcp-client...)
│   ├── sdk/            # @kanal/sdk público (npm)
│   ├── billing/        # Stripe wrappers + límites por plan
│   ├── observability/  # OTel bootstrap, logger, métricas
│   └── config/         # tsconfig, eslint, prettier, vitest presets
├── infra/{fly,terraform,docker}/
├── .github/workflows/  # ci.yml, deploy.yml, openapi-publish.yml
├── pnpm-workspace.yaml · turbo.json · package.json
```

---

## Modelo de Datos (esencial)

Aislamiento multi-tenant: **shared DB + RLS**. Todas las tablas tenant-scoped llevan `tenant_id uuid`, índice compuesto, y política RLS. La API setea `SET LOCAL app.tenant_id = '<uuid>'` por transacción.

Entidades clave:
- `tenant`, `user`, `membership(role)`
- `inbox(ai_enabled, ai_config jsonb, retention_days, redact_pii)`
- `channel(kind: whatsapp|email|api|web|mcp, config jsonb, secret_id)`
- `message(direction, status, sender, content_text, content_json, ai_summary, ai_classification, embedding vector(1536))`
- `attachment(storage_key, sha256, mime_type, size_bytes)`
- `rule(definition jsonb DSL, priority, enabled)`
- `destination(kind, config, secret_id, retry_policy, fallback_destination_id)`
- `delivery_attempt(attempt_no, status: pending|success|failed|dlq, request/response_snapshot)`
- `ai_usage(provider, model, operation, input_tokens, output_tokens, cost_usd_micros, charge_usd_micros, stripe_usage_record_id)`
- `api_key(key_prefix, key_hash, scopes[])` — solo hash, nunca plaintext
- `encrypted_secret(purpose, ciphertext, dek_wrapped, kms_key_id)` — KMS-wrapped DEK
- `audit_log` (append-only, particionada por mes)
- `subscription`, `usage_counter(period_month, ...)`, `webhook_endpoint`

Índices clave: `(tenant_id, inbox_id, received_at desc)` en `message`, IVFFlat en `embedding`.

---

## API Pública (REST, OpenAPI 3.1)

Base `https://api.kanal.app/v1`. Auth: `Authorization: Bearer kn_live_…` o sesión Clerk (web). Cursor pagination. `Idempotency-Key` en mutaciones.

Grupos:
- **Tenancy/identity**: `/me`, `/tenants/current`, `/tenants/current/members`, `/api-keys`
- **Inboxes**: CRUD + `/archive`
- **Channels** (por inbox): CRUD + `/test`
- **Rules**: CRUD + `/dry-run`
- **Destinations**: CRUD + `/test`
- **Messages**: `POST /v1/messages` (ingest), list, get, attachments (URL firmada), `/replay`, `/deliveries`, `/search` (FTS + semántico)
- **AI**: `GET/PATCH /inboxes/:id/ai`, `/tenants/current/ai/usage`
- **Billing**: `/subscription`, `/portal` (Stripe), `/usage`
- **Webhooks de proveedores** (no API key): `/webhooks/whatsapp/:appId`, `/webhooks/inbound/postmark`, `/webhooks/stripe`
- **Admin**: `/audit-logs`, `/dlq`, `/dlq/:id/retry`, `/exports`

GraphQL solo en `/graphql` para `apps/web` (Pothos), reutilizando los resolvers de los handlers REST.

---

## Rules Engine

**DSL declarativo propio en JSON**, ejecutado por un runtime async puro:
- **Predicados** en sintaxis CEL (`cel-js`).
- **Transforms** son ops nombradas de una librería fija (`set`, `ai.classify`, `ai.extract`, `ai.summarize`, `redact`, `enrich`...).
- **Scripts** opcionales en JS dentro de `isolated-vm` (50ms / 16MB caps).
- Pipeline: `match → transform → route(fanout, fallback)`.

UI: editor visual + JSON Monaco con JSON Schema. `dry-run` endpoint corre contra mensaje de muestra y devuelve output por paso.

Forma DSL (resumen):
```jsonc
{ "version": 1, "trigger": "message.received",
  "pipeline": [
    { "match": { "all": [{ "cel": "message.channel == 'email'" }] } },
    { "transform": [{ "op": "ai.classify", "schema": {...}, "out": "x" }] },
    { "route": { "fanout": [{ "destination": "..." }], "on_failure": "fallback" } }
  ] }
```

Rechazadas: JSONLogic (anémico), CEL puro (sin transforms), JS embebido (sandbox inseguro).

---

## MCP — Server (que exponemos) + Client (consumimos)

**Server**: Streamable HTTP en `https://mcp.kanal.app/sse` (auth: API key tenant en header) + bridge stdio publicado como `@kanal/mcp` para Claude Desktop. Tools:

| Tool | Propósito |
|---|---|
| `inbox.list` / `inbox.get` | Listar/leer config |
| `inbox.send` | Enviar mensaje a un buzón |
| `inbox.list_messages` / `inbox.get_message` | Lectura paginada |
| `inbox.search` | FTS + semántico |
| `inbox.create_rule` / `inbox.list_rules` / `inbox.test_rule` | Reglas |
| `inbox.add_destination` | Destinos |
| `inbox.replay_message` | Re-ejecutar pipeline |
| `inbox.dlq_list` / `inbox.dlq_retry` | DLQ |

Cada tool declara scope requerido (`messages:write`, `rules:admin`...). Resources read-only: `kanal://inbox/{id}/recent`, `kanal://message/{id}`. Prompts: `summarize_inbox`, `daily_digest`.

**Client**: usado como tipo de destino `mcp_client` — el worker de delivery hace `tools/list` al onboarding y deja al usuario elegir tool + mapping.

---

## Capa de IA

**Abstracción** `LLMProvider` con métodos `complete`, `classify<T>`, `extract<T>`, `embed`, `stream`. Implementaciones iniciales: `anthropic`, `google` (Gemini). Adapters posteriores: `openai`, `mistral`, etc. BYOK soportado para cualquiera.

### Selección de modelo por el usuario

El usuario elige modelo **por inbox** (y opcionalmente override por regla). UI: dropdown agrupado por proveedor con badges de capacidades (vision, JSON-mode, context window) y precio estimado por 1M tokens. La selección queda en `inbox.ai_config.model` (string canónico tipo `anthropic:claude-sonnet-4-6`).

**Catálogo inicial** (registry tipado en `packages/ai/src/models.ts`, single source of truth, consumida por API + UI + billing):

| Provider | Model ID canónico | Tier | Capacidades | Notas |
|---|---|---|---|---|
| Anthropic | `anthropic:claude-opus-4-7` | top | vision, tools, 200k ctx, structured | Razonamiento duro, generación premium |
| Anthropic | `anthropic:claude-sonnet-4-6` | balanced | vision, tools, 200k ctx, structured | Default recomendado para generación |
| Anthropic | `anthropic:claude-haiku-4-5` | fast | vision, tools, 200k ctx, structured | Default para classify/extract/summary |
| Google | `google:gemini-2.5-pro` | top | vision, audio, video, 1M ctx, structured | Long-context y multimodal alto |
| Google | `google:gemini-2.5-flash` | balanced | vision, audio, 1M ctx, structured | **Flash último** — alternativa rápida y barata |
| Google | `google:gemini-2.5-flash-lite` | cheap | vision, 1M ctx | Para alto volumen / classify masivo |
| Google | `google:gemini-2.0-flash` | legacy | vision, 1M ctx | Mantenido para compatibilidad |

Cada entry del registry declara: `id`, `provider`, `displayName`, `tier`, `contextWindow`, `capabilities[]`, `inputPricePer1M`, `outputPricePer1M`, `cachedInputPricePer1M`, `supportsByok`, `defaultForTask?`, `deprecated?`.

Cuando un modelo se deprecia: se marca `deprecated: true` con `replacement` apuntando al sucesor; UI lo oculta de selección nueva pero permite seguir usándolo hasta una fecha. Nuevos modelos se añaden agregando una fila al registry — sin migración.

### Defaults inteligentes (cuando el inbox no especifica modelo por tarea)

- Classify / extract / summary: el haiku/flash más barato disponible del provider elegido.
- Generación (respuestas, drafts): el balanced (`sonnet-4-6` o `gemini-2.5-flash`).
- Razonamiento duro (sintetizar reglas desde lenguaje natural): top (`opus-4-7` o `gemini-2.5-pro`).
- Embeddings: `voyage-3` (Anthropic) o `text-embedding-004` (Google) según provider del inbox; configurable.

### Provider routing

`LLMProvider.forModel(modelId)` parsea el prefijo (`anthropic:` / `google:`) y devuelve la implementación correcta. Cada implementación traduce parámetros comunes (system prompt, JSON schema para structured output, max_tokens, tools) al SDK nativo (`@anthropic-ai/sdk`, `@google/genai`).

Validación: si el modelo elegido no soporta una capacidad requerida por una regla (ej. `vision` pero el modelo es text-only), el rules executor falla en `dry-run` con mensaje claro y sugiere alternativas del registry.

**BYOK seguro**:
1. Frontend POST sobre TLS, server **nunca loguea**.
2. Per-tenant DEK wrapped por KMS CMK, almacenado en `encrypted_secret`.
3. En inferencia: unwrap DEK en memoria → desencripta key → llamada SDK puntual → zeroize buffer.
4. Rotación: `POST /v1/inboxes/:id/ai/rotate-byok`. Cipher anterior 7 días para auditoría.
5. `pino` redact paths + test de regresión que inyecta key falsa y verifica que no aparece en logs.

**Metering pipeline**:
- Cada llamada escribe una fila `ai_usage` en la **misma transacción** que el update del mensaje.
- Cron `meter:ai` cada 5 min agrega filas desde `last_reported_at` por tenant × Stripe price y POSTea `subscription_item.create_usage_record` con `idempotency-key = tenant_id|period|price_id|window`.
- BYOK: `charge_usd_micros = 0`, pero la fila se escribe igual para mostrar consumo al usuario.

**Pricing IA**: por 1M tokens (input/output), markup pequeño y **uniforme por tier** (no por modelo individual) sobre el coste provider — el registry de modelos expone `inputPricePer1M`/`outputPricePer1M` ya con markup; UI muestra ese precio. Stripe products por tier (`kanal_metered_ai_top_input/output`, `..._balanced_...`, `..._fast_...`) en lugar de uno por modelo, así añadir modelos no requiere crear productos Stripe nuevos. Free plan: cap duro de 100k tokens/mo enforced por contador Redis pre-llamada. BYOK: passthrough sin markup, contador escribe `charge_usd_micros = 0`.

---

## Billing (Stripe)

Productos:
- `kanal_plan_free` (1 inbox, 500 msg/mo, sin IA, retención 7d)
- `kanal_plan_pro` ($29/mo, 10 inboxes, 50k msg/mo, IA metered)
- `kanal_plan_team` ($99/mo, ilimitados, 200k msg, 5 seats, audit 1y)
- `kanal_plan_enterprise` (custom, SSO, RLS aislado, DPA)
- Metered: `kanal_metered_messages`, `kanal_metered_storage`, plus AI por tier: `kanal_metered_ai_top_input/output`, `kanal_metered_ai_balanced_input/output`, `kanal_metered_ai_fast_input/output`. El cron `meter:ai` mapea cada `ai_usage` row a su tier (vía model registry) y lo agrega al price correspondiente.

`packages/billing/limits.ts` enforced **antes** de hacer trabajo (API + worker). Soft alerts a 80% y 100% por email. Webhook `/webhooks/stripe` actualiza `subscription` + audit log.

---

## Tests

| Capa | Tool | Qué |
|---|---|---|
| Unit | Vitest | `packages/*` (rules executor, AI mocks, schemas) |
| Integration | Vitest + Testcontainers | Postgres + Redis reales; pipelines, RLS, BullMQ |
| Contract | Pact | Webhooks salientes + samples de WhatsApp/Postmark/Stripe |
| E2E web | Playwright | Login → crear inbox → regla → delivery |
| E2E API | Vitest + supertest + docker stack | Black-box `/v1/*` |
| Load | k6 | `POST /v1/messages` p95 < 80ms, 1k rps por worker |
| Security | npm audit + Snyk + Semgrep | Secrets, RLS bypass anti-patterns |

Coverage: 85% líneas en `packages/*`, 70% en `apps/*`. CI bloquea por debajo. **Test de regresión RLS**: cada test integration ejecuta dos veces (tenantA, tenantB) con helper `assertNoCrossTenantLeak()`.

---

## Documentación

- **Mintlify** en `apps/docs` → `https://docs.kanal.app`.
- Secciones: Quickstart · Conceptos (Inbox/Channel/Rule/Destination) · una página por canal · referencia DSL · guía IA (BYOK + metered) · guía MCP · API reference (auto desde OpenAPI) · SDK guide · Webhooks · Security & Compliance · Changelog.
- `apps/api` emite `openapi.json` en build → CI lo publica y valida con `oasdiff` (no breaking changes).
- SDK `@kanal/sdk`: tipos generados con `openapi-typescript` + cliente fino artesanal. Ejemplos Node/browser/Bun.
- Runbooks: drain DLQ, ventana 24h WhatsApp, debug Postmark, fallos webhook Stripe.
- Changelog: Changesets → docs + endpoint `/changelog`.

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Violación política WhatsApp (24h, templates, marketing masivo) | Bloqueo en código: outbound a WA solo si hay inbound en 24h o template aprobado; warnings UI. |
| Coste IA descontrolado | Caps Redis por tenant (diario/mensual), circuit breaker por inbox, BYOK shifts coste, alerta admin. |
| Abuso/spam vía email inbound | Threshold spam Postmark, rate-limit por alias, SPF/DKIM/DMARC, auto-disable en burst. |
| Multi-tenant data leakage | RLS Postgres en todas las tablas, `assertNoCrossTenantLeak` en CI, regla static analysis que prohíbe SQL raw sin `tenant_id`, pen-test pre-GA. |
| Vendor lock-in (Clerk/Postmark/Meta/Anthropic) | Todo detrás de interfaces (`AuthProvider`, `EmailInboundDriver`, `WhatsAppDriver`, `LLMProvider`); segunda implementación en tests. |
| Leakage de tokens en logs | `pino` redact + test que inyecta key falsa y verifica logs limpios; rotate-on-detect. |
| Duplicación de jobs en crash | Idempotency keys; `delivery_attempt` único `(message_id, destination_id, attempt_no)`. |
| Postgres bottleneck (vector + audit) | Audit particionado, archivado a R2 a 90d; vector index en réplica con replicación lógica al cruzar 5M mensajes. |
| GDPR / borrado | `DELETE /v1/tenants/current` → purge worker async; lifecycle R2; audit retiene tombstone hasheado. |

---

## Archivos Críticos a Crear

```
apps/api/src/server.ts                         # Fastify + plugins + OpenAPI
apps/api/src/plugins/auth.ts                   # API key + Clerk → tenant ctx
apps/api/src/plugins/tenant-context.ts         # SET LOCAL app.tenant_id
apps/api/src/routes/messages.ts                # POST /v1/messages
apps/api/src/routes/webhooks/whatsapp.ts       # Meta verify + receive
apps/api/src/routes/webhooks/postmark.ts       # Email inbound
apps/api/src/routes/webhooks/stripe.ts         # Subscription + usage

apps/worker/src/index.ts                       # BullMQ entrypoint
apps/worker/src/processors/ingest.ts           # Pipeline orchestrator
apps/worker/src/processors/deliver.ts          # Per-destination dispatcher
apps/worker/src/processors/meter-ai.ts         # Cron → Stripe

apps/mcp-server/src/server.ts                  # MCP server (HTTP)
apps/mcp-server/src/tools/inbox.ts             # Tools inbox.*

apps/web/src/app/(dashboard)/inboxes/[id]/settings/[section]/page.tsx
                                               # 10 secciones de ajustes

packages/db/src/schema.ts                      # Drizzle schema (single source)
packages/db/src/client.ts                      # Pool + tenant-scoped tx helper
packages/db/migrations/                        # SQL incl. policies RLS

packages/rules/src/dsl.ts                      # Zod schema del DSL
packages/rules/src/executor.ts                 # Runtime
packages/rules/src/cel.ts                      # CEL wrapper

packages/ai/src/provider.ts                    # LLMProvider interface + forModel()
packages/ai/src/models.ts                      # Model registry (Claude + Gemini, single source)
packages/ai/src/anthropic.ts                   # Anthropic adapter (@anthropic-ai/sdk)
packages/ai/src/google.ts                      # Gemini adapter (@google/genai)
packages/ai/src/byok.ts                        # KMS-wrapped key handling (per provider)
packages/ai/src/metering.ts                    # ai_usage writer + tier mapper

packages/channels/src/{whatsapp,email,api,web,mcp}/...
packages/destinations/src/{registry,notion,webhook,mcp-client,...}.ts

packages/shared/src/{envelopes,errors,scopes}.ts
packages/billing/src/{stripe,limits}.ts
packages/observability/src/otel.ts

infra/fly/{api,worker,mcp-server}.fly.toml
infra/terraform/main.tf
.github/workflows/ci.yml · deploy.yml
turbo.json · pnpm-workspace.yaml
```

---

## Verificación End-to-End

**Escenario manual**: WhatsApp → regla → IA extrae JSON → fan-out Notion + MCP server externo.

Setup: signup Clerk → tenant + Free → upgrade Pro vía Stripe → crear inbox `triage` → añadir canal WA (token + phone_number_id encriptados, registrar webhook con Meta) → añadir destino Notion (OAuth) → añadir destino MCP-client (URL + bearer, probe `tools/list`, elegir tool) → crear regla DSL → activar IA con `claude-sonnet-4-6` metered.

Run: enviar WA con foto + "urgent: AC broken" al número → Meta POST a `/webhooks/whatsapp/<appId>` (verifica HMAC, normaliza, encola, **200 en <50ms**) → worker persiste msg + media en R2 → rules engine → `ai.classify` Anthropic → `{ topic: "maintenance", urgency: "high" }` + `ai_usage` row → 2 `delivery_attempt` enqueued → workers entregan a Notion (DB page) y MCP-client (`kb.upsert_note`) → status `processed` → cron `meter:ai` POSTea Stripe usage record idempotente.

**Verificación automatizada (CI)**: Playwright + docker-compose con Postgres + Redis + LocalStack (R2) + simulador webhook Meta + Notion fake + MCP fake. Test: seed tenant/inbox/regla/destinos → fire webhook WA → poll `GET /v1/messages/:mid/deliveries` hasta `success` (timeout 10s) → asserts:
- Notion fake recibió 1 POST con campos extraídos.
- MCP fake recibió `kb.upsert_note` con los mismos campos.
- `ai_usage` con tokens > 0 y `stripe_usage_record_id` set tras meter cron.
- `audit_log` tiene entradas ingest + delivery success.
- **Ningún log contiene** WABA token, Notion token, ni MCP bearer (regression security guard).

Si todo verde → arquitectura validada extremo a extremo.
