/**
 * The sign-in email and phone of an account: when two values are the SAME
 * contact, and who may change it.
 *
 * `user.email` and `user.phone_num` are not profile fields — they are where a
 * sign-in code, a password reset and every security notice are sent. Changing
 * one therefore needs a code to the current contacts and one to the new one
 * (`POST /auth/contact-change/*`). The writers that used to change them without
 * any code — `PATCH /user/:id`, and the agency's `POST /pr` / `PUT /pr/:id`
 * through `ensureOpsBridge` and `prRepository.update` — now answer from here.
 *
 * A LEAF module on purpose (no db, no express): the controllers AND the
 * repository compare with the same rule, and a test can import it bare.
 */
import { storedPhone, toWhatsAppDigits } from '@/features/account-code/phone';

export const SIGN_IN_CONTACT_MESSAGES = {
  /** PATCH /user/:id — the caller is the account owner, so send them to the right screen. */
  selfEmail: 'Change your email from Security settings',
  selfPhone: 'Change your phone from Security settings',
  /** POST /pr, PUT /pr/:id — an agency or admin acting on somebody else's account. */
  notYours: 'Only the PR can change their sign-in email or phone',
  emailTaken: 'That email is already used by another account',
  phoneTaken: 'That phone number is already used by another account',
} as const;

/** trim + lowercase; `''` for null / undefined. Emails are stored this way. */
export function normaliseSignInEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * The ONE phone normaliser — `toWhatsAppDigits` from `account-code/phone.ts`,
 * the same rule the code sender and the contact-change flow use: strip
 * non-digits; `00`+x -> x; a leading `0` -> `60`+rest; 8-15 digits, else null.
 *
 * Imported, never copied: two copies that disagreed would make "the same
 * phone" mean one thing to the agency's writer and another to the flow that
 * sends the code. The test next door pins the cases this module relies on.
 */
export function signInPhoneDigits(value: string | null | undefined): string | null {
  return toWhatsAppDigits(value);
}

/**
 * How a phone is STORED: `'+' + digits` when it normalises, the trimmed value
 * as typed when it does not (an agency may still record a number the sender
 * cannot reach — refusing it here would block a roster entry, not protect a
 * login), and null when blank.
 */
export function storedSignInPhone(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const digits = signInPhoneDigits(trimmed);
  return digits ? storedPhone(digits) : trimmed;
}

/**
 * The values to hand `getUserByLoginMethod('phone', …)`, in order, when looking
 * for the account a typed phone belongs to.
 *
 * ⚠️ That lookup compares digits against `phoneLoginCandidates`, which knows the
 * `0` <-> `60` swap and NOTHING about the `00` international prefix this
 * module's normaliser strips. A number on file as `0060123456789` — or `00` +
 * 8-9 digits — is therefore invisible to a lookup by the normalised
 * `+60123456789`, and `POST /pr` created a second account for the same line
 * (the stored strings differ, so the unique index let it through).
 *
 * So: the stored form first (what every current row looks like), then the `00`
 * spelling of the same digits, then the value exactly as typed. Deduplicated by
 * digits, so a value that is already one of the earlier forms costs no second
 * query. Empty for a blank value or one with no digits at all.
 */
export function signInPhoneLookupForms(value: string | null | undefined): string[] {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return [];
  const forms: string[] = [];
  const seenDigits = new Set<string>();
  const add = (form: string) => {
    const key = form.replace(/\D/g, '');
    if (!key || seenDigits.has(key)) return;
    seenDigits.add(key);
    forms.push(form);
  };
  const digits = signInPhoneDigits(trimmed);
  if (digits) {
    add(storedPhone(digits));
    add(`00${digits}`);
  }
  add(trimmed);
  return forms;
}

/**
 * May an AGENCY correct the sign-in email / phone of a never-activated stub?
 *
 * Having no password is not enough. `POST /pr` matches ANY account by phone or
 * email, so without this agency B could type the phone of a stub agency A
 * invited plus an email B controls, have it written, then take the account
 * over through Forgot password (the code goes to that email). Only the agency
 * that CREATED the stub — its creator is one of that agency's members — may
 * correct it, and only while no other agency has it on a roster: once a second
 * agency relies on those contacts, neither may re-point them alone. An admin is
 * exempt and never reaches this.
 *
 * @param creatorAgencyIds every agency the stub's `created_by` account is (or
 *   was) a member of — empty when the creator is not a person (a seed, `system`).
 * @param rosterAgencyIds every agency with an `agency_pr` row for the stub.
 */
export function agencyMayCorrectStub(input: {
  agencyId: string | null;
  creatorAgencyIds: readonly string[];
  rosterAgencyIds: readonly string[];
}): boolean {
  const { agencyId } = input;
  if (!agencyId) return false;
  if (!input.creatorAgencyIds.includes(agencyId)) return false;
  return input.rosterAgencyIds.every((id) => id === agencyId);
}

/** Same email, ignoring case and surrounding space. Null and '' are the same (none). */
export function sameSignInEmail(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normaliseSignInEmail(a) === normaliseSignInEmail(b);
}

/**
 * Same phone line. `+60 12-345 6789`, `60123456789` and `0123456789` are one
 * number; blank equals blank. A value that does not normalise is compared by
 * its raw digits so two identical odd values still read as unchanged.
 */
export function sameSignInPhone(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const rawA = (a ?? '').trim();
  const rawB = (b ?? '').trim();
  if (!rawA || !rawB) return !rawA && !rawB;
  const digitsA = signInPhoneDigits(rawA);
  const digitsB = signInPhoneDigits(rawB);
  if (digitsA && digitsB) return digitsA === digitsB;
  if (digitsA || digitsB) return false;
  const rawDigitsA = rawA.replace(/\D/g, '');
  const rawDigitsB = rawB.replace(/\D/g, '');
  return rawDigitsA && rawDigitsB ? rawDigitsA === rawDigitsB : rawA === rawB;
}

/**
 * An account the person has ACTIVATED — it has a password. Until then it is a
 * roster stub the agency created, and the agency may still correct a mistyped
 * email or phone on it; afterwards only the person, through a code, may.
 */
export function isActivatedAccount(
  account: { passwordHash?: string | null } | null | undefined,
): boolean {
  return Boolean(account?.passwordHash);
}

export type SignInContactPatch = { email?: string | null; phoneNum?: string | null };

/**
 * The part of a requested email / phone write that actually CHANGES the
 * account, normalised for storage. `undefined` means "not asked for"; `null`
 * or `''` means "clear it". Unchanged values drop out, so a form that sends
 * the whole record back writes nothing to these two columns.
 */
export function signInContactChanges(
  account: { email: string | null; phoneNum: string | null },
  requested: { email?: string | null; phone?: string | null },
): SignInContactPatch {
  const patch: SignInContactPatch = {};
  if (requested.email !== undefined && !sameSignInEmail(requested.email, account.email)) {
    patch.email = normaliseSignInEmail(requested.email) || null;
  }
  if (requested.phone !== undefined && !sameSignInPhone(requested.phone, account.phoneNum)) {
    patch.phoneNum = storedSignInPhone(requested.phone);
  }
  return patch;
}
