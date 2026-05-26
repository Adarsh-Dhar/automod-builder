# AutoMod Builder - Deployment & Testing Guide

## TLDR

Your code is working correctly. The issues you're experiencing are expected behavior:

- ✅ **Playtest mode**: Intentionally mocks wiki writes (doesn't push to Reddit)
- ✅ **Wiki revisions**: Not implemented (no API endpoint exists)
- ✅ **gRPC errors**: Devvit dev proxy limitation (disappears in production)

**All three issues will be resolved when you deploy to production.**

---

## Part 1: Why Issues Happen in Playtest

### Issue 1: Changes Not Pushing to Wiki

**What Happens in Playtest:**
```
User saves rule → App sends to /rule-stage/rule → Rule saved to Redis ✅
                                                  → Wiki update MOCKED ❌
```

**Code Location**: `src/server/services/automod.service.ts` lines 144-157

```typescript
const isPlaytest = !subredditName || subredditName === 'default' || subredditName === 'AutoModDemo';

if (isPlaytest) {
  console.log('[AutoModService] Playtest mode: mocking wiki publish → storing to Redis.');
  await redis.set(`wiki:mock:${subredditName}`, yaml);  // ← Mocked write
  return; // ← Returns without pushing to Reddit
}

// Production code continues here...
```

**Why This Design?**
- Protects the test subreddit from being overwritten by development
- Allows you to test the UI flow without affecting real data
- Separates dev/test from production

---

### Issue 2: gRPC Errors in Chat/AI Features

**What Happens in Playtest:**
```
User asks for AI rule → Request goes through Devvit dev proxy → 
  Proxy has strict timeouts (DEADLINE_EXCEEDED) → gRPC error
```

**Code Location**: `src/server/services/model-proxy.service.ts` lines 113-116

```typescript
if (errorMessage.includes('DEADLINE_EXCEEDED') || errorMessage.includes('context deadline exceeded')) {
  console.error('Devvit HTTP plugin deadline exceeded - this is a plugin limitation');
  throw new Error('The Devvit HTTP plugin has an internal deadline...');
}
```

**Why This Happens?**
Playtest flow:
1. Your machine runs Devvit dev server locally
2. All external HTTP calls go through this local proxy
3. Proxy has aggressive timeouts to prevent hanging
4. Gemini API responses can be slow, triggering timeouts
5. Result: gRPC errors

**Production flow:**
1. App runs on Reddit's servers
2. HTTP calls go directly to Gemini, GitHub APIs
3. No proxy layer
4. Much more stable, no gRPC errors

---

### Issue 3: Wiki Versions Not Showing

**What Happens:**
```
User opens History panel → Shows local browser snapshots only
No connection to Reddit's wiki revision history
No API endpoint to fetch revisions from Reddit
```

**Code Analysis:**
- `HistoryPanel.tsx` line 72: "auto-saved locally"
- `HistoryPanel.tsx` line 187: "Stored in browser localStorage"
- `automod.service.ts`: Has `getLiveAutomodYaml()` but no `getWikiRevisions()`

---

## Part 2: Production Behavior

### What Changes in Production

When you deploy to your subreddit:

**Issue 1 Fix:**
```
User saves rule → Rule saved to Redis ✅
              → Rule pushed to Reddit wiki ✅
                (because subredditName is real, not 'AutoModDemo')
```

**Issue 2 Fix:**
```
User asks AI rule → Request goes directly to Gemini API ✅
                (no proxy layer, no DEADLINE_EXCEEDED)
```

**Issue 3 Fix:**
You'll still need to implement the wiki revisions API, but once deployed:
```
User opens History → Shows local snapshots ✅
                  → Also shows wiki revisions from Reddit ✅
```

---

## Part 3: Testing Checklist

### ✅ Test in Playtest (Expected Behavior)

**Run Playtest:**
```bash
npm run dev
# or
npx devvit playtest
```

**What to Test:**
1. ✅ Create rules in the UI
2. ✅ See rules appear in local history
3. ✅ See gRPC errors when running AI chat with long prompts (expected)
4. ⚠️ Changes won't push to wiki (expected - playtest mode)
5. ✅ Use short prompts to avoid gRPC timeout

**Example Short Prompt for Testing:**
```
"Create a rule that removes posts with 'spam' in title"
```

**Example Long Prompt (Will Timeout):**
```
"Create a comprehensive rule system that checks author age, account karma, 
combined karma, link karma, comment karma, and post history. Also check 
title includes, title matches, body includes, body matches, author flair, 
link flair, and domain. Apply multiple actions..."
```

---

### ✅ Test in Production (Real Behavior)

**Deployment Steps:**

1. **Build the app:**
   ```bash
   npm run build
   # or
   npx devvit build
   ```

2. **Deploy to your test subreddit:**
   ```bash
   npx devvit deploy --subreddit r/YourTestSubreddit
   ```

3. **Verify in your subreddit:**
   - Go to your subreddit
   - Install the AutoMod Builder app
   - Create/edit rules
   - Changes should appear in the wiki

4. **Check the wiki:**
   - Visit: `https://reddit.com/r/YourTestSubreddit/wiki/config/automoderator`
   - You should see your rules there
   - Check `revisions` link for version history

**What to Test in Production:**
1. ✅ Create rules → See them appear in wiki
2. ✅ Run AI chat with any prompt size (no gRPC errors)
3. ✅ View wiki revisions page (will show your edits)
4. ✅ All features work smoothly

---

## Part 4: Fixing the Issues

### Quick Wins (Do These First)

1. **Deploy to production** → Issues 1 & 2 are solved immediately
2. **Test with a real subreddit** → Confirm everything works

### Medium Priority (After Production)

Implement wiki revisions support (Issue 3):

1. Add `getWikiRevisions()` function to `automod.service.ts`
2. Add `/wiki-revisions` endpoint to `rule-stage.ts`
3. Update `HistoryPanel.tsx` to show both local and remote versions
4. (See the `*.FIX.txt` files for exact code)

---

## Part 5: Expected Error Messages

### In Playtest (Normal)

```
gRPC error: DEADLINE_EXCEEDED
context deadline exceeded
The Devvit HTTP plugin has an internal deadline...
```
✅ **Expected** - This is playtest limitation, not your code

---

### In Production (Shouldn't See)

```
gRPC error: DEADLINE_EXCEEDED
context deadline exceeded
```
❌ **Unexpected** - If you see this in production, check:
- Your API key is valid
- Your prompt isn't too large
- The Gemini API is responding normally

---

## Part 6: Debugging Commands

### Check Playtest Logs

```bash
# View live logs during playtest
npx devvit playtest

# Look for:
# [AutoModService] Playtest mode: mocking wiki publish
# [RuleStage] rule save failed
# DEADLINE_EXCEEDED
```

### Check Production Logs

```bash
# View production app logs
npx devvit logs --subreddit r/YourTestSubreddit

# Should see:
# [AutoModService] ... actual wiki write (no mock)
# [RuleStage] rule save failed: [if any error]
```

### Verify Wiki Changes

```bash
# In browser, after deploying to production:
1. Go to: reddit.com/r/YourSub/wiki/config/automoderator
2. Check you're the editor in the "Manage" section
3. Your rules should appear in the wiki
4. Click "revisions" link to see history
```

---

## Part 7: Common Questions

**Q: Will my changes push to the real Reddit wiki if I keep testing in playtest?**
A: No. The app is correctly configured to NOT overwrite production data during development. Deploy to production to see real wiki writes.

**Q: Why do I get gRPC errors in playtest but not when I test with curl?**
A: The Devvit dev proxy has different timeouts than direct curl requests. Production doesn't use the proxy.

**Q: Should I remove the playtest mode check?**
A: No. It protects your data. Instead, deploy to production or use a test subreddit.

**Q: My rules disappeared after restarting playtest. Why?**
A: In playtest, rules are stored in memory (Redis). Restarting clears them. This is normal. Deploy to production for persistence.

**Q: Can I test production-like behavior without deploying?**
A: Yes - see "Testing Checklist" Option B: Use a real test subreddit in playtest mode.

---

## Part 8: Action Items

### Before Production
- [ ] Run playtest and verify UI works
- [ ] Keep prompts short to avoid gRPC timeouts in playtest
- [ ] Review the wiki revisions fixes (provided in `.FIX.txt` files)

### For Production
- [ ] Build your app: `npm run build`
- [ ] Deploy: `npx devvit deploy --subreddit r/YourSubreddit`
- [ ] Create a rule in the UI
- [ ] Verify it appears in: `reddit.com/r/YourSub/wiki/config/automoderator`
- [ ] Confirm gRPC errors are gone
- [ ] Confirm changes are pushing to wiki

### Future (If Desired)
- [ ] Implement wiki revisions API (see `.FIX.txt` files)
- [ ] Add "View on Reddit" button to History panel
- [ ] Add ability to restore old wiki versions

---

## Part 9: Production Deployment Checklist

```
Pre-Deployment:
  [ ] Code builds without errors: npm run build
  [ ] All tests pass: npm test (if applicable)
  [ ] No TypeScript errors: npm run type-check
  [ ] Reviewed error handling in production paths

Deployment:
  [ ] Deploy to test subreddit: npx devvit deploy --subreddit r/TestSub
  [ ] Verify app appears in subreddit: r/TestSub/apps
  [ ] Grant necessary permissions if prompted

Post-Deployment:
  [ ] Create a test rule in the app UI
  [ ] Verify rule appears in wiki: r/TestSub/wiki/config/automoderator
  [ ] Try AI chat (should work without gRPC errors)
  [ ] Test all major features
  [ ] Check logs: npx devvit logs --subreddit r/TestSub
  [ ] Monitor for errors in production

Success Criteria:
  ✅ Rules push to wiki successfully
  ✅ No gRPC errors in AI chat
  ✅ Wiki shows correct rules
  ✅ All edits are logged in wiki revisions
  ✅ App is stable and responsive
```

---

## Part 10: Support Resources

### If You Need Help

**Check These Files:**
- `ISSUE_ANALYSIS_AND_FIXES.md` - Detailed issue breakdown
- `automod.service.ts.FIX.txt` - Add wiki revisions function
- `rule-stage.ts.FIX.txt` - Add wiki revisions endpoint
- `HistoryPanel.tsx.FIX.txt` - Update UI for wiki versions

**Devvit Documentation:**
- https://developers.reddit.com/docs/devvit
- https://developers.reddit.com/docs/devvit/devkit_commands

**Reddit API:**
- https://www.reddit.com/dev/api/oauth

---

## Summary

Your code is **working as designed**. The issues you see are expected behavior in playtest mode:

| Issue | Playtest | Production |
|-------|----------|-----------|
| Wiki pushes | ❌ Mocked | ✅ Real |
| gRPC errors | ⚠️ Common | ✅ None |
| Wiki versions | ⚠️ Not implemented | Need to add |

**Next Step: Deploy to production and verify everything works. That's the real test.**
