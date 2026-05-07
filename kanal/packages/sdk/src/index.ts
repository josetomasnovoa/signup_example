/**
 * @kanal/sdk — typed client for the Kanal REST API.
 *
 * The TypeScript types in `openapi.d.ts` are generated from `openapi.json`
 * via `pnpm --filter @kanal/sdk generate`. The runtime client below is a
 * thin wrapper over `fetch` that exposes the high-traffic endpoints with
 * full type safety on inputs/outputs.
 *
 * Use with any tenant API key:
 *   const client = new KanalClient({ apiKey: 'kn_live_…' });
 *   const inboxes = await client.listInboxes();
 *   const msg = await client.sendMessage({ inboxSlug: 'triage', contentText: 'hi' });
 */

export interface KanalClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export interface SendMessageInput {
  inboxId?: string;
  inboxSlug?: string;
  contentText?: string;
  subject?: string;
  channelKind?: 'whatsapp' | 'email' | 'api' | 'web' | 'mcp';
  sender?: { name?: string; email?: string; phone?: string };
  metadata?: Record<string, unknown>;
}

export interface InboxSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  aiEnabled: boolean;
  retentionDays: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface MessageSummary {
  id: string;
  inboxId: string;
  status: 'received' | 'processing' | 'processed' | 'failed' | 'dead';
  subject: string | null;
  contentText: string | null;
  aiSummary: string | null;
  aiClassification: Record<string, unknown> | null;
  receivedAt: string;
  processedAt: string | null;
}

export class KanalApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = 'KanalApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class KanalClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: KanalClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? 'https://api.kanal.app';
    this.fetchFn = opts.fetch ?? fetch;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await this.fetchFn(new URL(path, this.baseUrl), init);
    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const err = parsed as { code?: string; message?: string; details?: unknown } | null;
      throw new KanalApiError(
        res.status,
        err?.code ?? `http_${res.status}`,
        err?.message ?? `request failed with ${res.status}`,
        err?.details,
      );
    }
    return parsed as T;
  }

  // ── Inboxes ────────────────────────────────────────────────────────────
  listInboxes() {
    return this.req<{ inboxes: InboxSummary[] }>('GET', '/v1/inboxes');
  }
  getInbox(id: string) {
    return this.req<InboxSummary>('GET', `/v1/inboxes/${id}`);
  }
  createInbox(body: { name: string; slug: string; description?: string; aiEnabled?: boolean }) {
    return this.req<InboxSummary>('POST', '/v1/inboxes', body);
  }

  // ── Messages ───────────────────────────────────────────────────────────
  sendMessage(body: SendMessageInput) {
    return this.req<{ id: string; status: 'queued' }>('POST', '/v1/messages', body);
  }
  listMessages(inboxId: string, opts?: { cursor?: string; limit?: number }) {
    const qs = new URLSearchParams();
    if (opts?.cursor) qs.set('cursor', opts.cursor);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const suffix = qs.size ? `?${qs.toString()}` : '';
    return this.req<{ messages: MessageSummary[]; nextCursor: string | null }>(
      'GET',
      `/v1/inboxes/${inboxId}/messages${suffix}`,
    );
  }
  getMessage(id: string) {
    return this.req<MessageSummary>('GET', `/v1/messages/${id}`);
  }

  // ── AI Models ──────────────────────────────────────────────────────────
  listModels(opts?: { provider?: 'anthropic' | 'google'; includeDeprecated?: boolean }) {
    const qs = new URLSearchParams();
    if (opts?.provider) qs.set('provider', opts.provider);
    if (opts?.includeDeprecated) qs.set('includeDeprecated', 'true');
    const suffix = qs.size ? `?${qs.toString()}` : '';
    return this.req<{ models: Array<Record<string, unknown>> }>('GET', `/v1/ai/models${suffix}`);
  }
}
