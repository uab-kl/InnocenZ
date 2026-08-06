/**
 * Which roles a PUBLIC sign-up is allowed to create.
 *
 * The register route sits above the JWT guard (router/v1.ts), so anyone on the
 * internet can reach it. It used to take `roleId` straight from the request
 * body, which meant the caller chose their own role — and the role ids are not
 * secret: the web bundle ships the agency and outlet ones as VITE_* env vars,
 * and any admin can read the admin one off their own /auth/me.
 *
 * So the server picks the role now, and it picks it from this map. `admin` is
 * deliberately absent: minting one requires an authenticated admin caller, which
 * is enforced in AuthController.registerUser.
 */
import { portalRoleName } from '@/types/rbac-constant.js';

export const SIGNUP_ACCOUNT_TYPES = ['agency', 'outlet', 'pr'] as const;

export type SignupAccountType = (typeof SIGNUP_ACCOUNT_TYPES)[number];

/** First org user gets Owner on that portal; PR stays mobile `pr`. */
const ROLE_NAME_BY_ACCOUNT_TYPE: Readonly<Record<SignupAccountType, string>> =
  Object.freeze({
    agency: portalRoleName.OWNER,
    outlet: portalRoleName.OWNER,
    pr: portalRoleName.PR,
  });

export function isSignupAccountType(value: unknown): value is SignupAccountType {
  return (
    typeof value === 'string' &&
    (SIGNUP_ACCOUNT_TYPES as readonly string[]).includes(value)
  );
}

/** The role name a public sign-up of this account type may be given. */
export function roleNameForAccountType(accountType: SignupAccountType): string {
  return ROLE_NAME_BY_ACCOUNT_TYPE[accountType];
}

/** Portal for looking up the seeded role row (null = unassigned / mobile). */
export function portalCodeForAccountType(
  accountType: SignupAccountType,
): 'agency' | 'outlet' | null {
  if (accountType === 'agency') return 'agency';
  if (accountType === 'outlet') return 'outlet';
  return null;
}
