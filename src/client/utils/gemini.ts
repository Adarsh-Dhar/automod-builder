import type { DecoderAnalysis } from '../../shared/automod';

type GeminiMessage = {
  role: 'user' | 'model';
  content: string;
};

type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>;
  };
};

function buildGeminiUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function getGeminiText(data: unknown): string {
  const candidate = (data as { candidates?: GeminiCandidate[] })?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((part) => part.text ?? '').join('').trim();

  if (text) {
    return text;
  }

  return JSON.stringify(data);
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function parseDecoderAnalysis(text: string): DecoderAnalysis {
  const parsed = JSON.parse(stripCodeFences(text)) as DecoderAnalysis;

  if (!parsed || !Array.isArray(parsed.tricks) || typeof parsed.explanation !== 'string' || typeof parsed.regexPattern !== 'string' || typeof parsed.automodYaml !== 'string') {
    throw new Error('Gemini returned an invalid decoder analysis payload');
  }

  if (parsed.confidence !== 'high' && parsed.confidence !== 'medium' && parsed.confidence !== 'low') {
    throw new Error('Gemini returned an invalid confidence level');
  }

  return parsed;
}

function toGeminiContents(messages: GeminiMessage[]): GeminiContent[] {
  return messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.content }],
  }));
}

async function generateGeminiText(apiKey: string, contents: GeminiMessage[], generationConfig: Record<string, unknown>): Promise<string> {
  if (!apiKey) throw new Error('Missing Gemini API key');

  const res = await fetch(buildGeminiUrl(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: toGeminiContents(contents),
      generationConfig,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  return getGeminiText(data);
}

export async function callGemini(
  apiKey: string,
  prompt: string,
  history?: GeminiMessage[],
  subredditContext?: string
): Promise<string> {
  const contents: GeminiMessage[] = [];

  if (subredditContext) {
    contents.push({ role: 'user', content: subredditContext });
  }

  if (history?.length) {
    contents.push(...history);
  }

  contents.push({ role: 'user', content: prompt });

  return generateGeminiText(apiKey, contents, {
    temperature: 0.2,
    maxOutputTokens: 512,
  });
}

export async function analyzeObfuscation(
  apiKey: string,
  examples: [string, string, string]
): Promise<DecoderAnalysis> {
  if (examples.length !== 3) {
    throw new Error('Decoder analysis requires exactly three examples');
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

  const text = await generateGeminiText(apiKey, [{ role: 'user', content: prompt }], {
    temperature: 0.2,
    maxOutputTokens: 1024,
    responseMimeType: 'application/json',
  });

  return parseDecoderAnalysis(text);
}