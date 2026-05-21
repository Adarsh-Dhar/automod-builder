import { Hono } from 'hono';
import { DEFAULT_AUTOMOD_RULE, type DecoderAnalysis } from '../../shared/automod';
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

  const prompt = [
    'You are analyzing spam messages that bypass moderation by using Unicode and phrasing obfuscation.',
    'Inspect all three examples and identify the shared tricks used across the campaign.',
    'Return a single JSON object only. Do not wrap it in markdown fences or add commentary.',
    'The JSON object must match this shape exactly:',
    '{',
    '  "tricks": ["homoglyph" | "zero-width" | "look-alike" | "separator-noise" | "evasive-phrasing" | "mixed-script"],',
    '  "explanation": "human readable breakdown of each trick and how it works",',
    '  "regexPattern": "a single regex string that would match the campaign",',
    '  "automodYaml": "AutoModerator YAML snippet that applies the regex pattern",',
    '  "confidence": "high" | "medium" | "low"',
    '}',
    '',
    'Example 1:',
    examples[0],
    '',
    'Example 2:',
    examples[1],
    '',
    'Example 3:',
    examples[2],
  ].join('\n');

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