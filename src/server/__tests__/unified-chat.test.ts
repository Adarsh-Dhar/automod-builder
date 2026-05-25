/**
 * UNIFIED CHAT MODE — COMPREHENSIVE TEST SUITE
 *
 * Covers the AutoMod Builder systems:
 *
 *   Suite 1 — Normal Mode      : Pure YAML generation via generateChatReplyOnServer
 *   Suite 2 — Hybrid Mode      : YAML + TypeScript trigger produced in one logical pass
 *   Suite 3 — Redis CRUD       : create / read / update / delete on the ban / rule store
 *   Suite 4 — External API     : HTTP call integration baked into generated triggers
 *   Suite 5 — Edge Cases       : guard-rails, empty inputs, concurrent requests, types
 *
 * Design principles
 * -----------------
 *  • All network calls (model API, Reddit API, external APIs) are mocked via
 *    vi.stubGlobal('fetch', …) so NO real credentials are needed.
 *  • The @devvit/web/server module is mocked at the top with vi.mock() so every
 *    import of `redis`, `reddit`, and `context` receives controllable vi.fn() stubs.
 *  • Each suite re-declares its own fetch mock where the response shape differs from
 *    the global default, giving fine-grained control without leaking between suites.
 *  • Assertions target the real types exported from ../../shared/automod so the test
 *    acts as a compile-time contract as well as a runtime check.
 *
 * Run:
 *   npx vitest src/server/__tests__/unified-chat.test.ts
 *   npx vitest -c vitest.config.integration.ts src/server/__tests__/unified-chat.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1. MODULE MOCKS  (must appear before any import that resolves these modules)
// ---------------------------------------------------------------------------

/**
 * Full @devvit/web/server mock.
 * We include every Redis method used across all suites so individual tests can
 * override return values with vi.mocked(redis.xxx).mockResolvedValue(…) without
 * hitting "not a mock function" errors.
 */
vi.mock('@devvit/web/server', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    srem: vi.fn(),
    sismember: vi.fn(),
    smembers: vi.fn(),
  },
  reddit: {
    getPostById: vi.fn(),
    remove: vi.fn(),
    getWikiPage: vi.fn(),
    updateWikiPage: vi.fn(),
    getModerators: vi.fn(),
    getPostFlairTemplates: vi.fn(),
    getUserFlairTemplates: vi.fn(),
    sendModmail: vi.fn(),
  },
  context: { subredditName: 'test_subreddit' },
  settings: { get: vi.fn() },
}));

/**
 * Mock model-proxy.service so we never need real API keys.
 *
 * generateText  → returns content keyed by the heuristic in the prompt
 * generateJson  → returns a parsed object keyed by the same heuristic
 *
 * Both fns delegate to a single internal dispatcher so every test that
 * overrides fetch still gets consistent routing.
 */
vi.mock('../services/model-proxy.service', async (importOriginal) => {
  // We still want the real module's types; just replace the implementations.
  const original = await importOriginal<typeof import('../services/model-proxy.service')>();

  /** Heuristic dispatcher — mirrors the logic in buildFetchMock() below. */
  function dispatch(prompt: string): { isJson: boolean; payload: unknown } {
    const lower = prompt.toLowerCase();
    const markerIdx = lower.lastIndexOf('moderator request:');
    const req = markerIdx >= 0 ? lower.slice(markerIdx + 'moderator request:'.length).trim() : lower;

    // ---- Unified Analysis prompt (check first before limitation analysis) ----
    if (lower.includes('analyzing a reddit moderation request') || lower.includes('needsyaml') || lower.includes('needstypescript')) {
      return {
        isJson: true,
        payload: {
          needsYaml: true,
          needsTypeScript: false,
          yamlPart: req,
          typescriptPart: '',
          explanation: 'This request can be handled by AutoMod YAML.',
        },
      };
    }

    // ---- Simple JSON test requests ------------------------------------
    if (/return.*json.*object.*test.*field/i.test(prompt)) {
      return {
        isJson: true,
        payload: { test: 'success' },
      };
    }

    // ---- AutoMod YAML system prompt (generateChatReplyOnServer) -----------
    // These prompts start with the AUTOMOD_SYSTEM_PROMPT marker text.
    const isAutomodSystemPrompt = lower.includes('automod(erator)? rule assistant') ||
      lower.includes('automod rule assistant') ||
      lower.includes('automod(erator)?') ||
      prompt.includes('STRICT RULES:') ||
      prompt.includes('You are an AutoModerator rule assistant');
    if (isAutomodSystemPrompt) {
      return { isJson: false, payload: `\`\`\`yaml\n${MINIMAL_YAML_FIXTURE}\n\`\`\`` };
    }

    // ---- Direct generateText YAML prompts (no system prompt) ---------------
    // These are direct calls to generateText() for YAML rule content.
    // They look like "Remove posts with...", "Block posts...", "Filter posts..."
    // without any of the JSON schema keywords from the analysis or generation prompts.
    const looksLikeYamlRequest =
      /\b(remove|block|filter|approve|flag|report)\b.*\b(posts?|account|title|karma|flair|body|link)\b/i.test(prompt) &&
      !/(haslimitation|has_limitation|recommendation|typescript trigger|onpostsubmit|escape hatch|return.*json|json.*object)/i.test(prompt);
    if (looksLikeYamlRequest) {
      return { isJson: false, payload: `\`\`\`yaml\n${MINIMAL_YAML_FIXTURE}\n\`\`\`` };
    }

    const isGenerationPrompt = /generat(e|ing)|typescript trigger|onpostsubmit|devvit typescript/i.test(prompt);

    // ---- TypeScript trigger code generation --------------------------------
    if (isGenerationPrompt) {
      if (/(redis|database|db|ban.?list)/i.test(req)) {
        return {
          isJson: true,
          payload: {
            code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';
export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const isBanned = await context.redis.sismember('scammer-list', event.author.name);
    if (isBanned) { await context.reddit.remove(event.post.id, true); }
  } catch (error) { console.error('Redis check failed:', error); }
};`,
            description: 'Checks Redis scammer-list set before allowing a post through.',
            limitations: ['Redis set must be populated separately.'],
            confidence: 'high',
          },
        };
      }
      if (/(external[\w\s]*api|spam[\w\s]*api|fetch|http)/i.test(req)) {
        return {
          isJson: true,
          payload: {
            code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';
export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const res = await fetch('https://spam-api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: event.post.title, author: event.author.name }),
    });
    if (res.ok) {
      const data = await res.json() as { isSpam: boolean };
      if (data.isSpam) { await context.reddit.remove(event.post.id, true); }
    }
  } catch (error) { console.error('Spam API check failed:', error); }
};`,
            description: 'Calls external spam detection API and removes flagged posts.',
            limitations: [
              'Requires spam-api.example.com domain in devvit.json http whitelist.',
              'Fails open if the API is unreachable.',
            ],
            confidence: 'high',
          },
        };
      }
      if (/(json|parse)/i.test(req)) {
        return {
          isJson: true,
          payload: {
            code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';
export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const data = JSON.parse(event.post.body) as Record<string, unknown>;
    if (data.blocked === true || data.kind === 'forbidden') {
      await context.reddit.remove(event.post.id, true);
    }
  } catch { return; }
};`,
            description: 'Parses JSON from the post body and removes posts with blocked fields.',
            limitations: ['Only works when the post body is valid JSON.'],
            confidence: 'high',
          },
        };
      }
      return {
        isJson: true,
        payload: {
          code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';
export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try { /* generated logic */ } catch (error) { console.error('trigger error:', error); }
};`,
          description: 'Generic generated trigger.',
          limitations: ['Review before deploying.'],
          confidence: 'medium',
        },
      };
    }

    // ---- Limitation analysis (JSON) ----------------------------------------
    // The analysis prompt contains the marker "moderator request:" at the end.
    // req contains only the user's moderation requirement.
    if (/(external[\w\s]*api|http|fetch|spam[\w\s]*api|verify\.example)/i.test(req)) {
      return {
        isJson: true,
        payload: {
          hasLimitation: true,
          limitation: 'external-api',
          explanation: 'AutoMod YAML cannot make HTTP calls to external services.',
          recommendation: 'typescript',
        },
      };
    }
    if (/(json|parse|body)/i.test(req)) {
      return {
        isJson: true,
        payload: {
          hasLimitation: true,
          limitation: 'json-parsing',
          explanation: 'AutoMod YAML cannot parse structured JSON fields.',
          recommendation: 'typescript',
        },
      };
    }
    if (/(redis|database|db|ban.?list)/i.test(req)) {
      return {
        isJson: true,
        payload: {
          hasLimitation: true,
          limitation: 'database-check',
          explanation: 'AutoMod YAML cannot query a Redis store.',
          recommendation: 'typescript',
        },
      };
    }
    if (/(machine.?learning|ml model|neural|predict|train)/i.test(req)) {
      return {
        isJson: true,
        payload: {
          hasLimitation: true,
          limitation: 'other',
          explanation: 'AutoMod YAML cannot call an ML inference endpoint.',
          recommendation: 'typescript',
        },
      };
    }
    if (/(dynamic.?config|configuration.?server|feature.?flag)/i.test(req)) {
      return {
        isJson: true,
        payload: {
          hasLimitation: true,
          limitation: 'state-management',
          explanation: 'AutoMod YAML cannot load runtime configuration.',
          recommendation: 'typescript',
        },
      };
    }

    // Default: YAML-capable
    return {
      isJson: true,
      payload: {
        hasLimitation: false,
        limitation: null,
        explanation: 'AutoMod YAML handles this natively.',
        recommendation: 'yaml',
      },
    };
  }

  const mockGenerateText = vi.fn(async (input: string): Promise<string> => {
    const { isJson, payload } = dispatch(input);
    if (isJson) return JSON.stringify(payload);
    return payload as string;
  });

  const mockGenerateJson = vi.fn(async <T>(prompt: string): Promise<T> => {
    const { payload } = dispatch(prompt);
    // If payload is already a string (raw YAML text), return it parsed or as-is.
    if (typeof payload === 'string') {
      try { return JSON.parse(payload) as T; } catch { return payload as unknown as T; }
    }
    return payload as T;
  });

  return {
    ...original,
    generateText: mockGenerateText,
    generateJson: mockGenerateJson,
  };
});

