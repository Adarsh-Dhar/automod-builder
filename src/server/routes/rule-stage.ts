import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type { CachedPost } from '../../shared/blast-types';
import {
  DEFAULT_AUTOMOD_RULE,
  buildDebugPrompt,
  buildUnifiedAnalysisPrompt,
  parseAutomodRuleDraft,
  serializeAutomodRule,
  type UnifiedAnalysis,
} from '../../shared/automod';
import type { DebugResponse, MockPostDebugRequest } from '../../shared/debug-types';
import { runDebug, runDebugComparison } from '../services/debugger.service';
import { runBlastRadius } from '../services/blast-radius.service';
import { generateText, generateJson } from '../services/model-proxy.service';
import { getCurrentRule, getLiveAutomodYaml, pushYamlToWiki, resetRuleStageState, saveCurrentRule } from '../services/automod.service';

// (previously used to strip fenced code blocks from model output)

type DebugAnalysis = {
  explanation: string;
  fixedYaml: string;
  confidence: 'high' | 'medium' | 'low';
};

type ChatHistoryMessage = {
  role: 'user' | 'model';
  content: string;
};

// Simple circuit breaker to prevent cascading failures during rate limits
let circuitBreakerOpen = false;
let circuitBreakerOpenTime = 0;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 60 seconds

function isCircuitBreakerOpen(): boolean {
  if (!circuitBreakerOpen) return false;

  const now = Date.now();
  if (now - circuitBreakerOpenTime > CIRCUIT_BREAKER_TIMEOUT) {
    circuitBreakerOpen = false;
    return false;
  }

  return true;
}

function openCircuitBreaker(): void {
  circuitBreakerOpen = true;
  circuitBreakerOpenTime = Date.now();
}

const AUTOMOD_SYSTEM_PROMPT = `You are an AutoModerator rule assistant. Follow the user's EXACT instructions for rule specifications. Do not generate generic rules unless specifically requested.

RULES:
- type: submission always
- Use: title (includes), title (matches), body (includes), body (matches)
- Author conditions nested under author: with satisfy_any_threshold: true
- action: remove, approve, or report
- Always include comment: | and modmail: | blocks
- Rule name as comment after ---
- Wrap in \`\`\`yaml ... \`\`\`
- No prose outside code fence
- Author flair: author_flair_text at top level, NOT under author:
- Negate with ~ prefix: ~author_flair_text: "official"
- Modmail ONLY uses: {{permalink}} {{author}} {{title}} {{body}} {{kind}} {{domain}} {{url}} {{author_flair_text}} {{link_flair_text}}
- NEVER use dotted variables like {{author.account_age}} - they don't exist in AutoModerator
- If rule needs BOTH author thresholds AND title/body keyword matching, split into TWO rules
- IMPORTANT: Follow the user's specific rule requirements exactly. Do not add generic rules unless asked.

Example:
\`\`\`yaml
---
# Spam guard
type: submission
title (includes): ['spam']
author:
  satisfy_any_threshold: true
  account_age: "< 7 days"
  combined_karma: "< 100"
action: remove
comment_stickied: true
comment: |
  Removed.
modmail: |
  Removed: {{permalink}}
  User: u/{{author}}
  Title: {{title}}
---
\`\`\``;

