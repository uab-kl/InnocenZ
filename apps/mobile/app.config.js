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
const {
  AndroidConfig,
  withPodfileProperties,
  withStringsXml,
} = require('@expo/config-plugins');

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

function withAndroidAppDisplayName(config, displayName) {
  if (!displayName) return config;
  return withStringsXml(config, (conf) => {
    conf.modResults = AndroidConfig.Strings.setStringItem(
      [{ _: displayName, $: { name: 'app_name' } }],
      conf.modResults,
    );
    return conf;
  });
}

const R2_PUBLIC_URL = (
  process.env.EXPO_PUBLIC_R2_PUBLIC_URL ??
  process.env.R2_PUBLIC_URL ??
  ''
)
  .trim()
  .replace(/\/$/, '');

/**
 * Home-screen label. EAS `preview` (APK) / `development` → InnocenZ(beta);
 * `production` (Play Store AAB) keeps InnocenZ.
 * Override anytime with EXPO_PUBLIC_APP_DISPLAY_NAME.
 */
const EAS_PROFILE = process.env.EAS_BUILD_PROFILE?.trim() || '';
const DISPLAY_NAME =
  process.env.EXPO_PUBLIC_APP_DISPLAY_NAME?.trim() ||
  (EAS_PROFILE === 'preview' || EAS_PROFILE === 'development'
    ? 'InnocenZ(beta)'
    : null);

module.exports = ({ config }) => {
  const appName = DISPLAY_NAME || config.name || 'InnocenZ';
  let next = {
    ...config,
    name: appName,
    extra: {
      // Spread first: app.json's extra carries the EAS projectId.
      ...config.extra,
      ...(R2_PUBLIC_URL ? { r2PublicUrl: R2_PUBLIC_URL } : {}),
      easBuildProfile: EAS_PROFILE || null,
      appDisplayName: appName,
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
  };
  // Always sync native label from resolved name (preview env → beta).
  next = withAndroidAppDisplayName(next, appName);
  return next;
};