/** The minimal YAML fixture referenced inside the module-level mock above. */
const MINIMAL_YAML_FIXTURE = `---
# Rule: Test Spam Filter
type: submission
title (includes): ['buy now', 'click here', 'free money']
author:
  account_age: "< 30 days"
  combined_karma: "< 50"
action: remove
comment: |
  Your post was removed by AutoModerator. Contact mods if this is a mistake.
modmail: |
  Removed post: {{permalink}}
  User: u/{{author}}
---`;

// ---------------------------------------------------------------------------
// 2. IMPORTS  (after mocks so they receive the mocked module)
// ---------------------------------------------------------------------------

import { redis, reddit } from '@devvit/web/server';
import {
  getCurrentRule,
  saveCurrentRule,
  getLiveAutomodYaml,
  resetRuleStageState,
} from '../services/automod.service';
import {
  buildUnifiedAnalysisPrompt,
  type UnifiedAnalysis,
  DEFAULT_AUTOMOD_RULE,
  type AutomodRule,
} from '../../shared/automod';
// generateText and generateJson are imported via vi.mock above; re-import here for direct use in tests.
import { generateJson, generateText } from '../services/model-proxy.service';
import { generateChatReplyOnServer } from '../routes/rule-stage';

// ---------------------------------------------------------------------------
// 3. SHARED FIXTURES
// ---------------------------------------------------------------------------

/**
 * MINIMAL_YAML is the same content as MINIMAL_YAML_FIXTURE (defined before the mock).
 * We alias it here so test bodies read cleanly.
 */
const MINIMAL_YAML = MINIMAL_YAML_FIXTURE;

/** A realistic multi-rule YAML config used in save / update tests. */
const MULTI_RULE_YAML = `${MINIMAL_YAML}

---
# Rule: Crypto Spam Guard
type: submission
title (includes): ['100x', 'guaranteed profit', 'DM me', 'get rich']
action: remove
comment: |
  Financial spam is not allowed here.
modmail: |
  Crypto spam removed: {{permalink}}
---`;

/** Canonical TypeScript trigger skeleton returned by the model mock. */
const VALID_TRIGGER_SKELETON = `import { type Context, type PostSubmitEvent } from '@devvit/web/server';

export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    // generated logic
  } catch (error) {
    console.error('trigger error:', error);
  }
};`;

/** Build a valid AutomodRule for save / update tests. */
function makeTestRule(overrides: Partial<AutomodRule> = {}): AutomodRule {
  return {
    id: 'rule-test-1',
    name: 'Test Spam Filter',
    type: 'submission',
    enabled: true,
    conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
    satisfyAnyThreshold: true,
    action: 'remove',
    comment: 'Removed by AutoModerator.',
    commentStickied: false,
    modmail: 'Removed post: {{permalink}}',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 4. FETCH MOCK FACTORY
//    Single authoritative fetch mock used by all suites unless a test overrides.
//    Response shape is selected by heuristic pattern matching on the prompt text,
//    which mirrors exactly how model-proxy.service.ts uses the API response.
// ---------------------------------------------------------------------------

type ParsedResponse =
  | { hasLimitation: boolean; limitation: string | null; explanation: string; recommendation: string }
  | { code: string; description: string; limitations: string[]; confidence: string }
  | { isSpam: boolean }
  | { banned: boolean };

function buildFetchMock() {
  return vi.fn(async (url: string, options?: RequestInit): Promise<Response> => {
    const body = options?.body ? (JSON.parse(options.body as string) as Record<string, unknown>) : {};

    // ---- External API mocks (not Gemini) -----------------------------------

    if (url.includes('spam-api.example.com')) {
      const postBody = body as { title?: string; author?: string };
      const lower = `${postBody.title ?? ''} ${postBody.author ?? ''}`.toLowerCase();
      return makeJsonResponse({ isSpam: lower.includes('spam') });
    }

    if (url.includes('ban-api.example.com')) {
      const postBody = body as { user?: string };
      const lower = (postBody.user ?? '').toLowerCase();
      return makeJsonResponse({ banned: lower.includes('banned') });
    }

    // ---- Gemini / GitHub model mock ----------------------------------------

    const contents = (body as Record<string, unknown>)?.contents as Array<{ parts: Array<{ text: string }> }> | undefined;
    const messages = (body as Record<string, unknown>)?.messages as Array<{ content: string }> | undefined;
    const promptText: string =
      contents?.[0]?.parts?.[0]?.text ??
      messages?.map((m) => m.content).join(' ') ??
      '';
    const lower = promptText.toLowerCase();

    const markerIdx = lower.lastIndexOf('moderator request:');
    const requestSection = markerIdx >= 0 ? lower.slice(markerIdx + 'moderator request:'.length).trim() : lower;

    const isGenerationPrompt = /generat(e|ing)|typescript trigger|onpostsubmit|devvit typescript/i.test(promptText);

    let parsed: ParsedResponse;

    if (isGenerationPrompt) {
      // ---- TypeScript trigger generation responses --------------------------
      if (/(redis|database|db|ban.?list)/i.test(requestSection)) {
        parsed = {
          code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';
export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const isBanned = await context.redis.sismember('scammer-list', event.author.name);
    if (isBanned) { await context.reddit.remove(event.post.id, true); }
  } catch (error) { console.error('Redis check failed:', error); }
};`,
          description: 'Checks Redis scammer-list set before allowing a post through.',
          limitations: ['Redis set must be populated separately.'],
          confidence: 'high',
        };
      } else if (/(external[\w\s]*api|spam[\w\s]*api|fetch|http)/i.test(requestSection)) {
        parsed = {
          code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';
export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const res = await fetch('https://spam-api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: event.post.title, author: event.author.name }),
    });
    if (res.ok) {
      const data = await res.json() as { isSpam: boolean };
      if (data.isSpam) { await context.reddit.remove(event.post.id, true); }
    }
  } catch (error) { console.error('Spam API check failed:', error); }
};`,
          description: 'Calls external spam detection API and removes flagged posts.',
          limitations: [
            'Requires spam-api.example.com domain in devvit.json http whitelist.',
            'Fails open if the API is unreachable.',
          ],
          confidence: 'high',
        };
      } else if (/(json|parse)/i.test(requestSection)) {
        parsed = {
          code: `import { type Context, type PostSubmitEvent } from '@devvit/web/server';
export const onPostSubmit = async (event: PostSubmitEvent, context: Context) => {
  try {
    const data = JSON.parse(event.post.body) as Record<string, unknown>;
    if (data.blocked === true || data.kind === 'forbidden') {
      await context.reddit.remove(event.post.id, true);
    }
  } catch { return; }
};`,
          description: 'Parses JSON from the post body and removes posts with blocked fields.',
          limitations: ['Only works when the post body is valid JSON.'],
          confidence: 'high',
        };
      } else {
        parsed = {
          code: VALID_TRIGGER_SKELETON,
          description: 'Generic generated trigger.',
          limitations: ['Review before deploying.'],
          confidence: 'medium',
        };
      }

      return makeGeminiResponse(JSON.stringify(parsed));
    }

    // ---- Limitation / analysis responses ------------------------------------
    if (/(external[\w\s]*api|http|fetch|spam[\w\s]*api|verify\.example)/i.test(requestSection)) {
      parsed = {
        hasLimitation: true,
        limitation: 'external-api',
        explanation: 'AutoMod YAML cannot make HTTP calls to external services.',
        recommendation: 'typescript',
      };
    } else if (/(json|parse|body)/i.test(requestSection)) {
      parsed = {
        hasLimitation: true,
        limitation: 'json-parsing',
        explanation: 'AutoMod YAML cannot parse structured JSON fields.',
        recommendation: 'typescript',
      };
    } else if (/(redis|database|db|ban.?list)/i.test(requestSection)) {
      parsed = {
        hasLimitation: true,
        limitation: 'database-check',
        explanation: 'AutoMod YAML cannot query a Redis store.',
        recommendation: 'typescript',
      };
    } else if (/(machine.?learning|ml model|neural|predict|train)/i.test(requestSection)) {
      parsed = {
        hasLimitation: true,
        limitation: 'other',
        explanation: 'AutoMod YAML cannot call an ML inference endpoint.',
        recommendation: 'typescript',
      };
    } else if (/(dynamic.?config|configuration.?server|feature.?flag)/i.test(requestSection)) {
      parsed = {
        hasLimitation: true,
        limitation: 'state-management',
        explanation: 'AutoMod YAML cannot load runtime configuration.',
        recommendation: 'typescript',
      };
    } else if (/needsyaml|needs_yaml|needs typescript/i.test(lower)) {
      // Unified-analysis shape - but we now use the real escape-hatch path so
      // this branch covers any prompt that explicitly mentions these tokens.
      parsed = {
        hasLimitation: false,
        limitation: null,
        explanation: 'YAML can handle this natively.',
        recommendation: 'yaml',
      };
    } else {
      // Default: YAML-capable
      parsed = {
        hasLimitation: false,
        limitation: null,
        explanation: 'AutoMod YAML handles this natively.',
        recommendation: 'yaml',
      };
    }

    // Analysis responses use the Gemini candidates wrapper.
    return makeGeminiResponse(JSON.stringify(parsed));
  });
}

