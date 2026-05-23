import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';
import { fileURLToPath, URL } from 'node:url';

const stripUseClientPlugin = {
  name: 'strip-use-client',
  transform(code: string) {
    if (code.includes("'use client'") || code.includes('"use client"')) {
      const transformedCode = code.replace(/['"]use client['"];?\s*/g, '');
      if (transformedCode !== code) {
        return {
          code: transformedCode,
          map: null,
        };
      }
    }
  },
};

const rewriteRelativeHtmlAssetsPlugin = {
  name: 'rewrite-relative-html-assets',
  enforce: 'post' as const,
  transformIndexHtml(html: string) {
    return html
      .replace(/(src|href)="\/(default|game|index)\.(js|css)"/g, '$1="./$2.$3"')
      .replace(/(src|href)="\/(assets\/[^\"]+)"/g, '$1="./$2"');
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: mode === 'production' ? './' : '/',
    experimental: {
      renderBuiltUrl(_filename, { hostType, type }) {
        if (hostType === 'html' && (type === 'asset' || type === 'public')) {
          return { relative: true };
        }
      },
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY ?? ''),
      'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? ''),
      'process.env.GEMINI_MODEL': JSON.stringify(env.GEMINI_MODEL ?? ''),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src/client', import.meta.url)),
      },
    },
    plugins: [stripUseClientPlugin, react(), tailwind(), devvit(), rewriteRelativeHtmlAssetsPlugin],
  };
});