export async function generateChatReplyOnServer(
  prompt: string,
  history: ChatHistoryMessage[] = [],
  subredditContext?: string,
  apiKey?: string
): Promise<string> {
  // Build the prompt text combining system prompt, optional subreddit context, history and user prompt.
  const parts: string[] = [];
  parts.push(AUTOMOD_SYSTEM_PROMPT);
  parts.push('Understood. I will output only valid AutoModerator YAML.');

  if (subredditContext?.trim()) {
    parts.push(subredditContext.trim());
    parts.push('Noted. I will keep this subreddit context in mind.');
  }

  for (const message of history.slice(-3)) { // Reduced from -5 to -3 to reduce prompt size
    if (!message?.content?.trim()) continue;
    parts.push(`${message.role === 'model' ? 'Assistant:' : 'User:'} ${message.content}`);
  }

  parts.push(`User: ${prompt}`);

  const combined = parts.join('\n\n');
  let text = await generateText(combined, { temperature: 0.1, maxOutputTokens: 8192, maxRetries: 0 }, apiKey);
  // Fix doubled apostrophes in regex match conditions
  text = text.replace(
    /^(\s*(?:title|body)\s*\(matches\)\s*:\s*\[')(.*?)('\])\s*$/gm,
    (_, prefix, inner, suffix) => `${prefix}${inner.replace(/''/g, "\\'")}${suffix}`
  );
  // Strip invalid AutoMod template variables from modmail blocks
  text = text.replace(/\{\{author\.(account_age|combined_karma|link_karma|comment_karma)[^}]*\}\}/g, '');
  text = text.replace(/\{\{title_length\}\}/g, '');
  text = text.replace(/\{\{(author|post)\.[^}]+\}\}/g, '');
  return text || 'I could not generate a response.';
}

async function analyzeDebugOnServer(result: DebugResponse): Promise<DebugAnalysis> {
  const prompt = buildDebugPrompt(
    {
      id: result.postId,
      title: result.postTitle,
      body: result.postBody,
      author: result.postAuthor,
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
    },
    result.matches
  );

  const parsed = await generateJson<DebugAnalysis>(prompt, 1024);

  if (
    !parsed ||
    typeof parsed.explanation !== 'string' ||
    typeof parsed.fixedYaml !== 'string' ||
    (parsed.confidence !== 'high' && parsed.confidence !== 'medium' && parsed.confidence !== 'low')
  ) {
    throw new Error('Gemini returned an invalid debug analysis payload');
  }

  return parsed;
}

export const ruleStage = new Hono();

ruleStage.get('/init', async (c) => {
  try {
    const rule = await getCurrentRule();

    return c.json({
      status: 'success',
      rule,
    });
  } catch (error) {
    console.error('[RuleStage] init failed:', error);
    return c.json({ status: 'error', message: 'Failed to initialize RuleStage' }, 500);
  }
});

ruleStage.get('/rule', async (c) => {
  try {
    const rule = await getCurrentRule();
    return c.json({ status: 'success', rule });
  } catch (error) {
    console.error('[RuleStage] rule fetch failed:', error);
    return c.json({ status: 'error', message: 'Failed to load rule' }, 500);
  }
});

ruleStage.post('/rule', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const payload = body as typeof DEFAULT_AUTOMOD_RULE;
    const title = typeof body?.title === 'string' ? body.title : undefined;
    // Try to get subreddit name from request header first, then fall back to context
    const headerSub = c.req.header('x-reddit-subreddit');
    const subredditName = headerSub ?? context.subredditName ?? 'default';
    console.log('[RuleStage] /rule called with title:', title, 'headerSub:', headerSub, 'context.sub:', context.subredditName, 'using sub:', subredditName);
    const saved = await saveCurrentRule(payload, title);
    return c.json({ status: 'success', rule: saved });
  } catch (error) {
    console.error('[RuleStage] rule save failed:', error);
    return c.json({ status: 'error', message: 'Failed to save rule' }, 500);
  }
});

ruleStage.post('/blast', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const yaml: string = body?.yaml ?? serializeAutomodRule(await getCurrentRule());
    
    // Parse ALL rule blocks from the YAML
    const rules = yaml.split(/^---$/m)
      .filter((block) => block.trim())
      .map((block) => parseAutomodRuleDraft(block, DEFAULT_AUTOMOD_RULE));

    const blast = await runBlastRadius(rules);
    return c.json({ status: 'success', blast });
  } catch (error) {
    console.error('[RuleStage] blast failed:', error);
    return c.json({ status: 'error', message: 'Failed to run Blast Radius' }, 500);
  }
});

