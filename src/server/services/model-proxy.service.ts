import { settings } from '@devvit/web/server';

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

async function resolveGithubApiKey(): Promise<string> {
  const envKey = (process.env.GITHUB_API_KEY ?? '').trim();

  if (envKey) return envKey;

  try {
    const v = await settings.get<string>('GITHUB_API_KEY');
    return (v ?? '').trim();
  } catch {
    return '';
  }
}

export type GenerateOptions = {
  systemPrompt?: string;
  history?: Array<{ role: 'user' | 'model'; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string | null;
};

export async function generateText(input: string, opts: GenerateOptions = {}): Promise<string> {
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    // Gemini path — use existing Gemini REST API
    const apiKey = (process.env.GEMINI_API_KEY ?? '').trim() || (await settings.get<string>('GEMINI_API_KEY')) ?? '';

    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY for production');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
      apiKey
    )}`;

    const contents = [{ role: 'user', parts: [{ text: input }] }];

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
          responseMimeType: opts.responseMimeType ?? undefined,
        },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${txt}`);
    }

    const data = await res.json().catch(() => null);
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim() ?? '';
    return text || JSON.stringify(data || {});
  }

  // Dev path: GitHub model — require endpoint and API key
  const endpoint = (process.env.GITHUB_MODEL_ENDPOINT ?? '').trim();
  const modelId = (process.env.GITHUB_MODEL_ID ?? 'gpt-4o').trim();

  if (!endpoint) {
    throw new Error('GITHUB_MODEL_ENDPOINT is not configured. Set GITHUB_MODEL_ENDPOINT to the GitHub model API URL.');
  }

  const apiKey = await resolveGithubApiKey();
  if (!apiKey) {
    throw new Error('Missing GITHUB_API_KEY for dev GitHub model usage');
  }

  // Generic POST to user-provided GitHub-compatible endpoint.
  // Body shape is intentionally flexible; users can set GITHUB_MODEL_ENDPOINT to a compatible URL.
  const payload: any = {
    model: modelId,
    input: input,
    temperature: opts.temperature ?? 0.2,
    max_output_tokens: opts.maxOutputTokens ?? 1024,
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`GitHub model API error ${res.status}: ${txt}`);
    }

    const data = await res.json().catch(() => null);

    // Attempt to extract text conservatively from common fields
    const text =
      (data?.output_text as string) ||
      (data?.result?.output_text as string) ||
      (Array.isArray(data?.choices) && (data.choices[0].text ?? data.choices[0].message?.content)) ||
      JSON.stringify(data || {});

    return typeof text === 'string' ? text : JSON.stringify(text);
  } catch (err) {
    throw err;
  }
}

export async function generateJson<T>(prompt: string, maxOutputTokens = 1024): Promise<T> {
  const text = await generateText(prompt, { maxOutputTokens, responseMimeType: 'application/json' });

  const cleaned = stripCodeFences(text || '');
  return JSON.parse(cleaned) as T;
}
