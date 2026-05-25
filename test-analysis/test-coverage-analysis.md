# Test Coverage Analysis: AutoMod Builder
## Does it cover real production deployment workflow?

---

## TL;DR: **GAPS FOUND** ⚠️

The tests **DO NOT** fully cover the complete production workflow. Specifically missing:

1. **YAML-to-Prompt Bi-directional Flow** - Tests YAML generation from structured data but NOT the full circle back from generated YAML
2. **App Versioning & Update Management** - No tests for version bumping, tracking, or deployment versioning
3. **Subreddit App Installation & Removal** - No tests for actual Devvit app installation/removal from subreddits
4. **Version Conflict Resolution** - No tests for handling version mismatches between app and deployed rules
5. **Production Deployment Ceremony** - No integration tests for the full `npm run deploy` → `devvit upload` → `devvit publish` flow

---

## What IS Tested ✅

### 1. **YAML Serialization & Parsing** (yaml-generation.test.ts)
**What it covers:**
- ✅ Converting AutomodRule objects → valid YAML
- ✅ Parsing YAML back to AutomodRule (round-trip)
- ✅ YAML with all condition types (includes, matches, thresholds)
- ✅ Multi-line comments and special characters
- ✅ Edge cases (null chars, 100KB limit, special regex chars)
- ✅ Markdown code fence tolerance

**Example:**
```typescript
// ✅ This is tested:
rule → serialize → YAML → parse → rule (identical)
```

**Limitation:** Only tests the serialization layer, not integration with AI prompts

---

### 2. **Wiki Integration** (wiki-injection.test.ts, devvit-integration.test.ts)
**What it covers:**
- ✅ Calling `reddit.updateWikiPage()` with correct subreddit name
- ✅ Pushing YAML to `config/automoderator` wiki page
- ✅ Subreddit isolation (subreddit A's rules don't appear in B)
- ✅ Redis caching of current rule
- ✅ Fallback from wiki to Redis when wiki unavailable
- ✅ Wiki page content format validation

**Example from devvit-integration.test.ts:**
```typescript
// ✅ This is tested:
test('saveCurrentRule writes to Redis and attempts wiki update', async () => {
  const rule = { name: 'Saved rule', action: 'remove', ... };
  const saved = await saveCurrentRule(rule);
  
  // Verified wiki was called with correct subredditName
  expect(updateWikiSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      subredditName: 'my-subreddit',
      page: 'config/automoderator',
    })
  );
});
```

**What's NOT tested:**
- ❌ What happens when wiki page already has OTHER rules (rule merging/appending)
- ❌ Handling existing `---` delimiters in the wiki
- ❌ Version metadata in the wiki page content

---

### 3. **Rule Evaluation & Simulation** (rule-evaluation.test.ts, unified-chat.test.ts)
**What it covers:**
- ✅ Testing rules against mock posts
- ✅ Blast radius analysis (false positives, missed spam)
- ✅ All three actions: remove, approve, report
- ✅ Account age and karma thresholds
- ✅ Multiple conditions with AND/OR logic

**Limitation:** Tests evaluation in isolation, not within production mod workflows

---

### 4. **AI Chat to YAML Generation** (api-routes.integration.test.ts, unified-chat.test.ts)
**What it covers:**
- ✅ POST `/api/rule-stage/chat` accepts prompt + history
- ✅ Expected response shape with YAML inside markdown fences
- ✅ Prompt validation (not empty)
- ✅ History array format validation

**Example:**
```typescript
// ✅ This is tested:
it('should return text response shape', () => {
  const expectedResponse = {
    status: 'success',
    response: '```yaml\n---\naction: remove\n---\n```',
  };
  expect(expectedResponse.response).toContain('yaml');
});
```

**Critical gap:**
- ❌ No test that shows: prompt → AI → YAML response → actual wiki update
- ❌ No test for user edits after AI generation

---