ruleStage.post('/chat', async (c) => {
  try {
    // Check circuit breaker
    if (isCircuitBreakerOpen()) {
      const waitTime = Math.ceil((CIRCUIT_BREAKER_TIMEOUT - (Date.now() - circuitBreakerOpenTime)) / 1000);
      return c.json({
        status: 'error',
        message: `The chat feature is temporarily unavailable due to rate limiting. Please wait ${waitTime} seconds before trying again.`
      }, 429);
    }

    const body = (await c.req.json().catch(() => null)) as {
      prompt?: unknown;
      history?: unknown;
      subredditContext?: unknown;
      blastContext?: unknown;
    } | null;

    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const historyInput = Array.isArray(body?.history) ? body.history : [];
    let subredditContext = typeof body?.subredditContext === 'string' ? body.subredditContext : undefined;
    const blastContext = typeof body?.blastContext === 'string' ? body.blastContext : null;

    if (!prompt) {
      return c.json({ status: 'error', message: 'Prompt is required' }, 400);
    }

    if (blastContext) {
      subredditContext = (subredditContext ?? '') + `\n\nLast blast radius: ${blastContext}`;
    }

    const history = historyInput
      .filter((entry): entry is { role: unknown; content: unknown } => !!entry && typeof entry === 'object')
      .map((entry): ChatHistoryMessage => ({
        role: entry.role === 'model' ? 'model' : 'user',
        content: typeof entry.content === 'string' ? entry.content : '',
      }))
      .filter((entry) => entry.content.trim().length > 0)
      .slice(-3); // Reduced from -20 to -3 to reduce prompt size

    const response = await generateChatReplyOnServer(prompt, history, subredditContext);
    return c.json({ status: 'success', response });
  } catch (error) {
    console.error('[RuleStage] chat failed:', error);
    const errorMessage = (error as Error).message || 'Failed to run chat';

    // Open circuit breaker if it's a rate limit error
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      openCircuitBreaker();
    }

    return c.json({ status: 'error', message: errorMessage }, 500);
  }
});

ruleStage.post('/chat-unified', async (c) => {
  try {
    // Check circuit breaker
    if (isCircuitBreakerOpen()) {
      const waitTime = Math.ceil((CIRCUIT_BREAKER_TIMEOUT - (Date.now() - circuitBreakerOpenTime)) / 1000);
      return c.json({
        status: 'error',
        message: `The chat feature is temporarily unavailable due to rate limiting. Please wait ${waitTime} seconds before trying again.`
      }, 429);
    }

    const body = await c.req.json().catch(() => null) as {
      prompt?: unknown;
      history?: unknown;
      subredditContext?: unknown;
      apiKey?: unknown;
    } | null;

    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const historyInput = Array.isArray(body?.history) ? body.history : [];
    const subredditContext = typeof body?.subredditContext === 'string' ? body.subredditContext : undefined;
    const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : undefined;

    if (!prompt) {
      return c.json({ status: 'error', message: 'Prompt is required' }, 400);
    }

    if (!apiKey) {
      return c.json({ status: 'error', message: 'API key is required. Please set your Gemini API key in the chat settings.' }, 400);
    }

    // Step 1: Analyze whether this needs YAML, TypeScript, or both
    const analysis = await generateJson<UnifiedAnalysis>(
      buildUnifiedAnalysisPrompt(prompt),
      4096, // Increased to 4096 to prevent response truncation
      apiKey
    );

    const history = historyInput
      .filter((e): e is { role: unknown; content: unknown } => !!e && typeof e === 'object')
      .map((e) => ({
        role: (e.role === 'model' ? 'model' : 'user') as 'user' | 'model',
        content: typeof e.content === 'string' ? e.content : '',
      }))
      .filter((e) => e.content.trim().length > 0)
      .slice(-3); // Reduced from -5 to -3 to reduce prompt size

    // Step 2: Generate YAML if needed
    let yamlResponse: string | null = null;
    if (analysis.needsYaml) {
      const yamlPrompt = analysis.needsTypeScript
        ? `${prompt}\n\nNote: Only generate the YAML portion of this request. Generate as many YAML rule blocks as needed. The TypeScript portion will be handled separately: ${analysis.typescriptPart}`
        : prompt;
      yamlResponse = await generateChatReplyOnServer(yamlPrompt, history, subredditContext, apiKey);
    }

    // Skip TypeScript trigger generation for now to avoid Devvit HTTP plugin timeouts
    // TODO: Re-enable once Devvit HTTP plugin timeout issues are resolved
    const escapeHatch = null;
    /*
    if (analysis.needsTypeScript) {
      const modContext = getRuleStageModContext();
      const limitation = await analyzeYamlLimitation(
        analysis.typescriptPart || prompt,
        apiKey
      );
      escapeHatch = await generateEscapeHatchTrigger(
        analysis.typescriptPart || prompt,
        modContext,
        limitation,
        apiKey
      );
    }
    */

    return c.json({
      status: 'success',
      analysis,
      yamlResponse,
      escapeHatch,
    });
  } catch (error) {
    console.error('[RuleStage] chat-unified failed:', error);
    const errorMessage = (error as Error).message || 'Failed to process unified request';

    // Open circuit breaker if it's a rate limit error
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      openCircuitBreaker();
    }

    return c.json({ status: 'error', message: errorMessage }, 500);
  }
});

