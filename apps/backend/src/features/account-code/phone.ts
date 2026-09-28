/**
 * A phone number as the messaging providers want it: international digits, no
 * '+', no spaces — or `null` when it cannot be one.
 *
 * The rules, in order:
 *  0. a value holding ANY LETTER is not a phone number — null (see below);
 *  1. strip everything that is not a digit ("+60 12-345 6789" → "60123456789");
 *  2. a leading "00" is the international dialling prefix — drop it;
 *  3. otherwise a leading "0" is a Malaysian trunk prefix — replace it with the
 *     country code 60 ("0123456789" → "60123456789");
 *  4. the result must be 8-15 digits (E.164's maximum is 15), else null.
 *
 * Steps 2 and 3 are exclusive: "00" followed by a "0" is not a real number, and
 * turning it into "60…" would invent one.
 *
 * ⚠️ WHY LETTERS REFUSE THE WHOLE VALUE (Fix First, 28 Sep 2026). Step 1 used to
 * run on anything, so junk BECAME a number. The admin screen stored
 * `'+admin-' + 12 hex characters` as every admin's phone, and stripping the
 * letters out of `+admin-0a12b3456c78` leaves `0123456 78…` — a Malaysian-looking
 * mobile. `deliverCode` then sent that admin's reset and change codes by
 * WhatsApp and SMS to whoever holds the invented line. Punctuation is still
 * stripped (people type `+60 (12) 345-6789`); a letter means the value was
 * never a phone, so it is never a delivery target. Any script counts — `\p{L}`,
 * not just a-z.
 *
 * Stored phones on `user.phone_num` are '+' + these digits (see `storedPhone`).
 */
export function toWhatsAppDigits(phone: string | null | undefined): string | null {
  const raw = phone ?? '';
  if (/\p{L}/u.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = `60${digits.slice(1)}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** How a phone is written to `user.phone_num`: '+' and the digits. */
export function storedPhone(digits: string): string {
  return `+${digits.replace(/\D/g, '')}`;
}
