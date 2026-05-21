export async function callGemini(
  apiKey: string,
  prompt: string,
  history?: { role: 'user' | 'model'; content: string }[],
  subredditContext?: string
): Promise<string> {
  if (!apiKey) throw new Error('Missing Gemini API key');

  // Build a simple text prompt combining history and subreddit context when available
  let fullPrompt = '';
  if (subredditContext) {
    fullPrompt += `${subredditContext}\n\n`;
  }

  if (history && history.length) {
    for (const h of history) {
      fullPrompt += `${h.role === 'model' ? 'Assistant:' : 'User:'} ${h.content}\n`;
    }
    fullPrompt += '\n';
  }

  fullPrompt += prompt;

  const url = `https://generativelanguage.googleapis.com/v1/models/text-bison-001:generate?key=${encodeURIComponent(
    apiKey
  )}`;

  const body = {
    prompt: {
      text: fullPrompt,
    },
    temperature: 0.2,
    maxOutputTokens: 512,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${txt}`);
  }

  const data = await res.json();

  // data.candidates[0].content is typical; fall back to other shapes if needed
  const text = data?.candidates?.[0]?.content ?? data?.output?.[0]?.content ?? data?.content ?? JSON.stringify(data);

  return String(text);
}
