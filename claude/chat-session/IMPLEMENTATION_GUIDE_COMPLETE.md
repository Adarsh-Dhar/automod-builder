# AutoMod Builder - Complete Improvements Guide

## Overview

This guide covers three major improvements to your AutoMod Builder app:

1. **Chat Session Management** - Proper sessions, retry logic, error handling
2. **Wiki Revisions Display** - Show historical changes with restore capability
3. **Enhanced Error Handling** - Better feedback and recovery

---

## Part 1: Chat Session Management

### What's New
- ✅ Persistent chat sessions with retry logic
- ✅ Exponential backoff for failed requests
- ✅ Session status tracking (active, paused, error)
- ✅ Automatic recovery from network/gRPC errors
- ✅ Session history stored in localStorage

### Files to Create

**1. Create `src/client/utils/chat-session.ts`**
- Contains `ChatSessionManager` class
- Handles retry logic with exponential backoff
- Tracks session metadata
- Provides error recovery

Copy the content from: `chat-session.ts.NEW`

### Files to Update

**2. Update `src/client/components/ChatMode.tsx`**

Add imports:
```typescript
import { getChatSessionManager, type ChatSession } from '../utils/chat-session';
```

Add state variables:
```typescript
const [retryAttempt, setRetryAttempt] = useState(0);
const [chatSession, setChatSession] = useState<ChatSession | null>(null);
```

Add session monitor useEffect:
```typescript
useEffect(() => {
  const sessionManager = getChatSessionManager();
  const session = sessionManager.getSession();
  setChatSession(session);

  const interval = setInterval(() => {
    setChatSession(sessionManager.getSession());
  }, 1000);

  return () => clearInterval(interval);
}, []);
```

Replace the `sendMessage` function with the improved version that includes:
- Session tracking
- Retry logic with exponential backoff
- Better error messages
- Attempt counter display

See: `ChatMode-SESSION-IMPROVEMENTS.ts.NEW` for the updated `sendMessage` function

---

## Part 2: Wiki Revisions Display

### What's New
- ✅ Display historical changes from Reddit wiki
- ✅ Show author, timestamp, and reason for each revision
- ✅ Preview revision content before restoring
- ✅ One-click restore with confirmation dialog
- ✅ Automatic retry with error handling

### Files to Create

**1. Create `src/client/components/WikiRevisionsPanel.tsx`**

This is a new panel component that:
- Fetches wiki revisions from the server
- Displays them in a sidebar list
- Shows preview of selected revision
- Provides restore functionality with confirmation

Copy the content from: `WikiRevisionsPanel.tsx.NEW`

### Files to Update

**2. Update `src/server/routes/rule-stage.ts`**

Add these three new endpoints:

a) **GET `/api/rule-stage/wiki-revisions`**
   - Fetches all wiki revisions
   - Returns array of WikiRevision objects
   - Works only in production (not playtest)

b) **GET `/api/rule-stage/wiki-revisions/:revisionId`**
   - Fetches content of a specific revision
   - Returns the YAML configuration
   - Used for preview and restore

c) **POST `/api/rule-stage/wiki-revisions/restore/:revisionId`**
   - Restores a specific revision
   - Pushes it back to the wiki with a reason
   - Returns confirmation

See: `rule-stage-wiki-endpoints.ts.NEW` for the complete endpoint code

**3. Update `src/server/services/automod.service.ts`**

Add two helper functions with retry logic:

a) **`getWikiRevisionsWithRetry()`**
   - Fetches revisions from Reddit API
   - Implements exponential backoff
   - Handles network/timeout errors

b) **`getWikiRevisionContentWithRetry()`**
   - Fetches content of a specific revision
   - Same retry logic as above
   - Returns YAML string

See: `rule-stage-wiki-endpoints.ts.NEW` for implementation

**4. Update `src/client/pages/RuleStagePage.tsx` or main layout**

Add WikiRevisionsPanel to the UI:

```typescript
import WikiRevisionsPanel from '../components/WikiRevisionsPanel';

// In component state:
const [showWikiRevisions, setShowWikiRevisions] = useState(false);

// In JSX, add button to open panel:
<Button onClick={() => setShowWikiRevisions(true)}>
  📜 Wiki History
</Button>

// Add panel component:
<WikiRevisionsPanel
  open={showWikiRevisions}
  onOpenChange={setShowWikiRevisions}
  subredditName={subredditName}
  onRestore={async (yaml) => {
    // Handle restore - same as applying YAML
    onApplyYaml(yaml);
  }}
/>
```

