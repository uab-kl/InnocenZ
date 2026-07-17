import { paraglideVitePlugin } from '@inlang/paraglide-js';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  server: {
    // Serve backend static assets same-origin in local dev so profile/gallery
    // images are not blocked by Cross-Origin-Resource-Policy.
    proxy: {
      '/img': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:7777',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    devtools(),
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
