import { context } from '@devvit/web/server';
import {
  buildEscapeHatchAnalysisPrompt,
  buildEscapeHatchGenerationPrompt,
  type EscapeHatchCode,
  type YamlLimitation,
  type YamlLimitationAnalysis,
} from '../../shared/automod';
import { getEscapeHatchTemplate } from '../templates/escape-hatch-templates';
import { generateJson } from './model-proxy.service';

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

// model-proxy.generateJson is used directly below (imported at top)

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