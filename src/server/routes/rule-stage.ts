import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import {
  DEFAULT_AUTOMOD_RULE,
  buildDebugPrompt,
  buildUnifiedAnalysisPrompt,
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

const AUTOMOD_SYSTEM_PROMPT = `You are an AutoModerator rule assistant for Reddit. Your ONLY job is to output a single, complete AutoModerator YAML rule block in response to the user's request.

STRICT RULES:
1. Always output exactly ONE rule wrapped in --- delimiters.
2. Never include or repeat previous rules - write a fresh standalone rule each time.
3. type must always be: submission
4. For text matching use ONLY these exact keys:
   title (includes): ['phrase1', 'phrase2']
   title (matches): ['regex']
   body (includes): ['phrase']
   body (matches): ['regex']
   Never invent other keys like "title (includes-word)" or "report_reason".
5. Numeric author conditions go nested under author: block:
   author:
     satisfy_any_threshold: true
     account_age: "< 30 days"
     combined_karma: "< 50"
6. action must be one of: remove, approve, report
7. Always include comment: | and modmail: | as block literals.
8. The rule name is a comment on the line after the first ---:
   ---
   # Rule name here
   type: submission
   ...
   ---
9. Do not add any prose, explanation, or markdown outside the yaml code fence.
10. Wrap the YAML in a code fence: \`\`\`yaml ... \`\`\`
11. Use the provided post flair names exactly when writing link_flair conditions.
12. Use the provided removal reason text verbatim in comment: blocks.
13. Do not create rules that duplicate existing rule names shown in the context.
14. If the live config is provided, generate rules that are compatible with the existing YAML — use the same type, indentation style, and action patterns.

Example of a perfectly formatted rule:
\`\`\`yaml
---
# New account spam guard
type: submission
title (includes): ['buy now', 'grab yours']
author:
  satisfy_any_threshold: true
  account_age: "< 30 days"
  combined_karma: "< 50"
action: remove
comment_stickied: true
comment: |
  Your post was removed by AutoModerator. Contact the mods if this is a mistake.
modmail: |
  Removed post: {{permalink}}
  User: u/{{author}}
  Title: {{title}}
---
\`\`\``;

export async function generateChatReplyOnServer(
  prompt: string,
  history: ChatHistoryMessage[] = [],
  subredditContext?: string
): Promise<string> {
  // Build the prompt text combining system prompt, optional subreddit context, history and user prompt.
  const parts: string[] = [];
  parts.push(AUTOMOD_SYSTEM_PROMPT);
  parts.push('Understood. I will output only valid AutoModerator YAML.');

  if (subredditContext?.trim()) {
    parts.push(subredditContext.trim());
    parts.push('Noted. I will keep this subreddit context in mind.');
  }

  for (const message of history.slice(-10)) {
    if (!message?.content?.trim()) continue;
    parts.push(`${message.role === 'model' ? 'Assistant:' : 'User:'} ${message.content}`);
  }

  parts.push(`User: ${prompt}`);

  const combined = parts.join('\n\n');
  const text = await generateText(combined, { temperature: 0.1, maxOutputTokens: 1024 });
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
    const payload = (await c.req.json()) as typeof DEFAULT_AUTOMOD_RULE;
    const saved = await saveCurrentRule(payload);
    return c.json({ status: 'success', rule: saved });
  } catch (error) {
    console.error('[RuleStage] rule save failed:', error);
    return c.json({ status: 'error', message: 'Failed to save rule' }, 500);
  }
});

ruleStage.post('/blast', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const rule = body?.rule ?? (await getCurrentRule());
    const blast = await runBlastRadius(rule);
    return c.json({ status: 'success', blast });
  } catch (error) {
    console.error('[RuleStage] blast failed:', error);
    return c.json({ status: 'error', message: 'Failed to run Blast Radius' }, 500);
  }
});

