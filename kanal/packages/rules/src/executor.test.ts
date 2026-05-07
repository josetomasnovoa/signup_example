import { describe, expect, it } from 'vitest';
import { executeRule, type MessageView } from './executor.js';

const baseMsg: MessageView = {
  id: 'm1',
  channel: 'email',
  subject: 'Invoice #42 from Acme',
  contentText: 'Body text',
  sender: { email: 'a@b.com' },
  metadata: {},
  attachments: [{ filename: 'inv.pdf', mimeType: 'application/pdf', sizeBytes: 1000 }],
};

const ctx = {
  aiClassify: async ({ schema }: { schema: Record<string, string> }) => {
    const out: Record<string, unknown> = {};
    for (const [k] of Object.entries(schema)) out[k] = `v_${k}`;
    return out;
  },
  now: () => new Date('2026-05-07T12:00:00Z'),
};

describe('rules executor', () => {
  it('matches predicates and runs transforms then routes', async () => {
    const rule = {
      version: 1,
      name: 'invoice fanout',
      trigger: 'message.received',
      pipeline: [
        {
          match: {
            all: [
              { cel: "message.channel == 'email'" },
              { cel: 'has(message.attachments)' },
              { cel: "message.subject matches '(?i)invoice'" },
            ],
          },
          else: 'skip',
        },
        {
          transform: [
            { op: 'ai.classify', schema: { topic: 'string' }, out: 'classification' },
            { op: 'set', path: 'tags', value: ['invoice', 'demo'] },
          ],
        },
        { route: { fanout: [{ destination: 'webhook' }, { destination: 'webhook' }] } },
      ],
    };
    const res = await executeRule(rule, baseMsg, ctx);
    expect(res.matched).toBe(true);
    expect(res.derived.classification).toEqual({ topic: 'v_topic' });
    expect(res.tags).toEqual(['invoice', 'demo']);
    expect(res.fanout.map((f) => f.destination)).toEqual(['webhook']);
  });

  it('skip-on-no-match does not run later transforms', async () => {
    const rule = {
      version: 1,
      name: 'wa only',
      trigger: 'message.received',
      pipeline: [
        { match: { cel: "message.channel == 'whatsapp'" }, else: 'skip' },
        { transform: [{ op: 'ai.classify', schema: { x: 'string' }, out: 'x' }] },
      ],
    };
    const res = await executeRule(rule, baseMsg, ctx);
    expect(res.matched).toBe(false);
    expect(res.derived.x).toBeUndefined();
  });

  it('handles attachment count predicate', async () => {
    const rule = {
      version: 1,
      name: 'multi attach',
      trigger: 'message.received',
      pipeline: [{ match: { cel: 'message.attachments.size() > 0' }, else: 'stop' }],
    };
    const res = await executeRule(rule, baseMsg, ctx);
    expect(res.matched).toBe(true);
  });
});
