import type { AppTranslations } from '../i18n';
import type { PrVoucherSignatures } from './api';

/**
 * THE TWO HALVES OF A PV'S SIGNATURE, as the PR's voucher screen shows them.
 *
 * The screen drew one card — "YOUR SIGNATURE" — and, once she had signed, a
 * caption reading "Dual-signed · transfer processing". Neither half of that was
 * known to it: the agency's signer never reached the phone, and a PR signature
 * says nothing about a transfer. The agency signs first (the send needs it), so
 * the card now shows that half, then hers, and claims "both" only when both
 * are actually on the document.
 */

/** The agency's half — who, in what capacity, when. */
export type AgencySignature = {
  name: string | null;
  role: string | null;
  signedAt: string;
};

/** The agency's signature, or null while nobody at the agency has signed. */
export function agencySignatureOf(
  voucher: PrVoucherSignatures | null | undefined,
): AgencySignature | null {
  if (!voucher?.financeHeadSignedAt) return null;
  return {
    name: voucher.financeHeadName?.trim() || null,
    role: voucher.financeHeadRole?.trim() || null,
    signedAt: voucher.financeHeadSignedAt,
  };
}

/**
 * The capacity, in the reader's language. The stored value is English and
 * frozen at signing ('Owner', 'Finance'…); one this map does not know is shown
 * as stored rather than dropped — a title nobody translated is still a title.
 */
export function signerRoleLabel(role: string, t: AppTranslations): string {
  const key = role.trim().toLowerCase();
  if (key === 'owner') return t.pv.roleOwner;
  if (key === 'finance' || key === 'finance head' || key === 'financial head') {
    return t.pv.roleFinance;
  }
  if (key === 'director') return t.pv.roleDirector;
  if (key === 'guarantor') return t.pv.roleGuarantor;
  return role.trim();
}

/** Both halves on the document: the agency attested it AND the PR counter-signed. */
export function bothSigned(
  voucher: PrVoucherSignatures | null | undefined,
  prSigned: boolean,
): boolean {
  return prSigned && Boolean(voucher?.financeHeadSignedAt);
}

/**
 * A signing INSTANT as the calendar day the reader lives in — '14 Sep 2026' —
 * or null when there is none or it will not parse. An instant, not a stored
 * day, so the phone's own clock (Kuala Lumpur for every PR) decides the date.
 */
export function signedDayLabel(
  iso: string | null | undefined,
  locale: string,
): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
