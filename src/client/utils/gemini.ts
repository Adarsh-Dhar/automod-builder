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
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
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