ruleStage.post('/chat', async (c) => {
  try {
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
      .slice(-20);

    const response = await generateChatReplyOnServer(prompt, history, subredditContext);
    return c.json({ status: 'success', response });
  } catch (error) {
    console.error('[RuleStage] chat failed:', error);
    return c.json({ status: 'error', message: (error as Error).message || 'Failed to run chat' }, 500);
  }
});

ruleStage.post('/chat-unified', async (c) => {
  try {
    const body = await c.req.json().catch(() => null) as {
      prompt?: unknown;
      history?: unknown;
      subredditContext?: unknown;
    } | null;

    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const historyInput = Array.isArray(body?.history) ? body.history : [];
    const subredditContext = typeof body?.subredditContext === 'string' ? body.subredditContext : undefined;

    if (!prompt) {
      return c.json({ status: 'error', message: 'Prompt is required' }, 400);
    }

    // Step 1: Analyze whether this needs YAML, TypeScript, or both
    const analysis = await generateJson<UnifiedAnalysis>(
      buildUnifiedAnalysisPrompt(prompt),
      2048
    );

    const history = historyInput
      .filter((e): e is { role: unknown; content: unknown } => !!e && typeof e === 'object')
      .map((e) => ({
        role: (e.role === 'model' ? 'model' : 'user') as 'user' | 'model',
        content: typeof e.content === 'string' ? e.content : '',
      }))
      .filter((e) => e.content.trim().length > 0)
      .slice(-20);

    // Step 2: Generate YAML if needed
    let yamlResponse: string | null = null;
    if (analysis.needsYaml) {
      const yamlPrompt = analysis.needsTypeScript
        ? `${prompt}\n\nNote: Only generate the YAML portion. The part requiring code will be handled separately: ${analysis.typescriptPart}`
        : prompt;
      yamlResponse = await generateChatReplyOnServer(yamlPrompt, history, subredditContext);
    }

    // Step 3: Generate TypeScript trigger if needed (disabled - escape-hatch removed)
    // TypeScript trigger generation has been removed along with Advanced Mode

    return c.json({
      status: 'success',
      analysis,
      yamlResponse,
      escapeHatch: null,
    });
  } catch (error) {
    console.error('[RuleStage] chat-unified failed:', error);
    return c.json({ status: 'error', message: 'Failed to process unified request' }, 500);
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

    const currentRule = await getCurrentRule();
    const comparison = await runDebugComparison(validatedPost, currentRule);

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
    if (!yaml) {
      return c.json({ status: 'error', message: 'yaml is required' }, 400);
    }
    await pushYamlToWiki(yaml);
    // also update Redis so the next load is consistent
    const ruleStorageKey = `rulestage:rule:current:${context.subredditName ?? 'default'}`;
    await redis.set(ruleStorageKey, yaml);
    return c.json({ status: 'success' });
  } catch (error) {
    console.error('[RuleStage] publish failed:', error);
    return c.json({ status: 'error', message: 'Failed to publish to wiki' }, 500);
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

    // Fetch subreddit info from public API as fallback for subscribers and rules
    let subscribers = 0;
    let rules: { short_name: string; description?: string }[] = [];
    try {
      const aboutRes = await fetch(`https://www.reddit.com/r/${encodeURIComponent(sub)}/about.json`);
      if (aboutRes.ok) {
        const about = await aboutRes.json();
        subscribers = about?.data?.subscribers ?? 0;
      }
    } catch (e) {
      // ignore network errors
    }

    try {
      const rulesRes = await fetch(`https://www.reddit.com/r/${encodeURIComponent(sub)}/about/rules.json`);
      if (rulesRes.ok) {
        const rulesJson = await rulesRes.json();
        const rulesArray = rulesJson?.rules ?? rulesJson?.data?.rules ?? [];
        rules = Array.isArray(rulesArray)
          ? rulesArray.map((r: any) => ({
              short_name: r.short_name ?? r.shortName ?? r.shortname ?? (r.short ?? 'rule'),
              description: r.description ?? r.short_description ?? '',
            }))
          : [];
      }
    } catch (e) {
      // ignore
    }

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