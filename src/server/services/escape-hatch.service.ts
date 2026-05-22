import { context } from '@devvit/web/server';
import {
  buildEscapeHatchAnalysisPrompt,
  buildEscapeHatchGenerationPrompt,
  type EscapeHatchCode,
  type YamlLimitation,
  type YamlLimitationAnalysis,
} from '../../shared/automod';
import { getEscapeHatchTemplate } from '../templates/escape-hatch-templates';

type GeminiContentPart = {
  text?: string;
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiContentPart[];
  };
};

type LimitationDetectionResult = {
  hasLimitation: boolean;
  limitation: YamlLimitation | null;
  explanation: string;
  recommendation: 'yaml' | 'typescript';
};

type CodeGenerationResult = {
  code: string;
  description: string;
  limitations: string[];
  confidence: 'high' | 'medium' | 'low';
};

type ModContext = {
  subredditName?: string;
};

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch?.[1]?.trim() ?? trimmed;
}

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY ?? '';
}

function getGeminiUrl(apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function extractModelText(data: { candidates?: GeminiCandidate[] }): string {
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
}

async function generateJson<T>(prompt: string, maxOutputTokens: number): Promise<T> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error('Missing server Gemini API key');
  }

  const response = await fetch(getGeminiUrl(apiKey), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as { candidates?: GeminiCandidate[] };
  const text = stripCodeFences(extractModelText(data) || JSON.stringify(data));
  return JSON.parse(text) as T;
}

export async function analyzeYamlLimitation(request: string): Promise<YamlLimitationAnalysis> {
  const parsed = await generateJson<LimitationDetectionResult>(buildEscapeHatchAnalysisPrompt(request), 512);

  return {
    hasLimitation: Boolean(parsed.hasLimitation),
    limitation: parsed.limitation ?? null,
    explanation: parsed.explanation,
    recommendation: parsed.recommendation === 'typescript' ? 'typescript' : 'yaml',
  };
}

function buildInstallationSteps(): string[] {
  return [
    'Copy the generated trigger code.',
    'Create a new TypeScript file in your Devvit server code, such as src/server/triggers/escape-hatch.ts.',
    'Paste the code into that file and export the trigger from your server entry point.',
    'Keep the static trigger registration in devvit.json aligned with the trigger you actually ship.',
    'Run your normal build and deploy workflow after reviewing the generated logic.',
  ];
}

function buildCodeFromTemplate(request: string, limitation: YamlLimitation, modContext: ModContext): EscapeHatchCode | null {
  const template = getEscapeHatchTemplate(limitation);

  if (!template) {
    return null;
  }

  const contextSuffix = modContext.subredditName ? ` For subreddit ${modContext.subredditName}.` : '';

  return {
    triggerCode: template.code,
    description: `${template.description}${contextSuffix} Request: ${request}`,
    limitations: template.limitations,
    installationSteps: buildInstallationSteps(),
    confidence: 'high',
  };
}

export async function generateEscapeHatchTrigger(
  request: string,
  modContext: ModContext = {},
  limitation: YamlLimitationAnalysis | null = null
): Promise<EscapeHatchCode> {
  const analysis = limitation ?? (await analyzeYamlLimitation(request));

  if (analysis.hasLimitation && analysis.limitation) {
    const templateResult = buildCodeFromTemplate(request, analysis.limitation, modContext);

    if (templateResult) {
      return templateResult;
    }
  }

  const parsed = await generateJson<CodeGenerationResult>(buildEscapeHatchGenerationPrompt(request), 2048);

  return {
    triggerCode: parsed.code,
    description: parsed.description,
    limitations: parsed.limitations,
    installationSteps: buildInstallationSteps(),
    confidence: parsed.confidence,
  };
}

export function getRuleStageModContext(): ModContext {
  return {
    subredditName: context.subredditName ?? undefined,
  };
}