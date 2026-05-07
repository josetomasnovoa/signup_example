import { z } from 'zod';
import type { DeliveryPayload, DeliveryResult, DestinationDriver } from './driver.js';

/**
 * Discord webhook destination. Posts to a server-channel-specific webhook
 * URL with an embed describing the inbound message. Discord webhooks are
 * stateless — no app install required — and rate-limited per webhook
 * (5 messages / 2s) which we surface as 429s for retry by the worker.
 */
export const DiscordConfig = z.object({
  webhookUrl: z
    .string()
    .url()
    .refine(
      (u) => u.startsWith('https://discord.com/api/webhooks/') || u.startsWith('https://discordapp.com/api/webhooks/'),
      'must be a Discord webhook URL',
    ),
  username: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  timeoutMs: z.number().int().positive().max(30_000).default(8_000),
});
export type DiscordConfig = z.infer<typeof DiscordConfig>;

class DiscordDriver implements DestinationDriver {
  readonly kind = 'discord';

  async deliver(payload: DeliveryPayload, raw: Record<string, unknown>): Promise<DeliveryResult> {
    const cfg = DiscordConfig.parse(raw);
    const title = (payload.subject ?? `Message via ${payload.channel}`).slice(0, 256);
    const description = (payload.contentText ?? '').slice(0, 4000);
    const fields: { name: string; value: string; inline?: boolean }[] = [];
    if (payload.tags.length > 0) {
      fields.push({ name: 'Tags', value: payload.tags.map((t) => `\`${t}\``).join(' '), inline: false });
    }
    if (payload.sender && Object.keys(payload.sender).length > 0) {
      fields.push({
        name: 'Sender',
        value: Object.entries(payload.sender)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join('\n'),
        inline: true,
      });
    }
    const body = JSON.stringify({
      ...(cfg.username ? { username: cfg.username } : {}),
      ...(cfg.avatarUrl ? { avatar_url: cfg.avatarUrl } : {}),
      embeds: [
        {
          title,
          description,
          fields,
          timestamp: payload.receivedAt,
          footer: { text: `Kanal · ${payload.messageId.slice(0, 8)}` },
        },
      ],
    });

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: ac.signal,
      });
      const text = await res.text().catch(() => '');
      const ok = res.status >= 200 && res.status < 300;
      return {
        status: ok ? 'success' : 'failed',
        ...(ok ? {} : { errorCode: `http_${res.status}`, errorMessage: text.slice(0, 500) }),
        request: { url: redactUrl(cfg.webhookUrl), body: JSON.parse(body) },
        response: { status: res.status, body: text.slice(0, 1024) },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const aborted = msg.includes('aborted') || (err as { name?: string }).name === 'AbortError';
      return {
        status: 'failed',
        errorCode: aborted ? 'timeout' : 'network_error',
        errorMessage: msg,
        request: { url: redactUrl(cfg.webhookUrl), body: JSON.parse(body) },
        response: {},
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function redactUrl(url: string): string {
  const u = new URL(url);
  const segs = u.pathname.split('/');
  if (segs.length > 0) segs[segs.length - 1] = `${segs[segs.length - 1]!.slice(0, 4)}…`;
  return `${u.origin}${segs.join('/')}`;
}

export const discordDriver: DestinationDriver = new DiscordDriver();