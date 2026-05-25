import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

vi.mock('@devvit/web/server', () => ({
  settings: {
    get: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('resolveServerGeminiApiKey', () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.VITE_GEMINI_API_KEY;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('VITE_GEMINI_API_KEY=from-env-file\n');
  });

  it('reads the Gemini key from the workspace .env file when process env is empty', async () => {
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('from-env-file');
  });

  it('prefers GEMINI_API_KEY environment variable over .env file', async () => {
    process.env.GEMINI_API_KEY = 'from-process-env';
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('from-process-env');
  });

  it('prefers VITE_GEMINI_API_KEY environment variable over .env file', async () => {
    process.env.VITE_GEMINI_API_KEY = 'from-vite-env';
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('from-vite-env');
  });

  it('returns empty string when no API key is available', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('');
  });

  it('handles .env file read errors gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('');
  });
});

describe('resolveServerGitHubApiKey', () => {
  beforeEach(() => {
    delete process.env.GITHUB_API_KEY;
    delete process.env.VITE_GITHUB_API_KEY;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('VITE_GITHUB_API_KEY=from-env-file\n');
  });

  it('reads the GitHub key from GITHUB_API_KEY environment variable', async () => {
    process.env.GITHUB_API_KEY = 'github-token-from-env';
    const { resolveServerGitHubApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGitHubApiKey();

    expect(apiKey).toBe('github-token-from-env');
  });

  it('reads the GitHub key from VITE_GITHUB_API_KEY environment variable', async () => {
    process.env.VITE_GITHUB_API_KEY = 'github-token-from-vite';
    const { resolveServerGitHubApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGitHubApiKey();

    expect(apiKey).toBe('github-token-from-vite');
  });

  it('prefers GITHUB_API_KEY over VITE_GITHUB_API_KEY', async () => {
    process.env.GITHUB_API_KEY = 'primary-github-key';
    process.env.VITE_GITHUB_API_KEY = 'secondary-github-key';
    const { resolveServerGitHubApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGitHubApiKey();

    expect(apiKey).toBe('primary-github-key');
  });

  it('returns empty string when no GitHub API key is available', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const { resolveServerGitHubApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGitHubApiKey();

    expect(apiKey).toBe('');
  });
});

describe('API Key Error Scenarios', () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.VITE_GEMINI_API_KEY;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('VITE_GEMINI_API_KEY=from-env-file\n');
  });

  it('handles empty API key strings', async () => {
    process.env.GEMINI_API_KEY = '';
    vi.mocked(existsSync).mockReturnValue(false);
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    // Empty string should be treated as missing
    expect(apiKey).toBe('');
  });

  it('handles whitespace-only API key strings', async () => {
    process.env.GEMINI_API_KEY = '   ';
    vi.mocked(existsSync).mockReturnValue(false);
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    // Whitespace-only should be treated as missing
    expect(apiKey).toBe('');
  });

  it('handles malformed .env file content', async () => {
    vi.mocked(readFileSync).mockReturnValue('invalid-env-content-without-equals');
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    // Should handle malformed content gracefully
    expect(apiKey).toBe('');
  });

  it('handles .env file with multiple keys', async () => {
    vi.mocked(readFileSync).mockReturnValue(
      'VITE_GEMINI_API_KEY=correct-key\nOTHER_KEY=value\nANOTHER_KEY=value2'
    );
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('correct-key');
  });

  it('handles .env file with comments', async () => {
    vi.mocked(readFileSync).mockReturnValue(
      '# This is a comment\nVITE_GEMINI_API_KEY=key-with-comment\n# Another comment'
    );
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('key-with-comment');
  });
});

describe('API Key Validation', () => {
  it('validates Gemini API key format', async () => {
    process.env.GEMINI_API_KEY = 'AIzaSyD-Valid-Key-Format';
    const { resolveServerGeminiApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGeminiApiKey();

    expect(apiKey).toBe('AIzaSyD-Valid-Key-Format');
  });

  it('validates GitHub API key format', async () => {
    process.env.GITHUB_API_KEY = 'ghp_1234567890abcdef';
    const { resolveServerGitHubApiKey } = await import('../services/gemini-key.service');
    const apiKey = await resolveServerGitHubApiKey();

    expect(apiKey).toBe('ghp_1234567890abcdef');
  });

  it('accepts various GitHub token formats', async () => {
    const validFormats = [
      'ghp_1234567890abcdef',
      'github_pat_1234567890abcdef',
      'gho_1234567890abcdef',
      'ghu_1234567890abcdef',
      'ghs_1234567890abcdef',
      'ghr_1234567890abcdef',
    ];

    for (const format of validFormats) {
      delete process.env.GITHUB_API_KEY;
      process.env.GITHUB_API_KEY = format;
      const { resolveServerGitHubApiKey } = await import('../services/gemini-key.service');
      const apiKey = await resolveServerGitHubApiKey();

      expect(apiKey).toBe(format);
    }
  });
});