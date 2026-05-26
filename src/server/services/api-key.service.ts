import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadLocalEnvValue(key: string): string {
  // Resolve to project root from the current file location
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(currentDir, '../../..');
  const envFilePath = resolve(projectRoot, '.env');

  if (!existsSync(envFilePath)) {
    return '';
  }

  const contents = readFileSync(envFilePath, 'utf8');

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const lineKey = line.slice(0, separatorIndex).trim();

    if (lineKey !== key) {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).trim();
    }

    return value;
  }

  return '';
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? '';

    if (trimmed) {
      return trimmed;
    }
  }

  return '';
}

export async function resolveServerGeminiApiKey(): Promise<string> {
  const envKey = firstNonEmpty(
    process.env.GEMINI_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    loadLocalEnvValue('GEMINI_API_KEY'),
    loadLocalEnvValue('VITE_GEMINI_API_KEY')
  );

  return envKey;
}

export async function resolveServerGitHubApiKey(): Promise<string> {
  const envKey = firstNonEmpty(
    process.env.GITHUB_API_KEY,
    process.env.VITE_GITHUB_API_KEY,
    loadLocalEnvValue('GITHUB_API_KEY'),
    loadLocalEnvValue('VITE_GITHUB_API_KEY')
  );

  return envKey;
}
