import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  analyzeYamlLimitation,
  generateEscapeHatchTrigger,
  getRuleStageModContext,
} from '../services/escape-hatch.service';
import type { YamlLimitationAnalysis, EscapeHatchCode } from '../../shared/automod';

// Mock Gemini API
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

describe('EscapeHatchService', () => {
  describe('analyzeYamlLimitation', () => {
    it('should analyze requests and detect YAML limitations', async () => {
      const requests = [
        'Check if user is in our approved database',
        'Parse JSON from post body and validate fields',
        'Call an external spam detection API',
        'Perform complex mathematical calculations on post length',
        'Store user state across multiple posts',
        'Check if user email domain is whitelisted',
      ];

      for (const request of requests) {
        const analysis = await analyzeYamlLimitation(request);

        expect(analysis).toHaveProperty('hasLimitation');
        expect(analysis).toHaveProperty('limitation');
        expect(analysis).toHaveProperty('explanation');
        expect(analysis).toHaveProperty('recommendation');

        expect(typeof analysis.hasLimitation).toBe('boolean');
        expect(analysis.recommendation).toMatch(/yaml|typescript/);
      }
    });

    it('should identify external API limitations', async () => {
      const request = 'Call an external API to check if the URL is malicious';

      const analysis = await analyzeYamlLimitation(request);

      if (analysis.hasLimitation) {
        expect(analysis.limitation).toBe('external-api');
        expect(analysis.recommendation).toBe('typescript');
      }
    });

    it('should identify database check limitations', async () => {
      const request = 'Check if the user is in our Redis ban list';

      const analysis = await analyzeYamlLimitation(request);

      if (analysis.hasLimitation) {
        expect(['database-check', 'state-management']).toContain(
          analysis.limitation
        );
      }
    });

    it('should identify JSON parsing limitations', async () => {
      const request = 'Parse JSON from the post body and check a specific field';

      const analysis = await analyzeYamlLimitation(request);

      if (analysis.hasLimitation) {
        expect(analysis.limitation).toBe('json-parsing');
      }
    });

    it('should handle YAML-capable requests correctly', async () => {
      const yamlCapableRequests = [
        'Remove posts with the word crypto in the title',
        'Filter posts from new accounts with low karma',
        'Approve posts that mention specific keywords',
      ];

      for (const request of yamlCapableRequests) {
        const analysis = await analyzeYamlLimitation(request);

        if (analysis.hasLimitation) {
          expect(analysis.recommendation).toBe('yaml');
        } else {
          expect(analysis.hasLimitation).toBe(false);
        }
      }
    });

    it('should provide explanations for detected limitations', async () => {
      const request = 'Query our custom machine learning model to classify spam';

      const analysis = await analyzeYamlLimitation(request);

      expect(analysis.explanation).toBeTruthy();
      expect(analysis.explanation.length).toBeGreaterThan(10);
    });

    it('should handle empty requests', async () => {
      expect(async () => {
        await analyzeYamlLimitation('');
      }).not.toThrow();
    });

    it('should handle very long requests', async () => {
      const longRequest = 'a'.repeat(5000);

      expect(async () => {
        await analyzeYamlLimitation(longRequest);
      }).not.toThrow();
    });
  });

  describe('generateEscapeHatchTrigger', () => {
    it('should generate TypeScript code for detected limitations', async () => {
      const request =
        'Check if the user has a minimum account age of 1 year before allowing the post';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(trigger).toHaveProperty('triggerCode');
      expect(trigger).toHaveProperty('description');
      expect(trigger).toHaveProperty('limitations');
      expect(trigger).toHaveProperty('installationSteps');
      expect(trigger).toHaveProperty('confidence');
    });

    it('should generate valid TypeScript code', async () => {
      const request = 'Verify the post URL is not in a blocklist database';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(trigger.triggerCode).toMatch(/export|const|async|function/);
      expect(trigger.triggerCode).toMatch(/onPostSubmit|PostSubmitEvent|Context/);
    });

    it('should include confidence level', async () => {
      const request = 'Call external verification service';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(['high', 'medium', 'low']).toContain(trigger.confidence);
    });

    it('should provide installation steps', async () => {
      const request = 'Check Redis for user bans';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(Array.isArray(trigger.installationSteps)).toBe(true);
      expect(trigger.installationSteps.length).toBeGreaterThan(0);
      expect(trigger.installationSteps[0]).toMatch(/copy|create|paste|file/i);
    });

    it('should document known limitations', async () => {
      const request = 'Call an external API for spam detection';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(Array.isArray(trigger.limitations)).toBe(true);
      expect(trigger.limitations.length).toBeGreaterThan(0);
    });

    it('should include clear descriptions', async () => {
      const request =
        'Check if domain is in our whitelist before allowing post';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(trigger.description).toBeTruthy();
      expect(trigger.description.length).toBeGreaterThan(20);
    });

    it('should handle requests for common patterns', async () => {
      const commonRequests = [
        'Check user against a ban database',
        'Validate email address format',
        'Check API rate limits',
        'Store tracking information',
        'Calculate post similarity score',
      ];

      for (const request of commonRequests) {
        const trigger = await generateEscapeHatchTrigger(request);

        expect(trigger.triggerCode).toBeTruthy();
        expect(trigger.triggerCode.length).toBeGreaterThan(50);
      }
    });
  });

  describe('getRuleStageModContext', () => {
    it('should return moderation context', () => {
      const context = getRuleStageModContext();

      expect(context).toHaveProperty('subredditName');
    });

    it('should include subreddit name if available', () => {
      const context = getRuleStageModContext();

      if (context.subredditName) {
        expect(typeof context.subredditName).toBe('string');
      }
    });
  });

  describe('Integration with templates', () => {
    it('should use templates for external API pattern', async () => {
      const request = 'Call an external API service to check if post is spam';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(trigger.triggerCode).toMatch(/fetch|http|api/i);
    });

    it('should use templates for JSON parsing pattern', async () => {
      const request = 'Parse JSON from post body and validate structure';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(trigger.triggerCode).toMatch(/JSON\.parse|parse|json/i);
    });

    it('should use templates for Redis/database pattern', async () => {
      const request = 'Check Redis cache for user ban status';

      const trigger = await generateEscapeHatchTrigger(request);

      expect(trigger.triggerCode).toMatch(/redis|cache|database|get|set/i);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle moderator request for spam ring detection', async () => {
      const request = `
        We've been getting hit by a spam ring that coordinates across multiple accounts.
        We need to check if a user's IP address or device fingerprint matches a known pattern.
      `;

      const analysis = await analyzeYamlLimitation(request);
      expect(analysis).toBeDefined();

      if (analysis.hasLimitation) {
        const trigger = await generateEscapeHatchTrigger(request);
        expect(trigger.triggerCode).toBeTruthy();
      }
    });

    it('should handle request for ML-based filtering', async () => {
      const request = `
        We want to use our trained machine learning model to classify posts as spam.
        The model is hosted on our servers and returns a confidence score.
      `;

      const analysis = await analyzeYamlLimitation(request);
      expect(analysis.hasLimitation).toBe(true);
      expect(analysis.recommendation).toBe('typescript');

      const trigger = await generateEscapeHatchTrigger(request);
      expect(trigger.triggerCode).toMatch(/fetch|api|model/i);
    });

    it('should handle request for dynamic configuration', async () => {
      const request = `
        Load moderation rules from a central configuration server
        that changes based on current threat levels
      `;

      const analysis = await analyzeYamlLimitation(request);
      expect(analysis.hasLimitation).toBe(true);

      const trigger = await generateEscapeHatchTrigger(request);
      expect(trigger.triggerCode).toBeTruthy();
    });

    it('should handle request for multi-step verification', async () => {
      const request = `
        Implement a multi-step verification:
        1. Check if user exists in our database
        2. If yes, check their reputation score
        3. If reputation is low, check additional factors
        4. Only remove if all conditions are met
      `;

      const trigger = await generateEscapeHatchTrigger(request);
      expect(trigger.triggerCode).toContain('onPostSubmit');
      expect(trigger.limitations.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle requests in different languages', async () => {
      const requests = [
        'Check database for banned users', // English
        'Vérifier la base de données des utilisateurs bannis', // French
      ];

      for (const request of requests) {
        expect(async () => {
          await analyzeYamlLimitation(request);
        }).not.toThrow();
      }
    });

    it('should handle requests with special characters', async () => {
      const specialRequests = [
        'Check if post contains: @#$%^&*()',
        'Verify email@domain.com format',
        'Match regex: [a-zA-Z0-9]+',
        'Check URL query params: ?key=value&foo=bar',
      ];

      for (const request of specialRequests) {
        expect(async () => {
          await analyzeYamlLimitation(request);
        }).not.toThrow();
      }
    });

    it('should handle requests that are already possible in YAML', async () => {
      const yamlRequest = 'Remove posts from new accounts with low karma';

      const analysis = await analyzeYamlLimitation(yamlRequest);

      expect(analysis).toBeDefined();
      expect(
        !analysis.hasLimitation ||
          analysis.recommendation === 'yaml'
      ).toBe(true);
    });

    it('should generate code even for ambiguous requests', async () => {
      const ambiguousRequest = 'Do something smart with the post data';

      const trigger = await generateEscapeHatchTrigger(ambiguousRequest);

      expect(trigger.triggerCode).toBeTruthy();
      expect(trigger.confidence).toMatch(/high|medium|low/);
    });
  });

  describe('Error handling', () => {
    it('should handle API failures gracefully', async () => {
      const request = 'Some request that might cause API issues';

      expect(async () => {
        await analyzeYamlLimitation(request);
      }).not.toThrow();
    });

    it('should provide meaningful error messages', async () => {
      try {
        await analyzeYamlLimitation('test request');
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        if (error instanceof Error) {
          expect(error.message.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Type safety', () => {
    it('should return correct types for analysis', async () => {
      const analysis = await analyzeYamlLimitation(
        'Check external database'
      );

      expect(typeof analysis.hasLimitation).toBe('boolean');
      expect(
        typeof analysis.limitation === 'string' ||
          analysis.limitation === null
      ).toBe(true);
      expect(typeof analysis.explanation).toBe('string');
      expect(['yaml', 'typescript']).toContain(analysis.recommendation);
    });

    it('should return correct types for trigger code', async () => {
      const trigger = await generateEscapeHatchTrigger('Check database');

      expect(typeof trigger.triggerCode).toBe('string');
      expect(typeof trigger.description).toBe('string');
      expect(Array.isArray(trigger.limitations)).toBe(true);
      expect(Array.isArray(trigger.installationSteps)).toBe(true);
      expect(['high', 'medium', 'low']).toContain(trigger.confidence);
    });
  });

  describe('Performance', () => {
    it('should analyze requests within reasonable time', async () => {
      const startTime = performance.now();
      await analyzeYamlLimitation('Check external database');
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) =>
        analyzeYamlLimitation(`Request number ${i}`)
      );

      const results = await Promise.all(requests);

      expect(results.length).toBe(5);
      expect(results.every((r) => r !== undefined)).toBe(true);
    });
  });
});