ruleStage.post('/debug', async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as { postId?: unknown } | null;
    const postId = typeof body?.postId === 'string' ? body.postId.trim() : '';

    if (!postId) {
      return c.json({ status: 'error', message: 'postId is required' }, 400);
    }

    const debugResult = await runDebug(postId, context.subredditName ?? undefined);
    const analysis = await analyzeDebugOnServer(debugResult);

    return c.json({
      status: 'success',
      debug: {
        ...debugResult,
        aiFixYaml: analysis.fixedYaml,
      },
    });
  } catch (error) {
    console.error('[RuleStage] debug failed:', error);
    return c.json({ status: 'error', message: 'Failed to debug post' }, 500);
  }
});

ruleStage.post('/debug-mock', async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as { mockPost?: unknown } | null;
    const mockPost = body?.mockPost as Record<string, unknown> | null;

    if (!mockPost || typeof mockPost !== 'object') {
      return c.json({ status: 'error', message: 'mockPost is required' }, 400);
    }

    const validatedPost: MockPostDebugRequest = {
      title: typeof mockPost['title'] === 'string' ? mockPost['title'] : '',
      body: typeof mockPost['body'] === 'string' ? mockPost['body'] : '',
      author: typeof mockPost['author'] === 'string' ? mockPost['author'] : '',
      accountAgeDays: typeof mockPost['accountAgeDays'] === 'number' ? mockPost['accountAgeDays'] : 0,
      combinedKarma: typeof mockPost['combinedKarma'] === 'number' ? mockPost['combinedKarma'] : 0,
      linkKarma: typeof mockPost['linkKarma'] === 'number' ? mockPost['linkKarma'] : 0,
      commentKarma: typeof mockPost['commentKarma'] === 'number' ? mockPost['commentKarma'] : 0,
      subreddit: typeof mockPost['subreddit'] === 'string' ? mockPost['subreddit'] : '',
      domain: typeof mockPost['domain'] === 'string' ? mockPost['domain'] : '',
      url: typeof mockPost['url'] === 'string' ? mockPost['url'] : '',
      isSelf: typeof mockPost['isSelf'] === 'boolean' ? mockPost['isSelf'] : true,
      over18: typeof mockPost['over18'] === 'boolean' ? mockPost['over18'] : false,
      spoiler: typeof mockPost['spoiler'] === 'boolean' ? mockPost['spoiler'] : false,
      stickied: typeof mockPost['stickied'] === 'boolean' ? mockPost['stickied'] : false,
      numComments: typeof mockPost['numComments'] === 'number' ? mockPost['numComments'] : 0,
      score: typeof mockPost['score'] === 'number' ? mockPost['score'] : 0,
      upvoteRatio: typeof mockPost['upvoteRatio'] === 'number' ? mockPost['upvoteRatio'] : 1,
      authorFlairText: typeof mockPost['authorFlairText'] === 'string' ? mockPost['authorFlairText'] : '',
      linkFlairText: typeof mockPost['linkFlairText'] === 'string' ? mockPost['linkFlairText'] : '',
      distinguished: typeof mockPost['distinguished'] === 'string' ? mockPost['distinguished'] : '',
    };

    const liveYaml = await getLiveAutomodYaml(context.subredditName ?? '');
    const currentRule = await getCurrentRule();
    const comparison = await runDebugComparison(validatedPost, currentRule, liveYaml);

    return c.json({
      status: 'success',
      comparison,
    });
  } catch (error) {
    console.error('[RuleStage] debug-mock failed:', error);
    return c.json({ status: 'error', message: 'Failed to debug mock post' }, 500);
  }
});