## What's NOT Tested ❌

### 1. **Full Deployment Lifecycle**
```
┌─────────────────────────────────────────┐
│     npm run build                       │ ← Compiled via Vite
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│     npm run test (passes)               │ ← Tests run here
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│     devvit upload                       │ ← ❌ NOT TESTED
│     (package.json version → server)     │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│     devvit publish                      │ ← ❌ NOT TESTED
│     (app appears in subreddit store)    │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│     User installs app in subreddit      │ ← ❌ NOT TESTED
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│     App server starts in subreddit      │ ← ❌ NOT TESTED
│     (devvit.json triggers register)     │
└─────────────────────────────────────────┘
```

**No tests for:**
- ❌ Version bump in package.json
- ❌ Upload to Devvit server
- ❌ Publishing to subreddit app store
- ❌ User installation flow
- ❌ App startup in the actual subreddit context

---

### 2. **YAML Versioning & Updates**

**Scenario NOT tested:**
```
Subreddit has deployed app v1.0.0 with rules:
  - Rule A (old syntax)
  - Rule B (old syntax)

Dev updates to v1.1.0 and pushes new rule format:
  - Rule A (new syntax)
  - Rule B (new syntax)  ← Backward compatible?
  - Rule C (new)

❌ NO TEST: How does the subreddit handle the update?
           Do rules automatically migrate?
           Does it warn about breaking changes?
```

**What's needed but missing:**
```typescript
// Not in any test file:
test('updating from v1.0.0 to v1.1.0 maintains rule compatibility', () => {
  const oldYaml = /* v1.0.0 format */;
  const newYaml = /* v1.1.0 format */;
  
  // Parse old YAML with new parser
  const migrated = parseAutomodRuleDraft(oldYaml, DEFAULT_AUTOMOD_RULE);
  
  // Verify no data loss
  expect(migrated.name).toBe(oldRule.name);
});
```

---

### 3. **Subreddit App Lifecycle**

**NOT TESTED:**
```typescript
// User flow that has NO integration test:

// 1. Moderator navigates to subreddit apps
// 2. Finds "RuleStage" app
// 3. Clicks "Add to Community"
// 4. App appears in subreddit menu
// 5. Clicks "Open RuleStage" from mod menu
// 6. Builds a rule with AI
// 7. Clicks "Deploy"
// 8. Rule appears in automoderator config/wiki
// 9. Moderator removes app from subreddit
// 10. Rules remain in automoderator? Or are deleted?

No tests cover steps 2, 3, 4, 9, 10.
```

---

### 4. **Version Conflict Scenarios**

**NOT TESTED:**
```typescript
describe('Version Conflicts', () => {
  // ❌ These don't exist in the test suite:
  
  it('should warn if subreddit already has automod rules', () => {
    // Two versions of rules can coexist?
    // Or does one overwrite?
  });
  
  it('should track which version of app created each rule', () => {
    // v1.0: User creates Rule A
    // v1.2: Developer adds new field to rules
    // Can Rule A still be edited?
  });
  
  it('should prevent deploying to subreddit with incompatible app version', () => {
    // App v1.5 tries to deploy rules to subreddit running v1.2
    // What happens?
  });
  
  it('should handle app version downgrades gracefully', () => {
    // Subreddit has v2.0 rules
    // App downgraded to v1.9
    // Can old rules still be edited?
  });
});
```

---

### 5. **Prompt → YAML → Wiki → Live Execution**

