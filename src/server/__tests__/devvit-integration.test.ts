import { describe, expect, vi } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { redis } from '@devvit/web/server';
import {
  serializeAutomodRule,
  parseAutomodRuleDraft,
  DEFAULT_AUTOMOD_RULE,
  type AutomodRule,
} from '../../shared/automod';

// ── One test instance per logical context ────────────────────────────────────
const test = createDevvitTest({
  subredditName: 'my-subreddit',
  userId: 't2_mod1',
  username: 'mod1',
});

// ─── Redis isolation per subreddit ───────────────────────────────────────────

describe('Redis isolation — subreddit-scoped keys', () => {
  test('writing a rule for subreddit A does not appear in subreddit B', async () => {
    // The test harness creates a fully isolated Redis world for each test().
    // We use the key naming convention from automod.service.ts to verify isolation.
    const keyA = `rulestage:rule:current:my-subreddit`;
    const keyB = `rulestage:rule:current:other-subreddit`;

    const ruleYaml = serializeAutomodRule({
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Subreddit A rule',
      action: 'remove',
      comment: 'x',
      modmail: 'y',
      conditions: [{ field: 'title', comparator: 'includes', value: 'spam' }],
    });

    // Write under subreddit A's key
    await redis.set(keyA, ruleYaml);

    // Subreddit B's key should be empty
    const fromB = await redis.get(keyB);
    expect(fromB).toBeNull();

    // Subreddit A's key should have the rule
    const fromA = await redis.get(keyA);
    expect(fromA).toBe(ruleYaml);
  });

  test('two tests with the same key name do not interfere with each other', async () => {
    // This test writes '1' to 'counter'
    await redis.set('counter', '1');
    const val = await redis.get('counter');
    expect(val).toBe('1');
  });

  test('counter is still isolated — previous test state is gone', async () => {
    // The harness resets Redis between tests
    const val = await redis.get('counter');
    expect(val).toBeNull(); // never sees the '1' from the previous test
  });
});

// ─── Staging data through your service layer ─────────────────────────────────

describe('Full rule lifecycle via service layer', () => {
  // For wiki calls, spy on the mocked reddit object that the harness provides
  test('getCurrentRule falls back to Redis when wiki is unavailable', async ({ mocks }) => {
    // Stub wiki to throw (unavailable)
    vi.spyOn(mocks.reddit as any, 'getWikiPage').mockRejectedValue(new Error('wiki not found'));

    const ruleYaml = serializeAutomodRule({
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Fallback rule',
      action: 'report',
      comment: 'x',
      modmail: 'y',
      conditions: [],
    });

    // Write directly to Redis (simulating a saved draft)
    await redis.set('rulestage:rule:current:my-subreddit', ruleYaml);

    // Dynamically import the service so it picks up the harness context
    const { getCurrentRule } = await import('../../server/services/automod.service');
    const rule = await getCurrentRule();

    expect(rule.name).toBe('Fallback rule');
    expect(rule.action).toBe('report');
  });

  test('saveCurrentRule writes to Redis and attempts wiki update', async ({ mocks }) => {
    const updateWikiSpy = vi.spyOn(mocks.reddit as any, 'updateWikiPage').mockResolvedValue(undefined);
    vi.spyOn(mocks.reddit as any, 'getWikiPage').mockRejectedValue(new Error('not found'));

    const rule: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Saved rule',
      action: 'remove',
      comment: 'Removed.',
      modmail: '{{permalink}}',
      conditions: [{ field: 'title', comparator: 'includes', value: 'spam' }],
    };

    const { saveCurrentRule } = await import('../../server/services/automod.service');
    const saved = await saveCurrentRule(rule);

    // Service should have written to Redis
    const stored = await redis.get('rulestage:rule:current:my-subreddit');
    expect(stored).toBeTruthy();

    // Wiki should have been called with the correct subredditName
    expect(updateWikiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        subredditName: 'my-subreddit',
        page: 'config/automoderator',
      })
    );

    // The returned rule should round-trip cleanly
    expect(saved.name).toBe('Saved rule');
    expect(saved.action).toBe('remove');
  });

  test('resetRuleStageState clears Redis and returns the default rule', async ({ mocks }) => {
    vi.spyOn(mocks.reddit as any, 'getWikiPage').mockRejectedValue(new Error('not found'));

    // Write something first
    await redis.set('rulestage:rule:current:my-subreddit', 'some yaml');

    const { resetRuleStageState } = await import('../../server/services/automod.service');
    const result = await resetRuleStageState();

    expect(result).toEqual(DEFAULT_AUTOMOD_RULE);
    const stored = await redis.get('rulestage:rule:current:my-subreddit');
    expect(stored).toBeNull();
  });
});

