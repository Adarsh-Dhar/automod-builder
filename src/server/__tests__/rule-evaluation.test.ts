import { describe, it, expect } from 'vitest';
import {
  evaluateRule,
  DEFAULT_AUTOMOD_RULE,
  type AutomodRule,
  type SimulationPost,
} from '../../shared/automod';

function buildPost(overrides: Partial<SimulationPost>): SimulationPost {
  return {
    id: 'p1',
    title: '',
    body: '',
    author: 'testuser',
    accountAgeDays: 365,
    combinedKarma: 1000,
    linkKarma: 500,
    commentKarma: 500,
    subreddit: 'r/test',
    domain: 'self.test',
    url: 'https://reddit.com/r/test/abc',
    isSelf: true,
    over18: false,
    spoiler: false,
    stickied: false,
    numComments: 5,
    score: 10,
    upvoteRatio: 0.8,
    authorFlairText: '',
    linkFlairText: '',
    distinguished: '',
    ...overrides,
  };
}

function buildRule(overrides: Partial<AutomodRule>): AutomodRule {
  return {
    ...DEFAULT_AUTOMOD_RULE,
    id: 'test-rule',
    name: 'Test rule',
    action: 'remove',
    comment: 'Removed.',
    modmail: '{{permalink}}',
    conditions: [],
    ...overrides,
  };
}

// ─── Keyword matching ─────────────────────────────────────────────────────────

describe('evaluateRule — keyword matching', () => {
  it('removes post whose title includes a banned keyword', () => {
    const rule = buildRule({
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
    });
    const post = buildPost({ title: 'Check out this BUY NOW deal' });

    const result = evaluateRule(rule, [post]);

    expect(result.removed).toBe(1);
    expect(result.items[0]?.outcome).toBe('remove');
  });

  it('approves post whose title does not include the keyword', () => {
    const rule = buildRule({
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
    });
    const post = buildPost({ title: 'A completely normal discussion post' });

    const result = evaluateRule(rule, [post]);

    expect(result.approved).toBe(1);
    expect(result.items[0]?.outcome).toBe('approve');
  });

  it('matches regex in title (matches comparator)', () => {
    const rule = buildRule({
      conditions: [{ field: 'title', comparator: 'matches', value: '^[A-Z\\s]{10,}$' }],
    });
    const spamPost = buildPost({ title: 'ALL CAPS TITLE HERE' });
    const normalPost = buildPost({ id: 'p2', title: 'Normal title' });

    const result = evaluateRule(rule, [spamPost, normalPost]);

    expect(result.removed).toBe(1);
    expect(result.items[0]?.outcome).toBe('remove');
    expect(result.items[1]?.outcome).toBe('approve');
  });

  it('matches body keyword', () => {
    const rule = buildRule({
      conditions: [{ field: 'body', comparator: 'includes', value: 'promo code' }],
    });
    const post = buildPost({ body: 'Use my promo code for 20% off!' });

    const result = evaluateRule(rule, [post]);
    expect(result.removed).toBe(1);
  });

  it('keyword check is case-insensitive', () => {
    const rule = buildRule({
      conditions: [{ field: 'title', comparator: 'includes', value: 'spam' }],
    });
    const post = buildPost({ title: 'This is definitely SPAM content' });

    const result = evaluateRule(rule, [post]);
    expect(result.removed).toBe(1);
  });

  it('pipe-separated values act as OR', () => {
    const rule = buildRule({
      conditions: [{ field: 'title', comparator: 'includes', value: 'spam|promo|ad' }],
    });

    const spamPost = buildPost({ id: '1', title: 'This is a promo post' });
    const adPost = buildPost({ id: '2', title: 'Sponsored ad here' });
    const cleanPost = buildPost({ id: '3', title: 'Normal discussion' });

    const result = evaluateRule(rule, [spamPost, adPost, cleanPost]);
    expect(result.removed).toBe(2);
    expect(result.approved).toBe(1);
  });
});

// ─── Numeric thresholds ───────────────────────────────────────────────────────

