import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { DeliveryPayload, DeliveryResult, DestinationDriver } from './driver.js';

export const WebhookConfig = z.object({
  url: z.string().url(),
  signingSecret: z.string().min(8).optional(),
  /** Extra headers (already-redacted; do not put secrets here at runtime). */
  headers: z.record(z.string()).optional(),
  /** Wall-clock timeout in milliseconds for the HTTP call. */
  timeoutMs: z.number().int().positive().max(30_000).default(8_000),
});
export type WebhookConfig = z.infer<typeof WebhookConfig>;

class WebhookDriver implements DestinationDriver {
  readonly kind = 'webhook';

  async deliver(payload: DeliveryPayload, rawConfig: Record<string, unknown>): Promise<DeliveryResult> {
    const config = WebhookConfig.parse(rawConfig);
    const body = JSON.stringify({
      messageId: payload.messageId,
      inboxId: payload.inboxId,
      channel: payload.channel,
      receivedAt: payload.receivedAt,
      subject: payload.subject,
      contentText: payload.contentText,
      sender: payload.sender,
      derived: payload.derived,
      tags: payload.tags,
    });

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'Kanal/0.0',
      'x-kanal-message-id': payload.messageId,
      'x-kanal-tenant-id': payload.tenantId,
      ...config.headers,
    };
    if (config.signingSecret) {
      const ts = Math.floor(Date.now() / 1000).toString();
      const sig = createHmac('sha256', config.signingSecret)
        .update(`${ts}.${body}`)
        .digest('hex');
      headers['x-kanal-timestamp'] = ts;
      headers['x-kanal-signature'] = `t=${ts},v1=${sig}`;
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), config.timeoutMs);
    try {
      const res = await fetch(config.url, {
        method: 'POST',
        headers,
        body,
        signal: ac.signal,
      });
      const respText = await res.text().catch(() => '');
      const ok = res.status >= 200 && res.status < 300;
      return {
        status: ok ? 'success' : 'failed',
        ...(ok ? {} : { errorCode: `http_${res.status}`, errorMessage: respText.slice(0, 500) }),
        request: { url: config.url, headers, body: JSON.parse(body) },
        response: {
          status: res.status,
          body: respText.length > 0 ? respText.slice(0, 4096) : undefined,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const aborted = msg.includes('aborted') || (err as { name?: string }).name === 'AbortError';
      return {
        status: 'failed',
        errorCode: aborted ? 'timeout' : 'network_error',
        errorMessage: msg,
        request: { url: config.url, headers, body: JSON.parse(body) },
        response: {},
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const webhookDriver: DestinationDriver = new WebhookDriver();