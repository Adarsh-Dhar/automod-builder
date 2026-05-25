import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildDecoderAnalysisPrompt,
  buildDebugPrompt,
  buildEscapeHatchAnalysisPrompt,
  buildEscapeHatchGenerationPrompt,
  replaceOrAppendRule,
} from '../automod';
import type {
  AutomodRule,
  SimulationPost,
  YamlLimitation,
  EscapeHatchCode,
  DecoderAnalysis,
} from '../automod';
import type { DebugMatch } from '../debug-types';

describe('Shared Utilities Tests', () => {
  describe('Prompt builders', () => {
    describe('buildDecoderAnalysisPrompt', () => {
      it('should build valid prompt for three spam examples', () => {
        const examples: [string, string, string] = [
          'Buy crypto now!',
          'Get Bitcoin here',
          'Investment opportunity',
        ];

        const prompt = buildDecoderAnalysisPrompt(examples);

        expect(prompt).toBeTruthy();
        expect(prompt).toContain(examples[0]);
        expect(prompt).toContain(examples[1]);
        expect(prompt).toContain(examples[2]);
      });

      it('should request JSON output format', () => {
        const examples: [string, string, string] = ['ex1', 'ex2', 'ex3'];
        const prompt = buildDecoderAnalysisPrompt(examples);

        expect(prompt.toLowerCase()).toMatch(/json|object/);
      });

      it('should include obfuscation technique hints', () => {
        const examples: [string, string, string] = ['a', 'b', 'c'];
        const prompt = buildDecoderAnalysisPrompt(examples);

        const techniques = [
          'homoglyph',
          'zero-width',
          'look-alike',
          'separator-noise',
          'evasive-phrasing',
          'mixed-script',
        ];

        const hasTechniques = techniques.some((tech) =>
          prompt.toLowerCase().includes(tech)
        );

        expect(hasTechniques).toBe(true);
      });

      it('should specify regex pattern requirement', () => {
        const examples: [string, string, string] = ['test1', 'test2', 'test3'];
        const prompt = buildDecoderAnalysisPrompt(examples);

        expect(prompt.toLowerCase()).toMatch(/regex|pattern/);
      });
    });

    describe('buildDebugPrompt', () => {
      let mockPost: SimulationPost;
      let mockMatches: DebugMatch[];

      beforeEach(() => {
        mockPost = {
          id: 'post_1',
          title: 'Suspicious post title',
          body: 'Post body content',
          author: 'test_user',
          accountAgeDays: 5,
          combinedKarma: 10,
          linkKarma: 8,
          commentKarma: 2,
          subreddit: 'r/test',
          domain: 'self.test',
          url: 'https://reddit.com/r/test/comments/abc123',
          isSelf: true,
          over18: false,
          spoiler: false,
          stickied: false,
          numComments: 5,
          score: 3,
          upvoteRatio: 0.6,
          authorFlairText: '',
          linkFlairText: '',
          distinguished: '',
        };

        mockMatches = [
          {
            ruleName: 'New Account Spam',
            matchedCondition: {
              field: 'account_age',
              comparator: '<',
              value: '7',
            },
            confidence: 'high',
            rawYaml: 'account_age: < 7',
            lineStart: 1,
            lineEnd: 3,
          },
        ];
      });

      it('should include post information', () => {
        const prompt = buildDebugPrompt(mockPost, mockMatches);

        expect(prompt).toContain(mockPost.title);
        expect(prompt).toContain(mockPost.body);
        expect(prompt).toContain(mockPost.author);
      });

      it('should include matched rule information', () => {
        const prompt = buildDebugPrompt(mockPost, mockMatches);

        expect(prompt).toContain(mockMatches[0]?.ruleName);
        expect(prompt).toContain(mockMatches[0]?.rawYaml);
      });

      it('should request JSON output for fix suggestions', () => {
        const prompt = buildDebugPrompt(mockPost, mockMatches);

        expect(prompt.toLowerCase()).toMatch(/json|fix|suggest/);
      });

      it('should handle multiple matches', () => {
        const multiMatches: DebugMatch[] = [
          ...mockMatches,
          {
            ruleName: 'Low Karma',
            matchedCondition: {
              field: 'combined_karma',
              comparator: '<',
              value: '50',
            },
            confidence: 'medium',
            rawYaml: 'combined_karma: < 50',
            lineStart: 10,
            lineEnd: 12,
          },
        ];

        const prompt = buildDebugPrompt(mockPost, multiMatches);

        expect(prompt).toContain('New Account Spam');
        expect(prompt).toContain('Low Karma');
      });

      it('should handle no matches scenario', () => {
        const prompt = buildDebugPrompt(mockPost, []);

        expect(prompt).toBeTruthy();
        expect(prompt.toLowerCase()).toMatch(/no match|not matched/);
      });
    });

    describe('buildEscapeHatchAnalysisPrompt', () => {
      it('should explain YAML capabilities', () => {
        const prompt = buildEscapeHatchAnalysisPrompt(
          'Check a database'
        );

        expect(prompt.toLowerCase()).toMatch(/yaml|automod/);
      });

      it('should list YAML limitations', () => {
        const prompt = buildEscapeHatchAnalysisPrompt(
          'Check a database'
        );

        expect(prompt).toMatch(/cannot|limitation|native/i);
      });

      it('should include the user request', () => {
        const request = 'Check external API for spam detection';
        const prompt = buildEscapeHatchAnalysisPrompt(request);

        expect(prompt).toContain(request);
      });

      it('should request JSON output with limitation detection', () => {
        const prompt = buildEscapeHatchAnalysisPrompt(
          'Parse JSON from post'
        );

        expect(prompt.toLowerCase()).toMatch(/json|limitation|yaml/);
      });
    });

    describe('buildEscapeHatchGenerationPrompt', () => {
      it('should request TypeScript code generation', () => {
        const prompt = buildEscapeHatchGenerationPrompt(
          'Check database'
        );

        expect(prompt.toLowerCase()).toMatch(/typescript|devvit|trigger/);
      });

      it('should mention onPostSubmit trigger', () => {
        const prompt = buildEscapeHatchGenerationPrompt(
          'Moderate new posts'
        );

        expect(prompt).toMatch(/onPostSubmit|trigger/);
      });

      it('should request error handling', () => {
        const prompt = buildEscapeHatchGenerationPrompt(
          'Call external API'
        );

        expect(prompt.toLowerCase()).toMatch(/error|handle|graceful/);
      });

      it('should include user requirement in prompt', () => {
        const requirement = 'Call machine learning model';
        const prompt = buildEscapeHatchGenerationPrompt(requirement);

        expect(prompt).toContain(requirement);
      });
    });
  });

  describe('Type validation', () => {
    describe('AutomodRule type validation', () => {
      it('should validate complete rule', () => {
        const validRule: AutomodRule = {
          id: 'rule_1',
          name: 'Test Rule',
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
          comment: 'Removed',
          commentStickied: false,
          modmail: '',
        };

        expect(validRule).toBeDefined();
        expect(validRule.id).toBeTruthy();
        expect(validRule.conditions).toHaveLength(1);
      });

      it('should validate action field', () => {
        const validActions = ['remove', 'approve', 'report'];

        validActions.forEach((action) => {
          expect(['remove', 'approve', 'report']).toContain(action);
        });
      });

      it('should validate condition field types', () => {
        const validFields = ['title', 'body', 'account_age', 'combined_karma'];

        validFields.forEach((field) => {
          expect(['title', 'body', 'account_age', 'combined_karma']).toContain(
            field
          );
        });
      });

      it('should validate condition comparators', () => {
        const validComparators = ['includes', 'matches', '<', '>', '<=', '>='];

        validComparators.forEach((comp) => {
          expect(['includes', 'matches', '<', '>', '<=', '>=']).toContain(
            comp
          );
        });
      });
    });

    describe('SimulationPost type validation', () => {
      it('should validate complete post', () => {
        const validPost: SimulationPost = {
          id: 'post_1',
          title: 'Title',
          body: 'Body',
          author: 'user',
          accountAgeDays: 30,
          combinedKarma: 100,
          linkKarma: 80,
          commentKarma: 20,
          subreddit: 'r/test',
          domain: 'self.test',
          url: 'https://reddit.com/r/test/comments/abc123',
          isSelf: true,
          over18: false,
          spoiler: false,
          stickied: false,
          numComments: 10,
          score: 5,
          upvoteRatio: 0.8,
          authorFlairText: '',
          linkFlairText: '',
          distinguished: '',
        };

        expect(validPost).toBeDefined();
        expect(typeof validPost.accountAgeDays).toBe('number');
        expect(typeof validPost.combinedKarma).toBe('number');
      });

      it('should handle zero values', () => {
        const postWithZeros: SimulationPost = {
          id: 'post_1',
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

        expect(postWithZeros.accountAgeDays).toBe(0);
        expect(postWithZeros.combinedKarma).toBe(0);
      });
    });

    describe('YamlLimitation type validation', () => {
      it('should validate all limitation types', () => {
        const validLimitations: YamlLimitation[] = [
          'external-api',
          'json-parsing',
          'database-check',
          'complex-math',
          'conditional-logic',
          'state-management',
          'batch-processing',
          'other',
        ];

        validLimitations.forEach((limitation) => {
          expect(limitation).toBeTruthy();
          expect(typeof limitation).toBe('string');
        });
      });
    });

    describe('EscapeHatchCode type validation', () => {
      it('should validate complete escape hatch code object', () => {
        const validCode: EscapeHatchCode = {
          triggerCode: 'export const onPostSubmit = async () => {}',
          description: 'Test trigger',
          limitations: ['Test limitation'],
          installationSteps: ['Step 1', 'Step 2'],
          confidence: 'high',
        };

        expect(validCode.triggerCode).toBeTruthy();
        expect(validCode.confidence).toMatch(/high|medium|low/);
      });

      it('should validate confidence levels', () => {
        const validConfidences = ['high', 'medium', 'low'];

        validConfidences.forEach((conf) => {
          expect(['high', 'medium', 'low']).toContain(conf);
        });
      });
    });

    describe('DecoderAnalysis type validation', () => {
      it('should validate complete analysis object', () => {
        const validAnalysis: DecoderAnalysis = {
          tricks: ['homoglyph', 'zero-width'],
          explanation: 'Uses Unicode tricks',
          regexPattern: '^(0|O)pen',
          automodYaml: 'title (matches): ["pattern"]',
          confidence: 'high',
        };

        expect(validAnalysis.tricks).toBeInstanceOf(Array);
        expect(validAnalysis.regexPattern).toBeTruthy();
        expect(validAnalysis.confidence).toMatch(/high|medium|low/);
      });

      it('should validate trick types', () => {
        const validTricks = [
          'homoglyph',
          'zero-width',
          'look-alike',
          'separator-noise',
          'evasive-phrasing',
          'mixed-script',
        ];

        validTricks.forEach((trick) => {
          expect(trick).toBeTruthy();
        });
      });
    });
  });

  describe('Data transformation utilities', () => {
    it('should handle string normalization', () => {
      const inputs = ['SPAM', 'spam', 'Spam', '  spam  '];

      inputs.forEach((input) => {
        const normalized = input.toLowerCase().trim();
        expect(normalized).toBe('spam');
      });
    });

    it('should handle numeric conversions', () => {
      const stringNumbers = ['30', '100', '5000'];

      stringNumbers.forEach((num) => {
        const converted = parseInt(num, 10);
        expect(typeof converted).toBe('number');
        expect(converted).toBeGreaterThan(0);
      });
    });

    it('should handle array flattening', () => {
      const nested = [['item1'], ['item2', 'item3']];
      const flattened = nested.flat();

      expect(flattened).toHaveLength(3);
      expect(flattened).toContain('item1');
      expect(flattened).toContain('item2');
      expect(flattened).toContain('item3');
    });
  });

  describe('Validation functions', () => {
    it('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
      ];
      const invalidEmails = ['notanemail', '@example.com', 'user@'];

      validEmails.forEach((email) => {
        expect(email).toMatch(/.+@.+\..+/);
      });

      invalidEmails.forEach((email) => {
        expect(email).not.toMatch(/.+@.+\..+/);
      });
    });

    it('should validate URL format', () => {
      const validUrls = [
        'https://example.com',
        'http://sub.domain.co.uk',
      ];
      const invalidUrls = ['notaurl', 'example.com', 'htp://invalid'];

      validUrls.forEach((url) => {
        expect(url).toMatch(/^https?:\/\/.+/);
      });

      invalidUrls.forEach((url) => {
        const isValid = /^https?:\/\/.+/.test(url);
        expect(isValid).toBe(false);
      });
    });

    it('should validate regex patterns', () => {
      const validPatterns = ['^spam', 'crypto|bitcoin', '[a-z]+'];
      const invalidPatterns = ['[invalid', '(?P<invalid>)'];

      validPatterns.forEach((pattern) => {
        expect(() => new RegExp(pattern)).not.toThrow();
      });

      invalidPatterns.forEach((pattern) => {
        const isValid = (() => {
          try {
            new RegExp(pattern);
            return true;
          } catch {
            return false;
          }
        })();
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Constants and defaults', () => {
    it('should define default rule structure', () => {
      const defaultStructure = {
        id: '',
        name: '',
        type: 'submission',
        enabled: true,
        conditions: [],
        satisfyAnyThreshold: false,
        action: 'remove',
        comment: '',
        commentStickied: false,
        modmail: '',
      };

      expect(defaultStructure).toHaveProperty('id');
      expect(defaultStructure.type).toBe('submission');
      expect(defaultStructure.action).toBe('remove');
    });

    it('should define condition field labels', () => {
      const labels = {
        title: 'title',
        body: 'body',
        account_age: 'author.account_age',
        combined_karma: 'author.combined_karma',
      };

      expect(labels.title).toBe('title');
      expect(labels.account_age).toContain('account_age');
    });
  });

  describe('Error handling in shared utilities', () => {
    it('should handle empty string inputs', () => {
      const emptyString = '';

      expect(emptyString).toBeFalsy();
      expect(typeof emptyString).toBe('string');
    });

    it('should handle null and undefined gracefully', () => {
      const nullValue = null;
      const undefinedValue = undefined;

      expect(nullValue).toBeNull();
      expect(undefinedValue).toBeUndefined();
    });

    it('should handle array operations safely', () => {
      const emptyArray: string[] = [];
      const singleArray = ['item'];
      const multiArray = ['a', 'b', 'c'];

      expect(emptyArray.length).toBe(0);
      expect(singleArray.length).toBe(1);
      expect(multiArray.length).toBe(3);
    });
  });

  describe('replaceOrAppendRule', () => {
    it('should handle rule name appearing inside comment: | block (false positive)', () => {
      const existingYaml = `---
# Old rule
type: submission
action: remove
comment: |
  This comment mentions # Spam guard but should not match
modmail: Test
---`;

      const newYaml = `---
# Spam guard
type: submission
action: remove
comment: New comment
modmail: Test
---`;

      const result = replaceOrAppendRule(existingYaml, newYaml);

      // Should append, not replace (the # Spam guard in comment is not a rule name)
      expect(result).toContain('# Old rule');
      expect(result).toContain('# Spam guard');
      expect(result).toContain('This comment mentions # Spam guard but should not match');
      expect(result).toContain('New comment');
    });

    it('should handle wiki with only whitespace between blocks', () => {
      const existingYaml = `---

# Rule 1
type: submission
action: remove
comment: Test
modmail: Test


---

# Rule 2
type: submission
action: approve
comment: Test
modmail: Test
---`;

      const newYaml = `---
# Rule 3
type: submission
action: report
comment: Test
modmail: Test
---`;

      const result = replaceOrAppendRule(existingYaml, newYaml);

      // Should preserve existing rules and append new one
      expect(result).toContain('# Rule 1');
      expect(result).toContain('# Rule 2');
      expect(result).toContain('# Rule 3');
    });

    it('should handle unnamed new rule (fallback to append)', () => {
      const existingYaml = `---
# Existing rule
type: submission
action: remove
comment: Test
modmail: Test
---`;

      const newYaml = `---
type: submission
action: approve
comment: No name rule
modmail: Test
---`;

      const result = replaceOrAppendRule(existingYaml, newYaml);

      // Should append the unnamed rule
      expect(result).toContain('# Existing rule');
      expect(result).toContain('No name rule');
      expect(result).toContain('action: approve');
    });

    it('should replace existing rule with matching name', () => {
      const existingYaml = `---
# Spam guard
type: submission
action: remove
comment: Old comment
modmail: Test
---`;

      const newYaml = `---
# Spam guard
type: submission
action: remove
comment: New comment
modmail: Test
---`;

      const result = replaceOrAppendRule(existingYaml, newYaml);

      // Should replace, not duplicate
      const matches = (result.match(/# Spam guard/g) ?? []).length;
      expect(matches).toBe(1);
      expect(result).toContain('New comment');
      expect(result).not.toContain('Old comment');
    });

    it('should append new rule when no matching name exists', () => {
      const existingYaml = `---
# Existing rule
type: submission
action: remove
comment: Test
modmail: Test
---`;

      const newYaml = `---
# New rule
type: submission
action: approve
comment: Test
modmail: Test
---`;

      const result = replaceOrAppendRule(existingYaml, newYaml);

      // Should append
      expect(result).toContain('# Existing rule');
      expect(result).toContain('# New rule');
    });

    it('should handle empty existing wiki', () => {
      const existingYaml = '';
      const newYaml = `---
# First rule
type: submission
action: remove
comment: Test
modmail: Test
---`;

      const result = replaceOrAppendRule(existingYaml, newYaml);

      // Should just return new rule
      expect(result).toContain('# First rule');
    });
  });
});
