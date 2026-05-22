import { settings } from '@devvit/web/server';

export async function resolveServerGeminiApiKey(): Promise<string> {
  const envKey = process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY ?? '';

  if (envKey.trim()) {
    return envKey;
  }

  try {
    const appSettingKey = await settings.get<string>('GEMINI_API_KEY');
    return appSettingKey?.trim() ?? '';
  } catch {
    return '';
  }
}
