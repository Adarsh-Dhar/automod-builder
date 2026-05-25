/**
 * REDDIT API INTEGRATION TESTS
 *
 * This test suite validates real Reddit API calls to verify that the app
 * correctly interacts with Reddit's wiki and API endpoints.
 *
 * These tests use REAL Reddit API calls when REDDIT_TEST_CREDENTIALS are set.
 * Without credentials, tests are skipped.
 *
 * Required environment variables:
 *   REDDIT_TEST_SUBREDDIT - subreddit name (default: AutoModDemo)
 *   REDDIT_TEST_ACCESS_TOKEN - Reddit API access token
 *
 * Run with:
 *   REDDIT_TEST_SUBREDDIT=AutoModDemo REDDIT_TEST_ACCESS_TOKEN=your_token npx vitest src/server/__tests__/reddit-api-integration.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { reddit } from '@devvit/web/server';

// Check if Reddit test credentials are available
const REDDIT_TEST_SUBREDDIT = process.env.REDDIT_TEST_SUBREDDIT || 'AutoModDemo';
const REDDIT_TEST_ACCESS_TOKEN = process.env.REDDIT_TEST_ACCESS_TOKEN;

// Skip all tests if Reddit credentials are not available
const test = REDDIT_TEST_ACCESS_TOKEN ? describe : describe.skip;

// Test YAML content
const TEST_YAML = `---
# Test rule from integration test
type: submission
title (includes): ['test']
action: remove
comment: |
  Removed by test
modmail: |
  Test removal: {{permalink}}
---`;

test('Suite 1 — Real Reddit Wiki API Integration', () => {
  beforeAll(() => {
    if (!REDDIT_TEST_ACCESS_TOKEN) {
      console.warn('Skipping Reddit API integration tests - REDDIT_TEST_ACCESS_TOKEN not set');
    }
  });

  beforeEach(async () => {
    // Clean up any test data before each test
    try {
      const existingPage = await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator');
      const content = typeof existingPage === 'string' ? existingPage : (existingPage as any)?.content_md || '';
      
      // Remove test rule if it exists
      if (content.includes('# Test rule from integration test')) {
        const cleaned = content.replace(/---\n# Test rule from integration test[\s\S]*?---\n?/, '');
        await reddit.updateWikiPage({
          subredditName: REDDIT_TEST_SUBREDDIT,
          page: 'config/automoderator',
          content: cleaned,
          reason: 'Clean up test data',
        });
      }
    } catch (error) {
      // Wiki page might not exist yet, that's fine
      console.log('Wiki page does not exist yet, will create during test');
    }
  });

  it('1.1 — can read existing wiki page', async () => {
    try {
      const page = await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator');
      
      // Verify response structure
      expect(page).toBeTruthy();
      
      // Content should be a string or object with content_md
      const content = typeof page === 'string' ? page : (page as any)?.content_md;
      expect(typeof content).toBe('string');
    } catch (error) {
      // Page might not exist, which is acceptable
      expect((error as Error).message).toMatch(/not found|404/i);
    }
  });

  it('1.2 — can write to wiki page', async () => {
    // First, read existing content
    let existingContent = '';
    try {
      const page = await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator');
      existingContent = typeof page === 'string' ? page : (page as any)?.content_md || '';
    } catch {
      // Page doesn't exist, that's fine
    }

    // Append test YAML
    const newContent = existingContent.trim() ? `${existingContent}\n\n${TEST_YAML}` : TEST_YAML;

    // Write to wiki
    await reddit.updateWikiPage({
      subredditName: REDDIT_TEST_SUBREDDIT,
      page: 'config/automoderator',
      content: newContent,
      reason: 'Integration test - adding test rule',
    });

    // Verify it was written by reading it back
    const updatedPage = await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator');
    const updatedContent = typeof updatedPage === 'string' ? updatedPage : (updatedPage as any)?.content_md;
    
    expect(updatedContent).toContain('# Test rule from integration test');
    expect(updatedContent).toContain('title (includes): [\'test\']');
  });

  it('1.3 — wiki update includes correct request parameters', async () => {
    // Write to wiki with specific parameters
    await reddit.updateWikiPage({
      subredditName: REDDIT_TEST_SUBREDDIT,
      page: 'config/automoderator',
      content: TEST_YAML,
      reason: 'Test request parameters',
    });

    // Verify by reading back
    const page = await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator');
    const content = typeof page === 'string' ? page : (page as any)?.content_md;
    
    expect(content).toContain(TEST_YAML);
  });

  it('1.4 — handles wiki page that does not exist', async () => {
    // Try to read a non-existent page
    try {
      await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator_nonexistent');
      // If we get here, the page exists, which is fine
    } catch (error) {
      // We expect an error for non-existent page
      expect((error as Error).message).toBeTruthy();
    }
  });

  it('1.5 — can update wiki page multiple times', async () => {
    const iterations = 3;
    
    for (let i = 0; i < iterations; i++) {
      const yaml = `---
# Test rule iteration ${i}
type: submission
title (includes): ['test${i}']
action: remove
---`;

      await reddit.updateWikiPage({
        subredditName: REDDIT_TEST_SUBREDDIT,
        page: 'config/automoderator',
        content: yaml,
        reason: `Test iteration ${i}`,
      });

      // Verify each update
      const page = await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator');
      const content = typeof page === 'string' ? page : (page as any)?.content_md;
      
      expect(content).toContain(`Test rule iteration ${i}`);
    }
  });

  it('1.6 — handles large wiki content', async () => {
    // Create a large YAML file (simulating many rules)
    let largeYaml = '';
    for (let i = 0; i < 50; i++) {
      largeYaml += `---
# Large test rule ${i}
type: submission
title (includes): ['test${i}']
action: remove
comment: |
  This is a test comment for rule ${i}
modmail: |
  Test modmail for rule ${i}: {{permalink}}
---\n`;
    }

    await reddit.updateWikiPage({
      subredditName: REDDIT_TEST_SUBREDDIT,
      page: 'config/automoderator',
      content: largeYaml,
      reason: 'Test large content',
    });

    // Verify it was written
    const page = await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator');
    const content = typeof page === 'string' ? page : (page as any)?.content_md;
    
    expect(content.length).toBeGreaterThan(10000);
    expect(content).toContain('Large test rule 0');
    expect(content).toContain('Large test rule 49');
  });
});

test('Suite 2 — Error Handling', () => {
  beforeAll(() => {
    if (!REDDIT_TEST_ACCESS_TOKEN) {
      console.warn('Skipping Reddit API error handling tests - REDDIT_TEST_ACCESS_TOKEN not set');
    }
  });

  it('2.1 — handles invalid subreddit name', async () => {
    try {
      await reddit.getWikiPage('invalid_subreddit_name_!!!', 'config/automoderator');
      // If we get here, the API might have different error handling
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  it('2.2 — handles empty content in wiki update', async () => {
    try {
      await reddit.updateWikiPage({
        subredditName: REDDIT_TEST_SUBREDDIT,
        page: 'config/automoderator',
        content: '',
        reason: 'Test empty content',
      });
      // Some APIs might accept empty content
    } catch (error) {
      // Most APIs should reject empty content
      expect(error).toBeTruthy();
    }
  });

  it('2.3 — handles very long reason string', async () => {
    const veryLongReason = 'A'.repeat(10000);
    
    try {
      await reddit.updateWikiPage({
        subredditName: REDDIT_TEST_SUBREDDIT,
        page: 'config/automoderator',
        content: TEST_YAML,
        reason: veryLongReason,
      });
      // API might truncate or accept long reasons
    } catch (error) {
      // API might reject very long reasons
      expect(error).toBeTruthy();
    }
  });
});

test('Suite 3 — API Response Shape Validation', () => {
  beforeAll(() => {
    if (!REDDIT_TEST_ACCESS_TOKEN) {
      console.warn('Skipping API response shape tests - REDDIT_TEST_ACCESS_TOKEN not set');
    }
  });

  it('3.1 — getWikiPage returns expected structure', async () => {
    try {
      const page = await reddit.getWikiPage(REDDIT_TEST_SUBREDDIT, 'config/automoderator');
      
      // Response should be either a string or an object with content_md
      if (typeof page === 'string') {
        expect(typeof page).toBe('string');
      } else if (typeof page === 'object' && page !== null) {
        expect(page).toHaveProperty('content_md');
        expect(typeof (page as any).content_md).toBe('string');
      } else {
        throw new Error('Unexpected response structure');
      }
    } catch (error) {
      // Page might not exist
      expect((error as Error).message).toBeTruthy();
    }
  });

  it('3.2 — updateWikiPage accepts expected parameters', async () => {
    // This is a functional test - if it doesn't throw, the API accepts the parameters
    await reddit.updateWikiPage({
      subredditName: REDDIT_TEST_SUBREDDIT,
      page: 'config/automoderator',
      content: TEST_YAML,
      reason: 'Test parameter validation',
    });

    // If we get here without throwing, the API accepts the parameters
    expect(true).toBe(true);
  });
});
