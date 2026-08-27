import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [viteReact()],
  test: {
    environment: 'jsdom',
    // Repairs the `localStorage` Node 25 replaced jsdom's with. Self-disabling:
    // see the file — on a runtime whose localStorage works, it does nothing.
    setupFiles: ['./vitest.setup.ts'],
    /**
     * `src/env.ts` validates `import.meta.env` at MODULE LOAD, so any test that
     * transitively imports `axios-v1` dies during collection when VITE_API_URL
     * is absent — Sheet.test.tsx reported "0 test", not a failing assertion.
     *
     * It was absent because `.env` is gitignored: the suite passed or failed
     * depending on an untracked file, which is how a real breakage gets filed
     * as "pre-existing" forever. Pinned here so the result is the same on every
     * machine and in CI.
     *
     * Deliberately a dead address. These values OVERRIDE a developer's real
     * `.env` for the test run, so a suite that accidentally issues a request
     * cannot reach a live API — it fails loudly instead of quietly talking to
     * something real.
     */
    env: {
      VITE_API_URL: 'http://localhost:0/test-only',
    },
    globals: true,
    passWithNoTests: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
