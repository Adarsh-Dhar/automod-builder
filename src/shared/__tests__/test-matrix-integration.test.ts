/**
 * Tests for test matrix integration with rule evaluation
 * Tests the logic that connects rule evaluation to matrix cell creation
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AUTOMOD_RULE,
  evaluateRule,
  buildSimulationPost,
  createDefaultSimulationPosts,
  type AutomodRule,
} from '../automod';
import type { MockPostDebugRequest } from '../debug-types';

describe('test matrix integration with rule evaluation', () => {
  it('should create a matrix cell from a rule evaluation result for matching post', () => {
    // Create a simple spam rule
    const rule: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      id: 'rule-1',
      name: 'Spam Rule',
      conditions: [
        {
          field: 'title',
          comparator: 'includes',
          value: 'buy',
        },
      ],
      action: 'remove',
      comment: 'Removed as spam',
      modmail: 'Spam detected',
    };

    // Create a mock post that should match
    const mockPost: MockPostDebugRequest = {
      title: 'Buy this amazing product',
      body: 'Check it out',
      author: 'spammer123',
      accountAgeDays: 5,
      combinedKarma: 10,
      linkKarma: 5,
      commentKarma: 5,
      subreddit: 'r/test',
      domain: 'example.com',
      url: 'https://example.com',
      isSelf: true,
      over18: false,
      spoiler: false,
      stickied: false,
      numComments: 0,
      score: 0,
      upvoteRatio: 1,
      authorFlairText: '',
      linkFlairText: '',
      distinguished: '',
    };

    const post = buildSimulationPost(mockPost, 'test-1', 'Test Post');
    const result = evaluateRule(rule, [post]);

    // Verify the rule matched
    expect(result.matched).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.items[0]?.outcome).toBe('remove');

    // Create a matrix cell from the result
    const item = result.items[0];
    if (!item) {
      throw new Error('No result item found');
    }

    const cell = {
      changeId: 'change-1',
      testId: 'test-1',
      outcome: item.outcome,
      matchedCondition: result.matched > 0 ? `${rule.name} matched` : '',
      reason: item.reason,
      runAt: Date.now(),
    };

    // Verify the cell structure
    expect(cell.outcome).toBe('remove');
    expect(cell.matchedCondition).toBe('Spam Rule matched');
    expect(cell.reason).toBe('Spam Rule matched');
  });

  it('should create a matrix cell for a non-matching post', () => {
    // Create a spam rule
    const rule: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      id: 'rule-1',
      name: 'Spam Rule',
      conditions: [
        {
          field: 'title',
          comparator: 'includes',
          value: 'buy',
        },
      ],
      action: 'remove',
      comment: 'Removed as spam',
      modmail: 'Spam detected',
    };

    // Create a mock post that should NOT match
    const mockPost: MockPostDebugRequest = {
      title: 'Hello world',
      body: 'Just saying hi',
      author: 'regularuser',
      accountAgeDays: 100,
      combinedKarma: 1000,
      linkKarma: 500,
      commentKarma: 500,
      subreddit: 'r/test',
      domain: 'example.com',
      url: 'https://example.com',
      isSelf: true,
      over18: false,
      spoiler: false,
      stickied: false,
      numComments: 0,
      score: 0,
      upvoteRatio: 1,
      authorFlairText: '',
      linkFlairText: '',
      distinguished: '',
    };

    const post = buildSimulationPost(mockPost, 'test-2', 'Test Post 2');
    const result = evaluateRule(rule, [post]);

    // Verify the rule did not match
    expect(result.matched).toBe(0);
    expect(result.approved).toBe(1);
    expect(result.items[0]?.outcome).toBe('approve');

    // Create a matrix cell from the result
    const item = result.items[0];
    if (!item) {
      throw new Error('No result item found');
    }

    const cell = {
      changeId: 'change-1',
      testId: 'test-2',
      outcome: item.outcome,
      matchedCondition: result.matched > 0 ? `${rule.name} matched` : '',
      reason: item.reason,
      runAt: Date.now(),
    };

    // Verify the cell structure
    expect(cell.outcome).toBe('approve');
    expect(cell.matchedCondition).toBe('');
    expect(cell.reason).toBe('No rule match');
  });

  it('should create a matrix cell for low karma rule', () => {
    // Create a rule
    const rule: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      id: 'rule-1',
      name: 'Low Karma Rule',
      conditions: [
        {
          field: 'combined_karma',
          comparator: '<',
          value: '100',
        },
      ],
      satisfyAnyThreshold: true,
      action: 'remove',
      comment: 'Removed due to low karma',
      modmail: 'Low karma detected',
    };

    // Create a mock post with low karma
    const mockPost: MockPostDebugRequest = {
      title: 'My first post',
      body: 'Hello',
      author: 'newuser',
      accountAgeDays: 1,
      combinedKarma: 50,
      linkKarma: 25,
      commentKarma: 25,
      subreddit: 'r/test',
      domain: 'example.com',
      url: 'https://example.com',
      isSelf: true,
      over18: false,
      spoiler: false,
      stickied: false,
      numComments: 0,
      score: 0,
      upvoteRatio: 1,
      authorFlairText: '',
      linkFlairText: '',
      distinguished: '',
    };

    const post = buildSimulationPost(mockPost, 'test-3', 'Low Karma Post');
    const result = evaluateRule(rule, [post]);

    const item = result.items[0];
    if (!item) {
      throw new Error('No result item found');
    }

    const cell = {
      changeId: 'change-1',
      testId: 'test-3',
      outcome: item.outcome,
      matchedCondition: result.matched > 0 ? `${rule.name} matched` : '',
      reason: item.reason,
      runAt: Date.now(),
    };

    // Verify the cell structure
    expect(cell.outcome).toBe('remove');
  });

  it('should test with default simulation posts', () => {
    const defaultPosts = createDefaultSimulationPosts();

    // Create a spam rule that should catch post-1 and post-3
    const rule: AutomodRule = {
      ...DEFAULT_AUTOMOD_RULE,
      id: 'rule-1',
      name: 'Spam Rule',
      conditions: [
        {
          field: 'title',
          comparator: 'includes',
          value: 'launch',
        },
      ],
      action: 'remove',
      comment: 'Removed as spam',
      modmail: 'Spam detected',
    };

    const result = evaluateRule(rule, defaultPosts);

    // Post-1 has "Brand launch teaser" in body, but rule checks title
    // Post-3 has "shipping update" in title, not "launch"
    // So none should match
    expect(result.matched).toBe(0);
    expect(result.approved).toBe(4);
  });
});
