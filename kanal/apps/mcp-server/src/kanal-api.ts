import { ProviderError } from '@kanal/shared';

/**
 * Thin client for the Kanal REST API. The MCP server forwards the caller's
 * tenant API key on every request — there is no service-account elevation.
 * If a tool needs information another user isn't allowed to see, the API
 * itself enforces it via scope checks.
 */
export class KanalApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(new URL(path, this.baseUrl), init);
    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const err = parsed as { code?: string; message?: string } | string | null;
      const code = typeof err === 'object' && err?.code ? err.code : `http_${res.status}`;
      const msg =
        typeof err === 'object' && err?.message
          ? err.message
          : typeof err === 'string'
            ? err
            : `request failed with ${res.status}`;
      throw new ProviderError('kanal-api', `${method} ${path}: ${msg}`, { status: res.status, code });
    }
    return parsed as T;
  }

  listInboxes() {
    return this.req<{ inboxes: Array<Record<string, unknown>> }>('GET', '/v1/inboxes');
  }
  getInbox(id: string) {
    return this.req<Record<string, unknown>>('GET', `/v1/inboxes/${id}`);
  }
  listMessages(inboxId: string, cursor?: string, limit?: number) {
    const qs = new URLSearchParams();
    if (cursor) qs.set('cursor', cursor);
    if (limit) qs.set('limit', String(limit));
    const suffix = qs.size ? `?${qs.toString()}` : '';
    return this.req<{ messages: Array<Record<string, unknown>>; nextCursor: string | null }>(
      'GET',
      `/v1/inboxes/${inboxId}/messages${suffix}`,
    );
  }
  getMessage(id: string) {
    return this.req<Record<string, unknown>>('GET', `/v1/messages/${id}`);
  }
  sendMessage(body: {
    inboxId?: string;
    inboxSlug?: string;
    contentText?: string;
    subject?: string;
    sender?: { name?: string; email?: string; phone?: string };
  }) {
    return this.req<{ id: string; status: 'queued' }>('POST', '/v1/messages', body);
  }
  listRules(inboxId: string) {
    return this.req<{ rules: Array<Record<string, unknown>> }>('GET', `/v1/inboxes/${inboxId}/rules`);
  }
  createRule(inboxId: string, body: {
    name: string;
    enabled?: boolean;
    priority?: number;
    definition: Record<string, unknown>;
  }) {
    return this.req<Record<string, unknown>>('POST', `/v1/inboxes/${inboxId}/rules`, body);
  }
}
