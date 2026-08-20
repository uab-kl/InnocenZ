/**
 * EAS / local: set android app_name from EXPO_PUBLIC_APP_DISPLAY_NAME
 * (or EAS_BUILD_PROFILE preview/development → InnocenZ(beta)).
 *
 * Needed because a committed `android/` folder ignores Expo `name` for the
 * home-screen label — that comes from res/values/strings.xml only.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const stringsPath = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'src',
  'main',
  'res',
  'values',
  'strings.xml',
);

if (!existsSync(stringsPath)) {
  console.warn('[set-android-app-name] no strings.xml — skip');
  process.exit(0);
}

const profile = process.env.EAS_BUILD_PROFILE?.trim() || '';
const name =
  process.env.EXPO_PUBLIC_APP_DISPLAY_NAME?.trim() ||
  (profile === 'preview' || profile === 'development'
    ? 'InnocenZ(beta)'
    : 'InnocenZ');

let xml = readFileSync(stringsPath, 'utf8');
if (!/<string name="app_name">/.test(xml)) {
  console.error('[set-android-app-name] app_name string missing');
  process.exit(1);
}
xml = xml.replace(
  /<string name="app_name">[^<]*<\/string>/,
  `<string name="app_name">${name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string>`,
);
writeFileSync(stringsPath, xml);
console.log(`[set-android-app-name] app_name → ${name}`);
