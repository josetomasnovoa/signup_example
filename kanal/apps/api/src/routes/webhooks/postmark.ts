import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { findChannelByConfig, persistAndEnqueue } from './_helpers.js';

/**
 * Postmark inbound webhook. Postmark POSTs a JSON body parsed from the
 * incoming email. We resolve the tenant+inbox by matching the recipient
 * mailbox local-part against the channel's configured alias.
 *
 * Postmark itself does not sign requests; the recommended hardening is
 * (a) restrict the inbound URL by a long random path segment, and (b)
 * validate the basic-auth credentials Postmark adds to the webhook URL.
 * For now we accept the path-segment shared secret in `:secret` and
 * compare it to `POSTMARK_INBOUND_SECRET`.
 */

const PostmarkPayload = z.object({
  MessageID: z.string(),
  From: z.string(),
  FromName: z.string().optional(),
  FromFull: z.object({ Email: z.string(), Name: z.string().optional() }).optional(),
  To: z.string().optional(),
  ToFull: z
    .array(z.object({ Email: z.string(), MailboxHash: z.string().optional() }))
    .optional(),
  Subject: z.string().optional(),
  TextBody: z.string().optional(),
  HtmlBody: z.string().optional(),
  Date: z.string().optional(),
  MailboxHash: z.string().optional(),
  OriginalRecipient: z.string().optional(),
  Headers: z
    .array(z.object({ Name: z.string(), Value: z.string() }))
    .optional(),
});

function localPartOf(email: string): string {
  const at = email.indexOf('@');
  return at < 0 ? email : email.slice(0, at);
}

export async function registerPostmarkWebhook(app: FastifyInstance): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/webhooks/inbound/postmark/:secret',
    {
      config: { skipAuth: true },
      schema: { params: z.object({ secret: z.string().min(8) }), body: PostmarkPayload },
    },
    async (req, reply) => {
      const expected = process.env.POSTMARK_INBOUND_SECRET;
      if (!expected || req.params.secret !== expected) {
        return reply.code(401).send({ ok: false });
      }

      // Pick the recipient that maps to a known alias. Postmark may deliver
      // to multiple addresses; we resolve by the first match.
      const candidates: string[] = [];
      if (req.body.ToFull) candidates.push(...req.body.ToFull.map((t) => t.Email));
      if (req.body.OriginalRecipient) candidates.push(req.body.OriginalRecipient);
      if (req.body.To) candidates.push(req.body.To);

      let channel = null;
      let alias = '';
      for (const addr of candidates) {
        alias = localPartOf(addr);
        channel = await findChannelByConfig(app, 'email', 'alias', alias);
        if (channel) break;
      }
      if (!channel) {
        app.log.warn({ candidates }, 'postmark:no matching channel');
        return reply.code(200).send({ ok: true, ignored: true });
      }

      const sender = {
        ...(req.body.FromFull?.Name ?? req.body.FromName
          ? { name: (req.body.FromFull?.Name ?? req.body.FromName)! }
          : {}),
        email: req.body.FromFull?.Email ?? req.body.From,
      };

      const headersMap: Record<string, string> = {};
      for (const h of req.body.Headers ?? []) headersMap[h.Name.toLowerCase()] = h.Value;

      const result = await persistAndEnqueue(app, {
        tenantId: channel.tenantId,
        channelId: channel.id,
        inboxId: channel.inboxId,
        externalId: req.body.MessageID,
        sender,
        contentText: req.body.TextBody ?? null,
        contentHtml: req.body.HtmlBody ?? null,
        subject: req.body.Subject ?? null,
        metadata: { alias, mailboxHash: req.body.MailboxHash },
        headers: headersMap,
      });
      app.log.info({ alias, messageId: result.messageId, duplicate: result.duplicate }, 'postmark:ingested');
      return { ok: true, messageId: result.messageId, duplicate: result.duplicate };
    },
  );
}