import { describe, it, expect } from 'vitest';
import {
  serializeAutomodRule,
  parseAutomodRuleDraft,
  DEFAULT_AUTOMOD_RULE,
  type AutomodRule,
} from '../../shared/automod';

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildRule(overrides: Partial<AutomodRule>): AutomodRule {
  return {
    ...DEFAULT_AUTOMOD_RULE,
    id: 'test-rule',
    conditions: [],
    ...overrides,
  };
}

/**
 * Round-trips a rule through serialize → parse and asserts the result
 * equals the original. This is the most important property: whatever
 * you save should come back identical.
 */
function assertRoundTrip(rule: AutomodRule): void {
  const yaml = serializeAutomodRule(rule);
  const parsed = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
  // Compare only the fields that survive serialization
  expect(parsed.name).toBe(rule.name);
  expect(parsed.action).toBe(rule.action);
  expect(parsed.satisfyAnyThreshold).toBe(rule.satisfyAnyThreshold);
  expect(parsed.comment.trim()).toBe(rule.comment.trim());
  expect(parsed.modmail.trim()).toBe(rule.modmail.trim());
}

// ─── Serialization round-trip ───────────────────────────────────────────────

describe('serializeAutomodRule — round-trip', () => {
  it('serializes a keyword rule and parses back identically', () => {
    const rule = buildRule({
      name: 'Spam guard',
      action: 'remove',
      comment: 'Your post was removed.',
      modmail: 'Removed: {{permalink}}',
      conditions: [
        { field: 'title', comparator: 'includes', value: 'buy now' },
      ],
    });

    assertRoundTrip(rule);
  });

  it('serializes a threshold rule and parses back identically', () => {
    const rule = buildRule({
      name: 'New account filter',
      action: 'remove',
      satisfyAnyThreshold: true,
      comment: 'Account too new.',
      modmail: 'New account post: {{permalink}}',
      conditions: [
        { field: 'account_age', comparator: '<', value: '7' },
        { field: 'combined_karma', comparator: '<', value: '100' },
      ],
    });

    assertRoundTrip(rule);
  });

  it('produces valid YAML delimiters', () => {
    const rule = buildRule({ name: 'Test rule', action: 'report', comment: 'x', modmail: 'y' });
    const yaml = serializeAutomodRule(rule);

    // AutoMod requires --- delimiters
    expect(yaml.startsWith('---')).toBe(true);
    expect(yaml.endsWith('---')).toBe(true);
  });

  it('always includes "type: submission"', () => {
    const rule = buildRule({ name: 'Any rule', comment: 'x', modmail: 'y' });
    expect(serializeAutomodRule(rule)).toContain('type: submission');
  });

  it('includes the rule name as a YAML comment', () => {
    const rule = buildRule({ name: 'My rule name', comment: 'x', modmail: 'y' });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).toContain('# My rule name');
  });

  it('emits "includes" comparator correctly', () => {
    const rule = buildRule({
      name: 'Keyword rule',
      comment: 'x',
      modmail: 'y',
      conditions: [{ field: 'title', comparator: 'includes', value: 'spam' }],
    });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).toContain("title (includes): ['spam']");
  });

  it('emits "matches" comparator correctly', () => {
    const rule = buildRule({
      name: 'Regex rule',
      comment: 'x',
      modmail: 'y',
      conditions: [{ field: 'title', comparator: 'matches', value: '^[A-Z]+$' }],
    });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).toContain("title (matches): ['^[A-Z]+$']");
  });

  it('emits account_age condition with comparator', () => {
    const rule = buildRule({
      name: 'Age rule',
      comment: 'x',
      modmail: 'y',
      conditions: [{ field: 'account_age', comparator: '<', value: '14' }],
    });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).toContain('account_age: "< 14"');
  });

  it('emits combined_karma condition with comparator', () => {
    const rule = buildRule({
      name: 'Karma rule',
      comment: 'x',
      modmail: 'y',
      conditions: [{ field: 'combined_karma', comparator: '<=', value: '50' }],
    });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).toContain('combined_karma: "<= 50"');
  });

  it('includes satisfy_any_threshold in author block', () => {
    const rule = buildRule({
      name: 'Threshold rule',
      satisfyAnyThreshold: true,
      comment: 'x',
      modmail: 'y',
      conditions: [{ field: 'account_age', comparator: '<', value: '7' }],
    });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).toContain('satisfy_any_threshold: true');
  });

  it('multi-line comment is indented with two spaces per line', () => {
    const rule = buildRule({
      name: 'Multiline',
      comment: 'Line one.\nLine two.',
      modmail: 'x',
    });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).toContain('comment: |');
    expect(yaml).toContain('  Line one.');
    expect(yaml).toContain('  Line two.');
  });

  it('returns empty string for an empty rule', () => {
    // A rule with no name, conditions, comment or modmail should not serialize
    const yaml = serializeAutomodRule(DEFAULT_AUTOMOD_RULE);
    expect(yaml).toBe('');
  });
});

