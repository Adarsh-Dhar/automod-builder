import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import {
  DEFAULT_AUTOMOD_RULE,
  buildDebugPrompt,
  buildDecoderAnalysisPrompt,
  type DecoderAnalysis,
  type EscapeHatchCode,
} from '../../shared/automod';
import type { DebugResponse } from '../../shared/debug-types';
import { runDebug } from '../services/debugger.service';
import { runBlastRadius } from '../services/blast-radius.service';
import { analyzeYamlLimitation, generateEscapeHatchTrigger, getRuleStageModContext } from '../services/escape-hatch.service';
import { resolveServerGeminiApiKey } from '../services/gemini-key.service';
import { getCurrentRule, resetRuleStageState, runSimulation, saveCurrentRule } from '../services/automod.service';

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

async function analyzeObfuscationOnServer(examples: [string, string, string]): Promise<DecoderAnalysis> {
  const apiKey = await resolveServerGeminiApiKey();

  if (!apiKey) {
    throw new Error('Missing server Gemini API key');
  }

  const prompt = buildDecoderAnalysisPrompt(examples);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${txt}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
  const parsed = JSON.parse(stripCodeFences(text || JSON.stringify(data))) as DecoderAnalysis;

  if (!parsed || !Array.isArray(parsed.tricks) || typeof parsed.explanation !== 'string' || typeof parsed.regexPattern !== 'string' || typeof parsed.automodYaml !== 'string') {
    throw new Error('Gemini returned an invalid decoder analysis payload');
  }

  if (parsed.confidence !== 'high' && parsed.confidence !== 'medium' && parsed.confidence !== 'low') {
    throw new Error('Gemini returned an invalid confidence level');
  }

  return parsed;
}

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
  const apiKey = await resolveServerGeminiApiKey();

  if (!apiKey) {
    throw new Error('Missing server Gemini API key. Set GEMINI_API_KEY in Devvit app settings.');
  }

  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  contents.push({ role: 'user', parts: [{ text: AUTOMOD_SYSTEM_PROMPT }] });
  contents.push({ role: 'model', parts: [{ text: 'Understood. I will output only valid AutoModerator YAML.' }] });

  if (subredditContext?.trim()) {
    contents.push({ role: 'user', parts: [{ text: subredditContext.trim() }] });
    contents.push({ role: 'model', parts: [{ text: 'Noted. I will keep this subreddit context in mind.' }] });
  }

  for (const message of history.slice(-10)) {
    if (!message?.content?.trim()) {
      continue;
    }

    contents.push({
      role: message.role === 'model' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${txt}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
  return text || 'I could not generate a response.';
}

async function analyzeDebugOnServer(result: DebugResponse): Promise<DebugAnalysis> {
  const apiKey = await resolveServerGeminiApiKey();

  if (!apiKey) {
    throw new Error('Missing server Gemini API key');
  }

  const prompt = buildDebugPrompt(
    {
      id: result.postId,
      title: result.postTitle,
      body: result.postBody,
      author: result.postAuthor,
      accountAgeDays: 0,
      combinedKarma: 0,
    },
    result.matches
  );

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${txt}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
  const parsed = JSON.parse(stripCodeFences(text || JSON.stringify(data))) as DebugAnalysis;

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
    const simulation = await runSimulation(rule);

    return c.json({
      status: 'success',
      rule,
      simulation,
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

ruleStage.post('/simulate', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const rule = body?.rule ?? undefined;
    const result = await runSimulation(rule);
    return c.json({ status: 'success', simulation: result });
  } catch (error) {
    console.error('[RuleStage] simulate failed:', error);
    return c.json({ status: 'error', message: 'Failed to run simulation' }, 500);
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

ruleStage.post('/decoder/analyze', async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as { examples?: unknown } | null;
    const examples = body?.examples;

    if (!Array.isArray(examples) || examples.length !== 3 || examples.some((example) => typeof example !== 'string')) {
      return c.json({ status: 'error', message: 'Exactly three spam examples are required' }, 400);
    }

    const analysis = await analyzeObfuscationOnServer(examples as [string, string, string]);
    return c.json({ status: 'success', analysis });
  } catch (error) {
    console.error('[RuleStage] decoder analyze failed:', error);
    return c.json({ status: 'error', message: 'Failed to analyze obfuscation' }, 500);
  }
});

ruleStage.post('/chat', async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as {
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

ruleStage.post('/escape-hatch/analyze', async (c) => {
  try {
    const body = (await c.req.json().catch(() => null)) as { request?: unknown } | null;
    const request = typeof body?.request === 'string' ? body.request.trim() : '';

    if (!request) {
      return c.json({ status: 'error', message: 'Request description is required' }, 400);
    }

    const limitation = await analyzeYamlLimitation(request);
    let escapeHatch: EscapeHatchCode | null = null;

    if (limitation.hasLimitation) {
      escapeHatch = await generateEscapeHatchTrigger(request, getRuleStageModContext(), limitation);
    }

    return c.json({
      status: 'success',
      limitation,
      escapeHatch,
    });
  } catch (error) {
    console.error('[RuleStage] escape-hatch analyze failed:', error);
    return c.json({ status: 'error', message: 'Failed to analyze request' }, 500);
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

ruleStage.post('/reset', async (c) => {
  try {
    const rule = await resetRuleStageState();
    const simulation = await runSimulation(rule);

    return c.json({
      status: 'success',
      rule,
      simulation,
    });
  } catch (error) {
    console.error('[RuleStage] reset failed:', error);
    return c.json({ status: 'error', message: 'Failed to reset RuleStage' }, 500);
  }
});