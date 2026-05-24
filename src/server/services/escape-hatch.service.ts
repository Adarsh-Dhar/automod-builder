import { context } from '@devvit/web/server';
import {
  buildEscapeHatchAnalysisPrompt,
  buildEscapeHatchGenerationPrompt,
  type EscapeHatchCode,
  type YamlLimitation,
  type YamlLimitationAnalysis,
} from '../../shared/automod';
import { getEscapeHatchTemplate, ESCAPE_HATCH_TEMPLATES, type EscapeHatchTemplate } from '../templates/escape-hatch-templates';
import { generateJson } from './model-proxy.service';

type LimitationDetectionResult = {
  hasLimitation: boolean;
  limitation: YamlLimitation | null;
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

export async function analyzeYamlLimitation(request: string, apiKey?: string): Promise<YamlLimitationAnalysis> {
  const parsed = await generateJson<LimitationDetectionResult>(
    buildEscapeHatchAnalysisPrompt(request),
    2048,
    apiKey
  );
  return {
    hasLimitation: Boolean(parsed.hasLimitation),
    limitation: parsed.limitation ?? null,
    explanation: parsed.limitation
      ? `AutoModerator YAML cannot handle: ${parsed.limitation.replace(/-/g, ' ')}.`
      : 'This can be handled with AutoModerator YAML.',
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

function buildCodeFromTemplate(
  request: string,
  limitation: YamlLimitation,
  modContext: ModContext
): EscapeHatchCode | null {
  // If the request names a custom response field (e.g. "verified: false"),
  // the static template will check the wrong field — let the model generate instead.
  const hasCustomResponseField = /returns?\s+\w+:\s*(true|false)/i.test(request);
  if (hasCustomResponseField) return null;

  // For database-check, pick the sismember template when the request mentions
  // sismember or a named set, otherwise fall back to the redis.get template.
  const useSetTemplate =
    limitation === 'database-check' &&
    /sismember|smembers|\bset\b|scammer.?list|ban.?set/i.test(request);

  const template = useSetTemplate
    ? ESCAPE_HATCH_TEMPLATES.find((t: EscapeHatchTemplate) => t.label === 'Redis Set Member Check') ?? getEscapeHatchTemplate(limitation)
    : getEscapeHatchTemplate(limitation);

  if (!template) return null;

  // Extract the URL from the request, excluding trailing punctuation and parens.
  const urlMatch = request.match(/https?:\/\/[^\s"'`,()\]]+/);
  const triggerCode = urlMatch
    ? template.code.replace('https://api.example.com/check', urlMatch[0])
    : template.code;

  const contextSuffix = modContext.subredditName
    ? ` For subreddit ${modContext.subredditName}.`
    : '';
  return {
    triggerCode,
    description: `${template.description}${contextSuffix} Request: ${request}`,
    limitations: template.limitations,
    installationSteps: buildInstallationSteps(),
    confidence: 'high',
  };
}

export async function generateEscapeHatchTrigger(
  request: string,
  modContext: ModContext = {},
  limitation: YamlLimitationAnalysis | null = null,
  apiKey?: string
): Promise<EscapeHatchCode> {
  const analysis = limitation ?? (await analyzeYamlLimitation(request, apiKey));

  if (analysis.hasLimitation && analysis.limitation) {
    const templateResult = buildCodeFromTemplate(request, analysis.limitation, modContext);
    if (templateResult) return templateResult;
  }

  const parsed = await generateJson<CodeGenerationResult>(
    buildEscapeHatchGenerationPrompt(request),
    2048,
    apiKey
  );
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
