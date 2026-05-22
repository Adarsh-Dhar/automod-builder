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
    const envKey = (process.env.GEMINI_API_KEY ?? '').trim();
    const storedKey = (await settings.get<string>('GEMINI_API_KEY')) ?? '';
    const apiKey = envKey || (storedKey ?? '');

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
  const endpoint = (process.env.GITHUB_MODEL_ENDPOINT ?? '').trim() || 'https://models.github.ai/inference/chat/completions';
  const modelIdRaw = (process.env.GITHUB_MODEL_ID ?? 'gpt-4o').trim();
  const modelId = modelIdRaw.includes('/') ? modelIdRaw : `openai/${modelIdRaw}`;

  const apiKey = await resolveGithubApiKey();
  if (!apiKey) {
    throw new Error('Missing GITHUB_API_KEY for dev GitHub model usage');
  }

  // Build Chat-style messages payload
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt });
  if (Array.isArray(opts.history)) {
    for (const h of opts.history) {
      messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: h.content });
    }
  }
  messages.push({ role: 'user', content: input });

  const payload: any = {
    model: modelId,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxOutputTokens ?? 1024,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${apiKey}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub model API error ${res.status}: ${txt}`);
  }

  const data = await res.json().catch(() => null);

  // Robust extraction of textual content from multiple potential shapes
  const extractText = (d: any): string => {
    if (!d) return '';
    // New GitHub Models: choices[].message (string) or choices[].message.content
    if (Array.isArray(d.choices) && d.choices.length) {
      const choice = d.choices[0];
      if (typeof choice === 'string') return choice;
      if (choice?.message) {
        if (typeof choice.message === 'string') return choice.message;
        if (typeof choice.message?.content === 'string') return choice.message.content;
        // message.content might be an array/parts
        if (Array.isArray(choice.message?.content)) return choice.message.content.join('');
      }
      if (typeof choice.text === 'string') return choice.text;
    }

    // Old shapes or other providers
    if (typeof d.output_text === 'string') return d.output_text;
    if (d?.result && typeof d.result.output_text === 'string') return d.result.output_text;
    if (typeof d.output === 'string') return d.output;
    if (Array.isArray(d.output)) return d.output.map((o: any) => (o?.content ?? o?.text ?? '')).join('\n');

    // Fallback: stringify
    return JSON.stringify(d || {});
  };

  const text = extractText(data);
  return text;
}

export async function generateJson<T>(prompt: string, maxOutputTokens = 1024): Promise<T> {
  const text = await generateText(prompt, { maxOutputTokens, responseMimeType: 'application/json' });

  const cleaned = stripCodeFences(text || '');
  return JSON.parse(cleaned) as T;
}
