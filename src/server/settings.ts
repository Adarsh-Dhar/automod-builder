import { Devvit, SettingScope } from 'devvit';

Devvit.addSettings([
  {
    name: 'GEMINI_API_KEY',
    label: 'Gemini API Key',
    type: 'string',
    isSecret: true,
    scope: SettingScope.App,
  },
]);
