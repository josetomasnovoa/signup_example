import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ──────────────────────────────────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────────────────────────────────

export const membershipRole = pgEnum('membership_role', [
  'owner',
  'admin',
  'member',
  'viewer',
]);

export const channelKind = pgEnum('channel_kind', ['whatsapp', 'email', 'api', 'web', 'mcp']);

export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound']);

export const messageStatus = pgEnum('message_status', [
  'received',
  'processing',
  'processed',
  'failed',
  'dead',
]);

export const destinationKind = pgEnum('destination_kind', [
  'webhook',
  'notion',
  'drive',
  'slack',
  'discord',
  'github_issue',
  'email_forward',
  'mcp_client',
  'internal',
  'api_passthrough',
]);

export const deliveryStatus = pgEnum('delivery_status', ['pending', 'success', 'failed', 'dlq']);

export const aiOperation = pgEnum('ai_operation', [
  'classify',
  'extract',
  'summarize',
  'generate',
  'translate',
  'embed',
]);

export const aiProvider = pgEnum('ai_provider', ['anthropic', 'google', 'openai', 'byok']);

export const subscriptionPlan = pgEnum('subscription_plan', [
  'free',
  'pro',
  'team',
  'enterprise',
]);

export const secretPurpose = pgEnum('secret_purpose', [
  'byok_anthropic',
  'byok_google',
  'byok_openai',
  'wa_token',
  'notion_token',
  'slack_token',
  'generic_oauth',
  'signing_secret',
]);

// ──────────────────────────────────────────────────────────────────────────
// Tenancy
// ──────────────────────────────────────────────────────────────────────────

export const tenant = pgTable(
  'tenant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: subscriptionPlan('plan').notNull().default('free'),
    stripeCustomerId: text('stripe_customer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    slugIdx: uniqueIndex('tenant_slug_idx').on(t.slug),
  }),
);

export const user = pgTable(
  'user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkId: text('clerk_id').notNull(),
    email: text('email').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clerkIdx: uniqueIndex('user_clerk_idx').on(t.clerkId),
  }),
);

export const membership = pgTable(
  'membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('membership_tenant_user_idx').on(t.tenantId, t.userId),
  }),
);

// ──────────────────────────────────────────────────────────────────────────
// Inboxes, channels, rules, destinations
// ──────────────────────────────────────────────────────────────────────────

export const inbox = pgTable(
  'inbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    language: text('language').notNull().default('en'),
    timezone: text('timezone').notNull().default('UTC'),
    aiEnabled: boolean('ai_enabled').notNull().default(false),
    /**
     * { modelId, systemPrompt, maxTokens, byokSecretId, perTaskOverrides? }
     * `modelId` is canonical, e.g. `anthropic:claude-sonnet-4-6`.
     */
    aiConfig: jsonb('ai_config'),
    retentionDays: integer('retention_days').notNull().default(90),
    redactPii: boolean('redact_pii').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => ({
    tenantSlugIdx: uniqueIndex('inbox_tenant_slug_idx').on(t.tenantId, t.slug),
  }),
);

export const encryptedSecret = pgTable('encrypted_secret', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  purpose: secretPurpose('purpose').notNull(),
  ciphertext: text('ciphertext').notNull(),
  dekWrapped: text('dek_wrapped').notNull(),
  kmsKeyId: text('kms_key_id').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  rotatedAt: timestamp('rotated_at', { withTimezone: true }),
});

export const channel = pgTable(
  'channel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    inboxId: uuid('inbox_id')
      .notNull()
      .references(() => inbox.id, { onDelete: 'cascade' }),
    kind: channelKind('kind').notNull(),
    config: jsonb('config').notNull(),
    secretId: uuid('secret_id').references(() => encryptedSecret.id),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    inboxIdx: index('channel_inbox_idx').on(t.inboxId, t.kind),
  }),
);

export const rule = pgTable(
  'rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    inboxId: uuid('inbox_id')
      .notNull()
      .references(() => inbox.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    /** RuleDefinition shape — see @kanal/rules. */
    definition: jsonb('definition').notNull(),
    createdBy: uuid('created_by').references(() => user.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    priorityIdx: index('rule_inbox_priority_idx').on(t.inboxId, t.priority),
  }),
);

