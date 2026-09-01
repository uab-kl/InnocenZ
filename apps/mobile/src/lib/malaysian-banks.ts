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
 *
 * ⚠️ NOT `fpxBanks` — DO NOT MERGE THE TWO ROSTERS.
 * `payment-method.model.ts` carries an 18-entry `fpxBanks` list for the
 * SUBSCRIPTION direct debit (flow 1, an org paying InnocenZ inward). Those are
 * internet-banking PRODUCT brands — Maybank2u, CIMB Clicks, RHB Now — which in
 * an outbound IBG file is a rejected or misrouted transfer, not a cosmetic
 * oddity. Ten institutions a PR can genuinely bank with are absent from it
 * entirely: Al Rajhi, AEON Bank, Bank of China (Malaysia), Boost Bank,
 * Citibank, Co-opbank Pertama, GXBank, KAF Digital Bank, MBSB Bank, Ryt Bank.
 * Its endpoint also 403s a PR token. Opposite direction of money, different
 * list.
 *
 * ⚠️ AND THERE ARE TWO COLUMNS CALLED `bank_name`.
 * `user_profile.bank_name` varchar(255) is THIS value: a payee name that flows
 * to `payout_batch_item.bank_name` and into the CSV an agency uploads to its
 * bank — so a wrong one is a failed transfer, not a typo.
 * `payment_method.bank_name` varchar(120) is a snapshot of an fpxBanks display
 * name beside a PayNet `bank_code`. Same column name, different tables.
 *
 * KNOWN GAP: this roster constrains the PICKER, not the data.
 * `user.controller.ts` accepts `bankName` as free text up to 255, so a legacy
 * or hand-typed value still saves. That is deliberate — a strict server check
 * would 400 a PR's entire profile save over an old bank string, and a PR who
 * cannot save cannot be paid at all, which is strictly worse than a misspelling.
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
