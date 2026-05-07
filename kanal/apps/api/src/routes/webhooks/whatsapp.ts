import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findChannelByConfig, persistAndEnqueue } from './_helpers.js';

/**
 * Meta WhatsApp Cloud API webhook.
 *
 *   GET  /webhooks/whatsapp/:appId — verify subscription challenge
 *   POST /webhooks/whatsapp/:appId — receive message events
 *
 * Verification:
 *  - GET: Meta sends `hub.mode=subscribe`, `hub.verify_token=...`,
 *    `hub.challenge=...`. We compare the verify token against the channel
 *    config (`config.verifyToken`) and echo the challenge.
 *  - POST: Meta signs the request body with the App Secret using
 *    HMAC-SHA256 and sends `X-Hub-Signature-256: sha256=<hex>`. We compute
 *    the same and timing-safe compare. The App Secret is on the channel
 *    config (`config.appSecret`). Reject 401 on mismatch.
 *
 * The handler resolves the channel by `phone_number_id` (Meta's stable id
 * for the destination number) and persists+enqueues each individual
 * message in the payload.
 */

const WhatsAppEntry = z.object({
  changes: z.array(
    z.object({
      value: z.object({
        metadata: z.object({ phone_number_id: z.string() }),
        contacts: z
          .array(z.object({ profile: z.object({ name: z.string() }).optional(), wa_id: z.string() }))
          .optional(),
        messages: z
          .array(
            z.object({
              id: z.string(),
              from: z.string(),
              type: z.string(),
              timestamp: z.string(),
              text: z.object({ body: z.string() }).optional(),
            }),
          )
          .optional(),
      }),
    }),
  ),
});

const WhatsAppPayload = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(WhatsAppEntry),
});

function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header) return false;
  const m = /^sha256=([a-f0-9]+)$/i.exec(header);
  if (!m) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const got = Buffer.from(m[1]!, 'hex');
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

/**
 * Register WhatsApp routes inside an encapsulated Fastify plugin so the
 * raw-body content-type parser only applies here. Without encapsulation the
 * parser would shadow the default JSON parser across the whole API and
 * every other POST would fail validation.
 */
export async function registerWhatsAppWebhook(parent: FastifyInstance): Promise<void> {
  await parent.register(async function whatsappPlugin(app) {
    app.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      async (_req: unknown, body: Buffer) => body,
    );

    const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/webhooks/whatsapp/:appId',
    {
      config: { skipAuth: true },
      schema: {
        params: z.object({ appId: z.string() }),
        querystring: z.object({
          'hub.mode': z.string().optional(),
          'hub.verify_token': z.string().optional(),
          'hub.challenge': z.string().optional(),
        }),
      },
    },
    async (req, reply) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode !== 'subscribe' || !token || !challenge) {
        return reply.code(400).send('bad request');
      }

      // Look up any WA channel whose config.appId matches the path. This
      // lets one tenant's channel survive without disclosing other tenants.
      const channel = await findChannelByConfig(app, 'whatsapp', 'appId', req.params.appId);
      if (!channel) return reply.code(404).send('not found');
      const cfg = channel.config as { verifyToken?: string };
      if (cfg.verifyToken !== token) return reply.code(403).send('forbidden');
      reply.type('text/plain');
      return challenge;
    },
  );

  typed.post(
    '/webhooks/whatsapp/:appId',
    {
      config: { skipAuth: true },
      schema: { params: z.object({ appId: z.string() }) },
    },
    async (req, reply) => {
      const raw = req.body as Buffer;
      let parsed: z.infer<typeof WhatsAppPayload>;
      try {
        parsed = WhatsAppPayload.parse(JSON.parse(raw.toString('utf8')));
      } catch (err) {
        app.log.warn({ err }, 'whatsapp:invalid payload');
        return reply.code(400).send({ ok: false });
      }

      // Resolve channel by appId path param. Verify HMAC with that channel's
      // app secret. We do not 401 cross-app deliveries because Meta shares
      // a single endpoint per app: but invalid signatures must always fail.
      const channel = await findChannelByConfig(app, 'whatsapp', 'appId', req.params.appId);
      if (!channel) return reply.code(200).send({ ok: true }); // ignore unknown app
      const cfg = channel.config as { appSecret?: string; phoneNumberId?: string };
      if (!cfg.appSecret) return reply.code(500).send({ ok: false, error: 'channel missing appSecret' });

      const sig = req.headers['x-hub-signature-256'];
      if (!verifySignature(raw, Array.isArray(sig) ? sig[0] : sig, cfg.appSecret)) {
        app.log.warn({ appId: req.params.appId }, 'whatsapp:bad signature');
        return reply.code(401).send({ ok: false });
      }

      let count = 0;
      for (const entry of parsed.entry) {
        for (const change of entry.changes) {
          if (change.value.metadata.phone_number_id !== cfg.phoneNumberId) continue;
          for (const msg of change.value.messages ?? []) {
            const contact = change.value.contacts?.find((c) => c.wa_id === msg.from);
            await persistAndEnqueue(app, {
              tenantId: channel.tenantId,
              channelId: channel.id,
              inboxId: channel.inboxId,
              externalId: msg.id,
              sender: {
                ...(contact?.profile?.name ? { name: contact.profile.name } : {}),
                phone: msg.from,
              },
              contentText: msg.text?.body ?? null,
              metadata: { wa_type: msg.type, wa_timestamp: msg.timestamp },
              headers: { 'x-hub-signature-256': String(sig ?? '') },
            });
            count++;
          }
        }
      }
      app.log.info({ appId: req.params.appId, ingested: count }, 'whatsapp:ingested');
      return { ok: true, ingested: count };
    },
  );
  });
}