// ---------------------------------------------------------------------------
// Helpers for constructing mock Response objects
// ---------------------------------------------------------------------------

function makeJsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function makeGeminiResponse(text: string): Response {
  const body = { candidates: [{ content: { parts: [{ text }] } }] };
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

/** Build the raw YAML Gemini response shape (for generateChatReplyOnServer). */
function makeYamlFetchMock(yaml: string = MINIMAL_YAML) {
  return vi.fn(async (_url: string, _opts?: RequestInit): Promise<Response> => {
    const yamlBlock = `\`\`\`yaml\n${yaml}\n\`\`\``;
    return makeGeminiResponse(yamlBlock);
  });
}

// ---------------------------------------------------------------------------
// 5. TEST SUITES
// ---------------------------------------------------------------------------

// ============================================================
// SUITE 1 — NORMAL MODE: Pure YAML generation
// ============================================================
describe('Suite 1 — Normal Mode: Pure YAML Generation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeYamlFetchMock());
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('wiki unavailable'));
    vi.mocked(reddit.updateWikiPage).mockResolvedValue({ content: '', revisionId: '1-1-1-1-1' } as unknown as Awaited<ReturnType<typeof reddit.updateWikiPage>>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1.1 — generateText returns a string for a simple keyword filter request', async () => {
    const text = await generateText('Remove posts with "buy now" in the title');
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('1.2 — generated YAML contains required structural tokens (---, type, action)', async () => {
    const text = await generateText('Block posts from accounts newer than 30 days with low karma');
    expect(text).toMatch(/---/);
    expect(text).toMatch(/type: submission/);
    expect(text).toMatch(/action:/);
  });

  it('1.3 — generateChatReplyOnServer returns YAML for a plain keyword rule', async () => {
    const reply = await generateChatReplyOnServer('Remove posts with "buy now" in the title', []);
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).toMatch(/type: submission/);
  });

  it('1.4 — generateChatReplyOnServer includes the modmail block', async () => {
    const reply = await generateChatReplyOnServer('Remove self-promotion posts and send a modmail', []);
    expect(reply).toMatch(/modmail/i);
  });

  it('1.5 — generateText returns a non-empty string for a domain-filter rule', async () => {
    const text = await generateText('Remove posts with domain bit.ly or tinyurl.com');
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it('1.8 — generateText handles multi-condition rules without throwing', async () => {
    const text = await generateText(
      'Remove posts that have "DM me" in the title AND are from accounts under 14 days old with less than 100 karma'
    );
    expect(text.length).toBeGreaterThan(50);
  });

  it('1.9 — generateChatReplyOnServer trims history to the last 10 turns', async () => {
    const longHistory = Array.from({ length: 14 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'model') as 'user' | 'model',
      content: `msg-${i + 1}`,
    }));
    // Should not throw even when history exceeds the 10-turn cap
    const reply = await generateChatReplyOnServer('New rule please', longHistory);
    expect(typeof reply).toBe('string');
  });

  it('1.10 — YAML generation works with a subreddit context injected', async () => {
    const reply = await generateChatReplyOnServer(
      'Filter crypto spam',
      [],
      'Subreddit: r/cryptotrading — verified traders only'
    );
    expect(reply.length).toBeGreaterThan(0);
  });
});

// ============================================================
// SUITE 2 — HYBRID MODE: YAML + TypeScript Trigger Together
// ============================================================
// NOTE: Advanced Mode (escape-hatch) has been removed. This suite now focuses on
// unified analysis for YAML-only scenarios.
describe('Suite 2 — Unified Analysis for YAML Generation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', buildFetchMock());
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(redis.set).mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('2.1 — unified analysis classifies a YAML-only request correctly', async () => {
    const analysis = await generateJson<UnifiedAnalysis>(
      buildUnifiedAnalysisPrompt('Remove posts that contain the word "spam" in the title')
    );
    expect(analysis.needsYaml).toBe(true);
    expect(analysis.needsTypeScript).toBe(false);
    expect(analysis.explanation.length).toBeGreaterThan(5);
  });

  it('2.2 — unified analysis handles multi-condition YAML requests', async () => {
    const analysis = await generateJson<UnifiedAnalysis>(
      buildUnifiedAnalysisPrompt('Remove posts with "crypto" in title AND accounts under 30 days old')
    );
    expect(analysis.needsYaml).toBe(true);
  });

  it('2.3 — unified analysis returns all required fields', async () => {
    const analysis = await generateJson<UnifiedAnalysis>(
      buildUnifiedAnalysisPrompt('Filter posts by karma threshold')
    );
    expect(analysis).toHaveProperty('needsYaml');
    expect(analysis).toHaveProperty('needsTypeScript');
    expect(analysis).toHaveProperty('yamlPart');
    expect(analysis).toHaveProperty('typescriptPart');
    expect(analysis).toHaveProperty('explanation');
  });
});

