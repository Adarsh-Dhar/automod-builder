import { Devvit, SettingScope } from 'devvit';

// Also register app settings at the repository root so the Devvit CLI can discover them.
Devvit.addSettings([
  {
    name: 'GEMINI_API_KEY',
    label: 'Gemini API Key',
    type: 'string',
    isSecret: true,
    scope: SettingScope.App,
  },
]);
