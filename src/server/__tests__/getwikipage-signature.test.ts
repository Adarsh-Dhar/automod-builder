// src/server/__tests__/getwikipage-signature.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedisGet, mockRedisSet, mockUpdateWikiPage, mockGetWikiPage } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockUpdateWikiPage: vi.fn(),
  mockGetWikiPage: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: { get: mockRedisGet, set: mockRedisSet, del: vi.fn() },
  reddit: { updateWikiPage: mockUpdateWikiPage, getWikiPage: mockGetWikiPage },
  context: { subredditName: 'my-subreddit' },
}));

import { getLiveAutomodYaml, getCurrentRule } from '../../server/services/automod.service';
import { serializeAutomodRule, DEFAULT_AUTOMOD_RULE } from '../../shared/automod';

const AUTOMOD_PAGE = 'config/automoderator';

beforeEach(() => {
  vi.clearAllMocks();
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(null);
  mockUpdateWikiPage.mockResolvedValue(undefined);
  mockGetWikiPage.mockResolvedValue(null);
});

// ─── Positional args: getWikiPage(subredditName, page) ────────────────────────

describe('reddit.getWikiPage call signature', () => {
  it('calls getWikiPage with subredditName as first arg', async () => {
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    await getLiveAutomodYaml('my-subreddit');

    expect(mockGetWikiPage).toHaveBeenCalledOnce();
    const [firstArg] = mockGetWikiPage.mock.calls[0];
    expect(firstArg).toBe('my-subreddit');
  });

  it('calls getWikiPage with "config/automoderator" as second arg', async () => {
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    await getLiveAutomodYaml('my-subreddit');

    const [, secondArg] = mockGetWikiPage.mock.calls[0];
    expect(secondArg).toBe(AUTOMOD_PAGE);
  });

  it('does NOT call getWikiPage with an object (would be a signature regression)', async () => {
    mockGetWikiPage.mockResolvedValue({ content_md: '' });
    await getLiveAutomodYaml('my-subreddit');

    const [firstArg] = mockGetWikiPage.mock.calls[0];
    // If someone refactored to { subredditName, page } this would catch it
    expect(typeof firstArg).toBe('string');
  });

  it('passes the exact subredditName from context to getWikiPage in getCurrentRule', async () => {
    const yaml = serializeAutomodRule({
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Test rule',
      action: 'remove',
      comment: 'x',
      modmail: 'y',
      conditions: [],
    });
    mockGetWikiPage.mockResolvedValue({ content_md: yaml });

    await getCurrentRule();

    const [firstArg, secondArg] = mockGetWikiPage.mock.calls[0];
    expect(firstArg).toBe('my-subreddit'); // matches context.subredditName in mock
    expect(secondArg).toBe(AUTOMOD_PAGE);
  });

  it('uses different subredditName when context changes', async () => {
    // Two separate getLiveAutomodYaml calls with different names
    mockGetWikiPage.mockResolvedValue({ content_md: '' });

    await getLiveAutomodYaml('community-alpha');
    await getLiveAutomodYaml('community-beta');

    expect(mockGetWikiPage.mock.calls[0][0]).toBe('community-alpha');
    expect(mockGetWikiPage.mock.calls[1][0]).toBe('community-beta');
  });
});

// ─── updateWikiPage call signature (object form, already correct) ─────────────

describe('reddit.updateWikiPage call signature', () => {
  it('calls updateWikiPage with an object containing subredditName, page, content, reason', async () => {
    mockGetWikiPage.mockRejectedValue(new Error('not found'));
    const { pushYamlToWiki } = await import('../../server/services/automod.service');
    const yaml = serializeAutomodRule({
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Sig test',
      action: 'remove',
      comment: 'x',
      modmail: 'y',
      conditions: [],
    });

    await pushYamlToWiki(yaml);

    const callArg = mockUpdateWikiPage.mock.calls[0][0];
    expect(callArg).toHaveProperty('subredditName');
    expect(callArg).toHaveProperty('page', AUTOMOD_PAGE);
    expect(callArg).toHaveProperty('content');
    expect(callArg).toHaveProperty('reason');
  });
});
