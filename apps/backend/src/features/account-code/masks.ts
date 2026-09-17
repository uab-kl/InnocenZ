import { toWhatsAppDigits } from './phone.js';

/**
 * WHERE A CODE WENT, without saying where.
 *
 * The screen has to tell a person which phone and which mailbox to look at —
 * "a code was sent" with no destination sends people hunting — but the answer
 * is shown to whoever holds the session, and on the logged-out forgot-password
 * flow it would be an account lookup. So each destination is masked down to
 * what the owner recognises and a stranger learns nothing from:
 *
 *   phone  '+60 ••••• 6789'          country code + last four
 *   email  'o••••@atlas-agency.my'   first character + domain
 *
 * The number of bullets is FIXED, never the hidden length.
 */

const BULLETS = '•••••';
const EMAIL_BULLETS = '••••';

/**
 * ITU-T E.164 country codes that are TWO digits long. Zones 1 and 7 are one
 * digit; every other code in zones 2-9 not listed here is three digits. That
 * is the whole rule, so no library is needed to find where the code ends.
 */
const TWO_DIGIT_COUNTRY_CODES = new Set([
  '20', '27',
  '30', '31', '32', '33', '34', '36', '39',
  '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58',
  '60', '61', '62', '63', '64', '65', '66',
  '81', '82', '84', '86',
  '90', '91', '92', '93', '94', '95', '98',
]);

export function countryCodeOf(digits: string): string {
  if (digits.startsWith('1')) return '1';
  if (digits.startsWith('7')) return '7';
  const two = digits.slice(0, 2);
  if (TWO_DIGIT_COUNTRY_CODES.has(two)) return two;
  return digits.slice(0, 3);
}

export function maskPhone(phone: string | null | undefined): string {
  const digits = toWhatsAppDigits(phone) ?? (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return BULLETS;
  return `+${countryCodeOf(digits)} ${BULLETS} ${digits.slice(-4)}`;
}

export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1 || at === value.length - 1) return EMAIL_BULLETS;
  return `${value[0]}${EMAIL_BULLETS}${value.slice(at)}`;
}
