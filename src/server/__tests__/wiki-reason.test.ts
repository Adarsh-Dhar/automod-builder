// src/server/__tests__/wiki-reason.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedisGet, mockRedisSet, mockUpdateWikiPage, mockGetWikiPage } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockUpdateWikiPage: vi.fn(),
  mockGetWikiPage: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: { get: mockRedisGet, set: mockRedisSet, del: vi.fn() },
  reddit: { updateWikiPage: mockUpdateWikiPage, getWikiPage: mockGetWikiPage },
  context: { subredditName: 'testsub' },
}));

import { saveCurrentRule, pushYamlToWiki } from '../../server/services/automod.service';
import { serializeAutomodRule, DEFAULT_AUTOMOD_RULE, type AutomodRule } from '../../shared/automod';

function buildRule(overrides: Partial<AutomodRule> = {}): AutomodRule {
  return {
    ...DEFAULT_AUTOMOD_RULE,
    id: 'r1',
    name: 'Crypto spam filter',
    action: 'remove',
    comment: 'Removed.',
    modmail: '{{permalink}}',
    conditions: [{ field: 'title', comparator: 'includes', value: 'crypto' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(null);
  mockUpdateWikiPage.mockResolvedValue(undefined);
  mockGetWikiPage.mockRejectedValue(new Error('not found'));
});

// ─── reason = rule name via saveCurrentRule ───────────────────────────────────

describe('Wiki edit reason via saveCurrentRule', () => {
  it('passes rule name as reason to updateWikiPage', async () => {
    const rule = buildRule({ name: 'Crypto spam filter' });
    await saveCurrentRule(rule);

    const call = mockUpdateWikiPage.mock.calls[0][0];
    expect(call.reason).toBe('Crypto spam filter');
  });

  it('reason changes when rule name changes', async () => {
    await saveCurrentRule(buildRule({ name: 'First rule' }));
    const reason1: string = mockUpdateWikiPage.mock.calls[0][0].reason;

    vi.clearAllMocks();
    mockUpdateWikiPage.mockResolvedValue(undefined);
    mockGetWikiPage.mockRejectedValue(new Error('not found'));
    mockRedisSet.mockResolvedValue(null);

    await saveCurrentRule(buildRule({ name: 'Second rule' }));
    const reason2: string = mockUpdateWikiPage.mock.calls[0][0].reason;

    expect(reason1).toBe('First rule');
    expect(reason2).toBe('Second rule');
    expect(reason1).not.toBe(reason2);
  });
});

// ─── reason fallback via pushYamlToWiki directly (the /publish route) ─────────

describe('Wiki edit reason via pushYamlToWiki directly', () => {
  it('uses default reason when no reason arg is provided', async () => {
    const yaml = serializeAutomodRule(buildRule());
    await pushYamlToWiki(yaml); // no reason — same as /publish route

    const call = mockUpdateWikiPage.mock.calls[0][0];
    expect(call.reason).toBe('Updated via AutoMod Builder app');
  });

  it('uses provided reason string when given', async () => {
    const yaml = serializeAutomodRule(buildRule());
    await pushYamlToWiki(yaml, 'My custom reason');

    const call = mockUpdateWikiPage.mock.calls[0][0];
    expect(call.reason).toBe('My custom reason');
  });

  it('reason is a non-empty string in all cases', async () => {
    const yaml = serializeAutomodRule(buildRule());
    await pushYamlToWiki(yaml);

    const reason: string = mockUpdateWikiPage.mock.calls[0][0].reason;
    expect(reason.trim().length).toBeGreaterThan(0);
  });
});