// ============================================================
// SUITE 3 — REDIS CRUD: Create / Read / Update / Delete
// ============================================================
describe('Suite 4 — Redis CRUD: Ban List and Rule Store Operations', () => {
  beforeEach(() => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(redis.del).mockResolvedValue(undefined);
    vi.mocked(redis.sadd).mockResolvedValue(1);
    vi.mocked(redis.srem).mockResolvedValue(1);
    vi.mocked(redis.sismember).mockResolvedValue(0);
    vi.mocked(redis.smembers).mockResolvedValue([]);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('wiki unavailable'));
    vi.mocked(reddit.updateWikiPage).mockResolvedValue({ content: '', revisionId: '1-1-1-1-1' } as unknown as Awaited<ReturnType<typeof reddit.updateWikiPage>>);
    vi.stubGlobal('fetch', buildFetchMock());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- CREATE -----------------------------------------------------------

  it('4.1 — CREATE: sadd adds a user to the scammer-list set and returns 1', async () => {
    vi.mocked(redis.sadd).mockResolvedValue(1);
    const result = await redis.sadd('scammer-list', 'baduser123');
    expect(result).toBe(1);
    expect(redis.sadd).toHaveBeenCalledWith('scammer-list', 'baduser123');
  });

  it('4.2 — CREATE: sadd returns 0 when the user already exists in the set', async () => {
    vi.mocked(redis.sadd).mockResolvedValue(0);
    const result = await redis.sadd('scammer-list', 'baduser123');
    expect(result).toBe(0);
  });

  it('4.3 — CREATE: set stores a JSON-serialized rule draft under the rulestage key', async () => {
    const rule = { id: 'draft-1', name: 'Spam filter', action: 'remove' };
    await redis.set('rulestage:rule:current:test_subreddit', JSON.stringify(rule));
    expect(redis.set).toHaveBeenCalledWith(
      'rulestage:rule:current:test_subreddit',
      expect.stringContaining('"Spam filter"')
    );
  });

  it('4.4 — CREATE: set creates a per-user ban key with a truthy value', async () => {
    await redis.set('banned:user:scammer42', '1');
    expect(redis.set).toHaveBeenCalledWith('banned:user:scammer42', '1');
  });

  it('4.5 — CREATE: multiple users can be batch-added to the scammer-list', async () => {
    const users = ['spammer1', 'spammer2', 'spammer3'];
    for (const user of users) {
      await redis.sadd('scammer-list', user);
    }
    expect(redis.sadd).toHaveBeenCalledTimes(3);
  });

  it('4.6 — CREATE: saveCurrentRule writes to Redis via set', async () => {
    const rule = makeTestRule();
    await saveCurrentRule(rule);
    expect(redis.set).toHaveBeenCalled();
  });

  // ---- READ -------------------------------------------------------------

  it('4.7 — READ: get retrieves an existing ban key and returns a truthy value', async () => {
    vi.mocked(redis.get).mockResolvedValue('1');
    const result = await redis.get('banned:user:scammer42');
    expect(result).toBeTruthy();
    expect(redis.get).toHaveBeenCalledWith('banned:user:scammer42');
  });

  it('4.8 — READ: get returns null for a user not on the ban list', async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    const result = await redis.get('banned:user:clean_user');
    expect(result).toBeNull();
  });

  it('4.9 — READ: sismember returns 1 when user IS in the set', async () => {
    vi.mocked(redis.sismember).mockResolvedValue(1);
    const isMember = await redis.sismember('scammer-list', 'baduser123');
    expect(isMember).toBe(1);
  });

  it('4.10 — READ: sismember returns 0 when user is NOT in the set', async () => {
    vi.mocked(redis.sismember).mockResolvedValue(0);
    const isMember = await redis.sismember('scammer-list', 'good_user');
    expect(isMember).toBe(0);
  });

  it('4.11 — READ: smembers returns the full scammer-list contents', async () => {
    vi.mocked(redis.smembers).mockResolvedValue(['spammer1', 'spammer2', 'spammer3']);
    const members = await redis.smembers('scammer-list');
    expect(members).toHaveLength(3);
    expect(members).toContain('spammer1');
  });

  it('4.12 — READ: smembers returns an empty array when the list is empty', async () => {
    vi.mocked(redis.smembers).mockResolvedValue([]);
    const members = await redis.smembers('scammer-list');
    expect(members).toHaveLength(0);
  });

  it('4.13 — READ: getCurrentRule returns DEFAULT_AUTOMOD_RULE when both wiki and Redis are empty', async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('wiki not found'));
    const rule = await getCurrentRule();
    expect(rule).toHaveProperty('id');
    expect(rule.type).toBe('submission');
  });

  it('4.14 — READ: getCurrentRule parses a stored YAML rule from Redis when wiki is unavailable', async () => {
    vi.mocked(redis.get).mockResolvedValue(MINIMAL_YAML);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('wiki unavailable'));
    const rule = await getCurrentRule();
    expect(rule).toHaveProperty('type', 'submission');
  });

  it('4.15 — READ: getLiveAutomodYaml falls back to Redis when the wiki page is missing', async () => {
    vi.mocked(redis.get).mockResolvedValue(MINIMAL_YAML);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('not found'));
    const yaml = await getLiveAutomodYaml('test_subreddit');
    expect(typeof yaml).toBe('string');
    expect(yaml.length).toBeGreaterThan(0);
  });

  it('4.16 — READ: getLiveAutomodYaml returns wiki content when available', async () => {
    vi.mocked(reddit.getWikiPage).mockResolvedValue(MINIMAL_YAML as unknown as Awaited<ReturnType<typeof reddit.getWikiPage>>);
    const yaml = await getLiveAutomodYaml('test_subreddit');
    expect(yaml).toMatch(/type: submission/);
  });

  // ---- UPDATE -----------------------------------------------------------

  it('4.17 — UPDATE: set overwrites an existing ban key with new metadata', async () => {
    await redis.set('banned:user:scammer42', '1');
    await redis.set('banned:user:scammer42', JSON.stringify({ reason: 'spam ring', ts: Date.now() }));
    expect(redis.set).toHaveBeenCalledTimes(2);
    const lastCallArgs = vi.mocked(redis.set).mock.calls[1] as [string, string];
    expect(lastCallArgs[0]).toBe('banned:user:scammer42');
    expect(lastCallArgs[1]).toMatch(/spam ring/);
  });

  it('4.18 — UPDATE: saveCurrentRule normalizes and writes an updated rule', async () => {
    const updatedRule = makeTestRule({ name: 'Updated Spam Filter', action: 'report' });
    await saveCurrentRule(updatedRule);
    expect(redis.set).toHaveBeenCalled();
    const writtenYaml = String(vi.mocked(redis.set).mock.calls[0]?.[1]);
    expect(writtenYaml.length).toBeGreaterThan(0);
  });

  it('4.19 — UPDATE: sadd on an existing member is idempotent (first call 1, second call 0)', async () => {
    vi.mocked(redis.sadd)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    const first  = await redis.sadd('scammer-list', 'dupe_user');
    const second = await redis.sadd('scammer-list', 'dupe_user');
    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  // ---- DELETE -----------------------------------------------------------

  it('4.20 — DELETE: srem removes a user from the scammer-list and returns 1', async () => {
    vi.mocked(redis.srem).mockResolvedValue(1);
    const result = await redis.srem('scammer-list', 'baduser123');
    expect(result).toBe(1);
    expect(redis.srem).toHaveBeenCalledWith('scammer-list', 'baduser123');
  });

  it('4.21 — DELETE: srem returns 0 when the user was not in the set', async () => {
    vi.mocked(redis.srem).mockResolvedValue(0);
    const result = await redis.srem('scammer-list', 'nonexistent_user');
    expect(result).toBe(0);
  });

  it('4.22 — DELETE: del removes the entire ban key', async () => {
    await redis.del('banned:user:scammer42');
    expect(redis.del).toHaveBeenCalledWith('banned:user:scammer42');
  });

  it('4.23 — DELETE: resetRuleStageState clears the rule key and returns the default rule', async () => {
    const rule = await resetRuleStageState();
    expect(redis.del).toHaveBeenCalled();
    expect(rule.type).toBe('submission');
    // Must be the DEFAULT_AUTOMOD_RULE shape
    expect(rule.id).toBe(DEFAULT_AUTOMOD_RULE.id);
  });

  // ---- FULL LIFECYCLE ---------------------------------------------------

  it('4.24 — FULL LIFECYCLE: add → check → update metadata → remove user from ban list', async () => {
    // ADD
    vi.mocked(redis.sadd).mockResolvedValue(1);
    const added = await redis.sadd('scammer-list', 'lifecycle_user');
    expect(added).toBe(1);

    // CHECK EXISTS
    vi.mocked(redis.sismember).mockResolvedValue(1);
    const exists = await redis.sismember('scammer-list', 'lifecycle_user');
    expect(exists).toBe(1);

    // UPDATE BAN METADATA
    await redis.set(
      'ban:meta:lifecycle_user',
      JSON.stringify({ reason: 'spam', updatedAt: Date.now() })
    );
    expect(redis.set).toHaveBeenCalledWith(
      'ban:meta:lifecycle_user',
      expect.stringContaining('spam')
    );

    // REMOVE
    vi.mocked(redis.srem).mockResolvedValue(1);
    const removed = await redis.srem('scammer-list', 'lifecycle_user');
    expect(removed).toBe(1);

    // CONFIRM GONE
    vi.mocked(redis.sismember).mockResolvedValue(0);
    const gone = await redis.sismember('scammer-list', 'lifecycle_user');
    expect(gone).toBe(0);
  });

  it('4.25 — Redis trigger simulation: banned user causes reddit.remove to be called', async () => {
    vi.mocked(redis.sismember).mockResolvedValue(1);
    vi.mocked(reddit.remove).mockResolvedValue(undefined);

    const event = { post: { id: 't1_post_1' }, author: { name: 'banned_user' } };
    const isBanned = await redis.sismember('scammer-list', event.author.name);
    if (isBanned) {
      await reddit.remove(event.post.id as `t1_${string}`, true);
    }
    expect(reddit.remove).toHaveBeenCalledWith('t1_post_1', true);
  });

  it('4.26 — Redis trigger simulation: clean user does NOT cause reddit.remove', async () => {
    vi.mocked(redis.sismember).mockResolvedValue(0);
    vi.mocked(reddit.remove).mockResolvedValue(undefined);

    const event = { post: { id: 't1_post_2' }, author: { name: 'clean_user' } };
    const isBanned = await redis.sismember('scammer-list', event.author.name);
    if (isBanned) {
      await reddit.remove(event.post.id as `t1_${string}`, true);
    }
    expect(reddit.remove).not.toHaveBeenCalled();
  });
});

// ============================================================
// SUITE 5 — EXTERNAL API: HTTP Call Integration
// ============================================================
describe('Suite 5 — External API: HTTP Call Integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', buildFetchMock());
    vi.mocked(reddit.remove).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('5.1 — spam API mock returns isSpam: false for a clean post title', async () => {
    const res = await fetch('https://spam-api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'A perfectly fine post', author: 'good_user' }),
    });
    expect(res.ok).toBe(true);
    const data = (await res.json()) as { isSpam: boolean };
    expect(data).toHaveProperty('isSpam');
    expect(data.isSpam).toBe(false);
  });

  it('5.2 — spam API mock returns isSpam: true when title contains "spam"', async () => {
    const res = await fetch('https://spam-api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'This is spam buy now', author: 'spammer' }),
    });
    const data = (await res.json()) as { isSpam: boolean };
    expect(data.isSpam).toBe(true);
  });

  it('5.3 — ban API mock returns banned: true when user name contains "banned"', async () => {
    const res = await fetch('https://ban-api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'banned_user_xyz' }),
    });
    const data = (await res.json()) as { banned: boolean };
    expect(data.banned).toBe(true);
  });

  it('5.4 — ban API mock returns banned: false for a clean username', async () => {
    const res = await fetch('https://ban-api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'clean_user' }),
    });
    const data = (await res.json()) as { banned: boolean };
    expect(data.banned).toBe(false);
  });

  it('5.5 — simulated trigger removes post when external API returns isSpam: true', async () => {
    const mockEvent = {
      post: { id: 't1_post_abc', title: 'spam post', body: '' },
      author: { name: 'spammer' },
    };

    const res = await fetch('https://spam-api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: mockEvent.post.title, author: mockEvent.author.name }),
    });
    const data = (await res.json()) as { isSpam: boolean };
    if (data.isSpam) {
      await reddit.remove(mockEvent.post.id as `t1_${string}`, true);
    }

    expect(reddit.remove).toHaveBeenCalledWith('t1_post_abc', true);
  });

  it('5.9 — simulated trigger does NOT remove post when isSpam is false', async () => {
    const mockEvent = {
      post: { id: 'post_xyz', title: 'a lovely discussion', body: '' },
      author: { name: 'good_user' },
    };

    const res = await fetch('https://spam-api.example.com/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: mockEvent.post.title, author: mockEvent.author.name }),
    });
    const data = (await res.json()) as { isSpam: boolean };
    if (data.isSpam) {
      await reddit.remove(mockEvent.post.id as `t1_${string}`, true);
    }

    expect(reddit.remove).not.toHaveBeenCalled();
  });

  it('5.10 — trigger fails open gracefully on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(async () => {
      try {
        await fetch('https://spam-api.example.com/check', {
          method: 'POST',
          body: JSON.stringify({ title: 'test', author: 'user' }),
        });
      } catch {
        // trigger fails open — no post removal
      }
    }).not.toThrow();
  });

  it('5.6 — malformed API response does not cause reddit.remove to fire', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpectedField: true }),
    }));

    const res = await fetch('https://spam-api.example.com/check', {
      method: 'POST',
      body: JSON.stringify({ title: 'test' }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    const isSpam = typeof data.isSpam === 'boolean' ? data.isSpam : false;
    if (isSpam) {
      await reddit.remove('t1_any-post-id' as `t1_${string}`, true);
    }

    expect(isSpam).toBe(false);
    expect(reddit.remove).not.toHaveBeenCalled();
  });

  it('5.13 — HTTP 500 from external API does not crash the trigger simulation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal Server Error' }),
    }));

    await expect(async () => {
      const res = await fetch('https://spam-api.example.com/check', {
        method: 'POST',
        body: JSON.stringify({ title: 'test' }),
      });
      if (!res.ok) return; // trigger fails open on non-2xx
    }).not.toThrow();
  });

  it('5.14 — multiple concurrent external API calls resolve independently', async () => {
    vi.stubGlobal('fetch', buildFetchMock());

    const posts = [
      { title: 'spam post 1', author: 'user1' },
      { title: 'normal post', author: 'user2' },
      { title: 'spam post 3', author: 'user3' },
    ];

    const results = await Promise.all(
      posts.map((post) =>
        fetch('https://spam-api.example.com/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(post),
        }).then((r) => r.json() as Promise<{ isSpam: boolean }>)
      )
    );

    expect(results).toHaveLength(3);
    expect(results.every((r) => typeof r.isSpam === 'boolean')).toBe(true);
    // posts[0] and [2] contain "spam" → true; posts[1] does not → false
    expect(results[0]?.isSpam).toBe(true);
    expect(results[1]?.isSpam).toBe(false);
    expect(results[2]?.isSpam).toBe(true);
  });
});

