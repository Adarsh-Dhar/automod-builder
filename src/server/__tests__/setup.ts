import { vi } from 'vitest';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-key-for-unit-tests';

// Minimal global mocks for server-side Devvit APIs used by services/tests
vi.mock('@devvit/web/server', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(null),
  },
  reddit: {
    getPostById: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(null),
  },
  context: {
    subredditName: 'testsub',
  },
}));

// Provide a noop performance object if missing (node v18+ has it, but keep safe)
if (typeof (globalThis as any).performance === 'undefined') {
  (globalThis as any).performance = { now: () => Date.now() };
}

// Mock global fetch (Gemini API) to avoid network calls in tests.
vi.stubGlobal('fetch', vi.fn(async (url: string, options: any) => {
  const body = options?.body ? JSON.parse(options.body) : null;
  const promptText = body?.contents?.[0]?.parts?.[0]?.text ?? '';
  const lower = String(promptText).toLowerCase();
  // Prefer analyzing only the moderator's request section when available
  const marker = 'moderator request:';
  const markerIndex = lower.lastIndexOf(marker);
  const userRequest = markerIndex >= 0 ? lower.slice(markerIndex + marker.length).trim() : lower;

  // Simple heuristic responses depending on prompt content
  let parsed: any;
  
  // Detect generation prompts (these ask for TypeScript trigger code)
  const isGenerationPrompt = /generat(e|ing)|typescript trigger|onPostSubmit|devvit typescript/i.test(promptText);

  if (isGenerationPrompt) {
    if (/\b(machine learning|ml|model|predict|train)\b/i.test(userRequest)) {
      parsed = {
        code: 'export const onPostSubmit = async (event, context) => { const res = await fetch("https://model.api/predict", { method: "POST" }); /* mocked ML call */ }',
        description: 'Mocked ML-backed trigger that calls external model API',
        limitations: ['external-api'],
        confidence: 'high',
      };
    } else if (/\b(dynamic|configuration|config|feature flag)\b/i.test(userRequest)) {
      parsed = {
        code: 'export const onPostSubmit = async (event, context) => { const config = await redis.get("moderation-config"); /* mocked dynamic config usage */ }',
        description: 'Mocked dynamic-config trigger that reads from Redis',
        limitations: ['database-check'],
        confidence: 'high',
      };
    } else {
      parsed = {
        code: 'export const onPostSubmit = async (event, context) => { /* mocked trigger */ }',
        description: 'Mocked generated trigger for testing',
        limitations: ['mocked-limitation'],
        confidence: 'high',
      };
    }
  } else if (userRequest.length > 0) {
    if (/(\bexternal\b|\bapi\b|\burl\b)/i.test(userRequest)) {
      parsed = {
        hasLimitation: true,
        limitation: 'external-api',
        explanation: 'Mocked external API limitation detected',
        recommendation: 'typescript',
      };
    } else if (/\bjson\b/i.test(userRequest)) {
      parsed = {
        hasLimitation: true,
        limitation: 'json-parsing',
        explanation: 'Mocked JSON parsing limitation detected',
        recommendation: 'typescript',
      };
    } else if (/(\bredis\b|\bdatabase\b|\bdb\b)/i.test(userRequest)) {
      parsed = {
        hasLimitation: true,
        limitation: 'database-check',
        explanation: 'Mocked database limitation detected',
        recommendation: 'typescript',
      };
    } else if (/\b(machine learning|ml|model|neural network|predict|train)\b/i.test(userRequest)) {
      parsed = {
        hasLimitation: true,
        limitation: 'other',
        explanation: 'Mocked ML-based limitation detected',
        recommendation: 'typescript',
      };
    } else if (/\b(dynamic|configuration|config|feature flag)\b/i.test(userRequest)) {
      parsed = {
        hasLimitation: true,
        limitation: 'state-management',
        explanation: 'Mocked dynamic configuration limitation detected',
        recommendation: 'typescript',
      };
    } else {
      parsed = {
        hasLimitation: false,
        limitation: null,
        explanation: 'Mocked: YAML is capable for this request',
        recommendation: 'yaml',
      };
    }
  } else {
    // Code generation style response
    parsed = {
      code: 'export const onPostSubmit = async (event, context) => { /* mocked trigger */ }',
      description: 'Mocked generated trigger for testing',
      limitations: ['mocked-limitation'],
      confidence: 'high',
    };
  }

  const responseBody = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify(parsed),
            },
          ],
        },
      },
    ],
  };

  // no-op in tests (mocked)

  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(responseBody),
    json: async () => responseBody,
  } as unknown as Response;
}));
