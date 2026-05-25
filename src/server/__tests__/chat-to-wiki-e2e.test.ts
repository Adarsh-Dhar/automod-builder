// src/server/__tests__/chat-to-wiki-e2e.test.ts
//
// Tests the full: chat prompt → fenced YAML response → extract rule → wiki push
// Uses the same global fetch mock from setup.ts (returns Gemini-shaped JSON),
// but overrides it locally to return YAML strings as the chat endpoint expects.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist all Devvit mocks ────────────────────────────────────────────────────
const { mockRedisGet, mockRedisSet, mockUpdateWikiPage, mockGetWikiPage } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockUpdateWikiPage: vi.fn(),
  mockGetWikiPage: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: { get: mockRedisGet, set: mockRedisSet, del: vi.fn() },
  reddit: { updateWikiPage: mockUpdateWikiPage, getWikiPage: mockGetWikiPage },
  context: { subredditName: 'test-community' },
}));

import {
  parseAutomodRuleDraft,
  serializeAutomodRule,
  DEFAULT_AUTOMOD_RULE,
  extractYamlFromFenced,
  type AutomodRule,
} from '../../shared/automod';
import { saveCurrentRule, pushYamlToWiki } from '../../server/services/automod.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simulates what the AI model returns: YAML wrapped in fences */
function makeFencedYaml(rule: AutomodRule): string {
  return `\`\`\`yaml\n${serializeAutomodRule(rule)}\n\`\`\``;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(null);
  mockUpdateWikiPage.mockResolvedValue(undefined);
  mockGetWikiPage.mockRejectedValue(new Error('not found'));
});

// ─── Fence extraction → parse → save ────────────────────────────────────────

describe('Chat YAML fence extraction → parse → wiki push', () => {
  it('extracts YAML from fenced response and parses to correct rule', () => {
    const original: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Crypto spam filter',
      action: 'remove',
      comment: 'Removed: crypto spam.',
      modmail: '{{permalink}}',
      conditions: [{ field: 'title', comparator: 'includes', value: 'crypto' }],
    };

    const fenced = makeFencedYaml(original);
    const extracted = extractYamlFromFenced(fenced);
    if (!extracted) {
      throw new Error('Failed to extract YAML');
    }
    const fallbackWithTitle: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      conditions: [{ field: 'title', comparator: 'includes', value: '' }],
    };
    const parsed = parseAutomodRuleDraft(extracted, fallbackWithTitle);

    expect(parsed.name).toBe('Crypto spam filter');
    expect(parsed.action).toBe('remove');
    expect(parsed.conditions[0]?.value).toBe('crypto');
  });

  it('rule parsed from AI fenced response can be saved to wiki without error', async () => {
    const original: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Low-effort post filter',
      action: 'remove',
      comment: 'Low effort.',
      modmail: 'Removed: {{permalink}}',
      conditions: [{ field: 'body', comparator: 'includes', value: 'discount code' }],
    };

    const fenced = makeFencedYaml(original);
    const extracted = extractYamlFromFenced(fenced);
    if (!extracted) {
      throw new Error('Failed to extract YAML');
    }
    const fallbackWithBody: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      conditions: [{ field: 'body', comparator: 'includes', value: '' }],
    };
    const parsed = parseAutomodRuleDraft(extracted, fallbackWithBody);

    // This is what the front-end does after receiving the chat response
    const saved = await saveCurrentRule(parsed);

    expect(mockUpdateWikiPage).toHaveBeenCalledOnce();
    expect(saved.name).toBe('Low-effort post filter');
  });

  it('wiki content from fenced-AI-response save is parseable back to the same rule', async () => {
    const original: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Karma gate',
      action: 'remove',
      comment: 'Account too new.',
      modmail: '{{permalink}}',
      conditions: [{ field: 'combined_karma', comparator: '<', value: '50' }],
    };

    const fenced = makeFencedYaml(original);
    const extracted = extractYamlFromFenced(fenced);
    if (!extracted) {
      throw new Error('Failed to extract YAML');
    }
    // Use a fallback with only the combined_karma condition
    const fallbackWithKarma: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      conditions: [{ field: 'combined_karma', comparator: '<', value: '' }],
    };
    const parsed = parseAutomodRuleDraft(extracted, fallbackWithKarma);
    await saveCurrentRule(parsed);

    const wikiContent: string = mockUpdateWikiPage.mock.calls[0][0].content;
    const reparsed = parseAutomodRuleDraft(wikiContent, fallbackWithKarma);

    expect(reparsed.name).toBe('Karma gate');
    expect(reparsed.conditions[0]?.value).toBe('50');
  });
});