describe('evaluateRule — numeric thresholds', () => {
  it('removes post from account younger than threshold', () => {
    const rule = buildRule({
      conditions: [{ field: 'account_age', comparator: '<', value: '7' }],
    });
    const post = buildPost({ accountAgeDays: 3 });

    const result = evaluateRule(rule, [post]);
    expect(result.removed).toBe(1);
  });

  it('approves post from account older than threshold', () => {
    const rule = buildRule({
      conditions: [{ field: 'account_age', comparator: '<', value: '7' }],
    });
    const post = buildPost({ accountAgeDays: 30 });

    const result = evaluateRule(rule, [post]);
    expect(result.approved).toBe(1);
  });

  it('removes post with karma below threshold', () => {
    const rule = buildRule({
      conditions: [{ field: 'combined_karma', comparator: '<', value: '100' }],
    });
    const post = buildPost({ combinedKarma: 12 });

    const result = evaluateRule(rule, [post]);
    expect(result.removed).toBe(1);
  });

  it('handles <= comparator correctly at the boundary', () => {
    const rule = buildRule({
      conditions: [{ field: 'combined_karma', comparator: '<=', value: '50' }],
    });

    const atBoundary = buildPost({ id: '1', combinedKarma: 50 });
    const justOver = buildPost({ id: '2', combinedKarma: 51 });

    const result = evaluateRule(rule, [atBoundary, justOver]);
    expect(result.removed).toBe(1);
    expect(result.items[0]?.outcome).toBe('remove');
    expect(result.items[1]?.outcome).toBe('approve');
  });

  it('handles > comparator (approve high-karma posts)', () => {
    const rule = buildRule({
      action: 'approve',
      conditions: [{ field: 'combined_karma', comparator: '>', value: '1000' }],
    });
    const highKarmaPost = buildPost({ combinedKarma: 5000 });

    const result = evaluateRule(rule, [highKarmaPost]);
    expect(result.approved).toBe(1);
  });
});

// ─── satisfy_any_threshold logic ─────────────────────────────────────────────

describe('evaluateRule — satisfy_any_threshold', () => {
  it('fires when EITHER condition matches (satisfyAnyThreshold: true)', () => {
    const rule = buildRule({
      satisfyAnyThreshold: true,
      conditions: [
        { field: 'account_age', comparator: '<', value: '7' },
        { field: 'combined_karma', comparator: '<', value: '100' },
      ],
    });

    // Old enough but low karma — should still fire
    const lowKarmaPost = buildPost({ accountAgeDays: 30, combinedKarma: 5 });
    // Too new but has karma — should still fire
    const newAccountPost = buildPost({ id: 'p2', accountAgeDays: 2, combinedKarma: 500 });
    // Neither condition matches — should NOT fire
    const cleanPost = buildPost({ id: 'p3', accountAgeDays: 30, combinedKarma: 500 });

    const result = evaluateRule(rule, [lowKarmaPost, newAccountPost, cleanPost]);
    expect(result.removed).toBe(2);
    expect(result.approved).toBe(1);
  });

  it('fires only when BOTH conditions match (satisfyAnyThreshold: false)', () => {
    const rule = buildRule({
      satisfyAnyThreshold: false,
      conditions: [
        { field: 'account_age', comparator: '<', value: '7' },
        { field: 'combined_karma', comparator: '<', value: '100' },
      ],
    });

    // Low karma but old account — should NOT fire
    const lowKarmaOldPost = buildPost({ accountAgeDays: 30, combinedKarma: 5 });
    // New account but good karma — should NOT fire
    const newGoodKarmaPost = buildPost({ id: 'p2', accountAgeDays: 2, combinedKarma: 500 });
    // Both conditions match — SHOULD fire
    const spamPost = buildPost({ id: 'p3', accountAgeDays: 2, combinedKarma: 5 });

    const result = evaluateRule(rule, [lowKarmaOldPost, newGoodKarmaPost, spamPost]);
    expect(result.removed).toBe(1);
    expect(result.approved).toBe(2);
    expect(result.items[2]?.outcome).toBe('remove');
  });
});

// ─── Combined conditions ─────────────────────────────────────────────────────

describe('evaluateRule — combined text + threshold conditions', () => {
  it('fires only when both keyword and threshold match', () => {
    const rule = buildRule({
      satisfyAnyThreshold: false,
      conditions: [
        { field: 'title', comparator: 'includes', value: 'promo' },
        { field: 'account_age', comparator: '<', value: '7' },
      ],
    });

    // Keyword match, old account → should NOT fire
    const promoOldAccount = buildPost({ title: 'promo offer', accountAgeDays: 30 });
    // No keyword, new account → should NOT fire
    const newCleanAccount = buildPost({ id: 'p2', title: 'normal post', accountAgeDays: 2 });
    // Keyword match, new account → SHOULD fire
    const spamNewAccount = buildPost({ id: 'p3', title: 'promo offer', accountAgeDays: 2 });

    const result = evaluateRule(rule, [promoOldAccount, newCleanAccount, spamNewAccount]);
    expect(result.removed).toBe(1);
    expect(result.items[2]?.outcome).toBe('remove');
  });

  it('reports (not removes) when action is report', () => {
    const rule = buildRule({
      action: 'report',
      conditions: [{ field: 'title', comparator: 'includes', value: 'suspicious' }],
    });
    const post = buildPost({ title: 'This looks suspicious to me' });

    const result = evaluateRule(rule, [post]);
    expect(result.reported).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.items[0]?.outcome).toBe('report');
  });

  it('rule with no conditions matches all posts', () => {
    // No conditions = text match is vacuously true, threshold match is vacuously true
    const rule = buildRule({ conditions: [] });
    const posts = [buildPost({}), buildPost({ id: 'p2' }), buildPost({ id: 'p3' })];

    const result = evaluateRule(rule, posts);
    expect(result.removed).toBe(3);
  });
});
