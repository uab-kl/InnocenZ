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
 * ⚠️ Metro's `projectRoot` is the MONOREPO ROOT here, not `apps/mobile` —
 * `withNxMetro` sets it — so Metro crawls and `fs.watch`es every folder at the
 * top of the repo, tool and scratch directories included. That is not merely
 * wasteful: a directory listed during the crawl and deleted before Metro
 * watches it throws ENOENT out of `FallbackWatcher.#watchdir`, which nothing
 * catches, and `expo start` dies with exit code 7. It cost a dev session on
 * 22 Sep 2026, when a stray `.video-tools/` went away mid-crawl:
 *   Error: ENOENT ... watch '…\.video-tools\node_modules\agent-base\dist\src'
 * Metro skips a directory ENTIRELY only when the pattern matches the directory
 * ITSELF, so each entry below ends `(?:[/\\]|$)` rather than the `[/\\].*`
 * above, which hides the contents but still watches the folder.
 * Add any new top-level tool or scratch folder here. ⚠️ Never match
 * `node_modules/.pnpm` — that is where pnpm keeps the real packages, and
 * blocking it would break module resolution.
 */
const rootClutterBlockList = [
  /[/\\]_to_delete(?:[/\\]|$)/,
  /[/\\]outputs(?:[/\\]|$)/,
  /[/\\]patches(?:[/\\]|$)/,
  /[/\\]\.(?:nx|claude|codex|gemini|agents|opencode|vscode|github|video-tools)(?:[/\\]|$)/,
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
    blockList: [...coRunBlockList, ...rootClutterBlockList],
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