// ─── Full prompt → YAML → wiki narrative test ────────────────────────────────

describe('Full workflow: prompt → extracted YAML → wiki', () => {
  it('complete pipeline produces wiki content that matches the original intent', async () => {
    // STEP 1: Simulate AI returning fenced YAML for a spam-removal prompt
    const aiReturnedYaml: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Spam guard',
      action: 'remove',
      comment: 'Your post was removed for spam.',
      modmail: 'Removed spam post: {{permalink}}',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
    };
    const fencedResponse = makeFencedYaml(aiReturnedYaml);

    // STEP 2: Front-end extracts the YAML
    const rawYaml = extractYamlFromFenced(fencedResponse);
    if (!rawYaml) {
      throw new Error('Failed to extract YAML');
    }
    expect(rawYaml.startsWith('---')).toBe(true);
    expect(rawYaml.endsWith('---')).toBe(true);

    // STEP 3: Parse to rule object (what CodeMode/ChatMode does before calling POST /rule)
    const fallbackWithTitle: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      conditions: [{ field: 'title', comparator: 'includes', value: '' }],
    };
    const rule = parseAutomodRuleDraft(rawYaml, fallbackWithTitle);
    expect(rule.action).toBe('remove');
    expect(rule.name).toBe('Spam guard');

    // STEP 4: Save (triggers Redis + wiki push)
    await saveCurrentRule(rule);

    // STEP 5: Wiki was updated with content that enforces the original intent
    const wikiContent: string = mockUpdateWikiPage.mock.calls[0][0].content;
    expect(wikiContent).toContain("title (includes): ['buy now']");
    expect(wikiContent).toContain('action: remove');
    expect(wikiContent).toContain('Your post was removed for spam.');

    // STEP 6: The subreddit that gets updated is the right one
    const wikiCall = mockUpdateWikiPage.mock.calls[0][0];
    expect(wikiCall.subredditName).toBe('test-community');
    expect(wikiCall.page).toBe('config/automoderator');
  });

  it('existing subreddit wiki rules are preserved when new rule is added', async () => {
    // Existing wiki has a rule already live in the subreddit
    const existingContent = `---
# Pre-existing age gate
type: submission
author:
  satisfy_any_threshold: true
  account_age: "< 7"
action: remove
comment: |
  Account too new.
modmail: |
  {{permalink}}
---`;

    mockGetWikiPage.mockResolvedValue({ content_md: existingContent });

    const newRule: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Keyword block',
      action: 'remove',
      comment: 'Blocked keyword.',
      modmail: '{{permalink}}',
      conditions: [{ field: 'title', comparator: 'includes', value: 'spam' }],
    };

    await saveCurrentRule(newRule);

    const wikiContent: string = mockUpdateWikiPage.mock.calls[0][0].content;
    // Both old and new rules must be present
    expect(wikiContent).toContain('Pre-existing age gate');
    expect(wikiContent).toContain('Keyword block');
  });

  it('direct wiki push via pushYamlToWiki (the /publish endpoint path) also lands on correct page', async () => {
    const yaml = serializeAutomodRule({
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Direct publish test',
      action: 'report',
      comment: 'Reported.',
      modmail: '{{permalink}}',
      conditions: [],
    });

    await pushYamlToWiki(yaml);

    const wikiCall = mockUpdateWikiPage.mock.calls[0][0];
    expect(wikiCall.page).toBe('config/automoderator');
    expect(wikiCall.subredditName).toBe('test-community');
  });
});