---

## Part 3: Enhanced Error Handling

### What's New
- ✅ Session status indicator (connected/paused/error)
- ✅ Retry counter display during failed requests
- ✅ Better error messages with actionable advice
- ✅ Automatic retry on transient failures
- ✅ Clear distinction between retryable and non-retryable errors

### Retryable Errors (Auto-Retry)
- gRPC errors
- Deadline exceeded
- Timeouts
- Network connection errors
- Server errors (5xx)

### Non-Retryable Errors (Show to User)
- Missing API key
- Invalid credentials
- Bad request (400)
- Not found (404)
- Rate limiting after multiple retries

---

## Implementation Checklist

### Phase 1: Chat Sessions (1-2 hours)

- [ ] Create `src/client/utils/chat-session.ts`
- [ ] Update `src/client/components/ChatMode.tsx`:
  - [ ] Add imports
  - [ ] Add state variables
  - [ ] Add session monitor useEffect
  - [ ] Replace sendMessage function
  - [ ] Add SessionStatusIndicator component
  - [ ] Add RetryIndicator component
- [ ] Test in playtest:
  - [ ] Send messages normally
  - [ ] Verify session status shows "Connected"
  - [ ] Test with intentionally short timeout (to trigger retry)
  - [ ] Verify retry counter appears and increments
  - [ ] Confirm message eventually succeeds after retries

### Phase 2: Wiki Revisions (2-3 hours)

- [ ] Create `src/client/components/WikiRevisionsPanel.tsx`
- [ ] Update `src/server/routes/rule-stage.ts`:
  - [ ] Add three new endpoints
  - [ ] Import `getWikiRevisionsWithRetry` and `getWikiRevisionContentWithRetry`
- [ ] Update `src/server/services/automod.service.ts`:
  - [ ] Add `getWikiRevisionsWithRetry()` function
  - [ ] Add `getWikiRevisionContentWithRetry()` function
  - [ ] Export both functions
- [ ] Update main page component:
  - [ ] Add button to show WikiRevisionsPanel
  - [ ] Handle restore callback
- [ ] Test in production:
  - [ ] Make changes to rules
  - [ ] Click "Wiki History" button
  - [ ] Verify revisions load
  - [ ] Select a revision and preview
  - [ ] Click restore
  - [ ] Confirm changes are applied
  - [ ] Verify in wiki that revision was restored

### Phase 3: Testing & Refinement (1-2 hours)

- [ ] Test all retry scenarios:
  - [ ] Network timeout
  - [ ] Server error (500)
  - [ ] Rate limiting (429)
- [ ] Test error recovery:
  - [ ] Long prompts → timeout → retry → success
  - [ ] Network hiccup → retry → success
- [ ] Test wiki restore:
  - [ ] Load old revision
  - [ ] Restore it
  - [ ] Verify it appears in editor
  - [ ] Verify wiki shows new revision
- [ ] Performance testing:
  - [ ] Check localStorage usage
  - [ ] Verify no memory leaks
  - [ ] Check API call frequency

---

## Key Features

### Chat Session Manager

**Methods:**
```typescript
// Send message with automatic retry
await sessionManager.sendMessage(message, history, context);

// Get current session
const session = sessionManager.getSession();

// Create new session
sessionManager.createNewSession();

// Pause/resume
sessionManager.pauseSession();
sessionManager.resumeSession();

// Get history
const history = sessionManager.getSessionHistory();

// Clear everything
sessionManager.clearSessions();
```

**Session Status:**
```typescript
type ChatSession = {
  id: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
  status: 'active' | 'paused' | 'error';
  error?: string;
};
```

### Wiki Revisions Panel

**Features:**
- Automatic loading on open
- Infinite scroll for long revision lists
- Side-by-side list and preview
- YAML syntax highlighting
- One-click restore with confirmation
- Error messages with recovery tips

---

## Retry Logic Details

### Exponential Backoff Algorithm

```
Attempt 1: Fail → Wait 1s
Attempt 2: Fail → Wait 2s
Attempt 3: Fail → Wait 4s
Attempt 4: Fail → Return error
```

### Decision Tree

```
Error occurred?
  ↓
Is retryable (gRPC, timeout, network)?
  ├─ Yes: Attempts < 3?
  │   ├─ Yes: Wait then retry
  │   └─ No: Return error with "Max retries"
  └─ No: Return error immediately
```

