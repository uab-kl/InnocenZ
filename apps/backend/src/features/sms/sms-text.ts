/**
 * EVERY SMS body InnocenZ sends, in one place.
 *
 * ⚠️ "RM0.00" is the Malaysian marker for a message that costs the recipient
 * nothing; the provider's own rules (sender id, prefix, length, whether a
 * transactional OTP needs it) are STILL TO BE CONFIRMED with whichever SMS
 * provider is registered. Change the wording here and nowhere else.
 *
 * Plain ASCII on purpose: a single non-GSM character (an em dash, a curly
 * quote) switches the whole message to UCS-2 and halves the length limit.
 */
export const SMS_CODE_TEXT =
  'RM0.00 InnocenZ: your code is {code}. Valid {minutes} minutes. Never share it.';

/*
 * ⚠️ SMS_PHONE_CHANGED_NOTICE_TEXT was DELETED on 21 Sep 2026. It was the SMS
 * telling the OLD number that the account's phone had moved, and the owner
 * removed every message to the old contact along with the identity code, so it
 * lost its only caller. Bring it back only with the notice it belongs to.
 */

export function smsCodeText(code: string, minutes: number): string {
  return SMS_CODE_TEXT.replace('{code}', code).replace('{minutes}', String(minutes));
}
