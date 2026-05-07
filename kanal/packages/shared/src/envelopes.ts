import { z } from 'zod';

export const ChannelKind = z.enum(['whatsapp', 'email', 'api', 'web', 'mcp']);
export type ChannelKind = z.infer<typeof ChannelKind>;

export const MessageDirection = z.enum(['inbound', 'outbound']);
export type MessageDirection = z.infer<typeof MessageDirection>;

export const MessageStatus = z.enum(['received', 'processing', 'processed', 'failed', 'dead']);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const Sender = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  raw: z.record(z.unknown()).optional(),
});
export type Sender = z.infer<typeof Sender>;

export const InboundAttachment = z.object({
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sourceUrl: z.string().url().optional(),
  storageKey: z.string().optional(),
  sha256: z.string().optional(),
});
export type InboundAttachment = z.infer<typeof InboundAttachment>;

/**
 * The normalized envelope produced by every channel adapter and consumed by
 * the worker pipeline. Every field downstream is derived from this shape.
 */
export const InboundMessage = z.object({
  tenantId: z.string().uuid(),
  inboxId: z.string().uuid(),
  channelId: z.string().uuid(),
  channelKind: ChannelKind,
  externalId: z.string().optional(),
  receivedAt: z.string().datetime(),
  sender: Sender,
  contentText: z.string().optional(),
  contentHtml: z.string().optional(),
  contentJson: z.record(z.unknown()).optional(),
  subject: z.string().optional(),
  attachments: z.array(InboundAttachment).default([]),
  metadata: z.record(z.unknown()).default({}),
  headers: z.record(z.string()).default({}),
  traceparent: z.string().optional(),
});
export type InboundMessage = z.infer<typeof InboundMessage>;
