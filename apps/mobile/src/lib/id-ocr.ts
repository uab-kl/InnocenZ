/**
 * On-device ID OCR for PR sign-up Step 4.
 * Reuses the same ML Kit reader as receipt OCR (no cloud / no API key).
 */
import { Platform } from 'react-native';
import { recognizeReceiptText } from './receipt-ocr';

export const NRIC_LENGTH = 12;

/** Digits only, capped — same normalisation as the signup form. */
export function digitsOnlyId(value: string): string {
  return value.replace(/\D/g, '');
}

/** Malaysian NRIC: exactly 12 digits. */
export function isValidNricFormat(idNo: string): boolean {
  return digitsOnlyId(idNo).length === NRIC_LENGTH;
}

/** First 6 NRIC digits must be DOB as YYMMDD. */
export function nricMatchesDob(idNo: string, dob: string): boolean {
  const digits = digitsOnlyId(idNo);
  if (digits.length !== NRIC_LENGTH) return false;
  const [year, month, day] = dob.split('-');
  if (!year || !month || !day) return false;
  const prefix = `${year.slice(-2)}${month}${day}`;
  return digits.startsWith(prefix);
}

/** Pull plausible ID numbers from raw OCR text (front + MyKad back layouts). */
export function extractIdCandidates(ocrText: string): string[] {
  // OCR often confuses O/o with 0 on IC backs.
  const text = ocrText.replace(/[Oo]/g, '0').replace(/\s+/g, ' ');
  const found = new Set<string>();

  for (const m of text.matchAll(/(\d{6})[-\s.]?(\d{2})[-\s.]?(\d{4})/g)) {
    found.add(`${m[1]}${m[2]}${m[3]}`);
  }
  // Bare 12-digit runs anywhere (back print is often tight / no spaces)
  for (const m of text.matchAll(/(\d{12})/g)) {
    found.add(m[1]);
  }
  // Passport / work-permit style: alphanumerics 6–15 chars
  for (const m of text.matchAll(/\b([A-Z0-9]{6,15})\b/gi)) {
    found.add(m[1].toUpperCase());
  }

  return [...found];
}

export type IdOcrMatch =
  | { status: 'matched'; seen: string }
  | { status: 'mismatch'; seen: string | null; expected: string }
  | { status: 'unreadable' }
  | { status: 'unavailable' };

/**
 * OCR the ID front photo and check it contains the number the PR typed.
 * NRIC compares digits-only; other ID types compare case-insensitive alphanumerics.
 */
export async function verifyIdPhotoMatches(
  photoUri: string,
  expectedIdNo: string,
  idType: string,
): Promise<IdOcrMatch> {
  if (Platform.OS === 'web') return { status: 'unavailable' };

  const text = await recognizeReceiptText(photoUri);
  if (text == null) return { status: 'unavailable' };
  if (!text.trim()) return { status: 'unreadable' };

  const candidates = extractIdCandidates(text);
  if (!candidates.length) return { status: 'unreadable' };

  if (idType === 'NRIC') {
    const expected = digitsOnlyId(expectedIdNo);
    const hit = candidates.find((c) => digitsOnlyId(c) === expected);
    if (hit) return { status: 'matched', seen: digitsOnlyId(hit) };
    const firstNric = candidates.map(digitsOnlyId).find((c) => c.length === NRIC_LENGTH) ?? null;
    return { status: 'mismatch', seen: firstNric, expected };
  }

  const expected = expectedIdNo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const hit = candidates.find(
    (c) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === expected,
  );
  if (hit) return { status: 'matched', seen: hit };
  return {
    status: 'mismatch',
    seen: candidates[0] ?? null,
    expected: expectedIdNo.trim(),
  };
}
