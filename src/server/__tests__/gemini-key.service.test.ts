import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@devvit/web/server', () => ({
  settings: {
    get: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('VITE_GEMINI_API_KEY=from-env-file\n'),
}));

describe('resolveServerGeminiApiKey', () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.VITE_GEMINI_API_KEY;
  });

  it('reads the Gemini key from the workspace .env file when process env is empty', async () => {
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('from-env-file');
  });
});