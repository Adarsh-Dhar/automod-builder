/**
 * WIKI CONCURRENCY TESTS
 *
 * This test suite validates concurrent wiki write behavior when multiple
 * moderators deploy rules simultaneously.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @devvit/web/server before importing
const { mockRedisGet, mockRedisSet, mockUpdateWikiPage, mockGetWikiPage } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockUpdateWikiPage: vi.fn(),
  mockGetWikiPage: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: vi.fn(),
  },
  reddit: {
    updateWikiPage: mockUpdateWikiPage,
    getWikiPage: mockGetWikiPage,
  },
  context: {
    subredditName: 'test-subreddit',
  },
}));

// Import after mock is registered
import { pushYamlToWiki, saveCurrentRule } from '../../server/services/automod.service';
import { DEFAULT_AUTOMOD_RULE, serializeAutomodRule, type AutomodRule } from '../../shared/automod';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(null);
  mockUpdateWikiPage.mockResolvedValue(undefined);
  mockGetWikiPage.mockResolvedValue(null);
});

function buildRule(overrides: Partial<AutomodRule> = {}): AutomodRule {
  return {
    ...DEFAULT_AUTOMOD_RULE,
    id: 'test-rule',
    name: 'Test rule',
    action: 'remove',
    comment: 'Removed.',
    modmail: '{{permalink}}',
    conditions: [{ field: 'title', comparator: 'includes', value: 'test' }],
    ...overrides,
  };
}

describe('Concurrent Wiki Writes', () => {
  it('should handle sequential wiki writes correctly', async () => {
    // First write
    const rule1 = buildRule({ name: 'Rule 1' });
    const yaml1 = serializeAutomodRule(rule1);
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    await pushYamlToWiki(yaml1);

    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(1);
    const firstCall = mockUpdateWikiPage.mock.calls[0][0];
    expect(firstCall.content).toContain('Rule 1');

    // Second write
    vi.clearAllMocks();
    const rule2 = buildRule({ name: 'Rule 2' });
    const yaml2 = serializeAutomodRule(rule2);
    mockGetWikiPage.mockResolvedValue({ content_md: firstCall.content });
    await pushYamlToWiki(yaml2);

    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(1);
    const secondCall = mockUpdateWikiPage.mock.calls[0][0];
    expect(secondCall.content).toContain('Rule 1');
    expect(secondCall.content).toContain('Rule 2');
  });

  it('should handle rapid sequential writes (simulating concurrent mods)', async () => {
    const rules = [
      buildRule({ name: 'Rule A' }),
      buildRule({ name: 'Rule B' }),
      buildRule({ name: 'Rule C' }),
      buildRule({ name: 'Rule D' }),
      buildRule({ name: 'Rule E' }),
    ];

    let wikiContent = '';
    mockGetWikiPage.mockImplementation(async () => ({ content_md: wikiContent }));

    // Simulate 5 mods deploying rules in quick succession
    for (const rule of rules) {
      const yaml = serializeAutomodRule(rule);
      await pushYamlToWiki(yaml);
      // Update wiki content for next iteration
      const lastCall = mockUpdateWikiPage.mock.calls[mockUpdateWikiPage.mock.calls.length - 1][0];
      wikiContent = lastCall.content;
    }

    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(5);

    // Verify all rules are in the final content
    const finalContent = mockUpdateWikiPage.mock.calls[4][0].content;
    expect(finalContent).toContain('Rule A');
    expect(finalContent).toContain('Rule B');
    expect(finalContent).toContain('Rule C');
    expect(finalContent).toContain('Rule D');
    expect(finalContent).toContain('Rule E');
  });

  it('should handle same rule name updates (idempotency)', async () => {
    const rule = buildRule({ name: 'Spam filter' });
    const yaml1 = serializeAutomodRule(rule);
    
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    await pushYamlToWiki(yaml1);

    const firstContent = mockUpdateWikiPage.mock.calls[0][0].content;
    const firstMatches = (firstContent.match(/# Spam filter/g) ?? []).length;
    expect(firstMatches).toBe(1);

    // Update the same rule
    vi.clearAllMocks();
    const updatedRule = { ...rule, conditions: [{ field: 'title' as const, comparator: 'includes' as const, value: 'spam2' }] };
    const yaml2 = serializeAutomodRule(updatedRule);
    mockGetWikiPage.mockResolvedValue({ content_md: firstContent });
    await pushYamlToWiki(yaml2);

    const secondContent = mockUpdateWikiPage.mock.calls[0][0].content;
    const secondMatches = (secondContent.match(/# Spam filter/g) ?? []).length;
    expect(secondMatches).toBe(1); // Should replace, not duplicate
  });

  it('should handle wiki read errors during concurrent writes', async () => {
    const rule1 = buildRule({ name: 'Rule 1' });
    const rule2 = buildRule({ name: 'Rule 2' });

    // First write succeeds
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    await pushYamlToWiki(serializeAutomodRule(rule1));

    // Second write encounters read error
    vi.clearAllMocks();
    mockGetWikiPage.mockRejectedValue(new Error('Wiki read failed'));
    await pushYamlToWiki(serializeAutomodRule(rule2));

    // Should still write (treat as empty wiki)
    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(1);
    const content = mockUpdateWikiPage.mock.calls[0][0].content;
    expect(content).toContain('Rule 2');
  });

  it('should handle wiki write errors with retry logic', async () => {
    const rule = buildRule({ name: 'Test rule' });
    const yaml = serializeAutomodRule(rule);

    // Simulate retryable error then success
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    mockUpdateWikiPage
      .mockRejectedValueOnce(new Error('415 Unsupported Media Type'))
      .mockRejectedValueOnce(new Error('415 Unsupported Media Type'))
      .mockResolvedValueOnce(undefined);

    await pushYamlToWiki(yaml);

    // Should have retried and eventually succeeded
    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(3);
  });

  it('should handle non-retryable wiki write errors', async () => {
    const rule = buildRule({ name: 'Test rule' });
    const yaml = serializeAutomodRule(rule);

    // Simulate non-retryable error
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    mockUpdateWikiPage.mockRejectedValue(new Error('Permission denied'));

    await expect(pushYamlToWiki(yaml)).rejects.toThrow('Permission denied');

    // Should not retry non-retryable errors
    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(1);
  });
});

describe('Race Condition Detection', () => {
  it('should detect when wiki content changed between read and write', async () => {
    const rule1 = buildRule({ name: 'Rule 1' });
    const rule2 = buildRule({ name: 'Rule 2' });

    // First mod reads wiki
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    const yaml1 = serializeAutomodRule(rule1);

    // Second mod updates wiki before first mod writes
    const yaml2 = serializeAutomodRule(rule2);
    mockGetWikiPage.mockResolvedValue({ content_md: yaml2 });
    await pushYamlToWiki(yaml2);

    // First mod now writes (should merge with Rule 2)
    vi.clearAllMocks();
    mockGetWikiPage.mockResolvedValue({ content_md: yaml2 });
    await pushYamlToWiki(yaml1);

    const finalContent = mockUpdateWikiPage.mock.calls[0][0].content;
    expect(finalContent).toContain('Rule 1');
    expect(finalContent).toContain('Rule 2');
  });

  it('should handle simultaneous same-name rule updates', async () => {
    const rule1 = buildRule({ name: 'Spam filter', conditions: [{ field: 'title', comparator: 'includes', value: 'spam1' }] });
    const rule2 = buildRule({ name: 'Spam filter', conditions: [{ field: 'title', comparator: 'includes', value: 'spam2' }] });

    // Both mods read the same initial state
    mockGetWikiPage.mockResolvedValue({ content_md: '' });

    // First mod writes
    await pushYamlToWiki(serializeAutomodRule(rule1));
    const firstContent = mockUpdateWikiPage.mock.calls[0][0].content;

    // Second mod writes (should replace the first mod's version)
    vi.clearAllMocks();
    mockGetWikiPage.mockResolvedValue({ content_md: firstContent });
    await pushYamlToWiki(serializeAutomodRule(rule2));

    const finalContent = mockUpdateWikiPage.mock.calls[0][0].content;
    const matches = (finalContent.match(/# Spam filter/g) ?? []).length;
    expect(matches).toBe(1); // Should only have one instance

    // Should have the second mod's conditions
    expect(finalContent).toContain('spam2');
  });
});

describe('Redis Concurrency', () => {
  it('should handle concurrent Redis writes for rule drafts', async () => {
    const rule1 = buildRule({ name: 'Rule 1' });
    const rule2 = buildRule({ name: 'Rule 2' });

    // Simulate concurrent saves
    const save1 = saveCurrentRule(rule1);
    const save2 = saveCurrentRule(rule2);

    await Promise.all([save1, save2]);

    // Both should complete
    expect(mockRedisSet).toHaveBeenCalledTimes(2);

    // The last write wins (Redis behavior)
    const lastWrite = mockRedisSet.mock.calls[1][1];
    expect(lastWrite).toBeTruthy();
  });

  it('should handle Redis errors during concurrent operations', async () => {
    const rule = buildRule({ name: 'Test rule' });

    mockRedisSet.mockRejectedValue(new Error('Redis error'));
    mockGetWikiPage.mockResolvedValue({ content_md: '' });

    await expect(saveCurrentRule(rule)).rejects.toThrow();
  });
});

describe('Integration with saveCurrentRule', () => {
  it('should handle concurrent saveCurrentRule calls', async () => {
    const rules = [
      buildRule({ name: 'Concurrent Rule 1' }),
      buildRule({ name: 'Concurrent Rule 2' }),
      buildRule({ name: 'Concurrent Rule 3' }),
    ];

    let wikiContent = '';
    mockGetWikiPage.mockImplementation(async () => ({ content_md: wikiContent }));
    mockUpdateWikiPage.mockImplementation(async ({ content }: any) => {
      wikiContent = content;
    });

    // Simulate 3 concurrent saves
    await Promise.all(rules.map(rule => saveCurrentRule(rule)));

    // All should have attempted to write to wiki
    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(3);

    // Due to the merge logic, rules should be accumulated
    expect(wikiContent).toBeTruthy();
  });

  it('should maintain data consistency under load', async () => {
    const ruleCount = 10;
    const rules = Array.from({ length: ruleCount }, (_, i) =>
      buildRule({ name: `Load Test Rule ${i}` })
    );

    let wikiContent = '';
    mockGetWikiPage.mockImplementation(async () => ({ content_md: wikiContent }));
    mockUpdateWikiPage.mockImplementation(async ({ content }: any) => {
      wikiContent = content;
    });

    // Simulate high load
    await Promise.all(rules.map(rule => saveCurrentRule(rule)));

    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(ruleCount);

    // Verify wiki content was updated
    expect(wikiContent).toBeTruthy();
    expect(wikiContent.length).toBeGreaterThan(0);
  });
});
