import { Devvit } from '@devvit/public-api/devvit/Devvit.js';
import { SettingScope } from '@devvit/public-api/types/form.js';

Devvit.addSettings({
  name: 'GEMINI_API_KEY',
  label: 'Gemini API Key',
  type: 'string',
  isSecret: true,
  scope: SettingScope.App,
});
