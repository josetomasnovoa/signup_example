import { describe, expect, it } from 'vitest';
import {
  defaultModelForTask,
  getModel,
  listModels,
  modelSupports,
  requireModel,
} from './models.js';
import { buildUsageRecord } from './metering.js';

describe('model registry', () => {
  it('exposes Claude and Gemini families', () => {
    expect(getModel('anthropic:claude-sonnet-4-6')).toBeDefined();
    expect(getModel('anthropic:claude-haiku-4-5')).toBeDefined();
    expect(getModel('anthropic:claude-opus-4-7')).toBeDefined();
    expect(getModel('google:gemini-2.5-pro')).toBeDefined();
    expect(getModel('google:gemini-2.5-flash')).toBeDefined();
    expect(getModel('google:gemini-2.5-flash-lite')).toBeDefined();
  });

  it('listModels hides deprecated by default', () => {
    const visible = listModels();
    expect(visible.find((m) => m.id === 'google:gemini-2.0-flash')).toBeUndefined();
    const all = listModels({ includeDeprecated: true });
    expect(all.find((m) => m.id === 'google:gemini-2.0-flash')).toBeDefined();
  });

  it('chooses provider-specific defaults per task', () => {
    expect(defaultModelForTask('anthropic', 'classify').id).toBe('anthropic:claude-haiku-4-5');
    expect(defaultModelForTask('google', 'classify').id).toBe('google:gemini-2.5-flash-lite');
    expect(defaultModelForTask('anthropic', 'reason').id).toBe('anthropic:claude-opus-4-7');
    expect(defaultModelForTask('google', 'reason').id).toBe('google:gemini-2.5-pro');
  });

  it('requireModel throws on unknown id', () => {
    expect(() => requireModel('openai:gpt-99')).toThrow();
  });

  it('capability check', () => {
    expect(modelSupports('google:gemini-2.5-pro', 'video')).toBe(true);
    expect(modelSupports('anthropic:claude-haiku-4-5', 'video')).toBe(false);
  });
});

describe('metering', () => {
  it('charges 0 on BYOK but still records cost', () => {
    const rec = buildUsageRecord({
      tenantId: '00000000-0000-0000-0000-000000000001',
      inboxId: '00000000-0000-0000-0000-000000000002',
      modelId: 'anthropic:claude-haiku-4-5',
      operation: 'classify',
      usage: { inputTokens: 1_000_000, outputTokens: 500_000 },
      byok: true,
    });
    expect(rec.chargeUsdMicros).toBe(0);
    expect(rec.costUsdMicros).toBeGreaterThan(0);
    expect(rec.tier).toBe('fast');
  });

  it('charges = cost on metered (non-BYOK)', () => {
    const rec = buildUsageRecord({
      tenantId: '00000000-0000-0000-0000-000000000001',
      inboxId: '00000000-0000-0000-0000-000000000002',
      modelId: 'google:gemini-2.5-flash',
      operation: 'generate',
      usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      byok: false,
    });
    expect(rec.chargeUsdMicros).toBe(rec.costUsdMicros);
    // Sanity: Gemini Flash 2.5 should be in cents range for 2M tokens
    expect(rec.costUsdMicros).toBeGreaterThan(1_000_000); // > $1
    expect(rec.costUsdMicros).toBeLessThan(10_000_000); // < $10
  });
});
