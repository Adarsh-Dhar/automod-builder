import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBlastRadius,
  evaluateRuleAgainstCachedPosts,
  formatBlastRadiusResult,
} from '../services/blast-radius.service';
import type { BlastRadiusResult, CachedPost } from '../../shared/blast-types';
import type { AutomodRule } from '../../shared/automod';

describe('BlastRadiusService', () => {
  let mockPosts: CachedPost[];
  let mockRule: AutomodRule;

  beforeEach(() => {
    // Setup mock data
    mockPosts = [
      {
        id: 'post_1',
        title: 'Check out this crypto opportunity',
        body: 'Bitcoin investment scam',
        author: 'spam_bot',
        accountAgeDays: 2,
        combinedKarma: 0,
        createdAt: 1000000,
        isSpam: true,
        wasRemoved: false,
      },
      {
        id: 'post_2',
        title: 'Legitimate discussion about Bitcoin',
        body: 'Technical analysis of blockchain technology',
        author: 'real_user',
        accountAgeDays: 365,
        combinedKarma: 5000,
        createdAt: 1000100,
        isSpam: false,
        wasRemoved: false,
      },
      {
        id: 'post_3',
        title: 'NFT scam alert',
        body: 'Click here to get rich quick with NFTs',
        author: 'scammer_2',
        accountAgeDays: 1,
        combinedKarma: 10,
        createdAt: 1000200,
        isSpam: true,
        wasRemoved: false,
      },
    ];

    mockRule = {
      id: 'crypto-spam',
      name: 'Crypto spam filter',
      type: 'submission',
      enabled: true,
      conditions: [
        {
          field: 'title',
          comparator: 'includes',
          value: 'crypto|bitcoin|nft',
        },
        {
          field: 'account_age',
          comparator: '<',
          value: '30',
        },
      ],
      satisfyAnyThreshold: false,
      action: 'remove',
      comment: 'Your post was removed for spam',
      commentStickied: false,
      modmail: 'Spam removed: {{permalink}}',
    };
  });

  describe('calculateBlastRadius', () => {
    it('should calculate metrics for rule against posts', () => {
      const result = calculateBlastRadius(mockPosts, mockRule);

      expect(result).toHaveProperty('totalTested');
      expect(result).toHaveProperty('wouldCatch');
      expect(result).toHaveProperty('falsePositives');
      expect(result).toHaveProperty('missedSpam');
      expect(result).toHaveProperty('catchRate');
      expect(result).toHaveProperty('falsePositiveRate');
    });

    it('should identify spam posts that would be caught', () => {
      const result = calculateBlastRadius(mockPosts, mockRule);

      expect(result.totalTested).toBe(3);
      expect(result.wouldCatch).toBeGreaterThan(0);
    });

    it('should detect false positives', () => {
      const result = calculateBlastRadius(mockPosts, mockRule);

      expect(result.falsePositives).toBeInstanceOf(Array);
      expect(result.falsePositives.every((p) => !p.isSpam)).toBe(true);
    });

    it('should detect missed spam', () => {
      const result = calculateBlastRadius(mockPosts, mockRule);

      expect(result.missedSpam).toBeInstanceOf(Array);
      expect(result.missedSpam.every((p) => p.isSpam)).toBe(true);
    });

    it('should calculate accurate catch rate', () => {
      const result = calculateBlastRadius(mockPosts, mockRule);

      expect(result.catchRate).toBeGreaterThanOrEqual(0);
      expect(result.catchRate).toBeLessThanOrEqual(100);
      expect(typeof result.catchRate).toBe('number');
    });

    it('should calculate accurate false positive rate', () => {
      const result = calculateBlastRadius(mockPosts, mockRule);

      expect(result.falsePositiveRate).toBeGreaterThanOrEqual(0);
      expect(result.falsePositiveRate).toBeLessThanOrEqual(100);
    });
  });

  describe('evaluateRuleAgainstCachedPosts', () => {
    it('should evaluate rule and return detailed results', () => {
      const result = evaluateRuleAgainstCachedPosts(mockPosts, mockRule);

      expect(result).toHaveProperty('matched');
      expect(result).toHaveProperty('removed');
      expect(result).toHaveProperty('items');
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should track which posts matched the rule', () => {
      const result = evaluateRuleAgainstCachedPosts(mockPosts, mockRule);

      expect(result.matched).toBe(result.items.length);
    });

    it('should handle rules with no matches', () => {
      const emptyRule: AutomodRule = {
        ...mockRule,
        conditions: [
          {
            field: 'title',
            comparator: 'includes',
            value: 'this-will-never-match-xyz123',
          },
        ],
      };

      const result = evaluateRuleAgainstCachedPosts(mockPosts, emptyRule);

      expect(result.matched).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should handle empty post list', () => {
      const result = evaluateRuleAgainstCachedPosts([], mockRule);

      expect(result.matched).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('formatBlastRadiusResult', () => {
    it('should format result with proper structure', () => {
      const blastResult = calculateBlastRadius(mockPosts, mockRule);
      const formatted = formatBlastRadiusResult(blastResult, mockRule.name);

      expect(formatted).toHaveProperty('ruleName');
      expect(formatted).toHaveProperty('totalTested');
      expect(formatted).toHaveProperty('catches');
      expect(formatted).toHaveProperty('falsePositives');
      expect(formatted).toHaveProperty('missedSpam');
    });

    it('should round percentage values', () => {
      const blastResult = calculateBlastRadius(mockPosts, mockRule);
      const formatted = formatBlastRadiusResult(blastResult, mockRule.name);

      expect(Number.isInteger(formatted.catches.percentage)).toBe(true);
      expect(Number.isInteger(formatted.falsePositives.percentage)).toBe(true);
    });

    it('should include rule name in result', () => {
      const blastResult = calculateBlastRadius(mockPosts, mockRule);
      const ruleName = 'Test Rule';
      const formatted = formatBlastRadiusResult(blastResult, ruleName);

      expect(formatted.ruleName).toBe(ruleName);
    });
  });

  describe('Edge cases', () => {
    it('should handle posts with missing fields', () => {
      const incompletePosts: CachedPost[] = [
        {
          id: 'post_1',
          title: '',
          body: '',
          author: 'unknown',
          accountAgeDays: 0,
          combinedKarma: 0,
          createdAt: 0,
          isSpam: false,
          wasRemoved: false,
        },
      ];

      const result = calculateBlastRadius(incompletePosts, mockRule);
      expect(result).toBeDefined();
      expect(result.totalTested).toBe(1);
    });

    it('should handle regex patterns in conditions', () => {
      const regexRule: AutomodRule = {
        ...mockRule,
        conditions: [
          {
            field: 'title',
            comparator: 'matches',
            value: '^(crypto|bitcoin|nft)',
          },
        ],
      };

      const result = calculateBlastRadius(mockPosts, regexRule);
      expect(result.totalTested).toBe(mockPosts.length);
    });

    it('should handle satisfyAnyThreshold correctly', () => {
      const anyRule: AutomodRule = {
        ...mockRule,
        satisfyAnyThreshold: true,
      };

      const result1 = calculateBlastRadius(mockPosts, anyRule);
      expect(result1).toBeDefined();

      const allRule: AutomodRule = {
        ...mockRule,
        satisfyAnyThreshold: false,
      };

      const result2 = calculateBlastRadius(mockPosts, allRule);
      expect(result2).toBeDefined();
    });

    it('should handle very large post collections', () => {
      const largePostList = Array.from({ length: 1000 }, (_, i) => ({
        id: `post_${i}`,
        title: 'Test post',
        body: 'Test body',
        author: `user_${i}`,
        accountAgeDays: Math.random() * 365,
        combinedKarma: Math.random() * 10000,
        createdAt: Date.now() / 1000,
        isSpam: Math.random() > 0.8,
        wasRemoved: false,
      }));

      const result = calculateBlastRadius(largePostList, mockRule);
      expect(result.totalTested).toBe(1000);
    });
  });

  describe('Integration scenarios', () => {
    it('should simulate real-world spam detection scenario', () => {
      const dropshippingPosts: CachedPost[] = [
        {
          id: 'legit_1',
          title: 'Best practices for running an online store',
          body: 'Discussion about ecommerce platforms',
          author: 'expert_user',
          accountAgeDays: 730,
          combinedKarma: 50000,
          createdAt: 1000000,
          isSpam: false,
          wasRemoved: false,
        },
        {
          id: 'spam_1',
          title: 'Look what I got, just arrived! Grab yours here',
          body: 'Click the link to order now',
          author: 'new_account',
          accountAgeDays: 1,
          combinedKarma: 0,
          createdAt: 1000100,
          isSpam: true,
          wasRemoved: false,
        },
        {
          id: 'spam_2',
          title: 'JUST ARRIVED - Limited time offer!',
          body: 'Order before it sells out',
          author: 'another_spammer',
          accountAgeDays: 2,
          combinedKarma: 10,
          createdAt: 1000200,
          isSpam: true,
          wasRemoved: false,
        },
      ];

      const dropshippingRule: AutomodRule = {
        id: 'dropshipping',
        name: 'Drop-shipping spam',
        type: 'submission',
        enabled: true,
        conditions: [
          {
            field: 'title',
            comparator: 'includes',
            value: 'just arrived|limited time|grab yours',
          },
          {
            field: 'account_age',
            comparator: '<',
            value: '30',
          },
        ],
        satisfyAnyThreshold: false,
        action: 'remove',
        comment: 'Detected as dropshipping spam',
        commentStickied: false,
        modmail: '',
      };

      const result = calculateBlastRadius(dropshippingPosts, dropshippingRule);

      expect(result.totalTested).toBe(3);
      expect(result.wouldCatch).toBeGreaterThan(0);
      expect(result.falsePositiveRate).toBeLessThan(50);
    });

    it('should handle multiple rule evaluations', () => {
      const rule1 = mockRule;
      const rule2: AutomodRule = {
        ...mockRule,
        id: 'new-account-spam',
        conditions: [
          {
            field: 'account_age',
            comparator: '<',
            value: '7',
          },
        ],
      };

      const result1 = calculateBlastRadius(mockPosts, rule1);
      const result2 = calculateBlastRadius(mockPosts, rule2);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1.totalTested).toBe(result2.totalTested);
    });
  });
});
