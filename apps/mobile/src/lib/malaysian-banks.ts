/**
 * The banks a PR can be paid into — every licensed retail bank in Malaysia.
 *
 * WHY A LIST AND NOT A FREE-TEXT BOX: this string is printed on the voucher
 * document and will be read by whoever keys the transfer. Typed by hand it
 * arrives as "may bank", "MBB", "maybank berhad" and a dozen other spellings of
 * one bank, none of which can be matched to a payout file later. A fixed list
 * makes the value comparable across PRs.
 *
 * WHY NAMES AND NOT BANK CODES: the column is `user_profile.bank_name`
 * varchar(255) and the voucher PRINTS it, so a human is the consumer today. A
 * swift/DuitNow code is what a batch payout file will need — that is a second
 * column and a migration, not a reinterpretation of this one. Do not quietly
 * start storing codes here; a reader of the voucher would see "MBBEMYKL".
 *
 * COVERAGE IS THE WHOLE POINT. A PR whose bank is missing cannot be paid at
 * all, which is a worse failure than a misspelling — so this includes the
 * Islamic banks, the development banks (Agrobank, BSN, Bank Rakyat, MBSB) and
 * the digital banks, not just the big six. If a bank is ever missing, ADD IT
 * rather than telling anyone to pick the closest match.
 *
 * Alphabetical so the list is scannable; the picker's search box is what
 * actually finds a bank, and it matches on this same string.
 */
export const MALAYSIAN_BANKS = [
  'Affin Bank',
  'Agrobank',
  'Al Rajhi Bank',
  'Alliance Bank',
  'AmBank',
  'AEON Bank',
  'Bank Islam',
  'Bank Muamalat',
  'Bank of China (Malaysia)',
  'Bank Rakyat',
  'Bank Simpanan Nasional (BSN)',
  'Boost Bank',
  'CIMB Bank',
  'Citibank',
  'Co-opbank Pertama',
  'GXBank',
  'Hong Leong Bank',
  'HSBC Bank',
  'KAF Digital Bank',
  'Kuwait Finance House',
  'Maybank',
  'MBSB Bank',
  'OCBC Bank',
  'Public Bank',
  'RHB Bank',
  'Ryt Bank',
  'Standard Chartered',
  'UOB Malaysia',
] as const;

export type MalaysianBank = (typeof MALAYSIAN_BANKS)[number];

/**
 * Is a stored value still one of the banks we offer?
 *
 * Reads back a profile saved BEFORE this list existed (or before a bank was
 * renamed) without throwing it away: the picker shows an unknown value as the
 * current selection rather than silently resetting to blank, because blanking
 * it would delete a real payee detail the PR never asked to change.
 */
export function isKnownBank(value: string | null | undefined): boolean {
  return !!value && (MALAYSIAN_BANKS as readonly string[]).includes(value);
}
