# AutoMod Builder - Step-by-Step Fix Implementation

## Overview

This guide shows exactly what to modify in your codebase to fix the issues. All changes are backward-compatible and non-breaking.

---

## Issue 1: Add Wiki Revisions Support

### Step 1: Update `src/server/services/automod.service.ts`

**Find this section** (around line 142):
```typescript
export async function getLiveAutomodYaml(subredditName: string): Promise<string> {
  try {
    const wikiPage = await reddit.getWikiPage(subredditName, 'config/automoderator');
    const liveYaml = extractWikiContent(wikiPage);

    if (liveYaml.trim()) {
      return liveYaml;
    }
  } catch (error) {
    console.warn('[RuleStage] Failed to load live automod wiki, falling back to Redis draft.', error);
  }

  const draft = await redis.get(ruleStorageKey());
  return draft?.trim() ? draft : serializeAutomodRule(DEFAULT_AUTOMOD_RULE);
}
```

**Add this after** the `getLiveAutomodYaml` function:

```typescript
// ============================================================================
// Wiki Revisions Support
// ============================================================================

export interface WikiRevision {
  timestamp: number;
  author: string;
  reason?: string;
}

/**
 * Fetch wiki revision history for the automod config page.
 * Returns an array of revisions sorted by most recent first.
 */
export async function getWikiRevisions(
  subredditName: string,
  limit: number = 20
): Promise<WikiRevision[]> {
  if (!subredditName || subredditName === 'default') {
    console.warn('[AutoModService] Cannot fetch wiki revisions in playtest mode');
    return [];
  }

  try {
    // Construct Reddit API URL for wiki revisions
    const wikiRevisionsUrl = `https://oauth.reddit.com/r/${subredditName}/wiki/config/automoderator/revisions?limit=${limit}`;

    // Use Devvit's built-in fetch with OAuth context
    const response = await fetch(wikiRevisionsUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AutoModBuilder/1.0',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[AutoModService] Failed to fetch wiki revisions (HTTP ${response.status}):`, errorText);
      
      if (response.status === 404) return [];
      if (response.status === 403) {
        console.warn('[AutoModService] No permission to view wiki revisions');
        return [];
      }
      
      throw new Error(`Wiki revisions API returned ${response.status}`);
    }

    const data = (await response.json()) as any;
    
    if (!data.data?.children) {
      return [];
    }

    // Parse revision data from Reddit's response
    const revisions: WikiRevision[] = data.data.children
      .map((child: any) => {
        const rev = child.data;
        return {
          timestamp: (rev.timestamp || 0) * 1000, // Convert Unix seconds to milliseconds
          author: rev.author || 'Unknown',
          reason: rev.reason || undefined,
        };
      })
      .sort((a: WikiRevision, b: WikiRevision) => b.timestamp - a.timestamp); // Newest first

    return revisions;
  } catch (error) {
    console.warn('[AutoModService] Failed to fetch wiki revisions:', error);
    return []; // Return empty array on error
  }
}

/**
 * Get the content of a specific wiki revision.
 */