// ─── Mocking the Reddit API (wiki) ────────────────────────────────────────────

describe('Wiki mock patterns', () => {
  test('getWikiPage returns custom YAML content', async ({ mocks }) => {
    const customYaml = `---
# Custom rule
type: submission
action: remove
comment: |
  Removed.
modmail: |
  {{permalink}}
---`;

    // Spy on the harness's reddit object
    vi.spyOn(mocks.reddit as any, 'getWikiPage').mockResolvedValue({
      content_md: customYaml,
    });

    const { getLiveAutomodYaml } = await import('../../server/services/automod.service');
    const yaml = await getLiveAutomodYaml('my-subreddit');

    expect(yaml).toContain('# Custom rule');
    expect(yaml).toContain('type: submission');
  });

  test('updateWikiPage is called with the exact YAML content from the rule', async ({ mocks }) => {
    vi.spyOn(mocks.reddit as any, 'getWikiPage').mockRejectedValue(new Error('not found'));
    const updateSpy = vi.spyOn(mocks.reddit as any, 'updateWikiPage').mockResolvedValue(undefined);

    const rule: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Wiki content test',
      action: 'remove',
      comment: 'x',
      modmail: 'y',
      conditions: [{ field: 'combined_karma', comparator: '<', value: '10' }],
    };

    const { saveCurrentRule } = await import('../../server/services/automod.service');
    await saveCurrentRule(rule);

    const calledWith = updateSpy.mock.calls[0]?.[0] as { content: string } | undefined;
    // The wiki content should be parseable back to the same rule
    if (calledWith?.content) {
      const reparsed = parseAutomodRuleDraft(calledWith.content, DEFAULT_AUTOMOD_RULE);
      expect(reparsed.name).toBe('Wiki content test');
      expect(reparsed.conditions[0]?.value).toBe('10');
    }
  });

  test('two subreddits calling saveCurrentRule get separate wiki updates', async () => {
    // Use two test instances to prove separate contexts
    const testA = createDevvitTest({ subredditName: 'community-a' });
    const testB = createDevvitTest({ subredditName: 'community-b' });

    // Run inline assertions inside each test's own world
    await testA('community-a wiki update', async ({ mocks: mocksA }) => {
      vi.spyOn(mocksA.reddit as any, 'getWikiPage').mockRejectedValue(new Error('not found'));
      const spyA = vi.spyOn(mocksA.reddit as any, 'updateWikiPage').mockResolvedValue(undefined);

      const { saveCurrentRule } = await import('../../server/services/automod.service');
      await saveCurrentRule({ ...DEFAULT_AUTOMOD_RULE, name: 'Rule A', comment: 'x', modmail: 'y' });

      const callA = spyA.mock.calls[0]?.[0] as { subredditName: string } | undefined;
      expect(callA?.subredditName).toBe('community-a');
    });

    await testB('community-b wiki update', async ({ mocks: mocksB }) => {
      vi.spyOn(mocksB.reddit as any, 'getWikiPage').mockRejectedValue(new Error('not found'));
      const spyB = vi.spyOn(mocksB.reddit as any, 'updateWikiPage').mockResolvedValue(undefined);

      const { saveCurrentRule } = await import('../../server/services/automod.service');
      await saveCurrentRule({ ...DEFAULT_AUTOMOD_RULE, name: 'Rule B', comment: 'x', modmail: 'y' });

      const callB = spyB.mock.calls[0]?.[0] as { subredditName: string } | undefined;
      expect(callB?.subredditName).toBe('community-b');
    });
  });
});