**Current testing gap visualized:**
```
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│  User Prompt │   →    │ AI generates │   →    │ YAML string  │
│              │        │ YAML response│        │              │
└──────────────┘        └──────────────┘        └──────────────┘
     ✅ Tested              ✅ Tested              ✅ Tested
     (validation)          (via mocks)           (parsing)
          
                               ↓

┌──────────────────────────────────────────────────────────────┐
│              Wiki Page Updated                               │
│              (config/automoderator)                          │
└──────────────────────────────────────────────────────────────┘
     ✅ Tested (wiki update called)
     ❌ NOT tested: What if wiki already has content?
     ❌ NOT tested: Multi-rule aggregation

                               ↓

┌──────────────────────────────────────────────────────────────┐
│   Rules Actually Enforce in Subreddit (AutoModerator runs)  │
└──────────────────────────────────────────────────────────────┘
     ❌ NOT TESTED AT ALL
     This is production reality check
```

**Example missing test:**
```typescript
test('prompt → yaml → wiki → live moderation (full E2E)', async () => {
  // 1. Send chat prompt
  const response = await fetch('/api/rule-stage/chat', {
    body: JSON.stringify({
      prompt: 'Remove spam about crypto'
    })
  });
  
  const { response: yamlString } = await response.json();
  const yaml = extractYamlFromMarkdown(yamlString);
  
  // 2. Parse to rule
  const rule = parseAutomodRuleDraft(yaml, DEFAULT_AUTOMOD_RULE);
  
  // 3. Save to wiki
  await saveCurrentRule(rule);
  
  // 4. Verify wiki actually has it
  const liveWiki = await reddit.getWikiPage('my-subreddit', 'config/automoderator');
  expect(liveWiki.content_md).toContain('crypto'); // ← NOT TESTED
  
  // 5. Simulate a post and verify it matches
  const testPost = { title: 'Buy Bitcoin NOW!', ... };
  const result = evaluateRule(rule, [testPost]);
  expect(result.removed).toBe(1); // ← Isolated test, not integration
});
```

This test **does not exist**.

---

## Specific Gaps for Your Questions

### Q1: "Does YAML creation match what the prompt intended?"

**Current testing:**
```typescript
✅ Test: Prompt sent → Response contains valid YAML
✅ Test: YAML parses back to same rule
✅ Test: YAML written to wiki page

❌ Missing:
   - Does the YAML actually implement what user asked for?
   - Example: User says "Remove crypto spam"
     Does generated YAML only match real crypto spam?
     Or would it false-positive on "cryptocurrency research"?
   - Answer: Only blast radius estimates this (not a strict test)
```

**Better test would be:**
```typescript
test('AI-generated YAML for "remove spam" actually removes spam', async () => {
  // 1. Get AI response for specific prompt
  const response = await callAI('Remove cryptocurrency spam');
  const yaml = response.generatedYaml;
  
  // 2. Parse it
  const rule = parseAutomodRuleDraft(yaml, DEFAULT);
  
  // 3. Test on known spam posts
  const spamPosts = [
    { title: 'Buy Bitcoin now!', isSpam: true },
    { title: 'Ethereum discussion forum', isSpam: false },
  ];
  
  const result = evaluateRule(rule, spamPosts);
  
  // 4. Verify accuracy
  expect(result.removed).toBeGreaterThan(0); // Catches real spam
  expect(result.falsePositives).toBe(0);      // No legitimate posts removed
  
  // ← This test does NOT exist
});
```

---

### Q2: "Does the automod get added to subreddit with proper versioning?"

**Current testing:**
```
❌ NO VERSIONING TESTS EXIST

The tests show:
- reddit.updateWikiPage() is called with correct page name
- subreddit name is isolated

They do NOT show:
- Version metadata stored with rules
- Version tracking in wiki content
- Version compatibility checks
- What version info is sent to Devvit server
- How subreddit knows which app version created the rules
```

