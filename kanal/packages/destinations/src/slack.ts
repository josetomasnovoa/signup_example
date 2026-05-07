import { z } from 'zod';
import type { DeliveryPayload, DeliveryResult, DestinationDriver } from './driver.js';

/**
 * Slack incoming-webhook destination. Posts a Block Kit-shaped message to
 * a tenant-supplied incoming webhook URL. We compose a compact summary
 * (subject + first ~500 chars of body) plus a context line with tags so
 * the message is readable in any Slack channel without further config.
 *
 * For richer formatting (bot user, threads, app actions) we'd switch to
 * the Slack Web API with a bot token — but that requires a Slack app
 * install per workspace, which is a larger surface. The webhook URL works
 * for any inbox out of the box.
 */
export const SlackConfig = z.object({
  webhookUrl: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://hooks.slack.com/'), 'must be a Slack incoming-webhook URL'),
  channel: z.string().optional(),
  username: z.string().optional(),
  iconEmoji: z.string().optional(),
  timeoutMs: z.number().int().positive().max(30_000).default(8_000),
});
export type SlackConfig = z.infer<typeof SlackConfig>;

class SlackDriver implements DestinationDriver {
  readonly kind = 'slack';

  async deliver(payload: DeliveryPayload, raw: Record<string, unknown>): Promise<DeliveryResult> {
    const cfg = SlackConfig.parse(raw);
    const headline = payload.subject ?? `New message in ${payload.channel}`;
    const bodySnippet = (payload.contentText ?? '').slice(0, 500);
    const blocks: unknown[] = [
      { type: 'header', text: { type: 'plain_text', text: headline.slice(0, 150) } },
      ...(bodySnippet
        ? [{ type: 'section', text: { type: 'mrkdwn', text: bodySnippet } }]
        : []),
    ];
    if (payload.tags.length > 0) {
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Tags: \`${payload.tags.join('`, `')}\`` }],
      });
    }
    const body = JSON.stringify({
      text: headline,
      ...(cfg.channel ? { channel: cfg.channel } : {}),
      ...(cfg.username ? { username: cfg.username } : {}),
      ...(cfg.iconEmoji ? { icon_emoji: cfg.iconEmoji } : {}),
      blocks,
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

/** Slack incoming-webhook URLs embed a secret in the path. Truncate it. */
function redactUrl(url: string): string {
  const u = new URL(url);
  const segs = u.pathname.split('/');
  if (segs.length > 3) {
    segs[segs.length - 1] = `${segs[segs.length - 1]!.slice(0, 4)}…`;
  }
  return `${u.origin}${segs.join('/')}`;
}

export const slackDriver: DestinationDriver = new SlackDriver();