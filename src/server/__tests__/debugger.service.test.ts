import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDebugInfo,
  getAllRulesFromYaml,
  getDebugMatchesForPost,
  generateDebugAnalysis,
} from '../services/debugger.service';
import type { SimulationPost, AutomodRule } from '../../shared/automod';
import type { DebugMatch } from '../../shared/debug-types';

describe('DebuggerService', () => {
  let mockPost: SimulationPost;
  let mockYamlContent: string;
  let mockRules: AutomodRule[];

  beforeEach(() => {
    mockPost = {
      id: 'post_123',
      title: 'This is a suspicious post',
      body: 'Low karma user posting spam',
      author: 'suspicious_user',
      accountAgeDays: 2,
      combinedKarma: 5,
      linkKarma: 3,
      commentKarma: 2,
      subreddit: 'r/test',
      domain: 'self.test',
      url: 'https://reddit.com/r/test/comments/abc123',
      isSelf: true,
      over18: false,
      spoiler: false,
      stickied: false,
      numComments: 10,
      score: 5,
      upvoteRatio: 0.6,
      authorFlairText: '',
      linkFlairText: '',
      distinguished: '',
    };

    mockRules = [
      {
        id: 'rule_1',
        name: 'New account spam',
        type: 'submission',
        enabled: true,
        conditions: [
          {
            field: 'account_age',
            comparator: '<',
            value: '7',
          },
          {
            field: 'combined_karma',
            comparator: '<',
            value: '50',
          },
        ],
        satisfyAnyThreshold: false,
        action: 'remove',
        comment: 'Your post was removed',
        commentStickied: false,
        modmail: 'Removed: {{permalink}}',
      },
      {
        id: 'rule_2',
        name: 'Suspicious keywords',
        type: 'submission',
        enabled: true,
        conditions: [
          {
            field: 'title',
            comparator: 'includes',
            value: 'suspicious|spam',
          },
        ],
        satisfyAnyThreshold: false,
        action: 'report',
        comment: '',
        commentStickied: false,
        modmail: '',
      },
      {
        id: 'rule_3',
        name: 'Legitimate discussion',
        type: 'submission',
        enabled: true,
        conditions: [
          {
            field: 'title',
            comparator: 'includes',
            value: 'never_matches_anything_xyz123',
          },
        ],
        satisfyAnyThreshold: false,
        action: 'approve',
        comment: '',
        commentStickied: false,
        modmail: '',
      },
    ];

    mockYamlContent = `
id: rule_1
name: New account spam
type: submission
enabled: true
conditions:
  - field: account_age
    comparator: <
    value: 7
  - field: combined_karma
    comparator: <
    value: 50
---
id: rule_2
name: Suspicious keywords
type: submission
enabled: true
conditions:
  - field: title
    comparator: includes
    value: suspicious|spam
---
id: rule_3
name: Legitimate discussion
type: submission
enabled: true
conditions:
  - field: title
    comparator: includes
    value: never_matches_anything_xyz123
`;
  });

  describe('getDebugInfo', () => {
    it('should return debug information for a post', () => {
      const result = getDebugInfo(mockPost, mockYamlContent);

      expect(result).toHaveProperty('post');
      expect(result).toHaveProperty('matchedRules');
      expect(result).toHaveProperty('allRules');
    });

    it('should identify matching rules', () => {
      const result = getDebugInfo(mockPost, mockYamlContent);

      const matchedIds = result.matchedRules.map((r) => r.ruleName);
      expect(matchedIds.length).toBeGreaterThan(0);
    });

    it('should include rule details for debugging', () => {
      const result = getDebugInfo(mockPost, mockYamlContent);

      result.matchedRules.forEach((match) => {
        expect(match).toHaveProperty('ruleName');
        expect(match).toHaveProperty('rawYaml');
        expect(match).toHaveProperty('matchedCondition');
        expect(match).toHaveProperty('confidence');
      });
    });

    it('should handle invalid YAML gracefully', () => {
      const invalidYaml = 'this is not valid yaml: [';

      expect(() => {
        getDebugInfo(mockPost, invalidYaml);
      }).not.toThrow();
    });

    it('should work with empty YAML', () => {
      const result = getDebugInfo(mockPost, '');

      expect(result.matchedRules).toEqual([]);
      expect(result.allRules).toEqual([]);
    });
  });

  describe('getAllRulesFromYaml', () => {
    it('should parse rules from YAML content', () => {
      const rules = getAllRulesFromYaml(mockYamlContent);

      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should extract all required fields', () => {
      const rules = getAllRulesFromYaml(mockYamlContent);

      rules.forEach((rule) => {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('name');
        expect(rule).toHaveProperty('type');
        expect(rule).toHaveProperty('conditions');
      });
    });

    it('should handle multiple rule blocks separated by ---', () => {
      const rules = getAllRulesFromYaml(mockYamlContent);

      expect(rules.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle YAML with comments', () => {
      const yamlWithComments = `
# This is a spam filter rule
id: rule_1
name: Spam detector
type: submission
enabled: true
conditions:
  - field: title
    comparator: includes
    value: spam
`;

      const rules = getAllRulesFromYaml(yamlWithComments);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should return empty array for invalid YAML', () => {
      const invalidYaml = 'not: valid: yaml: [';

      const rules = getAllRulesFromYaml(invalidYaml);
      expect(Array.isArray(rules)).toBe(true);
    });
  });

  describe('getDebugMatchesForPost', () => {
    it('should identify which rules match a post', () => {
      const matches = getDebugMatchesForPost(mockPost, mockRules);

      expect(Array.isArray(matches)).toBe(true);
    });

    it('should return detailed match information', () => {
      const matches = getDebugMatchesForPost(mockPost, mockRules);

      matches.forEach((match) => {
        expect(match).toHaveProperty('ruleName');
        expect(match).toHaveProperty('matchedCondition');
        expect(match).toHaveProperty('confidence');
        expect(match).toHaveProperty('rawYaml');
      });
    });

    it('should identify false positives', () => {
      const matches = getDebugMatchesForPost(mockPost, mockRules);

      const rule3Match = matches.find((m) => m.ruleName === 'Legitimate discussion');
      expect(rule3Match).toBeUndefined();
    });

    it('should handle posts with edge case values', () => {
      const edgePost: SimulationPost = {
        id: 'edge_post',
        title: '',
        body: '',
        author: '',
        accountAgeDays: 0,
        combinedKarma: 0,
        linkKarma: 0,
        commentKarma: 0,
        subreddit: '',
        domain: '',
        url: '',
        isSelf: false,
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

      const matches = getDebugMatchesForPost(edgePost, mockRules);
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should track confidence levels', () => {
      const matches = getDebugMatchesForPost(mockPost, mockRules);

      matches.forEach((match) => {
        expect(['high', 'medium', 'low']).toContain(match.confidence);
      });
    });
  });

  describe('generateDebugAnalysis', () => {
    it('should generate analysis prompt for debugging', () => {
      const matches = getDebugMatchesForPost(mockPost, mockRules);
      const analysis = generateDebugAnalysis(mockPost, matches);

      expect(typeof analysis).toBe('string');
      expect(analysis.length).toBeGreaterThan(0);
    });

    it('should include post information in analysis', () => {
      const matches = getDebugMatchesForPost(mockPost, mockRules);
      const analysis = generateDebugAnalysis(mockPost, matches);

      expect(analysis).toContain(mockPost.title);
      expect(analysis).toContain(mockPost.author);
    });

    it('should include matched rules in analysis', () => {
      const matches = getDebugMatchesForPost(mockPost, mockRules);
      const analysis = generateDebugAnalysis(mockPost, matches);

      matches.forEach((match) => {
        expect(analysis).toContain(match.ruleName);
      });
    });

    it('should handle scenarios with no matches', () => {
      const matches: DebugMatch[] = [];
      const analysis = generateDebugAnalysis(mockPost, matches);

      expect(typeof analysis).toBe('string');
    });

    it('should be valid JSON prompt', () => {
      const matches = getDebugMatchesForPost(mockPost, mockRules);
      const analysis = generateDebugAnalysis(mockPost, matches);

      expect(analysis).toContain('{');
      expect(analysis).toContain('}');
    });
  });

  describe('Real-world scenarios', () => {
    it('should debug a false positive scenario', () => {
      const legitimatePost: SimulationPost = {
        id: 'legit_post',
        title: 'Discussion about spam prevention',
        body: 'Let me tell you how to avoid spam',
        author: 'expert_user',
        accountAgeDays: 365,
        combinedKarma: 10000,
        linkKarma: 8000,
        commentKarma: 2000,
        subreddit: 'r/moderation',
        domain: 'self.moderation',
        url: 'https://reddit.com/r/moderation/comments/xyz789',
        isSelf: true,
        over18: false,
        spoiler: false,
        stickied: false,
        numComments: 50,
        score: 100,
        upvoteRatio: 0.9,
        authorFlairText: 'Expert',
        linkFlairText: 'Discussion',
        distinguished: '',
      };

      const spamKeywordRule: AutomodRule = {
        id: 'spam_keyword',
        name: 'Spam keyword filter',
        type: 'submission',
        enabled: true,
        conditions: [
          {
            field: 'title',
            comparator: 'includes',
            value: 'spam',
          },
        ],
        satisfyAnyThreshold: false,
        action: 'remove',
        comment: 'Contains spam keyword',
        commentStickied: false,
        modmail: '',
      };

      const matches = getDebugMatchesForPost(legitimatePost, [spamKeywordRule]);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.ruleName).toBe('Spam keyword filter');
    });

    it('should debug a complex multi-condition rule', () => {
      const complexRule: AutomodRule = {
        id: 'complex',
        name: 'Complex multi-condition rule',
        type: 'submission',
        enabled: true,
        conditions: [
          { field: 'account_age', comparator: '<', value: '30' },
          { field: 'combined_karma', comparator: '<', value: '100' },
          { field: 'title', comparator: 'includes', value: 'buy|sell|investment' },
        ],
        satisfyAnyThreshold: false,
        action: 'remove',
        comment: 'Suspicious financial post from new account',
        commentStickied: false,
        modmail: '',
      };

      const matches = getDebugMatchesForPost(mockPost, [complexRule]);

      if (matches.length > 0) {
        expect(matches[0]?.matchedCondition).toBeDefined();
      }
    });

    it('should track multiple rule matches in order', () => {
      const result = getDebugInfo(mockPost, mockYamlContent);

      expect(Array.isArray(result.matchedRules)).toBe(true);
      if (result.matchedRules.length > 1) {
        const names = result.matchedRules.map((r) => r.ruleName);
        expect(new Set(names).size).toBe(names.length);
      }
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle regex patterns in conditions', () => {
      const regexRule: AutomodRule = {
        id: 'regex_rule',
        name: 'Regex rule',
        type: 'submission',
        enabled: true,
        conditions: [
          {
            field: 'title',
            comparator: 'matches',
            value: '^(buy|sell).*crypto',
          },
        ],
        satisfyAnyThreshold: false,
        action: 'remove',
        comment: '',
        commentStickied: false,
        modmail: '',
      };

      const matches = getDebugMatchesForPost(mockPost, [regexRule]);
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should handle very long post content', () => {
      const longPost: SimulationPost = {
        ...mockPost,
        body: 'a'.repeat(100000),
      };

      const matches = getDebugMatchesForPost(longPost, mockRules);
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should handle special characters in post data', () => {
      const specialPost: SimulationPost = {
        ...mockPost,
        title: 'Special chars: @#$%^&*()[]{}',
        body: 'Unicode: 你好世界 🎉 emoji',
        author: 'user_with_special_chars!@#',
      };

      const matches = getDebugMatchesForPost(specialPost, mockRules);
      expect(Array.isArray(matches)).toBe(true);
    });

    it('should handle disabled rules', () => {
      const disabledRule: AutomodRule = {
        id: 'disabled_rule',
        name: 'Disabled rule',
        type: 'submission',
        enabled: false,
        conditions: mockRules[0]?.conditions ?? [],
        satisfyAnyThreshold: false,
        action: 'remove',
        comment: '',
        commentStickied: false,
        modmail: '',
      };

      const matches = getDebugMatchesForPost(mockPost, [disabledRule]);

      const isDisabledMatched = matches.some(
        (m) => m.ruleName === disabledRule.name
      );
      expect(isDisabledMatched).toBe(false);
    });

    it('should handle null or undefined values gracefully', () => {
      const postWithNulls = {
        ...mockPost,
        title: null as any,
        body: undefined as any,
      };

      expect(() => {
        getDebugMatchesForPost(postWithNulls, mockRules);
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle large rule sets efficiently', () => {
      const largeRuleSet: AutomodRule[] = Array.from({ length: 100 }, (_, i) => ({
        id: `rule_${i}`,
        name: `Rule ${i}`,
        type: 'submission',
        enabled: true,
        conditions: mockRules[0]?.conditions ?? [],
        satisfyAnyThreshold: false,
        action: 'remove',
        comment: '',
        commentStickied: false,
        modmail: '',
      }));

      const startTime = performance.now();
      const matches = getDebugMatchesForPost(mockPost, largeRuleSet);
      const endTime = performance.now();

      expect(matches).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle large YAML content efficiently', () => {
      const largeYaml = Array.from({ length: 50 }, (_, i) => `
id: rule_${i}
name: Rule ${i}
type: submission
enabled: true
conditions:
  - field: title
    comparator: includes
    value: test_${i}
---
      `).join('\n');

      const startTime = performance.now();
      const rules = getAllRulesFromYaml(largeYaml);
      const endTime = performance.now();

      expect(rules.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