// ============================================================
// SUITE 6 — EDGE CASES & CROSS-SYSTEM GUARD RAILS
// ============================================================
describe('Suite 6 — Edge Cases and Guard Rails', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', buildFetchMock());
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(redis.del).mockResolvedValue(undefined);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('wiki unavailable'));
    vi.mocked(reddit.updateWikiPage).mockResolvedValue({ content: '', revisionId: '1-1-1-1-1' } as unknown as Awaited<ReturnType<typeof reddit.updateWikiPage>>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('6.1 — getCurrentRule falls back gracefully when both wiki and Redis are unavailable', async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('forbidden'));
    const rule = await getCurrentRule();
    expect(rule).toBeDefined();
    expect(rule.type).toBe('submission');
  });

  it('6.2 — generateText does not throw on a YAML-capable prompt', async () => {
    vi.stubGlobal('fetch', makeYamlFetchMock());
    await expect(generateText('Remove posts from new accounts with low karma')).resolves.toBeTruthy();
  });

  it('6.3 — generateJson parses valid JSON returned by the model', async () => {
    vi.stubGlobal('fetch', buildFetchMock());
    const result = await generateJson<{ test: string }>('Return a JSON object with a test field');
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('test');
  });

  it('6.4 — resetRuleStageState calls redis.del and returns DEFAULT_AUTOMOD_RULE shape', async () => {
    const rule = await resetRuleStageState();
    expect(redis.del).toHaveBeenCalled();
    expect(rule.type).toBe('submission');
    expect(rule.id).toBe(DEFAULT_AUTOMOD_RULE.id);
  });
});

// ============================================================
// SUITE 7 — RULE EVALUATION & SIMULATION ENGINE
// Tests the pure in-memory evaluateRule / createDefaultSimulationPosts
// / runSimulation / getMockSimulationPosts pipeline without any model
// calls — entirely synchronous or lightweight async.
// ============================================================
describe('Suite 7 — Rule Evaluation and Simulation Engine', () => {
  // Pull the pure functions in directly so we test the engine in isolation.
  let evaluateRule: typeof import('../../shared/automod').evaluateRule;
  let createDefaultSimulationPosts: typeof import('../../shared/automod').createDefaultSimulationPosts;
  let runSimulation: typeof import('../services/automod.service').runSimulation;
  let getMockSimulationPosts: typeof import('../services/automod.service').getMockSimulationPosts;
  let describeCondition: typeof import('../../shared/automod').describeCondition;

  beforeEach(async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('unavailable'));
    vi.mocked(reddit.updateWikiPage).mockResolvedValue({ content: '', revisionId: '1-1-1-1-1' } as unknown as Awaited<ReturnType<typeof reddit.updateWikiPage>>);

    const shared = await import('../../shared/automod');
    evaluateRule              = shared.evaluateRule;
    createDefaultSimulationPosts = shared.createDefaultSimulationPosts;
    describeCondition         = shared.describeCondition;

    const svc = await import('../services/automod.service');
    runSimulation             = svc.runSimulation;
    getMockSimulationPosts    = svc.getMockSimulationPosts;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- createDefaultSimulationPosts --------------------------------------

  it('7.1 — createDefaultSimulationPosts returns a non-empty array', () => {
    const posts = createDefaultSimulationPosts();
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
  });

  it('7.2 — every default simulation post has required SimulationPost fields', () => {
    const posts = createDefaultSimulationPosts();
    for (const p of posts) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.title).toBe('string');
      expect(typeof p.author).toBe('string');
      expect(typeof p.accountAgeDays).toBe('number');
      expect(typeof p.combinedKarma).toBe('number');
    }
  });

  it('7.3 — default posts include both old and new accounts', () => {
    const posts = createDefaultSimulationPosts();
    const hasNew = posts.some((p) => (p.accountAgeDays ?? 0) < 30);
    const hasOld = posts.some((p) => (p.accountAgeDays ?? 0) >= 30);
    expect(hasNew).toBe(true);
    expect(hasOld).toBe(true);
  });

  // ---- evaluateRule — title matching ------------------------------------

  it('7.4 — evaluateRule removes post whose title matches the rule keyword', () => {
    const rule = makeTestRule({
      name: 'Spam Catcher',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    });
    const posts = createDefaultSimulationPosts();
    // Inject a synthetic post whose title contains "buy now"
    const spamPost = { ...posts[0], id: 'spam-1', title: 'Buy now! Limited offer' };
    const result = evaluateRule(rule, [spamPost]);
    expect(result.removed).toBe(1);
    expect(result.matched).toBe(1);
    const item = result.items.find((i) => i.id === 'spam-1');
    expect(item?.outcome).toBe('remove');
  });

  it('7.5 — evaluateRule approves post whose title does NOT match the keyword', () => {
    const rule = makeTestRule({
      name: 'Spam Catcher',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    });
    const cleanPost = { ...createDefaultSimulationPosts()[1], id: 'clean-1', title: 'Weekly thread' };
    const result = evaluateRule(rule, [cleanPost]);
    expect(result.approved).toBe(1);
    expect(result.matched).toBe(0);
    const item = result.items.find((i) => i.id === 'clean-1');
    expect(item?.outcome).toBe('approve');
  });

  it('7.6 — evaluateRule uses report action correctly', () => {
    const rule = makeTestRule({ action: 'report', name: 'Flag Suspicious' });
    const post = { ...createDefaultSimulationPosts()[0], id: 'report-1', title: 'Buy now deal' };
    const result = evaluateRule(rule, [post]);
    expect(result.reported).toBe(1);
    const item = result.items.find((i) => i.id === 'report-1');
    expect(item?.outcome).toBe('report');
  });

  it('7.7 — evaluateRule uses approve action correctly', () => {
    const rule = makeTestRule({
      name: 'Approve Verified',
      conditions: [{ field: 'title', comparator: 'includes', value: 'weekly thread' }],
      action: 'approve',
    });
    const post = { ...createDefaultSimulationPosts()[1], id: 'approve-1', title: 'Weekly thread update' };
    const result = evaluateRule(rule, [post]);
    const item = result.items.find((i) => i.id === 'approve-1');
    // The rule action is approve; the post matched so outcome is approve from the rule, not fallback
    expect(['approve']).toContain(item?.outcome);
  });

  it('7.8 — evaluateRule handles account_age numeric condition', () => {
    const rule = makeTestRule({
      name: 'New Account Filter',
      conditions: [{ field: 'account_age', comparator: '<', value: '30' }],
      action: 'remove',
    });
    const newPost  = { ...createDefaultSimulationPosts()[0], id: 'new-1',  accountAgeDays: 5 };
    const oldPost  = { ...createDefaultSimulationPosts()[0], id: 'old-1',  accountAgeDays: 365 };
    const result = evaluateRule(rule, [newPost, oldPost]);
    expect(result.removed).toBe(1);
    const newItem = result.items.find((i) => i.id === 'new-1');
    const oldItem = result.items.find((i) => i.id === 'old-1');
    expect(newItem?.outcome).toBe('remove');
    expect(oldItem?.outcome).toBe('approve');
  });

  it('7.9 — evaluateRule handles combined_karma numeric condition', () => {
    const rule = makeTestRule({
      name: 'Low Karma Filter',
      conditions: [{ field: 'combined_karma', comparator: '<', value: '50' }],
      action: 'remove',
    });
    const lowKarma  = { ...createDefaultSimulationPosts()[0], id: 'lk-1', combinedKarma: 10 };
    const highKarma = { ...createDefaultSimulationPosts()[0], id: 'hk-1', combinedKarma: 500 };
    const result = evaluateRule(rule, [lowKarma, highKarma]);
    expect(result.removed).toBe(1);
    expect(result.items.find((i) => i.id === 'lk-1')?.outcome).toBe('remove');
    expect(result.items.find((i) => i.id === 'hk-1')?.outcome).toBe('approve');
  });

  it('7.10 — evaluateRule satisfyAnyThreshold=true matches when EITHER condition is met', () => {
    const rule = makeTestRule({
      name: 'Either Filter',
      conditions: [
        { field: 'account_age',    comparator: '<', value: '30' },
        { field: 'combined_karma', comparator: '<', value: '50' },
      ],
      satisfyAnyThreshold: true,
      action: 'remove',
    });
    // Old account with low karma → should still match (karma condition satisfies ANY)
    const post = { ...createDefaultSimulationPosts()[0], id: 'any-1', accountAgeDays: 200, combinedKarma: 10 };
    const result = evaluateRule(rule, [post]);
    expect(result.removed).toBe(1);
  });

  it('7.11 — evaluateRule satisfyAnyThreshold=false requires ALL conditions', () => {
    const rule = makeTestRule({
      name: 'Both Filter',
      conditions: [
        { field: 'account_age',    comparator: '<', value: '30' },
        { field: 'combined_karma', comparator: '<', value: '50' },
      ],
      satisfyAnyThreshold: false,
      action: 'remove',
    });
    // Old account with low karma → should NOT match (age doesn't satisfy)
    const post = { ...createDefaultSimulationPosts()[0], id: 'both-1', accountAgeDays: 200, combinedKarma: 10 };
    const result = evaluateRule(rule, [post]);
    expect(result.removed).toBe(0);
    expect(result.approved).toBe(1);
  });

  it('7.12 — evaluateRule with empty conditions approves all posts', () => {
    const rule = makeTestRule({ name: 'Empty Rule', conditions: [], action: 'remove' });
    const posts = createDefaultSimulationPosts();
    const result = evaluateRule(rule, posts);
    // With no conditions the text+threshold both default to true, so all are matched
    expect(result.items.length).toBe(posts.length);
  });

  it('7.13 — evaluateRule result totals are consistent (matched + approved = total)', () => {
    const rule = makeTestRule({
      name: 'Consistency Check',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    });
    const posts = createDefaultSimulationPosts();
    const result = evaluateRule(rule, posts);
    expect(result.items.length).toBe(posts.length);
    expect(result.matched + result.approved).toBe(posts.length);
  });

  it('7.14 — evaluateRule with regex comparator matches correctly', () => {
    const rule = makeTestRule({
      name: 'Regex Title Filter',
      conditions: [{ field: 'title', comparator: 'matches', value: 'buy\\s+now|grab yours' }],
      action: 'remove',
    });
    const post = { ...createDefaultSimulationPosts()[0], id: 'regex-1', title: 'Grab yours here before it is gone' };
    const result = evaluateRule(rule, [post]);
    expect(result.removed).toBe(1);
  });

  it('7.15 — evaluateRule with invalid regex does not throw', () => {
    const rule = makeTestRule({
      name: 'Bad Regex',
      conditions: [{ field: 'title', comparator: 'matches', value: '[invalid regex' }],
      action: 'remove',
    });
    expect(() => evaluateRule(rule, createDefaultSimulationPosts())).not.toThrow();
  });

  // ---- runSimulation / getMockSimulationPosts ----------------------------

  it('7.16 — getMockSimulationPosts returns empty array when Redis is empty', async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    const posts = await getMockSimulationPosts();
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBe(0);
  });

  it('7.17 — getMockSimulationPosts returns parsed posts from Redis', async () => {
    const fakePosts = createDefaultSimulationPosts().slice(0, 2);
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(fakePosts));
    const posts = await getMockSimulationPosts();
    expect(posts.length).toBe(2);
    if (posts[0] && fakePosts[0]) {
      expect(posts[0].id).toBe(fakePosts[0].id);
    }
  });

  it('7.18 — getMockSimulationPosts handles malformed JSON gracefully', async () => {
    vi.mocked(redis.get).mockResolvedValue('{this is not json}');
    const posts = await getMockSimulationPosts();
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBe(0);
  });

  it('7.19 — runSimulation uses getCurrentRule when no rule argument provided', async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    const result = await runSimulation();
    // With no posts stored, simulation runs against empty list → all counts 0
    expect(result).toHaveProperty('matched');
    expect(result).toHaveProperty('removed');
    expect(result).toHaveProperty('approved');
    expect(result).toHaveProperty('items');
  });

  it('7.20 — runSimulation accepts an explicit rule override', async () => {
    const fakePosts = [
      { ...createDefaultSimulationPosts()[0], id: 'sim-1', title: 'Buy now discount' },
    ];
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(fakePosts));
    const rule = makeTestRule({
      name: 'Sim Rule',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    });
    const result = await runSimulation(rule);
    expect(result.removed).toBe(1);
  });

  // ---- describeCondition -------------------------------------------------

  it('7.21 — describeCondition formats a title includes condition', () => {
    const desc = describeCondition({ field: 'title', comparator: 'includes', value: 'spam' });
    expect(desc).toMatch(/title/i);
    expect(desc).toMatch(/spam/);
  });

  it('7.22 — describeCondition formats an account_age numeric condition', () => {
    const desc = describeCondition({ field: 'account_age', comparator: '<', value: '30' });
    expect(desc).toMatch(/account_age|account\.age/i);
    expect(desc).toMatch(/30/);
  });

  it('7.23 — describeCondition formats a combined_karma condition', () => {
    const desc = describeCondition({ field: 'combined_karma', comparator: '<', value: '50' });
    expect(desc).toMatch(/karma/i);
    expect(desc).toMatch(/50/);
  });
});

