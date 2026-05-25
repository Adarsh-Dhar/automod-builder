import { Devvit } from '@devvit/public-api/devvit/Devvit.js';
import { SettingScope } from '@devvit/public-api/types/form.js';

Devvit.addSettings({
  name: 'GEMINI_API_KEY',
  label: 'Gemini API Key',
  type: 'string',
  isSecret: true,
  scope: SettingScope.App,
});

Devvit.addSettings({
  name: 'GITHUB_API_KEY',
  label: 'GitHub Models API Token',
  type: 'string',
  isSecret: true,
  scope: SettingScope.App,
});
