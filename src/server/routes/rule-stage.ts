import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import { DEFAULT_AUTOMOD_RULE, buildDebugPrompt, buildDecoderAnalysisPrompt, type DecoderAnalysis } from '../../shared/automod';
import type { DebugResponse } from '../../shared/debug-types';
import { runDebug } from '../services/debugger.service';
import { runBlastRadius } from '../services/blast-radius.service';
import { getCurrentRule, resetRuleStageState, runSimulation, saveCurrentRule } from '../services/automod.service';

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

async function analyzeObfuscationOnServer(examples: [string, string, string]): Promise<DecoderAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY ?? '';

  if (!apiKey) {
    throw new Error('Missing server Gemini API key');
  }

  const prompt = buildDecoderAnalysisPrompt(examples);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
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

async function analyzeDebugOnServer(result: DebugResponse): Promise<DebugAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY ?? '';

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

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
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