export const destination = pgTable(
  'destination',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    inboxId: uuid('inbox_id')
      .notNull()
      .references(() => inbox.id, { onDelete: 'cascade' }),
    kind: destinationKind('kind').notNull(),
    name: text('name').notNull(),
    config: jsonb('config').notNull(),
    secretId: uuid('secret_id').references(() => encryptedSecret.id),
    enabled: boolean('enabled').notNull().default(true),
    retryPolicy: jsonb('retry_policy'),
    fallbackDestinationId: uuid('fallback_destination_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    inboxIdx: index('destination_inbox_idx').on(t.inboxId),
  }),
);

// ──────────────────────────────────────────────────────────────────────────
// Messages, attachments, deliveries
// ──────────────────────────────────────────────────────────────────────────

export const message = pgTable(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    inboxId: uuid('inbox_id')
      .notNull()
      .references(() => inbox.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id').references(() => channel.id),
    externalId: text('external_id'),
    direction: messageDirection('direction').notNull(),
    status: messageStatus('status').notNull().default('received'),
    sender: jsonb('sender'),
    contentText: text('content_text'),
    contentHtml: text('content_html'),
    contentJson: jsonb('content_json'),
    subject: text('subject'),
    metadata: jsonb('metadata'),
    headers: jsonb('headers'),
    aiSummary: text('ai_summary'),
    aiClassification: jsonb('ai_classification'),
    /** pgvector(1536). Declared as jsonb here; CREATE EXTENSION + ALTER COLUMN runs in migration. */
    embedding: jsonb('embedding'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => ({
    inboxRecvIdx: index('message_inbox_received_idx').on(t.tenantId, t.inboxId, t.receivedAt),
    statusIdx: index('message_status_idx').on(t.tenantId, t.status),
  }),
);

export const attachment = pgTable('attachment', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id')
    .notNull()
    .references(() => message.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  sha256: text('sha256'),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const deliveryAttempt = pgTable(
  'delivery_attempt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade' }),
    destinationId: uuid('destination_id')
      .notNull()
      .references(() => destination.id, { onDelete: 'cascade' }),
    attemptNo: integer('attempt_no').notNull().default(1),
    status: deliveryStatus('status').notNull().default('pending'),
    requestSnapshot: jsonb('request_snapshot'),
    responseSnapshot: jsonb('response_snapshot'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    messageIdx: index('delivery_message_idx').on(t.messageId),
    statusIdx: index('delivery_status_idx').on(t.tenantId, t.status, t.startedAt),
    uniq: uniqueIndex('delivery_unique_attempt_idx').on(t.messageId, t.destinationId, t.attemptNo),
  }),
);

// ──────────────────────────────────────────────────────────────────────────
// AI usage + billing
// ──────────────────────────────────────────────────────────────────────────

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    inboxId: uuid('inbox_id').references(() => inbox.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => message.id, { onDelete: 'set null' }),
    provider: aiProvider('provider').notNull(),
    /** Provider-native model id (e.g. `claude-sonnet-4-6`, `gemini-2.5-flash`) */
    model: text('model').notNull(),
    operation: aiOperation('operation').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    costUsdMicros: bigint('cost_usd_micros', { mode: 'number' }).notNull().default(0),
    chargeUsdMicros: bigint('charge_usd_micros', { mode: 'number' }).notNull().default(0),
    /** Stripe `subscription_item.create_usage_record` id once reported. */
    stripeUsageRecordId: text('stripe_usage_record_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index('ai_usage_tenant_created_idx').on(t.tenantId, t.createdAt),
  }),
);

export const apiKey = pgTable(
  'api_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prefixIdx: index('api_key_prefix_idx').on(t.keyPrefix),
  }),
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => user.id),
    actorApiKeyId: uuid('actor_api_key_id').references(() => apiKey.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    requestId: text('request_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    diff: jsonb('diff'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt),
  }),
);

export const usageCounter = pgTable(
  'usage_counter',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    periodMonth: text('period_month').notNull(), // 'YYYY-MM'
    messagesCount: integer('messages_count').notNull().default(0),
    storageBytes: bigint('storage_bytes', { mode: 'number' }).notNull().default(0),
    aiInputTokens: bigint('ai_input_tokens', { mode: 'number' }).notNull().default(0),
    aiOutputTokens: bigint('ai_output_tokens', { mode: 'number' }).notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.tenantId, t.periodMonth] }),
  }),
);
