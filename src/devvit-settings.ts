// Also register app settings at the repository root so the Devvit CLI can discover them.
// Use the global `devvit.settings` object rather than importing `Devvit.addSettings`.
;(function registerGeminiKeyRoot() {
  const g = globalThis as any;
  g.devvit = g.devvit ?? {};
  g.devvit.settings = g.devvit.settings ?? {};
  g.devvit.settings.app = g.devvit.settings.app ?? [];

  const exists = (g.devvit.settings.app as any[]).some((s: any) => s.name === 'GEMINI_API_KEY');
  if (!exists) {
    g.devvit.settings.app.push({
      name: 'GEMINI_API_KEY',
      label: 'Gemini API Key',
      type: 'string',
      isSecret: true,
      scope: 'App',
    });
  }
})();
