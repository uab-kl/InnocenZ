import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // `src/**`, not `src/features/**`: the first shared rule to get a test lives
    // in `src/util`, and the narrower glob simply found no test file and exited
    // 0. ⚠️ With `passWithNoTests: true` below, a test outside the glob does not
    // fail the run — it reports success having executed nothing, which is the
    // worst possible outcome for a security rule.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
    passWithNoTests: true,
  },
});
