import { resolveServerGeminiApiKey } from './gemini-key.service';

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // Try to match complete code fences first
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }
  // Handle truncated responses - strip opening fence if present
  const openingFenceMatch = trimmed.match(/^```(?:json)?\s*/i);
  if (openingFenceMatch) {
    return trimmed.substring(openingFenceMatch[0].length).trim();
  }
  return trimmed;
}

export type GenerateOptions = {
  systemPrompt?: string;
  history?: Array<{ role: 'user' | 'model'; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string | null;
  maxRetries?: number;
};

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Simple in-memory rate limit cache to avoid repeated failed requests
const rateLimitCache = new Map<string, { timestamp: number; retryAfter: number }>();

function isRateLimited(url: string): boolean {
  const cached = rateLimitCache.get(url);
  if (!cached) return false;

  const now = Date.now();
  if (now < cached.timestamp + cached.retryAfter) {
    return true;
  }

  rateLimitCache.delete(url);
  return false;
}

function markRateLimited(url: string, retryAfterMs: number): void {
  rateLimitCache.set(url, {
    timestamp: Date.now(),
    retryAfter: retryAfterMs,
  });
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 0): Promise<Response> {
  let lastError: Error | null = null;

  // Check if this URL is currently rate limited
  if (isRateLimited(url)) {
    const cached = rateLimitCache.get(url)!;
    const waitTime = Math.ceil((cached.retryAfter - (Date.now() - cached.timestamp)) / 1000);
    throw new Error(`Rate limited. Please wait ${waitTime} seconds before trying again.`);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, 30000);

      // Check for rate limit errors (HTTP 429)
      if (response.status === 429) {
        const errorText = await response.text();
        lastError = new Error(`Rate limited: ${errorText}`);
        console.error(`Fetch attempt ${attempt + 1} rate limited:`, errorText);

        if (attempt < maxRetries) {
          // Use longer delays for rate limit errors (5s, 10s, 20s)
          const delayMs = Math.pow(2, attempt) * 5000;
          console.log(`Retrying after ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        } else {
          // Mark as rate limited for 60 seconds to avoid immediate retries
          markRateLimited(url, 60000);
        }
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`Fetch attempt ${attempt + 1} failed:`, error);

      const errorMessage = (error as Error)?.message || '';

      // If it's a DEADLINE_EXCEEDED error from Devvit plugin, don't retry - it's a plugin limitation
      if (errorMessage.includes('DEADLINE_EXCEEDED') || errorMessage.includes('context deadline exceeded')) {
        console.error('Devvit HTTP plugin deadline exceeded - this is a plugin limitation');
        throw new Error('The Devvit HTTP plugin has an internal deadline that was exceeded. Please try with a shorter prompt or reduce the request size.');
      }

      // If it's a rate limit error from the error message (not HTTP 429)
      if (errorMessage.includes('too many requests') || errorMessage.includes('rate limit')) {
        console.error('Rate limit detected from error message');
        if (attempt === maxRetries) {
          // Mark as rate limited for 60 seconds
          markRateLimited(url, 60000);
        }
      }

      if (attempt < maxRetries) {
        const delayMs = Math.pow(2, attempt) * 300;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // Check if it's a rate limit error and provide a better message
  const errorMessage = lastError?.message || '';
  const errorDetails = (lastError as any)?.details || '';
  const fullError = `${errorMessage} ${errorDetails}`.toLowerCase();

  if (fullError.includes('too many requests') || fullError.includes('rate limit') || fullError.includes('429') || errorMessage.includes('grpc invocation failed')) {
    throw new Error('The Gemini API is rate limiting your requests. Please wait a few minutes before trying again, or check your API key quota at https://aistudio.google.com/app/apikey.');
  }

  if (fullError.includes('deadline exceeded') || fullError.includes('timeout') || errorMessage.includes('DEADLINE_EXCEEDED')) {
    throw new Error('The request timed out. The Gemini API may be slow to respond. Please try again.');
  }

  throw lastError || new Error('Max retries exceeded');
}

export async function generateText(input: string, opts: GenerateOptions = {}, providedApiKey?: string): Promise<string> {
  const apiKey = providedApiKey || await resolveServerGeminiApiKey();
  const { temperature = 0.2, maxOutputTokens = 8192, maxRetries = 0 } = opts;

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY');
  }

  // Truncate input if it's too large to avoid URI size limit errors
  // Devvit HTTP plugin has a URI size limit and internal deadline, so we need to keep the request body reasonable
  const MAX_INPUT_LENGTH = 4000; // Increased from 2k to 4k to preserve user's detailed rule specifications
  const truncatedInput = input.length > MAX_INPUT_LENGTH
    ? input.substring(0, MAX_INPUT_LENGTH) + '\n\n[Content truncated due to size limit]'
    : input;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const contents = opts.systemPrompt
    ? [{ role: 'user', parts: [{ text: opts.systemPrompt }] }, { role: 'model', parts: [{ text: 'Understood.' }] }, { role: 'user', parts: [{ text: truncatedInput }] }]
    : [{ role: 'user', parts: [{ text: truncatedInput }] }];

  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    }),
  }, maxRetries);

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${txt}`);
  }

  const data = await res.json().catch(() => null);
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim() ?? '';
  return text || JSON.stringify(data || {});
}

export async function generateJson<T>(prompt: string, maxOutputTokens = 1024, providedApiKey?: string): Promise<T> {
  const systemPrompt = 'You are a JSON API. You must respond with ONLY valid JSON. No conversational text, no explanations, no markdown, no code fences. Just the raw JSON object starting with { and ending with }.';
  const text = await generateText(prompt, { maxOutputTokens, systemPrompt }, providedApiKey);

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
        console.error('Full response:', cleaned);
        throw new Error(`Failed to parse JSON from Gemini response. Extracted: ${jsonStr.substring(0, 200)}...`);
      }
    }

    console.error('Failed to find complete JSON in response:', cleaned.substring(0, 500));
    console.error('Full response:', cleaned);
    throw new Error(`Failed to parse JSON from Gemini response. Response: ${cleaned.substring(0, 200)}...`);
  }
}
