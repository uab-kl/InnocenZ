/**
 * On-device ID OCR for PR sign-up Step 4.
 * Reuses the same ML Kit reader as receipt OCR (no cloud / no API key).
 *
 * For NRIC / work permit we require:
 *  1. The typed ID number appears on the photo
 *  2. The photo looks like the requested side (front ≠ back)
 * Swapping front/back (or shooting the same side twice) must fail.
 */
import { Platform } from 'react-native';
import { recognizeReceiptText } from './receipt-ocr';

export const NRIC_LENGTH = 12;

export type IdCardSide = 'front' | 'back';
export type IdSideGuess = IdCardSide | 'unknown';

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
  for (const m of text.matchAll(/(\d{12})/g)) {
    found.add(m[1]);
  }
  for (const m of text.matchAll(/\b([A-Z0-9]{6,15})\b/gi)) {
    found.add(m[1].toUpperCase());
  }

  return [...found];
}

/**
 * Heuristic front vs back from OCR keywords.
 * MyKad front: citizenship / gender / name / address fields.
 * MyKad back: government-property legal block (Malay + English).
 */
export function guessIdCardSide(ocrText: string, idType: string): IdSideGuess {
  const t = ocrText
    .toUpperCase()
    .replace(/[0O]/g, 'O')
    .replace(/\s+/g, ' ');

  // Shared card title can appear on either face — weak signal alone.
  const frontKeys =
    idType === 'Work permit'
      ? [
          'FOREIGN WORKER',
          'WORKER',
          'PERMIT',
          'PASSPORT',
          'NATIONALITY',
          'GENDER',
          'NAME',
          'DOB',
          'DATE OF BIRTH',
          'EMPLOYER',
          'SECTOR',
        ]
      : [
          'WARGANEGARA',
          'LELAKI',
          'PEREMPUAN',
          'AGAMA',
          'ALAMAT',
          'NAMA',
          'MYKAD',
          'KAD PENGENALAN',
          'MALE',
          'FEMALE',
          'CITIZEN',
          'ADDRESS',
        ];

  const backKeys =
    idType === 'Work permit'
      ? [
          'CONDITIONS',
          'TERMS',
          'PROPERTY',
          'GOVERNMENT',
          'VALID UNTIL',
          'EXPIR',
          'HARTA',
          'KETENTUAN',
        ]
      : [
          'KETENTUAN',
          'HARTA KERAJAAN',
          'HARTA KERAJAAN MALAYSIA',
          'PROPERTY OF THE GOVERNMENT',
          'THIS CARD IS THE PROPERTY',
          'GOVERNMENT OF MALAYSIA',
          'PENALTI',
          'PENALTY',
          'JANGAN',
          'DO NOT',
          'TAMPER',
        ];

  let frontHits = 0;
  for (const k of frontKeys) {
    if (t.includes(k)) frontHits += 1;
  }
  let backHits = 0;
  for (const k of backKeys) {
    if (t.includes(k)) backHits += 1;
  }

  if (backHits >= 2 && backHits > frontHits) return 'back';
  if (frontHits >= 2 && frontHits > backHits) return 'front';
  if (backHits >= 1 && frontHits === 0) return 'back';
  if (frontHits >= 1 && backHits === 0) return 'front';
  return 'unknown';
}

/** Compact fingerprint so we can spot the same photo used for both sides. */
export function ocrFingerprint(ocrText: string): string {
  return ocrText.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True when two OCR reads are essentially the same capture. */
export function ocrLooksSamePhoto(a: string, b: string): boolean {
  const fa = ocrFingerprint(a);
  const fb = ocrFingerprint(b);
  if (fa.length < 24 || fb.length < 24) return false;
  if (fa === fb) return true;
  const shorter = fa.length <= fb.length ? fa : fb;
  const longer = fa.length <= fb.length ? fb : fa;
  return longer.includes(shorter);
}

export type IdOcrMatch =
  | { status: 'matched'; seen: string; side: IdSideGuess; rawText: string }
  | {
      status: 'wrong_side';
      seen: string;
      expectedSide: IdCardSide;
      detected: IdSideGuess;
      rawText: string;
    }
  | { status: 'mismatch'; seen: string | null; expected: string; rawText: string }
  | { status: 'unreadable' }
  | { status: 'unavailable' };

function idNumberMatched(
  candidates: string[],
  expectedIdNo: string,
  idType: string,
): { ok: true; seen: string } | { ok: false; seen: string | null; expected: string } {
  if (idType === 'NRIC') {
    const expected = digitsOnlyId(expectedIdNo);
    const hit = candidates.find((c) => digitsOnlyId(c) === expected);
    if (hit) return { ok: true, seen: digitsOnlyId(hit) };
    const firstNric = candidates.map(digitsOnlyId).find((c) => c.length === NRIC_LENGTH) ?? null;
    return { ok: false, seen: firstNric, expected };
  }

  const expected = expectedIdNo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const hit = candidates.find(
    (c) => c.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === expected,
  );
  if (hit) return { ok: true, seen: hit };
  return { ok: false, seen: candidates[0] ?? null, expected: expectedIdNo.trim() };
}

/**
 * OCR an ID photo: number must match, and (for dual-sided docs) the side must
 * look like the slot the user is filling (front vs back).
 */
export async function verifyIdPhotoMatches(
  photoUri: string,
  expectedIdNo: string,
  idType: string,
  expectedSide: IdCardSide | 'any' = 'any',
): Promise<IdOcrMatch> {
  if (Platform.OS === 'web') return { status: 'unavailable' };

  const text = await recognizeReceiptText(photoUri);
  if (text == null) return { status: 'unavailable' };
  if (!text.trim()) return { status: 'unreadable' };

  const candidates = extractIdCandidates(text);
  if (!candidates.length) return { status: 'unreadable' };

  const match = idNumberMatched(candidates, expectedIdNo, idType);
  if (!match.ok) {
    return {
      status: 'mismatch',
      seen: match.seen,
      expected: match.expected,
      rawText: text,
    };
  }

  const side = guessIdCardSide(text, idType);

  // Passport is a single page — side check does not apply.
  if (expectedSide !== 'any' && idType !== 'Passport') {
    // Only refuse when OCR clearly sees the opposite face. "Unknown" still
    // needs the ID number match; step-4 cross-checks both photos afterward.
    if (side !== 'unknown' && side !== expectedSide) {
      return {
        status: 'wrong_side',
        seen: match.seen,
        expectedSide,
        detected: side,
        rawText: text,
      };
    }
  }

  return { status: 'matched', seen: match.seen, side, rawText: text };
}
