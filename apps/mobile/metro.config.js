const path = require('path');
const { existsSync } = require('node:fs');
const { config: loadEnv } = require('dotenv');
const { withNxMetro } = require('@nx/expo');
const { getDefaultConfig } = require('@expo/metro-config');
const { mergeConfig } = require('metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const rootEnv = path.resolve(monorepoRoot, '.env');
const mobileEnv = path.resolve(projectRoot, '.env');

if (existsSync(rootEnv)) loadEnv({ path: rootEnv });
if (existsSync(mobileEnv)) loadEnv({ path: mobileEnv, override: true });
const defaultConfig = getDefaultConfig(projectRoot);
const { assetExts, sourceExts } = defaultConfig.resolver;

/**
 * When `pnpm dev:all` runs Vite + Metro together, Metro must not crawl/watch
 * the web or backend trees — that exhausts Windows file watchers and makes
 * Vite SSR time out (login lag). Paths are OS-agnostic (`[/\\]`).
 */
const coRunBlockList = [
  /[/\\]apps[/\\]web[/\\].*/,
  /[/\\]apps[/\\]backend[/\\].*/,
  /[/\\]postgres[/\\].*/,
  /[/\\]\.git[/\\].*/,
  /[/\\]\.cursor[/\\].*/,
];

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const customConfig = {
  cacheVersion: '@org/mobile',
  transformer: {
    babelTransformerPath: require.resolve('react-native-svg-transformer'),
  },
  resolver: {
    assetExts: assetExts.filter((ext) => ext !== 'svg'),
    sourceExts: [...sourceExts, 'cjs', 'mjs', 'svg'],
    blockList: coRunBlockList,
  },
  // Prefer watching the mobile app; monorepo packages resolve on demand.
  watchFolders: [projectRoot, path.join(monorepoRoot, 'node_modules')],
};

module.exports = withNxMetro(mergeConfig(defaultConfig, customConfig), {
  // Change this to true to see debugging info.
  // Useful if you have issues resolving modules
  debug: false,
  // all the file extensions used for imports other than 'ts', 'tsx', 'js', 'jsx', 'json'
  extensions: [],
  // Specify folders to watch, in addition to Nx defaults (workspace libraries and node_modules)
  watchFolders: [],
});