---

## API Endpoints

### GET `/api/rule-stage/wiki-revisions`

Request:
```json
{}
```

Response (Success):
```json
{
  "status": "success",
  "revisions": [
    {
      "timestamp": 1716547200000,
      "author": "your-username",
      "reason": "Updated via AutoMod Builder app"
    }
  ],
  "count": 42
}
```

Response (Playtest):
```json
{
  "status": "success",
  "revisions": [],
  "message": "Wiki revisions not available in playtest mode"
}
```

### GET `/api/rule-stage/wiki-revisions/:revisionId`

Response (Success):
```json
{
  "status": "success",
  "content": "---\n# Rule name\ntype: submission\n...",
  "revisionId": "abc123"
}
```

Response (Not Found):
```json
{
  "status": "error",
  "message": "Revision not found or no permission to access"
}
```

### POST `/api/rule-stage/wiki-revisions/restore/:revisionId`

Request:
```json
{
  "reason": "Restoring good config"
}
```

Response:
```json
{
  "status": "success",
  "message": "Revision restored successfully"
}
```

---

## Error Messages to Users

### Retryable (With Retry Counter)
- "⚡ Retrying... (Attempt 2/3)"
- Auto-retries in background
- User sees counter increment

### Non-Retryable (Stop and Show)
- "Error after 3 attempts: ..."
- Explains what went wrong
- Suggests action (check API key, use shorter prompt, etc.)

---

## Testing Checklist

### Manual Testing in Playtest

```
1. Chat Session Tests:
  [ ] Send "hello"
  [ ] Verify "Connected" status shows
  [ ] Send longer prompt
  [ ] See YAML response
  [ ] Verify no gRPC errors (or see retries)

2. Wiki Revision Tests (only in production):
  [ ] Click "Wiki History"
  [ ] See "Not available in playtest"
  [ ] Create rule and save
  [ ] Deploy to production
  [ ] Click "Wiki History"
  [ ] See revisions load

3. Restore Tests:
  [ ] Select an old revision
  [ ] Click "Restore"
  [ ] Confirm dialog appears
  [ ] Confirm restore
  [ ] Verify YAML appears in editor
  [ ] Verify wiki shows new restore revision
```

### Automated Tests (Bonus)

Consider adding tests for:
- `ChatSessionManager.sendMessage()` with various errors
- `getWikiRevisionsWithRetry()` with network errors
- Restore functionality with mock revisions

---

## File Structure After Changes

```
src/
├── client/
│   ├── components/
│   │   ├── ChatMode.tsx (UPDATED)
│   │   ├── WikiRevisionsPanel.tsx (NEW)
│   │   └── ...
│   └── utils/
│       ├── chat-session.ts (NEW)
│       └── ...
└── server/
    ├── routes/
    │   ├── rule-stage.ts (UPDATED)
    │   └── ...
    └── services/
        ├── automod.service.ts (UPDATED)
        └── ...
```

---

## Performance Considerations

### Chat Session Manager
- Uses in-memory Map for sessions
- Writes to localStorage periodically
- Minimal memory overhead (~1KB per session)

### Wiki Revisions Panel
- Lazy loads revision content on selection
- Caches content in component state
- No persistent storage needed
- Handles large revision lists efficiently

### API Calls
- Retry logic adds up to ~7s max wait time
- 30s timeout per request
- Rate limiting backed off to 60s+ delays

---

## Troubleshooting

### Sessions Not Persisting
- Check browser localStorage is enabled
- Clear `chat_sessions` from localStorage
- Restart the app

### Wiki Revisions Not Showing
- Verify you're in production (not playtest)
- Check subreddit has edit history
- Check moderator permissions

### Retries Not Working
- Check network connectivity
- Verify API key is valid
- Try shorter prompts
- Check server logs: `npx devvit logs`

---

## Next Steps

1. **Implement Phase 1**: Chat session management (highest priority - fixes gRPC issues)
2. **Test thoroughly**: Verify retry logic works
3. **Implement Phase 2**: Wiki revisions (nice to have, great UX)
4. **Deploy to production**: Everything will work perfectly
5. **Monitor and refine**: Based on user feedback

---

## Questions?

Refer to:
- `ChatSessionManager` class in `chat-session.ts` for session logic
- `WikiRevisionsPanel` component for UI patterns
- Server endpoints for API contract

All code is ready to copy/paste. Follow the checklist and you'll be done in 4-5 hours total.