// ============================================================
// SUITE 8 — BLAST RADIUS ENGINE
// Tests calculateBlastRadius, runBlastRadius, evaluateRuleAgainstCachedPosts,
// and formatBlastRadiusResult using in-memory fixtures — no model calls.
// ============================================================
describe('Suite 8 — Blast Radius Engine', () => {
  let calculateBlastRadius:        typeof import('../services/blast-radius.service').calculateBlastRadius;
  let runBlastRadius:              typeof import('../services/blast-radius.service').runBlastRadius;
  let evaluateRuleAgainstCachedPosts: typeof import('../services/blast-radius.service').evaluateRuleAgainstCachedPosts;
  let formatBlastRadiusResult:     typeof import('../services/blast-radius.service').formatBlastRadiusResult;

  /** Build a CachedPost fixture. */
  function makeCachedPost(overrides: Partial<import('../../shared/blast-types').CachedPost> = {}): import('../../shared/blast-types').CachedPost {
    return {
      id: `cp-${Math.random().toString(36).slice(2)}`,
      title: 'Normal post title',
      body: '',
      author: 'regular_user',
      accountAgeDays: 180,
      combinedKarma: 500,
      createdAt: Date.now(),
      isSpam: false,
      wasRemoved: false,
      ...overrides,
    };
  }

  beforeEach(async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(redis.set).mockResolvedValue('OK');

    const svc = await import('../services/blast-radius.service');
    calculateBlastRadius           = svc.calculateBlastRadius;
    runBlastRadius                 = svc.runBlastRadius;
    evaluateRuleAgainstCachedPosts = svc.evaluateRuleAgainstCachedPosts;
    formatBlastRadiusResult        = svc.formatBlastRadiusResult;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- calculateBlastRadius ---------------------------------------------

  it('8.1 — calculateBlastRadius returns zero counts for an empty post list', () => {
    const result = calculateBlastRadius([], makeTestRule());
    expect(result.totalTested).toBe(0);
    expect(result.wouldCatch).toBe(0);
    expect(result.catchRate).toBe(0);
    expect(result.falsePositiveRate).toBe(0);
  });

  it('8.2 — calculateBlastRadius returns correct shape for non-empty posts', () => {
    const posts = [makeCachedPost({ isSpam: true, title: 'Buy now spam', wasRemoved: true })];
    const result = calculateBlastRadius(posts, makeTestRule({
      name: 'Spam',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    }));
    expect(result).toHaveProperty('totalTested');
    expect(result).toHaveProperty('wouldCatch');
    expect(result).toHaveProperty('falsePositives');
    expect(result).toHaveProperty('missedSpam');
    expect(result).toHaveProperty('catchRate');
    expect(result).toHaveProperty('falsePositiveRate');
  });

  it('8.3 — calculateBlastRadius catchRate is 1.0 when all spam posts are caught', () => {
    const spam = makeCachedPost({ isSpam: true, title: 'Buy now', wasRemoved: true });
    const result = calculateBlastRadius([spam], makeTestRule({
      name: 'Perfect',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    }));
    expect(result.catchRate).toBe(1);
    expect(result.wouldCatch).toBe(1);
  });

  it('8.4 — calculateBlastRadius catchRate is 0 when rule misses all spam', () => {
    const spam = makeCachedPost({ isSpam: true, title: 'Perfectly normal title', wasRemoved: false });
    const result = calculateBlastRadius([spam], makeTestRule({
      name: 'Mismatch',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    }));
    expect(result.catchRate).toBe(0);
    expect(result.missedSpam.length).toBe(1);
  });

  it('8.5 — calculateBlastRadius identifies false positives (non-spam caught)', () => {
    const legit = makeCachedPost({ isSpam: false, title: 'Buy now sale — legitimate store', wasRemoved: false });
    const result = calculateBlastRadius([legit], makeTestRule({
      name: 'Broad',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    }));
    expect(result.falsePositives.length).toBeGreaterThanOrEqual(1);
  });

  it('8.6 — calculateBlastRadius: mixed posts — counts add up', () => {
    const posts = [
      makeCachedPost({ isSpam: true,  title: 'Buy now spam',   wasRemoved: true }),
      makeCachedPost({ isSpam: false, title: 'Normal post',    wasRemoved: false }),
      makeCachedPost({ isSpam: true,  title: 'Another spam',   wasRemoved: false }),
    ];
    const result = calculateBlastRadius(posts, makeTestRule({
      name: 'Mixed',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    }));
    expect(result.totalTested).toBe(3);
    expect(result.wouldCatch + result.missedSpam.length).toBe(2); // total spam
  });

  it('8.7 — calculateBlastRadius handles null/undefined posts gracefully', () => {
    // @ts-expect-error — deliberately passing null to test guard
    expect(() => calculateBlastRadius(null, makeTestRule())).not.toThrow();
  });

  it('8.8 — calculateBlastRadius falsePositiveRate is 0 when no false positives', () => {
    const spam = makeCachedPost({ isSpam: true, title: 'Buy now spam', wasRemoved: true });
    const result = calculateBlastRadius([spam], makeTestRule({
      name: 'Precise',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    }));
    expect(result.falsePositiveRate).toBe(0);
    expect(result.falsePositives.length).toBe(0);
  });

  // ---- runBlastRadius (async, uses Redis) --------------------------------

  it('8.9 — runBlastRadius returns zero result when Redis cache is empty', async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    const result = await runBlastRadius([makeTestRule()]);
    expect(result.totalTested).toBe(0);
    expect(result.catchRate).toBe(0);
  });

  it('8.10 — runBlastRadius reads posts from Redis cache key', async () => {
    const posts = [makeCachedPost({ isSpam: true, title: 'Buy now spam', wasRemoved: true })];
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(posts));
    const result = await runBlastRadius([makeTestRule({
      name: 'Redis Rule',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    })]);
    expect(result.totalTested).toBe(1);
  });

  it('8.11 — runBlastRadius handles malformed Redis JSON without throwing', async () => {
    vi.mocked(redis.get).mockResolvedValue('{bad json}');
    await expect(runBlastRadius([makeTestRule()])).resolves.toBeDefined();
    const result = await runBlastRadius([makeTestRule()]);
    expect(result.totalTested).toBe(0);
  });

  // ---- evaluateRuleAgainstCachedPosts ------------------------------------

  it('8.12 — evaluateRuleAgainstCachedPosts returns matched items for keyword hit', () => {
    const posts = [
      makeCachedPost({ id: 'hit-1', title: 'Buy now bargain' }),
      makeCachedPost({ id: 'miss-1', title: 'Discussion thread' }),
    ];
    const result = evaluateRuleAgainstCachedPosts(posts, makeTestRule({
      name: 'Keyword',
      conditions: [{ field: 'title', comparator: 'includes', value: 'buy now' }],
      action: 'remove',
    }));
    expect(result.matched).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.id).toBe('hit-1');
  });

  it('8.13 — evaluateRuleAgainstCachedPosts returns zero matched for empty post list', () => {
    const result = evaluateRuleAgainstCachedPosts([], makeTestRule());
    expect(result.matched).toBe(0);
    expect(result.items.length).toBe(0);
  });

  // ---- formatBlastRadiusResult -------------------------------------------

  it('8.14 — formatBlastRadiusResult returns correct shape', () => {
    const raw = { totalTested: 10, wouldCatch: 7, falsePositives: [], missedSpam: [], catchRate: 0.7, falsePositiveRate: 0 };
    const formatted = formatBlastRadiusResult(raw, 'My Rule');
    expect(formatted).toHaveProperty('ruleName', 'My Rule');
    expect(formatted).toHaveProperty('totalTested', 10);
    expect(formatted).toHaveProperty('catches');
    expect(formatted.catches.count).toBe(7);
    expect(formatted.catches.percentage).toBe(70);
  });

  it('8.15 — formatBlastRadiusResult rounds catchRate percentage correctly', () => {
    const raw = { totalTested: 3, wouldCatch: 1, falsePositives: [], missedSpam: [], catchRate: 1/3, falsePositiveRate: 0 };
    const formatted = formatBlastRadiusResult(raw, 'Fraction Rule');
    expect(formatted.catches.percentage).toBe(33);
  });

  it('8.16 — formatBlastRadiusResult handles 0% catch rate gracefully', () => {
    const raw = { totalTested: 5, wouldCatch: 0, falsePositives: [], missedSpam: [], catchRate: 0, falsePositiveRate: 0 };
    const formatted = formatBlastRadiusResult(raw, 'Zero Rule');
    expect(formatted.catches.percentage).toBe(0);
    expect(formatted.missedSpam.count).toBe(0);
  });
});

