/**
 * Remember the last dial-country ISO code (e.g. MY) used on login / sign-up.
 * Same storage shape as the session token: localStorage on web; in-memory on
 * native for the running app session.
 */
import { Platform } from 'react-native';
import { COUNTRY_BY_CODE } from '../screens/sign-up/constants';

const KEY = 'iz-pr-phone-country';
/** Default when nothing has been saved yet. */
export const DEFAULT_PHONE_COUNTRY = 'MY';

type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Survives navigation within one native app session. */
let memoryCode: string | null = null;

function webStorage(): WebStorage | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as { localStorage?: WebStorage }).localStorage ?? null;
}

function normalizeCountryCode(code: string | null | undefined): string {
  if (!code) return DEFAULT_PHONE_COUNTRY;
  const upper = code.trim().toUpperCase();
  return COUNTRY_BY_CODE[upper] ? upper : DEFAULT_PHONE_COUNTRY;
}

export function loadPhoneCountryCode(): string {
  try {
    const raw = webStorage()?.getItem(KEY) ?? memoryCode;
    return normalizeCountryCode(raw);
  } catch {
    return normalizeCountryCode(memoryCode);
  }
}

export function savePhoneCountryCode(countryCode: string): void {
  const code = normalizeCountryCode(countryCode);
  memoryCode = code;
  try {
    webStorage()?.setItem(KEY, code);
  } catch {
    /* storage unavailable */
  }
}

/** Digits-only local number (drop leading zeros). */
export function localPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
}

/** Login identifier the backend expects (e.g. 60123456789). */
export function phoneLoginIdentifier(countryCode: string, localNumber: string): string {
  const dial = COUNTRY_BY_CODE[normalizeCountryCode(countryCode)]?.dialCode ?? '';
  const local = localPhoneDigits(localNumber);
  if (!dial) return local;
  return `${dial.replace('+', '')}${local}`;
}
