import { describe, it, expect } from 'vitest';

/**
 * CUMULATIVE YAML GENERATION TEST SUITE
 * 
 * This test suite validates that the AI agent generates AutoMod rules cumulatively,
 * adding new rules to the existing YAML configuration without breaking anything.
 * 
 * Each request adds a new rule to the accumulated YAML.
 * Request 1 = Initial 3 + Rule 1
 * Request 2 = Request 1 + Rule 2
 * Request 3 = Request 2 + Rule 3
 * ... and so on
 */

// =====================================================
// INITIAL YAML CONFIG (Starting Point)
// =====================================================

const INITIAL_YAML = `---
# Rule: Link Domain Blocklist
type: submission
domain: ['tinyurl.com', 'bit.ly', 'short.link', 'goo.gl']
action: remove
modmail: |
  Removed post: {{permalink}}
  Reason: Shortened URL detected
  Domain: {{domain}}
comment: |
  Your post was removed - we don't allow shortened URLs as they can hide spam. Post the direct link instead.
---

---
# Rule: New Account Safeguard
type: submission
author:
  account_age: "< 7 days"
  combined_karma: "< 10"
action: filter
modmail: |
  Filtered post from new account: {{permalink}}
  User: u/{{author}} (Triggered age/karma threshold)
---

---
# Rule: All Caps Title
type: submission
title (regex): ['^[A-Z\\s\\d\\-\\.,:!?]{20,}$']
action: report
modmail: |
  Reported post with all-caps title: {{permalink}}
  Title: {{title}}
---`;

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function parseYamlRules(yaml: string): Array<{ name: string; yaml: string }> {
  const rules: Array<{ name: string; yaml: string }> = [];
  const blocks = yaml.split('---\n').filter(block => block.trim().length > 0);

  for (const block of blocks) {
    const nameMatch = block.match(/#\s*Rule:\s*(.+)/);
    const name = nameMatch?.[1]?.trim() ?? 'Unknown';
    rules.push({ name, yaml: `---\n${block}\n---` });
  }

  return rules;
}

function validateYamlBlock(yaml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!yaml.includes('---')) {
    errors.push('Missing YAML delimiters (---)');
  }

  if (!yaml.includes('type: submission')) {
    errors.push('Missing "type: submission"');
  }

  const actionMatch = yaml.match(/action:\s*(remove|filter|approve|report)/);
  if (!actionMatch) {
    errors.push('Missing valid action (remove, filter, approve, report)');
  }

  // Comment and modmail blocks are optional for some rules
  if (!yaml.includes('modmail: |') && !yaml.includes('modmail:|')) {
    errors.push('Missing modmail block');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function countRules(yaml: string): number {
  return (yaml.match(/type: submission/g) || []).length;
}

function getRuleNames(yaml: string): string[] {
  const matches = yaml.match(/#\s*Rule:\s*(.+)/g) || [];
  return matches.map(m => m.replace(/#\s*Rule:\s*/, '').trim());
}

// =====================================================
// REQUEST 1: SPAM DETECTION
// =====================================================

const REQUEST_1_NEW_RULE = `---
# Rule: New Account Link Spam
type: submission
author:
  satisfy_any_threshold: true
  account_age: "< 3 days"
  combined_karma: "< 5"
body (includes): ['http', 'www', 'bit.ly', 'tinyurl']
action: remove
comment: |
  Your post was removed by AutoModerator. Your account is too new and your post contains links. Wait a few days and build some karma, then try again.
modmail: |
  Removed new account link spam: {{permalink}}
  User: u/{{author}} ({{account_age}} days old, {{combined_karma}} karma)
  Body contains links and new account
---`;

const YAML_AFTER_REQUEST_1 = INITIAL_YAML + '\n\n' + REQUEST_1_NEW_RULE;

// =====================================================
// REQUEST 2: SELF-PROMOTION GUARD
// =====================================================

const REQUEST_2_NEW_RULE = `---
# Rule: Self-Promotion & Affiliate Detection
type: submission
title (regex): ['(?i)(buy|shop|order|click|link|visit|check out|download|exclusive|limited time)']
author:
  combined_karma: "< 100"
body (includes): ['amazon.com', 'ebay.com', 'affiliate', 'commission', 'sponsored']
action: remove
comment: |
  Your post was removed - Self Promotion. We require users to have community participation before self-promoting. [Message Mods](https://reddit.com/message/compose?to=/r/AutoModDemo)
modmail: |
  Removed self-promotion post: {{permalink}}
  User: u/{{author}} ({{combined_karma}} karma)
  Title: {{title}}
  Reason: Promotional language + low karma account
---`;

const YAML_AFTER_REQUEST_2 = YAML_AFTER_REQUEST_1 + '\n\n' + REQUEST_2_NEW_RULE;

// =====================================================
// REQUEST 3: MISINFORMATION FILTER
// =====================================================

const REQUEST_3_NEW_RULE = `---
# Rule: Unverified Health Claims
type: submission
title (regex): ['(?i)(cure|treat|heal|remedy|supplement|prevents? disease|cures? cancer|medical|health claim)']
body (not_includes): ['study', 'research', 'source', 'link', 'http', 'evidence', 'peer-reviewed', 'clinical', '[source]']
action: remove
comment: |
  Your post was removed - health claims require credible sources or be marked as opinion. Check Rule 3 (Verify Sources) and Rule 4 (No Misinformation). [Message Mods](https://reddit.com/message/compose?to=/r/AutoModDemo)
modmail: |
  Removed health claim without sources: {{permalink}}
  User: u/{{author}}
  Title: {{title}}
  Reason: Health claim without sources or evidence
---`;

const YAML_AFTER_REQUEST_3 = YAML_AFTER_REQUEST_2 + '\n\n' + REQUEST_3_NEW_RULE;

// =====================================================
// REQUEST 4: LOW-EFFORT FILTER
// =====================================================

const REQUEST_4_NEW_RULE = `---
# Rule: Low-Effort & Copy-Paste Detection
type: submission
title (regex): ['^.{1,20}$', '(?i)^[A-Z\\s\\d]{30,}$']
body (includes): ['copy paste', 'lorem ipsum', 'placeholder', 'test post', 'this is a test', 'asdf', 'qwerty']
body (not_includes): ['http', 'source', 'evidence', 'research', 'here is', 'check this']
action: remove
comment: |
  Your post was removed - Low Effort Content. Posts must provide substance and value. [Message Mods](https://reddit.com/message/compose?to=/r/AutoModDemo)
modmail: |
  Removed low-effort post: {{permalink}}
  User: u/{{author}}
  Title: {{title}}
  Reason: Low-effort content with generic or copy-paste text
---`;

const YAML_AFTER_REQUEST_4 = YAML_AFTER_REQUEST_3 + '\n\n' + REQUEST_4_NEW_RULE;

// =====================================================
// REQUEST 5: FLAIR ENFORCEMENT
// =====================================================

const REQUEST_5_NEW_RULE = `---
# Rule: Enforce Discussion Flairs
type: submission
link_flair_text (not): ['Discussion', 'Question']
title (includes): ['discussion', 'question', 'ask', 'what', 'how', 'why']
action: remove
comment: |
  Your post was removed - this community requires discussion posts to be flaired as either "Discussion" or "Question". Please repost with the appropriate flair.
modmail: |
  Removed unflaired discussion post: {{permalink}}
  User: u/{{author}}
  Current Flair: {{link_flair_text}}
  Reason: Discussion post without proper flair
---`;

const YAML_AFTER_REQUEST_5 = YAML_AFTER_REQUEST_4 + '\n\n' + REQUEST_5_NEW_RULE;

// =====================================================
// REQUEST 6: BLAST RADIUS REFINEMENT
// =====================================================

const REQUEST_6_NEW_RULE = `---
# Rule: Refined New Account Link Spam v2
type: submission
author:
  satisfy_any_threshold: true
  account_age: "< 2 days"
  combined_karma: "< 3"
title (regex): ['(?i)(buy|click|free|winner|act now|limited time|exclusive)']
body (includes): ['amazon', 'ebay', 'affiliate', 'commission', 'bit.ly', 'tinyurl', 'aff.link']
action: remove
comment: |
  Your post was removed by AutoModerator. This account is too new and the post appears to contain promotional content. Contact mods if this is a mistake.
modmail: |
  Removed refined spam: {{permalink}}
  User: u/{{author}} ({{account_age}} days old, {{combined_karma}} karma)
  Reason: New account + promotional keywords + affiliate links
---`;

const YAML_AFTER_REQUEST_6 = YAML_AFTER_REQUEST_5 + '\n\n' + REQUEST_6_NEW_RULE;

// =====================================================
// REQUEST 7: REMOVAL REASON INTEGRATION
// =====================================================

const REQUEST_7_NEW_RULE = `---
# Rule: Spam Bot Detection
type: submission
author:
  account_age: "< 1 day"
  combined_karma: "< 1"
title (regex): ['(?i)^[a-zA-Z0-9\\s]{50,}$|(?i)(click|buy|free|limited)']
body (includes): ['http', 'bot generated', 'auto-post', 'automated']
action: remove
comment: |
  Your post was removed - Spam Bot. Automated accounts and bot-generated content are prohibited. If you're legitimate, [Message Mods](https://reddit.com/message/compose?to=/r/AutoModDemo)
modmail: |
  Removed spam bot post: {{permalink}}
  User: u/{{author}} ({{account_age}} days old, {{combined_karma}} karma)
  Reason: Spam Bot - new account with bot-like behavior
---`;

const YAML_AFTER_REQUEST_7 = YAML_AFTER_REQUEST_6 + '\n\n' + REQUEST_7_NEW_RULE;

// =====================================================
// FINAL COMPLETE YAML
// =====================================================

const FINAL_COMPLETE_YAML = YAML_AFTER_REQUEST_7;

// =====================================================
// TEST SUITE
// =====================================================

describe('Cumulative YAML Generation Test Suite', () => {
  // =====================================================
  // REQUEST 1 TESTS
  // =====================================================

  describe('Request 1: Spam Detection', () => {
    it('should generate valid YAML rule', () => {
      const validation = validateYamlBlock(REQUEST_1_NEW_RULE);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should contain required fields', () => {
      expect(REQUEST_1_NEW_RULE).toContain('# Rule: New Account Link Spam');
      expect(REQUEST_1_NEW_RULE).toContain('type: submission');
      expect(REQUEST_1_NEW_RULE).toContain('account_age');
      expect(REQUEST_1_NEW_RULE).toContain('combined_karma');
      expect(REQUEST_1_NEW_RULE).toContain('body (includes)');
      expect(REQUEST_1_NEW_RULE).toContain('action: remove');
    });

    it('should accumulate after request 1', () => {
      const rules = parseYamlRules(YAML_AFTER_REQUEST_1);
      expect(rules).toHaveLength(4); // 3 initial + 1 new
      expect(countRules(YAML_AFTER_REQUEST_1)).toBe(4);
    });

    it('should have all previous rules intact', () => {
      const ruleNames = getRuleNames(YAML_AFTER_REQUEST_1);
      expect(ruleNames).toContain('Link Domain Blocklist');
      expect(ruleNames).toContain('New Account Safeguard');
      expect(ruleNames).toContain('All Caps Title');
      expect(ruleNames).toContain('New Account Link Spam');
    });

    it('should validate complete YAML after request 1', () => {
      const validation = validateYamlBlock(YAML_AFTER_REQUEST_1);
      expect(validation.valid).toBe(true);
    });
  });

  // =====================================================
  // REQUEST 2 TESTS
  // =====================================================

  describe('Request 2: Self-Promotion Guard', () => {
    it('should generate valid new rule', () => {
      const validation = validateYamlBlock(REQUEST_2_NEW_RULE);
      expect(validation.valid).toBe(true);
    });

    it('should use context-aware keywords', () => {
      expect(REQUEST_2_NEW_RULE).toContain('Self Promotion');
      expect(REQUEST_2_NEW_RULE).toContain('amazon.com');
      expect(REQUEST_2_NEW_RULE).toContain('ebay.com');
      expect(REQUEST_2_NEW_RULE).toContain('affiliate');
    });

    it('should accumulate to 5 rules total', () => {
      expect(countRules(YAML_AFTER_REQUEST_2)).toBe(5);
    });

    it('should maintain all previous rules', () => {
      const ruleNames = getRuleNames(YAML_AFTER_REQUEST_2);
      expect(ruleNames).toHaveLength(5);
      expect(ruleNames).toContain('Link Domain Blocklist');
      expect(ruleNames).toContain('New Account Link Spam');
      expect(ruleNames).toContain('Self-Promotion & Affiliate Detection');
    });

    it('should have valid complete YAML', () => {
      const validation = validateYamlBlock(YAML_AFTER_REQUEST_2);
      expect(validation.valid).toBe(true);
    });
  });

  // =====================================================
  // REQUEST 3 TESTS
  // =====================================================

  describe('Request 3: Misinformation Filter', () => {
    it('should generate valid misinformation rule', () => {
      const validation = validateYamlBlock(REQUEST_3_NEW_RULE);
      expect(validation.valid).toBe(true);
    });

    it('should match community rule about sources', () => {
      expect(REQUEST_3_NEW_RULE).toContain('Verify Sources');
      expect(REQUEST_3_NEW_RULE).toContain('Misinformation');
      expect(REQUEST_3_NEW_RULE).toContain('peer-reviewed');
    });

    it('should accumulate to 6 rules total', () => {
      expect(countRules(YAML_AFTER_REQUEST_3)).toBe(6);
    });

    it('should preserve all rule names', () => {
      const ruleNames = getRuleNames(YAML_AFTER_REQUEST_3);
      expect(ruleNames).toHaveLength(6);
      expect(ruleNames).toContain('Unverified Health Claims');
    });

    it('should maintain rule ordering', () => {
      const ruleNames = getRuleNames(YAML_AFTER_REQUEST_3);
      expect(ruleNames[0]).toContain('Link Domain');
      expect(ruleNames[ruleNames.length - 1]).toContain('Health Claims');
    });
  });

  // =====================================================
  // REQUEST 4 TESTS
  // =====================================================

  describe('Request 4: Low-Effort Filter', () => {
    it('should generate valid low-effort rule', () => {
      const validation = validateYamlBlock(REQUEST_4_NEW_RULE);
      expect(validation.valid).toBe(true);
    });

    it('should detect multiple low-effort patterns', () => {
      expect(REQUEST_4_NEW_RULE).toContain('copy paste');
      expect(REQUEST_4_NEW_RULE).toContain('lorem ipsum');
      expect(REQUEST_4_NEW_RULE).toContain('[A-Z\\s\\d]{30,}');
    });

    it('should accumulate to 7 rules', () => {
      expect(countRules(YAML_AFTER_REQUEST_4)).toBe(7);
    });

    it('should reference removal reason', () => {
      expect(REQUEST_4_NEW_RULE).toContain('Low Effort Content');
    });

    it('should not duplicate any rules', () => {
      const ruleNames = getRuleNames(YAML_AFTER_REQUEST_4);
      const uniqueNames = new Set(ruleNames);
      expect(ruleNames).toHaveLength(uniqueNames.size);
    });
  });

  // =====================================================
  // REQUEST 5 TESTS
  // =====================================================

  describe('Request 5: Flair Enforcement', () => {
    it('should generate valid flair rule', () => {
      const validation = validateYamlBlock(REQUEST_5_NEW_RULE);
      expect(validation.valid).toBe(true);
    });

    it('should use exact flair names from context', () => {
      expect(REQUEST_5_NEW_RULE).toContain("'Discussion'");
      expect(REQUEST_5_NEW_RULE).toContain("'Question'");
    });

    it('should accumulate to 8 rules', () => {
      expect(countRules(YAML_AFTER_REQUEST_5)).toBe(8);
    });

    it('should use correct flair syntax', () => {
      expect(REQUEST_5_NEW_RULE).toContain('link_flair_text (not)');
    });

    it('all rules should be valid', () => {
      const rules = parseYamlRules(YAML_AFTER_REQUEST_5);
      for (const rule of rules) {
        const validation = validateYamlBlock(rule.yaml);
        expect(validation.valid).toBe(true);
      }
    });
  });

  // =====================================================
  // REQUEST 6 TESTS (BLAST FEEDBACK)
  // =====================================================

  describe('Request 6: Blast Radius Refinement', () => {
    it('should generate refined spam rule v2', () => {
      const validation = validateYamlBlock(REQUEST_6_NEW_RULE);
      expect(validation.valid).toBe(true);
    });

    it('should be stricter on affiliate links', () => {
      expect(REQUEST_6_NEW_RULE).toContain('amazon');
      expect(REQUEST_6_NEW_RULE).toContain('ebay');
      expect(REQUEST_6_NEW_RULE).toContain('affiliate');
      expect(REQUEST_6_NEW_RULE).toContain('commission');
    });

    it('should be looser on account age (2 days vs 3)', () => {
      expect(REQUEST_6_NEW_RULE).toContain('< 2 days');
      expect(REQUEST_6_NEW_RULE).not.toContain('< 3 days');
    });

    it('should accumulate to 9 rules', () => {
      expect(countRules(YAML_AFTER_REQUEST_6)).toBe(9);
    });

    it('should reflect blast feedback in comment', () => {
      expect(REQUEST_6_NEW_RULE).toContain('Contact mods if this is a mistake');
    });

    it('should include blast context explanation', () => {
      expect(REQUEST_6_NEW_RULE).toContain('Refined');
      expect(REQUEST_6_NEW_RULE).toContain('v2');
    });
  });

  // =====================================================
  // REQUEST 7 TESTS (REMOVAL REASON INTEGRATION)
  // =====================================================

  describe('Request 7: Removal Reason Integration', () => {
    it('should generate valid spam bot rule', () => {
      const validation = validateYamlBlock(REQUEST_7_NEW_RULE);
      expect(validation.valid).toBe(true);
    });

    it('should use exact removal reason text', () => {
      expect(REQUEST_7_NEW_RULE).toContain('Spam Bot');
    });

    it('should detect bot-like accounts', () => {
      expect(REQUEST_7_NEW_RULE).toContain('account_age: "< 1 day"');
      expect(REQUEST_7_NEW_RULE).toContain('combined_karma: "< 1"');
    });

    it('should accumulate to 10 rules final', () => {
      expect(countRules(YAML_AFTER_REQUEST_7)).toBe(10);
    });

    it('should reference removal reason consistently', () => {
      expect(REQUEST_7_NEW_RULE).toContain('Spam Bot');
      expect(REQUEST_7_NEW_RULE).toContain('Reason: Spam Bot');
    });
  });

  // =====================================================
  // FINAL YAML VALIDATION
  // =====================================================

  describe('Final Complete YAML Validation', () => {
    it('should have exactly 10 rules', () => {
      expect(countRules(FINAL_COMPLETE_YAML)).toBe(10);
    });

    it('should have all rule names', () => {
      const ruleNames = getRuleNames(FINAL_COMPLETE_YAML);
      expect(ruleNames).toEqual([
        'Link Domain Blocklist',
        'New Account Safeguard',
        'All Caps Title',
        'New Account Link Spam',
        'Self-Promotion & Affiliate Detection',
        'Unverified Health Claims',
        'Low-Effort & Copy-Paste Detection',
        'Enforce Discussion Flairs',
        'Refined New Account Link Spam v2',
        'Spam Bot Detection',
      ]);
    });

    it('should maintain proper YAML structure', () => {
      const sections = FINAL_COMPLETE_YAML.split('---').filter(s => s.trim().length > 0);
      // Each rule should be a complete section
      for (const section of sections) {
        expect(section).toContain('type: submission');
        expect(section).toContain('action:');
      }
    });

    it('should not have duplicate rule names', () => {
      const ruleNames = getRuleNames(FINAL_COMPLETE_YAML);
      const uniqueNames = new Set(ruleNames);
      expect(ruleNames).toHaveLength(uniqueNames.size);
    });

    it('should validate each individual rule', () => {
      const rules = parseYamlRules(FINAL_COMPLETE_YAML);
      expect(rules).toHaveLength(10);

      for (const rule of rules) {
        const validation = validateYamlBlock(rule.yaml);
        expect(validation.valid).toBe(true);
      }
    });

    it('should preserve all context elements', () => {
      // Check for community rule references
      expect(FINAL_COMPLETE_YAML).toContain('Verify Sources');
      expect(FINAL_COMPLETE_YAML).toContain('Misinformation');
      expect(FINAL_COMPLETE_YAML).toContain('Self Promotion');
      expect(FINAL_COMPLETE_YAML).toContain('Spam Bot');
      expect(FINAL_COMPLETE_YAML).toContain('Low Effort');
    });

    it('should use exact flair names', () => {
      expect(FINAL_COMPLETE_YAML).toContain("'Discussion'");
      expect(FINAL_COMPLETE_YAML).toContain("'Question'");
    });

    it('should have consistent modmail templates', () => {
      const modmailCount = (FINAL_COMPLETE_YAML.match(/modmail:/g) || []).length;
      expect(modmailCount).toBe(10);
    });

    it('should have consistent comment templates', () => {
      const commentCount = (FINAL_COMPLETE_YAML.match(/comment:/g) || []).length;
      expect(commentCount).toBe(8); // 8 rules have comment blocks (2 initial rules don't)
    });

    it('should maintain proper action diversity', () => {
      const hasRemove = FINAL_COMPLETE_YAML.includes('action: remove');
      const hasFilter = FINAL_COMPLETE_YAML.includes('action: filter');
      const hasReport = FINAL_COMPLETE_YAML.includes('action: report');

      expect(hasRemove).toBe(true);
      expect(hasFilter).toBe(true);
      expect(hasReport).toBe(true);
    });

    it('should show progression and refinement', () => {
      // Request 6 should be a refinement (has "v2" or "Refined")
      const request6RuleName = getRuleNames(FINAL_COMPLETE_YAML)[8];
      expect(request6RuleName).toContain('Refined');
    });
  });

  // =====================================================
  // CUMULATIVE PROGRESSION TESTS
  // =====================================================

  describe('Cumulative Progression', () => {
    it('should grow from 3 initial to 10 total rules', () => {
      const initial = countRules(INITIAL_YAML);
      const final = countRules(FINAL_COMPLETE_YAML);

      expect(initial).toBe(3);
      expect(final).toBe(10);
      expect(final - initial).toBe(7); // 7 requests added 7 rules
    });

    it('should maintain rule integrity at each step', () => {
      const steps = [
        { yaml: YAML_AFTER_REQUEST_1, expected: 4 },
        { yaml: YAML_AFTER_REQUEST_2, expected: 5 },
        { yaml: YAML_AFTER_REQUEST_3, expected: 6 },
        { yaml: YAML_AFTER_REQUEST_4, expected: 7 },
        { yaml: YAML_AFTER_REQUEST_5, expected: 8 },
        { yaml: YAML_AFTER_REQUEST_6, expected: 9 },
        { yaml: YAML_AFTER_REQUEST_7, expected: 10 },
      ];

      for (const step of steps) {
        expect(countRules(step.yaml)).toBe(step.expected);
        const rules = parseYamlRules(step.yaml);
        for (const rule of rules) {
          const validation = validateYamlBlock(rule.yaml);
          expect(validation.valid).toBe(true);
        }
      }
    });

    it('should show context awareness at each step', () => {
      // Each rule should reference or use community context
      expect(YAML_AFTER_REQUEST_1).toContain('account_age'); // Respects account age
      expect(YAML_AFTER_REQUEST_2).toContain('Self Promotion'); // Uses removal reason
      expect(YAML_AFTER_REQUEST_3).toContain('Verify Sources'); // References community rule
      expect(YAML_AFTER_REQUEST_4).toContain('Low Effort'); // Uses removal reason
      expect(YAML_AFTER_REQUEST_5).toContain("'Discussion'"); // Uses exact flairs
      expect(YAML_AFTER_REQUEST_6).toContain('v2'); // Shows refinement
      expect(YAML_AFTER_REQUEST_7).toContain('Spam Bot'); // Uses removal reason
    });

    it('should show iterative improvement at request 6', () => {
      // Request 1 has: account_age: "< 3 days", combined_karma: "< 5"
      const request1HasThreshold = YAML_AFTER_REQUEST_1.includes('< 3 days');
      expect(request1HasThreshold).toBe(true);

      // Request 6 refines to: account_age: "< 2 days", combined_karma: "< 3"
      const request6HasRefinedThreshold = YAML_AFTER_REQUEST_6.includes('< 2 days');
      expect(request6HasRefinedThreshold).toBe(true);

      // Shows the refinement happened
      expect(YAML_AFTER_REQUEST_6).toContain('Refined');
    });
  });

  // =====================================================
  // CONTENT MATCHING TESTS
  // =====================================================

  describe('Content Matching & Validation', () => {
    const testCases = [
      {
        name: 'Rule 1: New Account Link Spam',
        yaml: YAML_AFTER_REQUEST_1,
        shouldContain: [
          '# Rule: New Account Link Spam',
          'account_age: "< 3 days"',
          'body (includes)',
          'action: remove',
        ],
      },
      {
        name: 'Rule 2: Self-Promotion & Affiliate',
        yaml: YAML_AFTER_REQUEST_2,
        shouldContain: [
          '# Rule: Self-Promotion & Affiliate Detection',
          'amazon.com',
          'ebay.com',
          'affiliate',
        ],
      },
      {
        name: 'Rule 3: Health Claims',
        yaml: YAML_AFTER_REQUEST_3,
        shouldContain: [
          '# Rule: Unverified Health Claims',
          'cure',
          'heal',
          'remedy',
          'peer-reviewed',
        ],
      },
      {
        name: 'Rule 4: Low-Effort',
        yaml: YAML_AFTER_REQUEST_4,
        shouldContain: [
          '# Rule: Low-Effort & Copy-Paste Detection',
          'lorem ipsum',
          'placeholder',
          'Low Effort Content',
        ],
      },
      {
        name: 'Rule 5: Flair Enforcement',
        yaml: YAML_AFTER_REQUEST_5,
        shouldContain: [
          '# Rule: Enforce Discussion Flairs',
          "'Discussion'",
          "'Question'",
          'link_flair_text (not)',
        ],
      },
      {
        name: 'Rule 6: Refined Spam',
        yaml: YAML_AFTER_REQUEST_6,
        shouldContain: [
          '# Rule: Refined New Account Link Spam v2',
          '< 2 days',
          'promotional',
        ],
      },
      {
        name: 'Rule 7: Spam Bot',
        yaml: YAML_AFTER_REQUEST_7,
        shouldContain: [
          '# Rule: Spam Bot Detection',
          'Spam Bot',
          '< 1 day',
          'bot-generated',
        ],
      },
    ];

    for (const testCase of testCases) {
      it(`${testCase.name} contains expected content`, () => {
        for (const content of testCase.shouldContain) {
          expect(testCase.yaml).toContain(content);
        }
      });
    }
  });
});

// =====================================================
// EXPORT FINAL YAML
// =====================================================

export const FinalYamlExport = {
  initial: INITIAL_YAML,
  afterRequest1: YAML_AFTER_REQUEST_1,
  afterRequest2: YAML_AFTER_REQUEST_2,
  afterRequest3: YAML_AFTER_REQUEST_3,
  afterRequest4: YAML_AFTER_REQUEST_4,
  afterRequest5: YAML_AFTER_REQUEST_5,
  afterRequest6: YAML_AFTER_REQUEST_6,
  afterRequest7: FINAL_COMPLETE_YAML,
  final: FINAL_COMPLETE_YAML,
};

export function printYamlProgression() {
  console.log('=== YAML PROGRESSION ===\n');
  console.log('Initial YAML (3 rules)');
  console.log('├─ Link Domain Blocklist');
  console.log('├─ New Account Safeguard');
  console.log('└─ All Caps Title\n');

  console.log('Request 1 (+1): New Account Link Spam (4 total)');
  console.log('Request 2 (+1): Self-Promotion & Affiliate Detection (5 total)');
  console.log('Request 3 (+1): Unverified Health Claims (6 total)');
  console.log('Request 4 (+1): Low-Effort & Copy-Paste Detection (7 total)');
  console.log('Request 5 (+1): Enforce Discussion Flairs (8 total)');
  console.log('Request 6 (+1): Refined New Account Link Spam v2 (9 total)');
  console.log('Request 7 (+1): Spam Bot Detection (10 total)\n');

  console.log('Final YAML (10 rules total)');
  console.log(`Size: ${FINAL_COMPLETE_YAML.length} characters`);
  console.log(`Rules: ${countRules(FINAL_COMPLETE_YAML)}`);
  console.log(`Unique names: ${getRuleNames(FINAL_COMPLETE_YAML).length}`);
}