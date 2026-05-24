import { settings } from '@devvit/web/server';
import { createRequire } from 'module';

// Load environment variables from .env file for local development
const require = createRequire(import.meta.url);
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
  try {
    require('dotenv').config({ path: '.env' });
  } catch {
    // dotenv not available, continue without it
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

export type GenerateOptions = {
  systemPrompt?: string;
  history?: Array<{ role: 'user' | 'model'; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string | null;
};

export async function generateText(input: string, opts: GenerateOptions = {}): Promise<string> {
  // Use Gemini API in both production and development
  const envKey = (process.env.GEMINI_API_KEY ?? '').trim();
  const storedKey = (await settings.get<string>('GEMINI_API_KEY')) ?? '';
  const apiKey = envKey || (storedKey ?? '');

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY');
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

export async function generateJson<T>(prompt: string, maxOutputTokens = 1024): Promise<T> {
  const text = await generateText(prompt, { maxOutputTokens, responseMimeType: 'application/json' });

  const cleaned = stripCodeFences(text || '');
  
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    // If JSON parsing fails, try to extract JSON from the response
    // Sometimes Gemini returns JSON with extra text around it
    // Try to find a complete JSON object by matching braces
    let braceCount = 0;
    let startIndex = -1;
    let endIndex = -1;
    
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (braceCount === 0) startIndex = i;
        braceCount++;
      } else if (cleaned[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIndex !== -1) {
          endIndex = i + 1;
          break;
        }
      }
    }
    
    if (startIndex !== -1 && endIndex !== -1) {
      const jsonStr = cleaned.substring(startIndex, endIndex);
      try {
        return JSON.parse(jsonStr) as T;
      } catch (parseError) {
        console.error('Failed to parse extracted JSON:', jsonStr);
        throw new Error(`Failed to parse JSON from Gemini response. Extracted: ${jsonStr.substring(0, 200)}...`);
      }
    }
    
    console.error('Failed to find complete JSON in response:', cleaned.substring(0, 500));
    throw new Error(`Failed to parse JSON from Gemini response. Response: ${cleaned.substring(0, 200)}...`);
  }
}
