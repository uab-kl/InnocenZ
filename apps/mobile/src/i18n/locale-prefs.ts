/**
 * Remember UI locale (en | zh | zh-Hant). Same storage shape as session / phone prefs:
 * localStorage on web; in-memory on native for the running app session.
 *
 * When nothing is saved yet, default follows the phone / browser language.
 */
import { NativeModules, Platform } from 'react-native';

/** `zh` = Simplified · `zh-Hant` = Traditional */
export type AppLocale = 'en' | 'zh' | 'zh-Hant';

const KEY = 'innocenz-mobile-locale';

type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

let memoryLocale: AppLocale | null = null;

function webStorage(): WebStorage | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as { localStorage?: WebStorage }).localStorage ?? null;
}

/** Parse a BCP-47 / Android `zh_CN` tag into our app locale. */
export function localeFromTag(raw: string | null | undefined): AppLocale | null {
  if (!raw) return null;
  const tag = raw.trim().replace(/_/g, '-');
  if (!tag) return null;

  // Exact app ids
  if (tag === 'en' || tag === 'zh' || tag === 'zh-Hant') return tag;

  const lower = tag.toLowerCase();

  // Traditional Chinese (Taiwan / HK / Macau / Hant script)
  if (
    lower.startsWith('zh-hant') ||
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hk') ||
    lower.startsWith('zh-mo') ||
    lower === 'zh-cht'
  ) {
    return 'zh-Hant';
  }

  // Simplified Chinese (Mainland / Singapore / Hans script)
  if (
    lower.startsWith('zh-hans') ||
    lower.startsWith('zh-cn') ||
    lower.startsWith('zh-sg') ||
    lower.startsWith('zh-my') ||
    lower === 'zh-chs' ||
    lower === 'zh'
  ) {
    return 'zh';
  }

  if (lower.startsWith('en')) return 'en';
  return null;
}

function normalizeStored(raw: string | null | undefined): AppLocale | null {
  if (raw == null || raw === '') return null;
  return localeFromTag(raw) ?? (raw === 'zh-CN' || raw === 'zh-Hans' ? 'zh' : null);
}

/** Best-effort device / browser language tag (sync, no extra deps). */
function detectSystemLocaleTag(): string | null {
  try {
    const fromIntl = Intl.DateTimeFormat().resolvedOptions().locale;
    if (fromIntl) return fromIntl;
  } catch {
    /* Intl unavailable */
  }

  try {
    const i18n = NativeModules.I18nManager as { localeIdentifier?: string } | undefined;
    if (typeof i18n?.localeIdentifier === 'string' && i18n.localeIdentifier) {
      return i18n.localeIdentifier;
    }
    const settings = (
      NativeModules.SettingsManager as {
        settings?: { AppleLocale?: string; AppleLanguages?: string[] };
      } | undefined
    )?.settings;
    const apple = settings?.AppleLocale ?? settings?.AppleLanguages?.[0];
    if (typeof apple === 'string' && apple) return apple;
  } catch {
    /* native modules unavailable */
  }

  if (Platform.OS === 'web') {
    const nav = (
      globalThis as { navigator?: { language?: string; languages?: readonly string[] } }
    ).navigator;
    return nav?.language ?? nav?.languages?.[0] ?? null;
  }

  return null;
}

/** Map the phone / browser language to an app locale (fallback: English). */
export function localeFromSystem(): AppLocale {
  return localeFromTag(detectSystemLocaleTag()) ?? 'en';
}

export function loadLocale(): AppLocale {
  try {
    const stored = normalizeStored(webStorage()?.getItem(KEY) ?? memoryLocale);
    if (stored) return stored;
  } catch {
    const stored = normalizeStored(memoryLocale);
    if (stored) return stored;
  }
  return localeFromSystem();
}

export function saveLocale(locale: AppLocale): void {
  memoryLocale = locale;
  try {
    webStorage()?.setItem(KEY, locale);
  } catch {
    /* storage unavailable */
  }
}
