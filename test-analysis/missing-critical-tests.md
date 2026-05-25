# Missing Tests: Production-Ready Checklist

This document shows **exactly which tests are missing** for the production workflow you're asking about.

---

## Test 1: Full E2E Chat → YAML → Wiki → Live

**Currently Missing** ❌

```typescript
describe('Full production workflow: prompt to live moderation', () => {
  it('should go from user prompt to rules enforcing in subreddit', async ({ mocks }) => {
    const subredditName = 'test-community';
    
    // STEP 1: User sends prompt via chat
    const chatResponse = await callChatEndpoint({
      prompt: 'Remove cryptocurrency spam and low-effort posts',
      subredditContext: `We are a tech discussion forum.
                         Posts about "invest now" or "get rich quick" are spam.
                         Posts under 50 words with no links are low-effort.`,
      history: []
    });

    expect(chatResponse.status).toBe('success');
    expect(chatResponse.response).toContain('```yaml');

    // STEP 2: Extract and parse YAML from response
    const yamlMatch = chatResponse.response.match(/```yaml\n([\s\S]*?)\n```/);
    expect(yamlMatch).not.toBeNull();
    
    const generatedYaml = yamlMatch![1];
    const rule = parseAutomodRuleDraft(generatedYaml, DEFAULT_AUTOMOD_RULE);

    // STEP 3: Verify rule matches intent
    expect(rule.action).toBe('remove');
    expect(rule.name).toMatch(/crypto|spam|low.*effort/i);
    expect(rule.conditions.length).toBeGreaterThan(0);

    // STEP 4: Save to wiki (this is what happens on "Deploy" click)
    const testContext = { subredditName };
    
    // Mock wiki to allow save
    vi.spyOn(mocks.reddit as any, 'getWikiPage')
      .mockResolvedValue({ content_md: '' });
    
    const updateWikiSpy = vi.spyOn(mocks.reddit as any, 'updateWikiPage')
      .mockResolvedValue(undefined);

    // In a real test, we'd need context override, but this shows the flow:
    // await saveCurrentRule(rule);

    // STEP 5: Verify wiki was updated with correct content
    // expect(updateWikiSpy).toHaveBeenCalled();
    // const wikiContent = updateWikiSpy.mock.calls[0][0].content;
    // expect(wikiContent).toContain('cryptocurrency');
    // expect(wikiContent).toContain('low.effort');

    // STEP 6: Simulate posts to verify rule works as intended
    const testPosts = [
      {
        id: 'post1',
        title: 'Buy Bitcoin NOW - Easy Money!!!',
        body: 'Click here to invest',
        author: 'spammer_bot',
        accountAgeDays: 1,
        combinedKarma: 10,
        isSpam: true,
      },
      {
        id: 'post2',
        title: 'Interesting discussion about blockchain technology',
        body: 'I wanted to share some thoughts on blockchain...',
        author: 'legitimate_user',
        accountAgeDays: 365,
        combinedKarma: 5000,
        isSpam: false,
      },
      {
        id: 'post3',
        title: 'lol',
        body: '',
        author: 'lazy_poster',
        accountAgeDays: 30,
        combinedKarma: 50,
        isSpam: true,
      },
    ];

    const evaluation = evaluateRule(rule, testPosts);
    
    // Should catch spam
    expect(evaluation.removed).toBeGreaterThanOrEqual(2);
    
    // Should NOT flag legitimate discussion
    expect(evaluation.falsePositives.posts).not.toContainEqual(
      expect.objectContaining({ id: 'post2' })
    );

    // STEP 7: In production, AutoModerator would now enforce this rule
    // This step requires actual Devvit server running, so it can't be unit tested
    // But we could add a documentation requirement that this was manually tested
  });
});
```

**Why this test is critical:**
- Verifies the user's journey is complete
- Catches if AI response can't be parsed
- Catches if YAML doesn't implement what user asked for
- Catches if false positives exist

---

## Test 2: Versioning & Version Compatibility

**Currently Missing** ❌

```typescript
describe('App versioning and rule compatibility', () => {
  test('should include app version in serialized rules', () => {
    const rule = buildRule({
      name: 'Spam filter',
      action: 'remove',
      comment: 'Removed',
      modmail: 'Spam: {{permalink}}'
    });

    const yaml = serializeAutomodRule(rule);
    
    // Rules should indicate which version created them
    // Currently this is NOT in the code:
    // expect(yaml).toContain('# Created by RuleStage v');
    // expect(yaml).toContain('1.2.3'); // version from package.json
    
    // MISSING: Version metadata in YAML
    console.log('FAIL: No version marker in YAML');
  });

  test('should migrate rules from v1.0 format to v2.0 format', () => {
    // Old YAML from v1.0
    const oldYaml = `---
# Spam filter
type: submission
action: remove
comment: |
  Removed as spam
modmail: |
  {{permalink}}
domain: ['spam.com']
---`;

    // Parse with NEW v2.0 parser
    // In v2.0, maybe we add priority or other fields
    const migrated = parseAutomodRuleDraft(oldYaml, DEFAULT_AUTOMOD_RULE);

    // Ensure backward compatibility
    expect(migrated.name).toBe('Spam filter');
    expect(migrated.action).toBe('remove');
    expect(migrated.conditions.length).toBeGreaterThanOrEqual(0);

    // MISSING: No migration path is defined in the codebase
  });

  test('should warn when app is newer than deployed rules', () => {
    // Subreddit installed v1.2.0 of app
    // Rules were created in v1.2.0
    // User updates to v1.5.0
    // Check if rules need migration
    
    const deployedRuleVersion = '1.2.0';
    const currentAppVersion = '1.5.0';

    // Should API indicate: "Rules are from older version, consider review"?
    // MISSING: No such version tracking exists
    console.log('FAIL: No version tracking in deployed rules');
  });

  test('should prevent incompatible version combinations', () => {
    // Subreddit has v2.0 rules (new format)
    // App accidentally downgraded to v1.9
    // Should prevent or warn
    
    const subredditRulesVersion = '2.0.0';
    const appVersion = '1.9.0';

    // Should validate: app version >= rules version
    // MISSING: No such validation exists
    const isCompatible = validateVersionCompat(appVersion, subredditRulesVersion);
    expect(isCompatible).toBe(false); // Should fail
    
    // MISSING: This function doesn't exist
  });
});
```

**Why this test is critical:**
- Prevents silent data loss on updates
- Allows tracking which version created each rule
- Enables safe upgrades and downgrades
- Currently the code has: `"version": "0.0.0"` but never uses it

---

## Test 3: Multi-Rule Aggregation (Don't Overwrite Existing Rules)

**Currently Missing** ❌

```typescript
describe('Wiki contains existing rules before deployment', () => {
  test('should append to existing automod rules, not replace them', async () => {
    // SCENARIO: Subreddit already has automod rules from months ago
    // User now deploys via RuleStage
    // Should merge, not overwrite

    const existingWikiContent = `---
# Rule 1: Old spam filter (created 3 months ago)
type: submission
action: remove
comment: Removed
modmail: Spam
domain: ['old-spam.com']
---

---
# Rule 2: Old linkflairs check
type: submission
action: remove
comment: Missing flair
modmail: No flair
link_flair_text: null
---`;

    // User now creates a new rule via RuleStage
    const newRule = buildRule({
      name: 'New crypto filter',
      action: 'remove',
      comment: 'Crypto spam removed',
      modmail: 'Crypto: {{permalink}}',
      conditions: [
        { field: 'title', comparator: 'includes', value: 'crypto' }
      ]
    });

    const newYaml = serializeAutomodRule(newRule);

    // Current implementation does:
    // reddit.updateWikiPage({ content: newYaml })
    // This OVERWRITES existingWikiContent ❌

    // What SHOULD happen:
    const mergedYaml = existingWikiContent + '\n\n' + newYaml;
    // And both rules should be in wiki

    // TEST MISSING: No test verifies that old rules are preserved
    expect(mergedYaml).toContain('Old spam filter');
    expect(mergedYaml).toContain('Old linkflairs check');
    expect(mergedYaml).toContain('New crypto filter');

    // The real saveCurrentRule() function doesn't do this merge
    // See: src/server/services/automod.service.ts lines 61-67
    // It just calls pushYamlToWiki(yaml) with no merge logic
  });

  test('should warn user if existing rules will be affected', async () => {
    // Before deploying, user should see:
    // "This subreddit already has 2 automod rules. These will [be replaced/merged]."

    // MISSING: No such warning exists in the code
    // User clicks "Deploy" and might lose rules without knowing
  });

  test('should provide version control / history of rule changes', async () => {
    // User deploys rule on Monday
    // User edits rule on Tuesday
    // User wants to roll back to Monday version

    // MISSING: No history/versioning of rules exists
    // Only current rule is stored
  });
});
```

**Why this test is critical:**
- Real subreddits have existing automod rules
- RuleStage as new app should MERGE, not REPLACE
- This is a data-loss bug waiting to happen
- Current code at line 120-121 of automod.service.ts does NOT read existing wiki before writing

---

## Test 4: Subreddit App Lifecycle

**Currently Missing** ❌

```typescript
describe('App installation and removal from subreddit', () => {
  test('should handle app being installed for first time', async () => {
    // Flow:
    // 1. Mod visits /r/mysubreddit/apps
    // 2. Finds RuleStage app
    // 3. Clicks "Add to community"
    // 4. App is now installed

    // What should happen:
    // - App setup initializes
    // - Menu item appears for mods
    // - Database entry created for subreddit (if any)

    // MISSING: No test for app initialization
    // devvit.json has entry point but no init handler
  });

  test('should clean up when app is uninstalled from subreddit', async () => {
    // Flow:
    // 1. Mod uninstalls RuleStage from /r/mysubreddit
    // 2. App is removed

    // What should happen:
    // - Automod rules: kept or deleted?
    // - Cached data: deleted
    // - Settings: deleted

    // MISSING: No test for cleanup
    // No handler defined for app uninstall
    // Rules would be orphaned in wiki
  });

  test('should handle multiple subreddits installing same app', async () => {
    // /r/subreddit-a and /r/subreddit-b both install RuleStage
    // Each should have independent rules and settings

    // Test should verify:
    // - /r/subreddit-a changes don't affect /r/subreddit-b
    // - Redis keys are properly scoped

    // PARTIAL: wiki-injection.test.ts tests this for Reddit wiki
    // But doesn't test app menu, triggers, or subreddit context switching
  });

  test('should handle app being reinstalled after uninstall', async () => {
    // Mod uninstalls, then reinstalls
    // Should it restore old rules or start fresh?

    // MISSING: No test for reinstallation scenario
    // No cleanup defined for uninstallation
  });
});
```

**Why this test is critical:**
- Verifies app doesn't cause data loss on removal
- Tests that rules are safely preserved
- Tests that multiple subreddits don't interfere

---

## Test 5: Deployment Command Integration

**Currently Missing** ❌

```typescript
describe('Deployment and version bumping', () => {
  test('npm run deploy should increment version and publish', async () => {
    // package.json has:
    // "version": "0.0.0"
    // "deploy": "npm run type-check && npm run lint && npm run test && devvit upload"
    // "launch": "npm run deploy && devvit publish"

    // Current behavior:
    // 1. Tests run ✅ (vitest)
    // 2. devvit upload is called ❌ (but not tested)
    // 3. devvit publish is called ❌ (but not tested)

    // What should be tested:
    // - Version in package.json gets sent to devvit upload
    // - Devvit server tracks the version
    // - Subreddit users can see "RuleStage v1.2.3" installed

    // MISSING: No test for deployment ceremony
    // Version never changes from "0.0.0"
    // No version tracking in deployed rules
  });

  test('should prevent deploying with failing tests', async () => {
    // "deploy" script runs "npm run test" first
    // If tests fail, devvit upload should not run

    // This is handled by npm script ordering
    // But no test verifies this requirement
  });
});
```

**Why this test is critical:**
- Ensures versioning is consistent
- Prevents broken versions from being published
- Allows users to know which version they have installed

---

## Test 6: AI Accuracy Validation

**Currently Missing** ❌

```typescript
describe('Validate AI-generated rules match user intent', () => {
  test('AI response for "remove cryptocurrency spam" should catch real spam', async () => {
    // This is a cross-cutting concern:
    // The test would need:
    // 1. A real or mock Gemini/LLM API call
    // 2. Multiple spam examples
    // 3. A scoring function to rate accuracy

    const userPrompt = 'Remove cryptocurrency spam - we get a lot of "buy bitcoin" posts';
    const subredditContext = `This is r/NoStupidQuestions.
We don't allow:
- Posts about "getting rich quick"
- Affiliate links
- "Make money fast" spam`;

    // Get AI response
    const response = await callChatEndpoint({
      prompt: userPrompt,
      subredditContext: subredditContext,
      history: []
    });

    const yaml = extractYaml(response.response);
    const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);

    // Test on known spam/non-spam
    const testCases = [
      { post: { title: 'Buy Bitcoin NOW!', body: 'Invest $100 to make $10,000' }, shouldMatch: true },
      { post: { title: 'Best cryptocurrencies for investment', body: 'Here is research...' }, shouldMatch: true }, // Ambiguous
      { post: { title: 'How do I learn about blockchain?', body: 'I want to understand...' }, shouldMatch: false },
      { post: { title: 'GET RICH QUICK!!!', body: 'Click here for free money' }, shouldMatch: true },
    ];

    const evaluation = evaluateRule(rule, testCases.map(tc => tc.post));

    // Accuracy metric: (matches + correct non-matches) / total
    let correct = 0;
    testCases.forEach((tc, idx) => {
      const matched = evaluation.matched > idx; // Simplified
      if (matched === tc.shouldMatch) correct++;
    });

    const accuracy = correct / testCases.length;
    
    // Rule should be at least 80% accurate to user intent
    expect(accuracy).toBeGreaterThanOrEqual(0.8);

    // MISSING: This entire test doesn't exist
    // There's no validation that AI generated YAML is correct
  });
});
```

**Why this test is critical:**
- Validates AI actually understands the user's intent
- Prevents bad rules from being deployed
- Requires test examples that mirror real subreddit needs
- This is a fundamental "does it work?" test

---

## Summary of Missing Tests

| Test Category | Impact | Difficulty | Priority |
|---|---|---|---|
| Full E2E workflow | **CRITICAL** - Entire flow untested | Medium | **P0** |
| Versioning system | **CRITICAL** - Data loss risk | High | **P0** |
| Multi-rule merging | **CRITICAL** - Overwrites existing rules | High | **P0** |
| App lifecycle | **HIGH** - Orphaned rules on uninstall | Medium | **P1** |
| Deployment integration | **HIGH** - Version never tracked | Medium | **P1** |
| AI accuracy | **HIGH** - Rules might not work | Hard | **P1** |

---

## How to Fix

### Immediate (P0 - Blocking)
1. Add test for reading existing wiki before overwriting
2. Add versioning metadata to rules
3. Add E2E test from prompt to rule evaluation

### Short-term (P1 - Important)
1. Add app lifecycle handlers (install/uninstall)
2. Add version compatibility checks
3. Add AI accuracy validation

### Medium-term (P2 - Nice to have)
1. Add app store integration tests
2. Add deployment command tests
3. Add history/audit trail for rules

---

## Proof of the Bug (Overwriting Rules)

Looking at the actual code:

**File: `src/server/services/automod.service.ts` (lines 111-121)**
```typescript
export async function pushYamlToWiki(yaml: string): Promise<void> {
  const subredditName = getSubredditKey();
  if (!subredditName || subredditName === 'default') {
    throw new Error('No subreddit context available');
  }
  await reddit.updateWikiPage({
    subredditName,
    page: 'config/automoderator',
    content: yaml,           // ← OVERWRITES existing wiki content
    reason: 'Updated via AutoMod Builder app',
  });
}
```

**Should be:**
```typescript
export async function pushYamlToWiki(yaml: string): Promise<void> {
  const subredditName = getSubredditKey();
  if (!subredditName || subredditName === 'default') {
    throw new Error('No subreddit context available');
  }
  
  // READ existing content first
  let existingContent = '';
  try {
    const existing = await reddit.getWikiPage(subredditName, 'config/automoderator');
    existingContent = extractWikiContent(existing);
  } catch {
    // Wiki doesn't exist yet, that's fine
  }
  
  // MERGE new rule with existing
  const mergedContent = existingContent.trim() 
    ? existingContent + '\n\n' + yaml 
    : yaml;
  
  await reddit.updateWikiPage({
    subredditName,
    page: 'config/automoderator',
    content: mergedContent,  // ← Now preserves existing rules
    reason: 'Updated via AutoMod Builder app',
  });
}
```

**Test that would catch this:**
```typescript
test('should preserve existing rules when deploying new one', async () => {
  // Mock existing wiki content
  const mockGetWiki = vi.spyOn(mocks.reddit as any, 'getWikiPage')
    .mockResolvedValue({
      content_md: '---\n# Old Rule\ntype: submission\naction: remove\n---'
    });

  const mockUpdateWiki = vi.spyOn(mocks.reddit as any, 'updateWikiPage');

  const newRule = buildRule({ name: 'New Rule' });
  await saveCurrentRule(newRule);

  // Verify update includes BOTH old and new
  const updateCall = mockUpdateWiki.mock.calls[0][0];
  expect(updateCall.content).toContain('Old Rule');      // ← Would FAIL with current code
  expect(updateCall.content).toContain('New Rule');      // ← Would FAIL with current code
});
```

This test **does not exist**, which is why the bug persists.
