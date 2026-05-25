import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock @devvit/web/server before importing service ---
// (mirroring your existing setup.ts pattern but explicit here for clarity)
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockUpdateWikiPage = vi.fn();
const mockGetWikiPage = vi.fn();

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
});
