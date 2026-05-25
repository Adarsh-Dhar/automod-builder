import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock @devvit/web/server before importing service ---
const { mockRedisGet, mockRedisSet, mockRedisDel, mockUpdateWikiPage, mockGetWikiPage } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockUpdateWikiPage: vi.fn(),
  mockGetWikiPage: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  },
  reddit: {
    updateWikiPage: mockUpdateWikiPage,
    getWikiPage: mockGetWikiPage,
  },
  context: {
    // This is overridden per test via vi.mocked below
    get subredditName() { return currentSubreddit; },
  },
}));

// Track which subreddit context is active
let currentSubreddit = 'testsub';

// Import after mock is registered
import {
  saveCurrentRule,
  pushYamlToWiki,
  getCurrentRule,
} from '../../server/services/automod.service';
import {
  DEFAULT_AUTOMOD_RULE,
  serializeAutomodRule,
  type AutomodRule,
} from '../../shared/automod';

function buildRule(overrides: Partial<AutomodRule> = {}): AutomodRule {
  return {
    ...DEFAULT_AUTOMOD_RULE,
    id: 'test-rule',
    name: 'Spam guard',
    action: 'remove',
    comment: 'Removed.',
    modmail: '{{permalink}}',
    conditions: [{ field: 'title', comparator: 'includes', value: 'spam' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSubreddit = 'testsub';
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(null);
  mockRedisDel.mockResolvedValue(null);
  mockUpdateWikiPage.mockResolvedValue(undefined);
  mockGetWikiPage.mockResolvedValue(null);
});

// ─── Mocking reddit.updateWikiPage ───────────────────────────────────────────

describe('pushYamlToWiki — happy path', () => {
  it('calls reddit.updateWikiPage with the correct page and content', async () => {
    const yaml = serializeAutomodRule(buildRule());
    await pushYamlToWiki(yaml);

    expect(mockUpdateWikiPage).toHaveBeenCalledOnce();
    expect(mockUpdateWikiPage).toHaveBeenCalledWith({
      subredditName: 'testsub',
      page: 'config/automoderator',
      content: yaml,
      reason: 'Updated via AutoMod Builder app',
    });
  });

  it('does not wrap YAML in markdown code fences', async () => {
    const yaml = serializeAutomodRule(buildRule());
    await pushYamlToWiki(yaml);

    const content: string = mockUpdateWikiPage.mock.calls[0][0].content;
    expect(content).not.toContain('```yaml');
    expect(content).not.toContain('```');
  });

  it('the content pushed to the wiki is valid YAML starting with ---', async () => {
    const yaml = serializeAutomodRule(buildRule());
    await pushYamlToWiki(yaml);

    const content: string = mockUpdateWikiPage.mock.calls[0][0].content;
    expect(content.trim().startsWith('---')).toBe(true);
  });
});

// ─── Existing Wiki Content Tests ─────────────────────────────────────────────

describe('pushYamlToWiki — with existing wiki content', () => {
  it('merges new rule with existing wiki content', async () => {
    const existingWikiContent = `---
# Old spam filter
type: submission
title (includes): ['spam']
author:
  satisfy_any_threshold: true
action: remove
comment_stickied: false
comment: |
  Removed.
modmail: |
  {{permalink}}
---`;

    mockGetWikiPage.mockResolvedValue({
      content_md: existingWikiContent,
    });

    const newYaml = serializeAutomodRule(buildRule({ name: 'New crypto filter' }));
    await pushYamlToWiki(newYaml);

    const content: string = mockUpdateWikiPage.mock.calls[0][0].content;
    expect(content).toContain('Old spam filter');
    expect(content).toContain('New crypto filter');
  });

  it('replaces existing rule with same name instead of duplicating', async () => {
    const existingWikiContent = `---
# Spam guard
type: submission
title (includes): ['spam']
author:
  satisfy_any_threshold: true
action: remove
comment_stickied: false
comment: |
  Old comment.
modmail: |
  {{permalink}}
---`;

    mockGetWikiPage.mockResolvedValue({
      content_md: existingWikiContent,
    });

    const newYaml = serializeAutomodRule(buildRule({ name: 'Spam guard', comment: 'New comment.' }));
    await pushYamlToWiki(newYaml);

    const content: string = mockUpdateWikiPage.mock.calls[0][0].content;
    const matches = (content.match(/# Spam guard/g) ?? []).length;
    expect(matches).toBe(1); // Should appear exactly once, not duplicated
    expect(content).toContain('New comment.');
    expect(content).not.toContain('Old comment.');
  });
});

// ─── Subreddit isolation ─────────────────────────────────────────────────────

describe('saveCurrentRule — subreddit isolation', () => {
  it('writes to different Redis keys for different subreddits', async () => {
    const rule = buildRule();

    // Save for 'subreddit-a'
    currentSubreddit = 'subreddit-a';
    await saveCurrentRule(rule);
    const keyForA = mockRedisSet.mock.calls[0][0];

    vi.clearAllMocks();
    mockRedisSet.mockResolvedValue(null);
    mockUpdateWikiPage.mockResolvedValue(undefined);

    // Save for 'subreddit-b'
    currentSubreddit = 'subreddit-b';
    await saveCurrentRule(rule);
    const keyForB = mockRedisSet.mock.calls[0][0];

    // Keys must be different — each subreddit owns its own namespace
    expect(keyForA).not.toBe(keyForB);
    expect(keyForA).toContain('subreddit-a');
    expect(keyForB).toContain('subreddit-b');
  });

  it('calls updateWikiPage with the correct subredditName each time', async () => {
    const rule = buildRule();

    currentSubreddit = 'my-community';
    await saveCurrentRule(rule);

    expect(mockUpdateWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({ subredditName: 'my-community' })
    );
  });

  it('pushing to subreddit-a does not affect subreddit-b Redis data', async () => {
    // Simulate subreddit-a already having a saved rule in Redis
    currentSubreddit = 'subreddit-a';
    const rule = buildRule({ name: 'Subreddit A rule' });
    await saveCurrentRule(rule);

    // Now check that subreddit-b returns the default (no rule saved)
    currentSubreddit = 'subreddit-b';
    mockRedisGet.mockResolvedValue(null); // B has nothing saved
    const loaded = await getCurrentRule();
    expect(loaded).toEqual(DEFAULT_AUTOMOD_RULE);
  });
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe('pushYamlToWiki — input validation', () => {
  it('throws when subredditName is "default" (no context)', async () => {
    currentSubreddit = 'default';
    const yaml = serializeAutomodRule(buildRule());
    await expect(pushYamlToWiki(yaml)).rejects.toThrow('No subreddit context');
  });

  it('throws when subredditName is undefined (no context)', async () => {
    currentSubreddit = undefined as any;
    const yaml = serializeAutomodRule(buildRule());
    await expect(pushYamlToWiki(yaml)).rejects.toThrow('No subreddit context');
  });

  it('throws when YAML is empty string', async () => {
    await expect(pushYamlToWiki('')).rejects.toThrow('YAML content must be a non-empty string');
  });

  it('throws when YAML is whitespace only', async () => {
    await expect(pushYamlToWiki('   \n\n  ')).rejects.toThrow('YAML content must not be whitespace only');
  });

  it('throws when YAML contains null bytes', async () => {
    const yamlWithNullByte = '---\n# Test\ntype: submission\n\x00';
    await expect(pushYamlToWiki(yamlWithNullByte)).rejects.toThrow('invalid null characters');
  });

  it('throws when YAML exceeds 100KB limit', async () => {
    const largeYaml = '---\n# Test\ntype: submission\n' + 'x'.repeat(100_001);
    await expect(pushYamlToWiki(largeYaml)).rejects.toThrow('exceeds maximum size of 100KB');
  });
});

// ─── Retry Logic Tests ─────────────────────────────────────────────────────────

describe('pushYamlToWiki — retry on transient errors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on 415 and succeeds on second attempt', async () => {
    const yaml = serializeAutomodRule(buildRule());
    let attemptCount = 0;

    mockUpdateWikiPage.mockImplementation(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error('HTTP 415 Unsupported Media Type');
      }
      return undefined;
    });

    const promise = pushYamlToWiki(yaml);
    await vi.runAllTimersAsync();
    await promise;

    expect(attemptCount).toBe(2);
    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(2);
  });

  it('retries on UNKNOWN and succeeds on third attempt', async () => {
    const yaml = serializeAutomodRule(buildRule());
    let attemptCount = 0;

    mockUpdateWikiPage.mockImplementation(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('UNKNOWN error');
      }
      return undefined;
    });

    const promise = pushYamlToWiki(yaml);
    await vi.runAllTimersAsync();
    await promise;

    expect(attemptCount).toBe(3);
    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(3);
  });

  it('throws after all retries exhausted', async () => {
    const yaml = serializeAutomodRule(buildRule());

    mockUpdateWikiPage.mockRejectedValue(new Error('HTTP 415'));

    const promise = pushYamlToWiki(yaml);
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toThrow('HTTP 415');
    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-retryable errors', async () => {
    const yaml = serializeAutomodRule(buildRule());

    mockUpdateWikiPage.mockRejectedValue(new Error('Permission denied'));

    await expect(pushYamlToWiki(yaml)).rejects.toThrow('Permission denied');
    expect(mockUpdateWikiPage).toHaveBeenCalledTimes(1);
  });
});