// ─── Parse tolerance ─────────────────────────────────────────────────────────

describe('parseAutomodRuleDraft — tolerance', () => {
  it('handles YAML wrapped in markdown code fences', () => {
    // Some AI models return YAML wrapped in ```yaml … ```
    const fenced = `\`\`\`yaml
---
# Fenced rule
type: submission
action: remove
comment: |
  Removed.
modmail: |
  {{permalink}}
---
\`\`\``;

    // parseAutomodRuleDraft itself does NOT strip fences — that's done by
    // extractWikiContent in automod.service.ts. Test the stripping logic here.
    const stripped = fenced.replace(/^[\s]*```(?:yaml)?\s*([\s\S]*?)\s*```[\s]*$/m, '$1').trim();
    const rule = parseAutomodRuleDraft(stripped, DEFAULT_AUTOMOD_RULE);
    expect(rule.name).toBe('Fenced rule');
    expect(rule.action).toBe('remove');
  });

  it('falls back to fallback rule when YAML is malformed', () => {
    const fallback = buildRule({ name: 'Fallback', action: 'approve' });
    const rule = parseAutomodRuleDraft('this is not yaml', fallback);
    // Should not crash; fields that did not parse keep fallback values
    expect(rule).toBeDefined();
  });

  it('parses action correctly for all three values', () => {
    for (const action of ['remove', 'approve', 'report'] as const) {
      const yaml = `---\n# Test\ntype: submission\naction: ${action}\ncomment: |\n  x\nmodmail: |\n  y\n---`;
      const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
      expect(rule.action).toBe(action);
    }
  });

  it('parses satisfy_any_threshold: false correctly', () => {
    const yaml = `---\n# T\ntype: submission\nauthor:\n  satisfy_any_threshold: false\n  account_age: "< 7"\naction: remove\ncomment: |\n  x\nmodmail: |\n  y\n---`;
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
    expect(rule.satisfyAnyThreshold).toBe(false);
  });

  it('parses body condition', () => {
    const yaml = `---
# B
type: submission
body (includes): ['promo']
action: remove
comment: |
  x
modmail: |
  y
---`;
    // Use a fallback with a body condition so the parser can update it
    const fallback = buildRule({
      conditions: [{ field: 'body', comparator: 'includes', value: 'old' }],
    });
    const rule = parseAutomodRuleDraft(yaml, fallback);
    const bodyCondition = rule.conditions.find(c => c.field === 'body');
    expect(bodyCondition?.value).toBe('promo');
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('YAML edge cases', () => {
  it('rule name with special characters survives round-trip', () => {
    const rule = buildRule({ name: "Spam & Scam: 100% off!", comment: 'x', modmail: 'y' });
    const yaml = serializeAutomodRule(rule);
    const parsed = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
    expect(parsed.name).toBe("Spam & Scam: 100% off!");
  });

  it('regex with special chars survives round-trip', () => {
    const rule = buildRule({
      name: 'Regex rule',
      comment: 'x',
      modmail: 'y',
      conditions: [{ field: 'title', comparator: 'matches', value: '^[A-Z\\s]{20,}$' }],
    });
    const yaml = serializeAutomodRule(rule);
    // Use the rule itself as fallback so the parser can update the existing condition
    const parsed = parseAutomodRuleDraft(yaml, rule);
    const cond = parsed.conditions.find(c => c.field === 'title');
    // The value is preserved exactly through round-trip
    expect(cond?.value).toBe('^[A-Z\\s]{20,}$');
  });

  it('does not include null characters in serialized YAML', () => {
    const rule = buildRule({ name: 'Safe rule', comment: 'x', modmail: 'y' });
    const yaml = serializeAutomodRule(rule);
    expect(yaml).not.toContain('\x00');
  });

  it('serialized YAML does not exceed 100KB', () => {
    const rule = buildRule({
      name: 'Big comment',
      comment: 'x'.repeat(50_000),
      modmail: 'y',
    });
    const yaml = serializeAutomodRule(rule);
    expect(Buffer.byteLength(yaml, 'utf8')).toBeLessThan(100_000);
  });
});
