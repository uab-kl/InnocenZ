/**
 * Expo config. Static config stays in app.json; this layer injects the Google
 * Maps key from the environment so it is not committed to the repo.
 *
 * EAS supplies EXPO_PUBLIC_GOOGLE_MAPS_API_KEY from the dashboard environment
 * named by each build profile's `environment` field (see eas.json). For local
 * runs load repo-root `.env` then apps/mobile/.env (same pattern as backend).
 *
 * Use the react-native-maps config plugin for native setup — do not set
 * ios.config.googleMapsApiKey / android.config.googleMaps; Expo's built-in
 * maps plugin still references the removed react-native-google-maps pod.
 *
 * Note: the key is compiled into the app binary and is public by nature. What
 * protects it is the Android/iOS application restriction on the key in Google
 * Cloud Console, not keeping it out of the bundle.
 */
const { existsSync } = require('node:fs');
const path = require('node:path');
const { config: loadEnv } = require('dotenv');
const { withPodfileProperties } = require('@expo/config-plugins');

const mobileRoot = __dirname;
const repoRoot = path.resolve(mobileRoot, '../..');
const rootEnv = path.resolve(repoRoot, '.env');
const mobileEnv = path.resolve(mobileRoot, '.env');

if (existsSync(rootEnv)) loadEnv({ path: rootEnv });
if (existsSync(mobileEnv)) loadEnv({ path: mobileEnv, override: true });

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

if (!GOOGLE_MAPS_API_KEY) {
  throw new Error(
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set, so the check-in map would ' +
      'render blank. Set it in the repo-root .env (or apps/mobile/.env) for ' +
      'local runs, or in the EAS dashboard environment matching your build profile.',
  );
}

/** iOS pod settings: ML Kit needs 15.5+; build RN from source avoids prebuilt React module errors (Expo 55 / RN 0.83). */
function withIosPodProperties(config) {
  return withPodfileProperties(config, (conf) => {
    conf.modResults['ios.deploymentTarget'] = '15.5';
    conf.modResults['ios.buildReactNativeFromSource'] = 'true';
    return conf;
  });
}

/**
 * Public R2 base, carried into the binary as config rather than only as an
 * inlined `EXPO_PUBLIC_` constant.
 *
 * `r2PublicBase()` in lib/api.ts already reads `expoConfig.extra.r2PublicUrl`
 * as its third fallback — nothing ever set it, so that branch could not fire.
 * Without a base, `assetUrl` returns null for every `user/…` object key and
 * every stored photo resolves to nothing: the comcard, the avatar, the
 * portfolio. Setting it here means a stale Metro cache or a build whose
 * EXPO_PUBLIC inlining did not pick the var up still resolves images, instead
 * of failing silently and looking like the photos were never saved.
 */
const R2_PUBLIC_URL = (
  process.env.EXPO_PUBLIC_R2_PUBLIC_URL ??
  process.env.R2_PUBLIC_URL ??
  ''
)
  .trim()
  .replace(/\/$/, '');

module.exports = ({ config }) => ({
  ...config,
  extra: {
    // Spread first: app.json's extra carries the EAS projectId.
    ...config.extra,
    ...(R2_PUBLIC_URL ? { r2PublicUrl: R2_PUBLIC_URL } : {}),
  },
  plugins: [
    ...(config.plugins ?? []),
    withIosPodProperties,
    [
      'react-native-maps',
      {
        iosGoogleMapsApiKey: GOOGLE_MAPS_API_KEY,
        androidGoogleMapsApiKey: GOOGLE_MAPS_API_KEY,
      },
    ],
  ],
});