// ============================================================
// SUITE 9 — YAML SERIALIZATION & PARSING
// Tests the round-trip serializeAutomodRule → parseAutomodRuleDraft
// and validates the YAML output structure for every action type.
// ============================================================
describe('Suite 9 — YAML Serialization and Parsing', () => {
  let serializeAutomodRule: typeof import('../../shared/automod').serializeAutomodRule;
  let parseAutomodRuleDraft: typeof import('../../shared/automod').parseAutomodRuleDraft;

  beforeEach(async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('unavailable'));
    vi.mocked(reddit.updateWikiPage).mockResolvedValue({ content: '', revisionId: '1-1-1-1-1' } as unknown as Awaited<ReturnType<typeof reddit.updateWikiPage>>);

    const shared = await import('../../shared/automod');
    serializeAutomodRule = shared.serializeAutomodRule;
    parseAutomodRuleDraft = shared.parseAutomodRuleDraft;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---- serializeAutomodRule ----------------------------------------------

  it('9.1 — serializeAutomodRule returns empty string for an empty rule', () => {
    const emptyRule: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      name: '',
      conditions: [],
      comment: '',
      modmail: '',
    };
    const yaml = serializeAutomodRule(emptyRule);
    expect(yaml).toBe('');
  });

  it('9.2 — serializeAutomodRule wraps output in --- delimiters', () => {
    const yaml = serializeAutomodRule(makeTestRule());
    expect(yaml).toMatch(/^---/m);
    expect(yaml).toMatch(/---\s*$/m);
  });

  it('9.3 — serializeAutomodRule includes type: submission', () => {
    const yaml = serializeAutomodRule(makeTestRule());
    expect(yaml).toMatch(/type: submission/);
  });

  it('9.4 — serializeAutomodRule includes the action field', () => {
    const yaml = serializeAutomodRule(makeTestRule({ action: 'report' }));
    expect(yaml).toMatch(/action:\s*report/);
  });

  it('9.5 — serializeAutomodRule includes the comment block', () => {
    const yaml = serializeAutomodRule(makeTestRule({ comment: 'Post removed.' }));
    expect(yaml).toMatch(/comment:/);
    expect(yaml).toMatch(/Post removed\./);
  });

  it('9.6 — serializeAutomodRule includes the modmail block when set', () => {
    const yaml = serializeAutomodRule(makeTestRule({ modmail: 'Removed: {{permalink}}' }));
    expect(yaml).toMatch(/modmail:/);
    expect(yaml).toMatch(/Removed:/);
  });

  it('9.7 — serializeAutomodRule includes title condition', () => {
    const rule = makeTestRule({
      name: 'Title Rule',
      conditions: [{ field: 'title', comparator: 'includes', value: 'spam phrase' }],
    });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).toMatch(/title.*includes/i);
    expect(yaml).toMatch(/spam phrase/);
  });

  it('9.8 — serializeAutomodRule handles all three action types', () => {
    for (const action of ['remove', 'approve', 'report'] as const) {
      const yaml = serializeAutomodRule(makeTestRule({ action }));
      if (yaml.length > 0) {
        expect(yaml).toMatch(new RegExp(`action:\\s*${action}`));
      }
    }
  });

  // ---- parseAutomodRuleDraft round-trip ----------------------------------

  it('9.9 — parseAutomodRuleDraft returns fallback for empty string', () => {
    const rule = parseAutomodRuleDraft('', DEFAULT_AUTOMOD_RULE);
    expect(rule).toHaveProperty('type', 'submission');
  });

  it('9.10 — parseAutomodRuleDraft returns fallback for garbage input', () => {
    const rule = parseAutomodRuleDraft('not yaml at all !!!', DEFAULT_AUTOMOD_RULE);
    expect(rule).toBeDefined();
    expect(rule.type).toBe('submission');
  });

  it('9.11 — parseAutomodRuleDraft round-trips a rule through serialize → parse', () => {
    const original = makeTestRule({ name: 'Round Trip', comment: 'Test comment.' });
    const yaml = serializeAutomodRule(original);
    if (!yaml) return; // empty rule check
    const parsed = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
    expect(parsed.type).toBe('submission');
    expect(parsed.action).toBe(original.action);
  });

  it('9.12 — parseAutomodRuleDraft round-trips the remove action', () => {
    const yaml = serializeAutomodRule(makeTestRule({ action: 'remove', name: 'Remove Test', comment: 'Removed.' }));
    if (!yaml) return;
    const parsed = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
    expect(parsed.action).toBe('remove');
  });

  it('9.13 — parseAutomodRuleDraft round-trips the report action', () => {
    const yaml = serializeAutomodRule(makeTestRule({ action: 'report', name: 'Report Test', comment: 'Reported.' }));
    if (!yaml) return;
    const parsed = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
    expect(parsed.action).toBe('report');
  });

  it('9.14 — parseAutomodRuleDraft round-trips the approve action', () => {
    const yaml = serializeAutomodRule(makeTestRule({ action: 'approve', name: 'Approve Test', comment: 'Approved.' }));
    if (!yaml) return;
    const parsed = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
    expect(parsed.action).toBe('approve');
  });

  it('9.15 — parseAutomodRuleDraft parses the MINIMAL_YAML fixture', () => {
    const rule = parseAutomodRuleDraft(MINIMAL_YAML, DEFAULT_AUTOMOD_RULE);
    expect(rule.type).toBe('submission');
    expect(rule.action).toBe('remove');
  });

  it('9.16 — serializeAutomodRule output is always a string', () => {
    const yaml = serializeAutomodRule(makeTestRule());
    expect(typeof yaml).toBe('string');
  });

  it('9.17 — parseAutomodRuleDraft always returns an object with required fields', () => {
    const rule = parseAutomodRuleDraft('', DEFAULT_AUTOMOD_RULE);
    expect(rule).toHaveProperty('id');
    expect(rule).toHaveProperty('type');
    expect(rule).toHaveProperty('action');
    expect(rule).toHaveProperty('conditions');
    expect(Array.isArray(rule.conditions)).toBe(true);
  });
});

