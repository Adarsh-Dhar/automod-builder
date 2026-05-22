// Register the app setting for the Devvit CLI and runtime by
// attaching it to the global `devvit.settings` object. We avoid
// importing Devvit here because the package's ESM entry doesn't
// export the `Devvit` symbol used by some older examples.
;(function registerGeminiKey() {
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
