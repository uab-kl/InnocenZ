/**
 * Expo config. Static config stays in app.json; this layer injects the Google
 * Maps key from the environment so it is not committed to the repo.
 *
 * EAS supplies EXPO_PUBLIC_GOOGLE_MAPS_API_KEY from the dashboard environment
 * named by each build profile's `environment` field (see eas.json). For local
 * runs it comes from apps/mobile/.env, which is gitignored.
 *
 * Note: the key is compiled into the app binary and is public by nature. What
 * protects it is the Android/iOS application restriction on the key in Google
 * Cloud Console, not keeping it out of the bundle.
 */
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

if (!GOOGLE_MAPS_API_KEY) {
  throw new Error(
    'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set, so the check-in map would ' +
      'render blank. Set it in apps/mobile/.env for local runs, or in the EAS ' +
      'dashboard environment matching your build profile.',
  );
}

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    config: {
      ...config.ios?.config,
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    },
  },
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: { apiKey: GOOGLE_MAPS_API_KEY },
    },
  },
});
