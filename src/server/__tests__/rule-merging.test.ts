import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    get subredditName() { return currentSubreddit; },
  },
}));

// Track which subreddit context is active
let currentSubreddit = 'testsub';

// Import after mock is registered
import {
  saveCurrentRule,
  pushYamlToWiki,
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

// ─── Rule Merging Tests ─────────────────────────────────────────────────────

describe('Rule Merging - Preserve Existing Wiki Rules', () => {
  it('should preserve existing wiki rules when deploying new rule', async () => {
    // Mock existing wiki content with old rules
    const existingWikiContent = `---
# Old spam filter (created 3 months ago)
type: submission
action: remove
comment: Removed
modmail: Spam
domain: ['old-spam.com']
---

---
# Old linkflairs check
type: submission
action: remove
comment: Missing flair
modmail: No flair
link_flair_text: null
---`;

    mockGetWikiPage.mockResolvedValue({
      content_md: existingWikiContent,
    });

    // Create a new rule to deploy
    const newRule = buildRule({
      name: 'New crypto filter',
      action: 'remove',
      comment: 'Crypto spam removed',
      modmail: 'Crypto: {{permalink}}',
      conditions: [{ field: 'title', comparator: 'includes', value: 'crypto' }],
    });

    // Save the new rule
    await saveCurrentRule(newRule);

    // Verify updateWikiPage was called
    expect(mockUpdateWikiPage).toHaveBeenCalledOnce();

    // Verify the content includes BOTH old and new rules
    const updateCall = mockUpdateWikiPage.mock.calls[0]?.[0] as { content: string };
    const content = updateCall.content;

    // This will FAIL with current implementation (overwrites existing)
    expect(content).toContain('Old spam filter');
    expect(content).toContain('Old linkflairs check');
    expect(content).toContain('New crypto filter');
  });

  it('should append new rule to existing rules with proper delimiter', async () => {
    const existingWikiContent = `---
# Existing rule
type: submission
action: remove
comment: Removed
modmail: Test
---`;

    mockGetWikiPage.mockResolvedValue({
      content_md: existingWikiContent,
    });

    const newRule = buildRule({ name: 'New rule' });
    await saveCurrentRule(newRule);

    const content = (mockUpdateWikiPage.mock.calls[0]?.[0] as { content: string }).content;

    // Should have proper delimiter between rules
    expect(content).toContain('---\n\n---'); // Double newline with delimiter
    expect(content).toContain('Existing rule');
    expect(content).toContain('New rule');
  });

  it('should handle empty wiki (first deployment)', async () => {
    // Wiki doesn't exist yet
    mockGetWikiPage.mockRejectedValue(new Error('wiki not found'));

    const newRule = buildRule({ name: 'First rule' });
    await saveCurrentRule(newRule);

    const content = (mockUpdateWikiPage.mock.calls[0]?.[0] as { content: string }).content;

    // Should just contain the new rule
    expect(content).toContain('First rule');
    expect(content).not.toContain('---\n\n---'); // No double delimiter needed
  });

  it('should handle wiki with empty content', async () => {
    // Wiki exists but is empty
    mockGetWikiPage.mockResolvedValue({
      content_md: '',
    });

    const newRule = buildRule({ name: 'First rule' });
    await saveCurrentRule(newRule);

    const content = (mockUpdateWikiPage.mock.calls[0]?.[0] as { content: string }).content;

    // Should just contain the new rule
    expect(content).toContain('First rule');
  });

  it('should preserve multiple existing rules when adding one', async () => {
    const existingWikiContent = `---
# Rule 1
type: submission
action: remove
comment: Removed
modmail: Test 1
---

---
# Rule 2
type: submission
action: approve
comment: Approved
modmail: Test 2
---

---
# Rule 3
type: submission
action: report
comment: Reported
modmail: Test 3
---`;

    mockGetWikiPage.mockResolvedValue({
      content_md: existingWikiContent,
    });

    const newRule = buildRule({ name: 'Rule 4' });
    await saveCurrentRule(newRule);

    const content = (mockUpdateWikiPage.mock.calls[0]?.[0] as { content: string }).content;

    // All rules should be present
    expect(content).toContain('Rule 1');
    expect(content).toContain('Rule 2');
    expect(content).toContain('Rule 3');
    expect(content).toContain('Rule 4');
  });
});

// ─── Direct pushYamlToWiki Tests ────────────────────────────────────────────

describe('pushYamlToWiki - merge behavior', () => {
  it('should merge with existing wiki content when called directly', async () => {
    const existingWikiContent = `---
# Old rule
type: submission
action: remove
comment: Old
modmail: Old
---`;

    mockGetWikiPage.mockResolvedValue({
      content_md: existingWikiContent,
    });

    const newYaml = serializeAutomodRule(buildRule({ name: 'New rule' }));
    await pushYamlToWiki(newYaml);

    const content = (mockUpdateWikiPage.mock.calls[0]?.[0] as { content: string }).content;

    // Should merge
    expect(content).toContain('Old rule');
    expect(content).toContain('New rule');
  });

  it('should handle whitespace in existing wiki content', async () => {
    const existingWikiContent = `

---
# Rule with leading whitespace
type: submission
action: remove
comment: Test
modmail: Test
---

`;

    mockGetWikiPage.mockResolvedValue({
      content_md: existingWikiContent,
    });

    const newYaml = serializeAutomodRule(buildRule({ name: 'New rule' }));
    await pushYamlToWiki(newYaml);

    const content = (mockUpdateWikiPage.mock.calls[0]?.[0] as { content: string }).content;

    expect(content).toContain('Rule with leading whitespace');
    expect(content).toContain('New rule');
  });
});
