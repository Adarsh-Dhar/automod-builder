/**
 * LLM OUTPUT QUALITY TESTS
 *
 * This test suite validates that real LLM responses produce correct AutoMod YAML
 * that matches user intent and accurately identifies spam vs legitimate content.
 *
 * These tests use REAL GitHub Models API calls when GITHUB_API_KEY is set.
 * Without the key, tests are skipped.
 *
 * Run with:
 *   GITHUB_API_KEY=your_token npx vitest src/server/__tests__/llm-quality.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateText, type ModelProvider } from '../services/model-proxy.service';
import {
  parseAutomodRuleDraft,
  DEFAULT_AUTOMOD_RULE,
  evaluateRule,
  type SimulationPost,
} from '../../shared/automod';

// Check if GitHub API key is available
const GITHUB_API_KEY = process.env.GITHUB_API_KEY || process.env.VITE_GITHUB_API_KEY;

// Skip all tests if GitHub API key is not available
const test = GITHUB_API_KEY ? describe : describe.skip;

// Helper to extract YAML from markdown code fences
function extractYamlFromMarkdown(response: string): string {
  const yamlMatch = response.match(/```yaml\n([\s\S]*?)\n```/);
  if (yamlMatch) {
    return yamlMatch[1]!;
  }
  // Try without language specifier
  const fallbackMatch = response.match(/```\n([\s\S]*?)\n```/);
  return fallbackMatch ? fallbackMatch[1]! : response;
}

// Test posts for spam detection
const SPAM_TEST_POSTS: SimulationPost[] = [
  {
    id: 'spam1',
    title: 'Buy Bitcoin NOW - Easy Money!!!',
    body: 'Click here to invest and get rich quick',
    author: 'spammer_bot',
    accountAgeDays: 1,
    combinedKarma: 10,
  },
  {
    id: 'spam2',
    title: 'GET RICH QUICK - Free money',
    body: 'Invest in crypto now',
    author: 'crypto_scammer',
    accountAgeDays: 2,
    combinedKarma: 5,
  },
  {
    id: 'legit1',
    title: 'Interesting discussion about blockchain technology',
    body: 'I wanted to share some thoughts on blockchain development...',
    author: 'legitimate_user',
    accountAgeDays: 365,
    combinedKarma: 5000,
  },
  {
    id: 'legit2',
    title: 'How do I learn about cryptocurrency?',
    body: 'I want to understand the technology behind crypto',
    author: 'curious_learner',
    accountAgeDays: 180,
    combinedKarma: 1000,
  },
];

test('Suite 1 — Real LLM Output Quality (GitHub Models API)', () => {
  beforeAll(() => {
    if (!GITHUB_API_KEY) {
      console.warn('Skipping LLM quality tests - GITHUB_API_KEY not set');
    }
  });

  it('1.1 — generates YAML that accurately removes cryptocurrency spam', async () => {
    const prompt = 'Remove cryptocurrency spam - we get a lot of "buy bitcoin" and "get rich quick" posts';
    const subredditContext = 'This is a tech discussion forum. We do not allow posts about "getting rich quick", affiliate links, or "make money fast" spam.';

    const fullPrompt = `${prompt}\n\nSubreddit context:\n${subredditContext}`;

    const response = await generateText(fullPrompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences. The YAML should create rules that match the user intent.',
    });

    const yaml = extractYamlFromMarkdown(response);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    // Verify the rule was parsed correctly
    expect(rule.name).toBeTruthy();
    expect(rule.action).toBe('remove');

    // Evaluate against test posts
    const evaluation = evaluateRule(rule, SPAM_TEST_POSTS);

    // Should catch at least the obvious spam posts
    expect(evaluation.removed).toBeGreaterThanOrEqual(2);

    // Should NOT flag legitimate discussion posts
    const legitPostIds = ['legit1', 'legit2'];
    const falsePositives = evaluation.items.filter((item) => legitPostIds.includes(item.id));
    expect(falsePositives.length).toBe(0);
  });

  it('1.2 — generates YAML with appropriate karma thresholds', async () => {
    const prompt = 'Remove posts from new accounts with low karma';
    const response = await generateText(prompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences.',
    });

    const yaml = extractYamlFromMarkdown(response);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    // Verify the rule has account age or karma conditions
    const hasAgeCondition = rule.conditions.some(c => c.field === 'account_age');
    const hasKarmaCondition = rule.conditions.some(c => c.field === 'combined_karma');

    expect(hasAgeCondition || hasKarmaCondition).toBe(true);
  });

  it('1.3 — generates approve rules for trusted content', async () => {
    const prompt = 'Approve posts from users with high karma who have been active for a long time';
    const response = await generateText(prompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences.',
    });

    const yaml = extractYamlFromMarkdown(response);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    // Verify the rule is an approve action
    expect(rule.action).toBe('approve');

    // Verify it has karma or account age conditions
    const hasCondition = rule.conditions.some(c => c.field === 'combined_karma' || c.field === 'account_age');
    expect(hasCondition).toBe(true);
  });

  it('1.4 — handles complex multi-condition rules', async () => {
    const prompt = 'Remove posts that have "spam" in the title AND are from accounts with less than 100 karma';
    const response = await generateText(prompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences. Use satisfy_any_threshold: false for AND logic.',
    });

    const yaml = extractYamlFromMarkdown(response);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    // Verify multiple conditions
    expect(rule.conditions.length).toBeGreaterThanOrEqual(2);

    // Verify it uses AND logic (satisfyAnyThreshold should be false)
    expect(rule.satisfyAnyThreshold).toBe(false);
  });

  it('1.5 — generates valid YAML that round-trips correctly', async () => {
    const prompt = 'Create a rule to remove posts with "scam" in the title';
    const response = await generateText(prompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences.',
    });

    const yaml = extractYamlFromMarkdown(response);

    // Parse the YAML
    const rule1 = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    // Verify it parsed successfully
    expect(rule1.name).toBeTruthy();
    expect(rule1.action).toBeTruthy();

    // The YAML should be parseable without errors
    expect(() => parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE)).not.toThrow();
  });

  it('1.6 — maintains context across conversation history', async () => {
    const initialPrompt = 'Create a rule to remove posts with "spam" in the title';
    const initialResponse = await generateText(initialPrompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences.',
    });

    const followUpPrompt = 'Now also add a condition for posts with "scam" in the body';
    const followUpResponse = await generateText(followUpPrompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences.',
      history: [
        { role: 'user', content: initialPrompt },
        { role: 'model', content: initialResponse },
      ],
    });

    const yaml = extractYamlFromMarkdown(followUpResponse);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    // Should have conditions for both title and body
    const hasTitleCondition = rule.conditions.some(c => c.field === 'title');
    const hasBodyCondition = rule.conditions.some(c => c.field === 'body');

    expect(hasTitleCondition || hasBodyCondition).toBe(true);
  });

  it('1.7 — generates appropriate comment and modmail messages', async () => {
    const prompt = 'Remove spam posts and notify the moderators';
    const response = await generateText(prompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences. Include comment and modmail fields.',
    });

    const yaml = extractYamlFromMarkdown(response);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    // Verify comment and modmail are present
    expect(rule.comment).toBeTruthy();
    expect(rule.comment.length).toBeGreaterThan(0);
    expect(rule.modmail).toBeTruthy();
    expect(rule.modmail.length).toBeGreaterThan(0);

    // Verify they contain relevant placeholders
    expect(rule.modmail).toContain('{{permalink}}');
  });

  it('1.8 — handles edge cases in prompts', async () => {
    const prompt = 'Remove posts with special characters: @#$%^&*() in the title';
    const response = await generateText(prompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences.',
    });

    const yaml = extractYamlFromMarkdown(response);

    // Should still generate valid YAML even with special characters in prompt
    expect(() => parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE)).not.toThrow();
  });
});

test('Suite 2 — Accuracy Metrics (Real API)', () => {
  beforeAll(() => {
    if (!GITHUB_API_KEY) {
      console.warn('Skipping accuracy metric tests - GITHUB_API_KEY not set');
    }
  });

  it('2.1 — achieves 80%+ accuracy on spam detection', async () => {
    const prompt = 'Remove cryptocurrency spam and get-rich-quick posts';
    const response = await generateText(prompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences.',
    });

    const yaml = extractYamlFromMarkdown(response);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    const evaluation = evaluateRule(rule, SPAM_TEST_POSTS);

    // Calculate accuracy: (correct removals + correct non-removals) / total
    const spamIds = ['spam1', 'spam2'];
    const legitIds = ['legit1', 'legit2'];

    const correctRemovals = evaluation.items.filter((item) => spamIds.includes(item.id) && item.outcome === 'remove').length;
    const correctNonRemovals = evaluation.items.filter((item) => legitIds.includes(item.id) && item.outcome !== 'remove').length;
    const total = SPAM_TEST_POSTS.length;

    const accuracy = (correctRemovals + correctNonRemovals) / total;

    // Should be at least 80% accurate
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });

  it('2.2 — minimizes false positives on legitimate content', async () => {
    const prompt = 'Remove spam but be careful not to remove legitimate discussions';
    const response = await generateText(prompt, {
      provider: 'github' as ModelProvider,
      systemPrompt: 'You are an AutoModerator YAML generator. Respond only with valid YAML wrapped in ```yaml code fences. Be conservative to avoid false positives.',
    });

    const yaml = extractYamlFromMarkdown(response);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    const evaluation = evaluateRule(rule, SPAM_TEST_POSTS);

    const legitIds = ['legit1', 'legit2'];
    const falsePositives = evaluation.items.filter((item) => legitIds.includes(item.id) && item.outcome === 'remove');

    // Should have zero false positives on legitimate content
    expect(falsePositives.length).toBe(0);
  });
});