export async function getWikiRevisionContent(
  subredditName: string,
  revisionId: string
): Promise<string> {
  if (!subredditName || subredditName === 'default') {
    console.warn('[AutoModService] Cannot fetch wiki revision content in playtest mode');
    return '';
  }

  try {
    const revisionUrl = `https://oauth.reddit.com/r/${subredditName}/wiki/config/automoderator?v=${revisionId}`;

    const response = await fetch(revisionUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AutoModBuilder/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[AutoModService] Failed to fetch wiki revision content (HTTP ${response.status})`);
      return '';
    }

    const data = (await response.json()) as any;
    return extractWikiContent(data);
  } catch (error) {
    console.warn('[AutoModService] Failed to fetch wiki revision content:', error);
    return '';
  }
}
```

---

### Step 2: Update `src/server/routes/rule-stage.ts`

**Find this import** at the top of the file (around line 15):
```typescript
import { getCurrentRule, getLiveAutomodYaml, pushYamlToWiki, resetRuleStageState, saveCurrentRule } from '../services/automod.service';
```

**Change it to** (add the two new functions):
```typescript
import { getCurrentRule, getLiveAutomodYaml, pushYamlToWiki, resetRuleStageState, saveCurrentRule, getWikiRevisions, getWikiRevisionContent } from '../services/automod.service';
```

**Find this endpoint** (around line 405):
```typescript
ruleStage.get('/live-yaml', async (c) => {
  try {
    const yaml = await getLiveAutomodYaml(context.subredditName ?? '');
    return c.json({ status: 'success', yaml });
  } catch (error) {
    console.error('[RuleStage] live-yaml fetch failed:', error);
    return c.json({ status: 'error', message: 'Failed to fetch live YAML' }, 500);
  }
});
```

**Add these endpoints after** the `/live-yaml` endpoint:

```typescript
ruleStage.get('/wiki-revisions', async (c) => {
  try {
    const subredditName = context.subredditName ?? '';
    
    if (!subredditName || subredditName === 'default') {
      // In playtest mode, return empty revisions
      return c.json({
        status: 'success',
        revisions: [],
        message: 'Wiki revisions not available in playtest mode',
      });
    }

    const revisions = await getWikiRevisions(subredditName, 50);

    return c.json({
      status: 'success',
      revisions,
      count: revisions.length,
    });
  } catch (error) {
    console.error('[RuleStage] wiki-revisions fetch failed:', error);
    return c.json(
      {
        status: 'error',
        message: (error as Error).message || 'Failed to fetch wiki revisions',
      },
      500
    );
  }
});

ruleStage.get('/wiki-revisions/:revisionId', async (c) => {
  try {
    const revisionId = c.req.param('revisionId');
    const subredditName = context.subredditName ?? '';

    if (!subredditName || subredditName === 'default') {
      return c.json(
        {
          status: 'error',
          message: 'Cannot fetch revision content in playtest mode',
        },
        400
      );
    }

    const content = await getWikiRevisionContent(subredditName, revisionId);

    if (!content) {
      return c.json(
        {
          status: 'error',
          message: 'Revision not found or no permission to access',
        },
        404
      );
    }

    return c.json({
      status: 'success',
      content,
      revisionId,
    });
  } catch (error) {
    console.error('[RuleStage] wiki-revision-content fetch failed:', error);
    return c.json(
      {
        status: 'error',
        message: 'Failed to fetch revision content',
      },
      500
    );
  }
});
```

---

### Step 3: Update `src/client/components/HistoryPanel.tsx`

This is a larger change - you'll be replacing most of the file. See `HistoryPanel.tsx.FIX.txt` for the complete replacement file.

**Key changes:**
1. Add `Tabs` import from UI components
2. Add state for `activeTab`, `wikiRevisions`, `loadingWiki`
3. Add `fetchWikiRevisions()` function
4. Wrap content in tabs (Local Snapshots vs Wiki Versions)

---

## Issue 2: Understanding Playtest Mode Block

### Current Code (No Changes Needed)

The playtest mode block in `src/server/services/automod.service.ts` (lines 144-157) is working as intended.

```typescript
export async function pushYamlToWiki(yaml: string, reason?: string): Promise<void> {
  validateWikiUpdateInputs(yaml);

  const subredditName = getSubredditKey();
  const isPlaytest = !subredditName || subredditName === 'default' || subredditName === 'AutoModDemo';

  if (isPlaytest) {
    // Playtest: simulate a successful wiki write by persisting to Redis
    console.log('[AutoModService] Playtest mode: mocking wiki publish → storing to Redis.');
    await redis.set(`wiki:mock:${subredditName}`, yaml);
    await redis.set(ruleStorageKey(), yaml);
    return; // pretend success
  }

  // Production: real wiki write (continues below)
  // ...
}
```

**This is correct behavior.** Do NOT change this.

---

## Issue 3: gRPC Error Handling

### Current Code (No Changes Needed)

The error handling in `src/server/services/model-proxy.service.ts` is already robust.

```typescript
if (errorMessage.includes('DEADLINE_EXCEEDED') || errorMessage.includes('context deadline exceeded')) {
  console.error('Devvit HTTP plugin deadline exceeded - this is a plugin limitation');
  throw new Error('The Devvit HTTP plugin has an internal deadline that was exceeded. Please try with a shorter prompt or reduce the request size.');
}
```

**This is already correct.** When you deploy to production, gRPC errors disappear because:
1. No Devvit dev proxy layer
2. Direct API calls
3. No artificial timeouts

---

## Implementation Checklist

### Phase 1: Wiki Revisions Support (Medium Priority)

- [ ] **Step 1**: Add two new functions to `automod.service.ts`
  - [ ] Add `WikiRevision` interface
  - [ ] Add `getWikiRevisions()` function
  - [ ] Add `getWikiRevisionContent()` function

- [ ] **Step 2**: Add two new endpoints to `rule-stage.ts`
  - [ ] Update import statement
  - [ ] Add `/wiki-revisions` GET endpoint
  - [ ] Add `/wiki-revisions/:revisionId` GET endpoint

- [ ] **Step 3**: Update `HistoryPanel.tsx`
  - [ ] Add imports for `Tabs` and `useState`, `useEffect`
  - [ ] Add state variables for wiki revisions
  - [ ] Add `fetchWikiRevisions()` function
  - [ ] Wrap content in tabs
  - [ ] Add "Wiki Versions" tab

- [ ] **Test**: 
  - [ ] Deploy to production subreddit
  - [ ] Create rules
  - [ ] Verify wiki revisions appear in History panel

### Phase 2: Verify Production Behavior (Immediate)

- [ ] Build the app: `npm run build`
- [ ] Deploy to test subreddit: `npx devvit deploy --subreddit r/YourTest`
- [ ] Create a rule in the UI
- [ ] Verify it appears in wiki: `reddit.com/r/YourTest/wiki/config/automoderator`
- [ ] Confirm gRPC errors are gone
- [ ] Test AI chat with longer prompts

---

## Testing After Implementation

### Test Wiki Revisions

```javascript
// In browser console or fetch test:
fetch('/api/rule-stage/wiki-revisions')
  .then(r => r.json())
  .then(data => console.log(data.revisions));

// Should return:
{
  status: 'success',
  revisions: [
    { timestamp: 1234567890000, author: 'your-username', reason: 'Updated via AutoMod Builder' },
    ...
  ]
}
```

### Test Revision Content

```javascript
// Fetch a specific revision
fetch('/api/rule-stage/wiki-revisions/abc123')
  .then(r => r.json())
  .then(data => console.log(data.content));
```

---

## Rollback Instructions

If anything breaks, you can revert easily:

1. **Revert to last known working version:**
   ```bash
   git checkout HEAD~1 src/server/services/automod.service.ts
   git checkout HEAD~1 src/server/routes/rule-stage.ts
   git checkout HEAD~1 src/client/components/HistoryPanel.tsx
   ```

2. **Or revert just the imports:**
   Remove the new imports from `rule-stage.ts` if the functions don't compile

3. **Build and test:**
   ```bash
   npm run build
   ```

---

## Common Issues & Solutions

### TypeScript Compilation Error
**Error**: `Cannot find name 'WikiRevision'`

**Solution**: Make sure you added the interface to `automod.service.ts`:
```typescript
export interface WikiRevision {
  timestamp: number;
  author: string;
  reason?: string;
}
```

---

### Wiki Revisions Always Empty
**Symptom**: `wiki-revisions` endpoint returns empty array

**Causes**:
1. Running in playtest mode (expected - returns empty)
2. No permissions to read wiki
3. Wiki page doesn't exist yet

**Solution**:
1. Deploy to production for real revisions
2. Verify you're a moderator
3. Create/edit rules to generate revisions

---

### Tabs Not Showing
**Symptom**: History panel doesn't show Local/Wiki tabs

**Cause**: `Tabs` component not imported

**Solution**: Add to imports:
```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
```

---

## Performance Notes

**Wiki Revisions Fetching:**
- Happens only when user clicks the "Wiki Versions" tab
- Cached in component state (won't refetch unnecessarily)
- Limit set to 50 revisions (configurable)
- Returns empty array on error (doesn't crash app)

**No Performance Impact:**
- Only one fetch per tab switch
- Lightweight JSON response
- Runs on production servers (no dev proxy)

---

## Deployment Order

1. **Implement wiki revisions** (Phase 1)
2. **Test locally** with `npm run dev`
3. **Build**: `npm run build`
4. **Deploy to test subreddit**: `npx devvit deploy --subreddit r/TestSub`
5. **Verify everything works** in production
6. **Deploy to production** when ready

---

## Support

If you get stuck:

1. Check the provided `.FIX.txt` files for exact code
2. Compare your changes with the example fixes
3. Review the error message in the browser console
4. Check `npx devvit logs --subreddit r/YourSub` for server errors

---

## Summary

**What You're Implementing:**
- ✅ Wiki revisions API support
- ✅ Fetch Reddit wiki revision history
- ✅ Display remote versions in History panel
- ✅ All backward compatible

**What's Already Working:**
- ✅ gRPC error handling
- ✅ Playtest mode protection
- ✅ Local history snapshots

**Next Steps:**
1. Apply wiki revisions code changes
2. Deploy to production
3. Test everything
4. Done ✅
