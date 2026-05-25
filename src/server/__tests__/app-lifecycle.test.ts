/**
 * APP LIFECYCLE TESTS
 *
 * This test suite validates the app install/uninstall/reinstall lifecycle.
 * Tests ensure proper initialization, cleanup, and state management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @devvit/web/server before importing
const { mockRedisGet, mockRedisSet, mockRedisDel, mockUpdateWikiPage, mockGetWikiPage } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockUpdateWikiPage: vi.fn(),
  mockGetWikiPage: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  },
  reddit: {
    updateWikiPage: mockUpdateWikiPage,
    getWikiPage: mockGetWikiPage,
  },
  context: {
    get subredditName() { return currentSubreddit; },
  },
}));

// Track which subreddit context is active
let currentSubreddit = 'test-subreddit';

// Import after mock is registered
import { triggers } from '../../server/routes/triggers';
import { DEFAULT_AUTOMOD_RULE, serializeAutomodRule } from '../../shared/automod';

beforeEach(() => {
  vi.clearAllMocks();
  currentSubreddit = 'test-subreddit';
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(null);
  mockRedisDel.mockResolvedValue(null);
  mockUpdateWikiPage.mockResolvedValue(undefined);
  mockGetWikiPage.mockResolvedValue(null);
});

describe('App Installation Lifecycle', () => {
  it('should initialize Redis keys on first install', async () => {
    // Simulate first-time install (no existing keys)
    mockRedisGet.mockResolvedValue(null);

    const response = await triggers.request('/on-install', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    // Verify Redis.set was called for both rule and posts keys
    expect(mockRedisSet).toHaveBeenCalledTimes(2);

    // Verify the rule key was initialized with default rule
    const ruleSetCall = mockRedisSet.mock.calls.find((call: any[]) => 
      call[0].includes('rulestage:rule:current')
    );
    expect(ruleSetCall).toBeTruthy();
    expect(ruleSetCall[1]).toContain('# Default rule');

    // Verify the posts key was initialized with empty array
    const postsSetCall = mockRedisSet.mock.calls.find((call: any[]) => 
      call[0].includes('rulestage:simulation:posts')
    );
    expect(postsSetCall).toBeTruthy();
    expect(postsSetCall[1]).toBe('[]');
  });

  it('should preserve existing keys on reinstall', async () => {
    // Simulate reinstall (keys already exist)
    const existingRule = serializeAutomodRule({
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Existing rule',
    });
    const existingPosts = JSON.stringify([{ id: 'post1', title: 'Test' }]);

    mockRedisGet
      .mockResolvedValueOnce(existingRule) // rule key
      .mockResolvedValueOnce(existingPosts); // posts key

    const response = await triggers.request('/on-install', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    // Verify Redis.set was NOT called (preserving existing data)
    expect(mockRedisSet).toHaveBeenCalledTimes(0);
  });

  it('should handle mixed state (one key exists, one does not)', async () => {
    // Simulate partial state (rule exists, posts does not)
    const existingRule = serializeAutomodRule({
      ...DEFAULT_AUTOMOD_RULE,
      name: 'Existing rule',
    });

    mockRedisGet
      .mockResolvedValueOnce(existingRule) // rule key exists
      .mockResolvedValueOnce(null); // posts key does not exist

    const response = await triggers.request('/on-install', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    // Verify only posts key was initialized
    expect(mockRedisSet).toHaveBeenCalledTimes(1);
    const postsSetCall = mockRedisSet.mock.calls.find((call: any[]) => 
      call[0].includes('rulestage:simulation:posts')
    );
    expect(postsSetCall).toBeTruthy();
  });

  it('should use correct subreddit context', async () => {
    currentSubreddit = 'different-subreddit';
    mockRedisGet.mockResolvedValue(null);

    const response = await triggers.request('/on-install', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    // Verify keys are scoped to the correct subreddit
    const ruleSetCall = mockRedisSet.mock.calls.find((call: any[]) => 
      call[0].includes('different-subreddit')
    );
    expect(ruleSetCall).toBeTruthy();
  });
});

describe('App Uninstallation Lifecycle', () => {
  it('should clean up Redis keys on uninstall', async () => {
    const response = await triggers.request('/on-uninstall', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    // Verify Redis.del was called for both keys
    expect(mockRedisDel).toHaveBeenCalledTimes(2);

    // Verify the correct keys were deleted
    const deleteCalls = mockRedisDel.mock.calls.map((call: any[]) => call[0]);
    expect(deleteCalls.some((key: string) => key.includes('rulestage:rule:current'))).toBe(true);
    expect(deleteCalls.some((key: string) => key.includes('rulestage:simulation:posts'))).toBe(true);
  });

  it('should not modify wiki on uninstall', async () => {
    const response = await triggers.request('/on-uninstall', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    // Verify wiki was NOT touched
    expect(mockUpdateWikiPage).not.toHaveBeenCalled();
    expect(mockGetWikiPage).not.toHaveBeenCalled();
  });

  it('should handle errors gracefully during cleanup', async () => {
    // Simulate Redis error during deletion
    mockRedisDel.mockRejectedValue(new Error('Redis connection failed'));

    const response = await triggers.request('/on-uninstall', {
      method: 'POST',
    });

    // Should still return 200 even if cleanup fails
    expect(response.status).toBe(200);
  });

  it('should use correct subreddit context for cleanup', async () => {
    currentSubreddit = 'cleanup-test-subreddit';

    const response = await triggers.request('/on-uninstall', {
      method: 'POST',
    });

    expect(response.status).toBe(200);

    // Verify keys are scoped to the correct subreddit
    const deleteCalls = mockRedisDel.mock.calls.map((call: any[]) => call[0]);
    expect(deleteCalls.some((key: string) => key.includes('cleanup-test-subreddit'))).toBe(true);
  });
});

describe('Reinstallation Scenarios', () => {
  it('should handle install-uninstall-reinstall cycle', async () => {
    // Step 1: Install
    mockRedisGet.mockResolvedValue(null);
    await triggers.request('/on-install', { method: 'POST' });
    expect(mockRedisSet).toHaveBeenCalledTimes(2);

    // Step 2: Uninstall
    vi.clearAllMocks();
    await triggers.request('/on-uninstall', { method: 'POST' });
    expect(mockRedisDel).toHaveBeenCalledTimes(2);

    // Step 3: Reinstall
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    await triggers.request('/on-install', { method: 'POST' });
    expect(mockRedisSet).toHaveBeenCalledTimes(2);

    // Verify reinitialization happened
    const ruleSetCall = mockRedisSet.mock.calls.find((call: any[]) => 
      call[0].includes('rulestage:rule:current')
    );
    expect(ruleSetCall).toBeTruthy();
  });

  it('should preserve wiki rules through reinstall cycle', async () => {
    // Install
    mockRedisGet.mockResolvedValue(null);
    await triggers.request('/on-install', { method: 'POST' });

    // Uninstall (should not touch wiki)
    vi.clearAllMocks();
    await triggers.request('/on-uninstall', { method: 'POST' });
    expect(mockUpdateWikiPage).not.toHaveBeenCalled();

    // Reinstall (should not touch wiki)
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    await triggers.request('/on-install', { method: 'POST' });
    expect(mockUpdateWikiPage).not.toHaveBeenCalled();
  });
});

describe('Multi-Subreddit Isolation', () => {
  it('should keep subreddit data separate', async () => {
    // Install in subreddit A
    currentSubreddit = 'subreddit-a';
    mockRedisGet.mockResolvedValue(null);
    await triggers.request('/on-install', { method: 'POST' });

    const subredditACalls = mockRedisSet.mock.calls.filter((call: any[]) => 
      call[0].includes('subreddit-a')
    );
    expect(subredditACalls.length).toBe(2);

    // Install in subreddit B
    vi.clearAllMocks();
    currentSubreddit = 'subreddit-b';
    mockRedisGet.mockResolvedValue(null);
    await triggers.request('/on-install', { method: 'POST' });

    const subredditBCalls = mockRedisSet.mock.calls.filter((call: any[]) => 
      call[0].includes('subreddit-b')
    );
    expect(subredditBCalls.length).toBe(2);

    // Verify no cross-contamination
    expect(mockRedisSet.mock.calls.every((call: any[]) => 
      call[0].includes('subreddit-a') || call[0].includes('subreddit-b')
    )).toBe(true);
  });

  it('should uninstall from one subreddit without affecting others', async () => {
    // Install in both subreddits
    currentSubreddit = 'subreddit-a';
    mockRedisGet.mockResolvedValue(null);
    await triggers.request('/on-install', { method: 'POST' });

    vi.clearAllMocks();
    currentSubreddit = 'subreddit-b';
    mockRedisGet.mockResolvedValue(null);
    await triggers.request('/on-install', { method: 'POST' });

    // Uninstall from subreddit A only
    vi.clearAllMocks();
    currentSubreddit = 'subreddit-a';
    await triggers.request('/on-uninstall', { method: 'POST' });

    // Verify only subreddit A keys were deleted
    const deleteCalls = mockRedisDel.mock.calls.map((call: any[]) => call[0]);
    expect(deleteCalls.every((key: string) => key.includes('subreddit-a'))).toBe(true);
    expect(deleteCalls.some((key: string) => key.includes('subreddit-b'))).toBe(false);
  });
});

describe('Error Handling', () => {
  it('should handle Redis errors during install', async () => {
    mockRedisGet.mockRejectedValue(new Error('Redis connection failed'));

    const response = await triggers.request('/on-install', {
      method: 'POST',
    });

    // Should still return 200 even if Redis fails
    expect(response.status).toBe(200);
  });

  it('should handle missing subreddit context', async () => {
    currentSubreddit = 'default'; // Invalid context

    const response = await triggers.request('/on-install', {
      method: 'POST',
    });

    // Should still handle gracefully
    expect(response.status).toBe(200);
  });

  it('should handle serialization errors during install', async () => {
    mockRedisGet.mockResolvedValue(null);
    // Mock the import to fail serialization
    vi.doMock('../../shared/automod', () => ({
      DEFAULT_AUTOMOD_RULE: {},
      serializeAutomodRule: () => {
        throw new Error('Serialization failed');
      },
    }));

    const response = await triggers.request('/on-install', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
  });
});
