import { paraglideVitePlugin } from '@inlang/paraglide-js';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

// Opt-in: `VITE_TANSTACK_DEVTOOLS=1 pnpm dev:web` — slows SSR when Metro co-runs.
const enableDevtools = process.env.VITE_TANSTACK_DEVTOOLS === '1';
// Set by `tools/scripts/dev-all.mjs` when Vite co-runs with Metro.
const coRunWithMetro = process.env.INNOCENZ_DEV_ALL === '1';

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
    // TanStack Start also dedupes these; keep here so client + SSR share one copy
    // without absolute aliases (aliasing to node_modules/react makes Vite's SSR
    // runner execute CJS index.js as ESM → "module is not defined").
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Proxy only backend-owned /img paths so Vite can still serve marketing
    // assets from apps/web/public/img (landing, UAB badge, etc.).
    // Profile/gallery images stay same-origin to avoid CORP blocks.
    proxy: {
      '^/img/(users|pr|outlets|agencies)(/|$)': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:7777',
        changeOrigin: true,
      },
      '/img/blank-profile-picture.png': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:7777',
        changeOrigin: true,
      },
    },
    ...(coRunWithMetro
      ? {
          watch: {
            // Don't compete with Metro for these trees on Windows.
            ignored: [
              '**/apps/mobile/**',
              '**/apps/backend/**',
              '**/postgres/**',
              '**/.git/**',
              '**/android/**',
              '**/ios/**',
            ],
          },
        }
      : {}),
  },
  plugins: [
    ...(enableDevtools ? [devtools()] : []),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['url', 'baseLocale'],
      urlPatterns: [
        {
          pattern: ':protocol://:domain(.*)::port?/:path(.*)?',
          localized: [
            ['en', ':protocol://:domain(.*)::port?/en/:path(.*)?'],
            ['cn', ':protocol://:domain(.*)::port?/cn/:path(.*)?'],
          ],
        },
      ],
    }),
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
});

export default config;