**What SHOULD be tested but ISN'T:**
```typescript
describe('Version Tracking in Wiki', () => {
  test('rules include version metadata', async () => {
    const rule = buildRule({ name: 'Test' });
    const yaml = serializeAutomodRule(rule);
    
    // Rule YAML should indicate which app version created it
    // Currently: No version marker exists
    expect(yaml).toContain('# Generated by RuleStage v');
    // ← FAILS - version not in YAML
  });

  test('subreddit knows which app version is running', async () => {
    // After installing the app, subreddit should track:
    // - app version installed
    // - version of rules created
    // Currently: No version tracking exists
    
    const subredditAppVersion = await getInstalledAppVersion('my-subreddit');
    expect(subredditAppVersion).toBe('1.2.3');
    // ← NOT POSSIBLE - no test for this
  });

  test('prevents deploying rules to wrong app version', async () => {
    // Subreddit running v1.0
    // App v2.0 tries to deploy new rule format
    // Should warn or prevent
    
    // Currently: No such protection exists
  });
});
```

---

## Production Issues This Would Catch

If the missing tests were added, they would catch:

1. **Silent Rule Loss**
   - Update app → Rules in wiki get overwritten
   - Discovered: 6 months later when someone complains

2. **Version Mismatches**
   - Rule created in v1.5 edited in v1.3 app
   - Rule gets corrupted or breaks

3. **Multi-Rule Collision**
   - User has 10 existing automod rules
   - RuleStage wipes them out when deploying

4. **App Uninstall Issues**
   - User removes app from subreddit
   - Automod rules permanently deleted (or remain orphaned)

5. **Backward Incompatibility**
   - Old rule syntax no longer supported
   - Subreddit's existing rules fail silently

---

## Summary Table

| Coverage Area | Tested | Test File | Notes |
|---|---|---|---|
| YAML serialization | ✅ | yaml-generation.test.ts | Does NOT test AI→YAML accuracy |
| YAML parsing | ✅ | yaml-generation.test.ts | Round-trip only |
| Wiki write operation | ✅ | wiki-injection.test.ts | Does NOT test appending to existing rules |
| Subreddit isolation | ✅ | devvit-integration.test.ts | Rules don't cross subreddits |
| Rule evaluation | ✅ | rule-evaluation.test.ts | Isolated, not production-like |
| API endpoints | ⚠️ | api-routes.integration.test.ts | Mocked, not real integration |
| **App deployment** | ❌ | None | Missing entirely |
| **Version management** | ❌ | None | Missing entirely |
| **Multi-rule merging** | ❌ | None | Missing entirely |
| **Full E2E workflow** | ❌ | None | Missing entirely |
| **Subreddit app lifecycle** | ❌ | None | Missing entirely |

---

## Recommendations

### High Priority
1. Add E2E tests for: prompt → YAML → wiki → production
2. Add version tracking tests
3. Add multi-rule merging tests (don't overwrite existing rules)
4. Add version compatibility tests

### Medium Priority
1. Test AI-generated YAML accuracy against known spam
2. Test app installation/removal ceremony
3. Test version migration paths

### Low Priority
1. Test concurrent rule updates
2. Test wiki page format edge cases
3. Test performance with 100+ rules

---

## Code Evidence

**What gets tested (wiki-injection.test.ts):**
```typescript
// Line 68-78: Tests updateWikiPage call
expect(mockUpdateWikiPage).toHaveBeenCalledWith({
  subredditName: 'testsub',
  page: 'config/automoderator',
  content: yaml,
  reason: 'Updated via AutoMod Builder app',
});
```

**What does NOT get tested:**
```typescript
// Missing tests that should check:
// 1. What if wiki already has other rules?
// 2. How are multiple rules combined?
// 3. Does version info get included?
// 4. What happens when app is reinstalled?
// 5. How does deployment to app store work?
```

---

## Conclusion

**The tests validate the happy path but not the production journey.**

They confirm that individual pieces work:
- ✅ Rules serialize/deserialize correctly
- ✅ Wiki updates are called
- ✅ Subreddits are isolated

But they **do not confirm** that:
- ❌ A user can follow the full workflow and have working rules
- ❌ Rules are versioned and trackable
- ❌ Updates don't break existing deployments
- ❌ App can be installed/removed/reinstalled safely