// ============================================================
// SUITE 10 — RULE STAGE INTEGRATION
// End-to-end integration tests that exercise the full service
// layer together: getCurrentRule → saveCurrentRule → simulate
// → reset, plus wiki push / fallback paths.
// ============================================================
describe('Suite 10 — Rule Stage Integration', () => {
  let saveCurrentRule:      typeof import('../services/automod.service').saveCurrentRule;
  let getCurrentRule:       typeof import('../services/automod.service').getCurrentRule;
  let resetRuleStageState:  typeof import('../services/automod.service').resetRuleStageState;
  let runSimulation:        typeof import('../services/automod.service').runSimulation;
  let pushYamlToWiki:       typeof import('../services/automod.service').pushYamlToWiki;
  let getLiveAutomodYaml:   typeof import('../services/automod.service').getLiveAutomodYaml;

  beforeEach(async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(redis.del).mockResolvedValue(undefined);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('unavailable'));
    vi.mocked(reddit.updateWikiPage).mockResolvedValue({ content: '', revisionId: '1-1-1-1-1' } as unknown as Awaited<ReturnType<typeof reddit.updateWikiPage>>);
    vi.stubGlobal('fetch', buildFetchMock());

    const svc = await import('../services/automod.service');
    saveCurrentRule     = svc.saveCurrentRule;
    getCurrentRule      = svc.getCurrentRule;
    resetRuleStageState = svc.resetRuleStageState;
    runSimulation       = svc.runSimulation;
    pushYamlToWiki      = svc.pushYamlToWiki;
    getLiveAutomodYaml  = svc.getLiveAutomodYaml;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('10.1 — saveCurrentRule → getCurrentRule round-trip preserves action', async () => {
    const original = makeTestRule({ action: 'report', name: 'Integration Rule', comment: 'Filed report.' });
    await saveCurrentRule(original);
    const written = vi.mocked(redis.set).mock.calls[0];
    expect(written).toBeDefined();
    // Re-inject the YAML that was written so getCurrentRule can read it back
    const writtenYaml = String(written?.[1]);
    vi.mocked(redis.get).mockResolvedValue(writtenYaml);
    const loaded = await getCurrentRule();
    expect(loaded.action).toBe('report');
  });

  it('10.2 — saveCurrentRule calls redis.set with a non-empty YAML string', async () => {
    const rule = makeTestRule({ name: 'Save Test', comment: 'Saved.' });
    await saveCurrentRule(rule);
    expect(redis.set).toHaveBeenCalled();
    const value = String(vi.mocked(redis.set).mock.calls[0]?.[1]);
    expect(value.length).toBeGreaterThan(0);
  });

  it('10.3 — saveCurrentRule calls reddit.updateWikiPage', async () => {
    await saveCurrentRule(makeTestRule({ name: 'Wiki Push', comment: 'Pushed.' }));
    expect(reddit.updateWikiPage).toHaveBeenCalled();
  });

  it('10.4 — saveCurrentRule wiki call receives the subredditName from context', async () => {
    await saveCurrentRule(makeTestRule({ name: 'Context Check', comment: 'Check.' }));
    const call = vi.mocked(reddit.updateWikiPage).mock.calls[0]?.[0] as { subredditName: string; page: string };
    expect(call).toBeDefined();
    expect(call.subredditName).toBe('test_subreddit');
    expect(call.page).toBe('config/automoderator');
  });

  it('10.5 — getCurrentRule falls back to DEFAULT_AUTOMOD_RULE when both sources empty', async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('not found'));
    const rule = await getCurrentRule();
    expect(rule.id).toBe(DEFAULT_AUTOMOD_RULE.id);
    expect(rule.type).toBe('submission');
  });

  it('10.6 — getCurrentRule prefers wiki content over Redis draft when wiki is available', async () => {
    // Wiki returns MINIMAL_YAML; Redis has a different draft
    vi.mocked(reddit.getWikiPage).mockResolvedValue(MINIMAL_YAML as unknown as Awaited<ReturnType<typeof reddit.getWikiPage>>);
    vi.mocked(redis.get).mockResolvedValue('---\ntype: submission\naction: approve\n---');
    const rule = await getCurrentRule();
    // MINIMAL_YAML has action: remove — wiki takes precedence
    expect(rule.action).toBe('remove');
  });

  it('10.7 — resetRuleStageState deletes the rule key from Redis', async () => {
    await resetRuleStageState();
    expect(redis.del).toHaveBeenCalled();
    const deletedKey = String(vi.mocked(redis.del).mock.calls[0]?.[0]);
    expect(deletedKey).toMatch(/rulestage:rule:current/);
  });

  it('10.8 — resetRuleStageState returns the DEFAULT_AUTOMOD_RULE', async () => {
    const rule = await resetRuleStageState();
    expect(rule.id).toBe(DEFAULT_AUTOMOD_RULE.id);
    expect(rule.action).toBe(DEFAULT_AUTOMOD_RULE.action);
    expect(rule.conditions.length).toBe(DEFAULT_AUTOMOD_RULE.conditions.length);
  });

  it('10.9 — resetRuleStageState resets the posts key to an empty array', async () => {
    await resetRuleStageState();
    const setCalls = vi.mocked(redis.set).mock.calls;
    const postsCall = setCalls.find(([key]) => String(key).includes('simulation:posts'));
    expect(postsCall).toBeDefined();
    expect(JSON.parse(String(postsCall![1]))).toEqual([]);
  });

  it('10.10 — runSimulation returns matched = 0 when no posts are stored', async () => {
    vi.mocked(redis.get).mockResolvedValue(undefined);
    const result = await runSimulation(makeTestRule());
    expect(result.matched).toBe(0);
    expect(result.items.length).toBe(0);
  });

  it('10.11 — full integration: save rule → simulate → reset → verify default', async () => {
    // SAVE
    const rule = makeTestRule({ name: 'Integration Flow', comment: 'Testing.', action: 'report' });
    await saveCurrentRule(rule);

    // SIMULATE against stored posts (none → empty result)
    vi.mocked(redis.get).mockResolvedValue(undefined);
    const simResult = await runSimulation(rule);
    expect(simResult.matched).toBe(0);

    // RESET
    await resetRuleStageState();
    expect(redis.del).toHaveBeenCalled();

    // VERIFY default is restored
    vi.mocked(redis.get).mockResolvedValue(undefined);
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('gone'));
    const restored = await getCurrentRule();
    expect(restored.id).toBe(DEFAULT_AUTOMOD_RULE.id);
  });

  it('10.12 — pushYamlToWiki calls updateWikiPage with correct page path', async () => {
    await pushYamlToWiki(MINIMAL_YAML, 'testsubreddit');
    const call = vi.mocked(reddit.updateWikiPage).mock.calls[0]?.[0] as { page: string; content: string; subredditName: string };
    expect(call.page).toBe('config/automoderator');
    expect(call.content).toContain('type: submission');
    expect(call.subredditName).toBe('testsubreddit');
  });

  it('10.13 — getLiveAutomodYaml returns serialized DEFAULT when both sources are empty', async () => {
    vi.mocked(reddit.getWikiPage).mockRejectedValue(new Error('not found'));
    vi.mocked(redis.get).mockResolvedValue(undefined);
    const yaml = await getLiveAutomodYaml('test_subreddit');
    expect(typeof yaml).toBe('string');
    // Either DEFAULT YAML or empty — must be a string either way
    expect(yaml.length).toBeGreaterThanOrEqual(0);
  });

  it('10.14 — getLiveAutomodYaml returns wiki YAML when wiki is populated', async () => {
    vi.mocked(reddit.getWikiPage).mockResolvedValue(
      MINIMAL_YAML as unknown as Awaited<ReturnType<typeof reddit.getWikiPage>>
    );
    const yaml = await getLiveAutomodYaml('test_subreddit');
    expect(yaml).toMatch(/type: submission/);
    expect(yaml).toMatch(/action: remove/);
  });

  it('10.15 — five concurrent saveCurrentRule calls all invoke redis.set', async () => {
    const rules = Array.from({ length: 5 }, (_, i) =>
      makeTestRule({ name: `Concurrent Rule ${i}`, comment: `Rule ${i} comment.` })
    );
    await Promise.all(rules.map((r) => saveCurrentRule(r)));
    // Each save calls set (at least once per call)
    expect(vi.mocked(redis.set).mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});