ruleStage.post('/reset', async (c) => {
  try {
    const rule = await resetRuleStageState();

    return c.json({
      status: 'success',
      rule,
    });
  } catch (error) {
    console.error('[RuleStage] reset failed:', error);
    return c.json({ status: 'error', message: 'Failed to reset RuleStage' }, 500);
  }
});

ruleStage.get('/live-yaml', async (c) => {
  try {
    const yaml = await getLiveAutomodYaml(context.subredditName ?? '');
    return c.json({ status: 'success', yaml });
  } catch (error) {
    console.error('[RuleStage] live-yaml fetch failed:', error);
    return c.json({ status: 'error', message: 'Failed to fetch live YAML' }, 500);
  }
});

ruleStage.post('/publish', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const yaml = typeof body?.yaml === 'string' ? body.yaml : null;
    const title = typeof body?.title === 'string' ? body.title : undefined;
    // Try to get subreddit name from request header first, then fall back to context
    const headerSub = c.req.header('x-reddit-subreddit');
    const subredditName = headerSub ?? context.subredditName ?? 'default';
    console.log('[RuleStage] /publish called with title:', title, 'headerSub:', headerSub, 'context.sub:', context.subredditName, 'using sub:', subredditName, 'yaml length:', yaml?.length);
    if (!yaml) {
      return c.json({ status: 'error', message: 'yaml is required' }, 400);
    }
    await pushYamlToWiki(yaml, subredditName, title);
    // also update Redis so the next load is consistent
    const ruleStorageKey = `rulestage:rule:current:${subredditName}`;
    await redis.set(ruleStorageKey, yaml);
    console.log('[RuleStage] /publish completed successfully');
    return c.json({ status: 'success' });
  } catch (error) {
    console.error('[RuleStage] publish failed:', error);
    return c.json({ status: 'error', message: (error as Error).message || 'Failed to publish to wiki' }, 500);
  }
});

