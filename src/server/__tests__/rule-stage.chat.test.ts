import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/gemini-key.service', () => ({
  resolveServerGeminiApiKey: vi.fn(async () => 'test-api-key'),
}));

describe('generateChatReplyOnServer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prepends the AutoModerator instruction prompt and keeps only the latest history turns', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '```yaml\n---\n# generated rule\ntype: submission\n---\n```' }],
            },
          },
        ],
      }),
    }));

    vi.stubGlobal('fetch', fetchMock);

    const { generateChatReplyOnServer } = await import('../routes/rule-stage');

    const history: Array<{ role: 'user' | 'model'; content: string }> = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('model' as const),
      content: `history-${index + 1}`,
    }));

    const response = await generateChatReplyOnServer('Create a rule for spam', history, 'Subreddit context goes here');

    expect(response).toContain('# generated rule');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body)) as {
      contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
      generationConfig: { temperature: number; maxOutputTokens: number };
    };

    expect(body.generationConfig.temperature).toBe(0.1);
    expect(body.contents[0]).toMatchObject({ role: 'user' });
    expect(body.contents[0]?.parts?.[0]?.text).toContain('AutoModerator rule assistant for Reddit');
    expect(body.contents[1]).toMatchObject({ role: 'model' });
    expect(body.contents[2]?.parts?.[0]?.text).toBe('Subreddit context goes here');
    expect(body.contents[3]).toMatchObject({ role: 'model' });
    expect(body.contents.at(-1)?.parts?.[0]?.text).toBe('Create a rule for spam');

    const historyTexts = body.contents
      .slice(4, -1)
      .map((entry) => entry.parts[0]?.text)
      .filter((text): text is string => typeof text === 'string');

    expect(historyTexts).toEqual([
      'history-3',
      'history-4',
      'history-5',
      'history-6',
      'history-7',
      'history-8',
      'history-9',
      'history-10',
      'history-11',
      'history-12',
    ]);
  });
});