ruleStage.post('/sync-blast-cache', async (c) => {
  try {
    // Try to get subreddit name from request header first, then fall back to context
    const headerSub = c.req.header('x-reddit-subreddit');
    const sub = headerSub ?? context.subredditName ?? 'AutoModDemo'; // Default to AutoModDemo for testing
    const blastCacheKey = `blast:posts:${sub}`;
    console.log('[RuleStage] sync-blast-cache: headerSub=', headerSub, 'context.sub=', context.subredditName, 'using sub=', sub, 'key=', blastCacheKey);
    
    const existingRaw = await redis.get(blastCacheKey);
    const existingPosts: CachedPost[] = existingRaw ? JSON.parse(existingRaw) : [];
    console.log('[RuleStage] sync-blast-cache: existing posts=', existingPosts.length);

    // Fetch recent posts using the Devvit reddit API (not direct HTTP)
    const freshPosts: CachedPost[] = [];
    try {
      for await (const post of reddit.getNewPosts({ subredditName: sub, limit: 100 })) {
        freshPosts.push({
          id: post.id,
          title: post.title,
          body: post.body ?? '',
          author: post.authorName ?? 'unknown',
          accountAgeDays: 365,    // safe default — won't trigger age-based rules
          combinedKarma: 1000,    // safe default
          createdAt: post.createdAt ? post.createdAt.getTime() / 1000 : Date.now() / 1000,
          isSpam: false,
          wasRemoved: post.removed ?? false,
        });
        if (freshPosts.length >= 100) break;
      }
    } catch (fetchError) {
      console.error('[RuleStage] Failed to fetch new posts:', fetchError);
    }
    console.log('[RuleStage] sync-blast-cache: fetched posts=', freshPosts.length);

    // Merge: fresh posts take priority, keep existing posts not in fresh list
    const freshIds = new Set(freshPosts.map((p) => p.id));
    const merged = [
      ...freshPosts,
      ...existingPosts.filter((p) => !freshIds.has(p.id)),
    ].slice(0, 500);

    await redis.set(blastCacheKey, JSON.stringify(merged));
    console.log('[RuleStage] sync-blast-cache: saved merged posts=', merged.length);

    return c.json({
      status: 'success',
      synced: freshPosts.length,
      total: merged.length,
    });
  } catch (error) {
    console.error('[RuleStage] sync-blast-cache failed:', error);
    return c.json({ status: 'error', message: (error as Error).message || 'Failed to sync blast cache' }, 500);
  }
});


ruleStage.get('/context', async (c) => {
  try {
    const sub = context.subredditName ?? '';
    if (!sub) {
      return c.json({ status: 'error', message: 'No subreddit context' }, 400);
    }

    const [
      wikiPageResult,
      flairTemplatesResult,
      userFlairsResult,
      moderatorsResult,
    ] = await Promise.allSettled([
      reddit.getWikiPage(sub, 'config/automoderator'),
      reddit.getPostFlairTemplates(sub),
      reddit.getUserFlairTemplates(sub),
      (async () => {
        const mods: string[] = [];
        for await (const m of reddit.getModerators({ subredditName: sub })) {
          mods.push(m.username);
          if (mods.length >= 50) break;
        }
        return mods;
      })(),
    ]);

    // Extract wiki content
    function extractWikiContent(page: unknown): string {
      if (typeof page === 'string') {
        return page;
      }
      if (page && typeof page === 'object') {
        const record = page as Record<string, unknown>;
        const content = record.content_md ?? record.content ?? record.wikitext ?? record.body ?? record.md;
        if (typeof content === 'string') {
          return content;
        }
      }
      return '';
    }

    const liveYaml = wikiPageResult.status === 'fulfilled' ? extractWikiContent(wikiPageResult.value) : '';
    const postFlairs = flairTemplatesResult.status === 'fulfilled' ? flairTemplatesResult.value.map((f: any) => f.text) : [];
    const userFlairs = userFlairsResult.status === 'fulfilled' ? userFlairsResult.value.map((f: any) => f.text) : [];
    const moderators = moderatorsResult.status === 'fulfilled' ? moderatorsResult.value : [];
    const removalReasons: string[] = [];

    // Direct HTTP requests to www.reddit.com are not allowed in Devvit serverless environment
    // Subscribers and rules are not available through the reddit API
    const subscribers = 0;
    const rules: { short_name: string; description?: string }[] = [];

    return c.json({
      status: 'success',
      liveYaml,
      postFlairs,
      userFlairs,
      removalReasons,
      moderators,
      subredditName: sub,
      subscribers,
      rules,
    });
  } catch (error) {
    console.error('[RuleStage] context fetch failed:', error);
    return c.json({ status: 'error', message: 'Failed to fetch context' }, 500);
  }
});