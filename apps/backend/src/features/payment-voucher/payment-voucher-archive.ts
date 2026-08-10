/**
 * Archive the rendered PV document to R2.
 *
 * The key is DETERMINISTIC — no DB column holds it:
 *   user/{prUserId}/pv/{voucherNo}-{voucherId}.pdf
 * so the archived paper for any voucher can be located from the voucher row
 * alone. It is rendered by the SAME buildVoucherPdf() every export uses, so
 * what is filed can never diverge from what the PR downloads.
 *
 * Extracted from signMyVoucher's inline block so the sign route and the
 * backfill script archive through one code path rather than two that drift.
 */
import { logger } from '@/util/logger';
import { sanitizePathSegment } from '@/util/profile-image';
import { r2Configured, r2PutObject } from '@/util/r2';
import { userFolder } from '@/util/user-folder';
import { buildVoucherPdf } from './payment-voucher-pdf.js';

/** Exactly the shape buildVoucherPdf takes — tracked, never re-declared. */
export type VoucherPdfDocument = Parameters<typeof buildVoucherPdf>[0];

/**
 * Always ends with the uuid so the key is collision-proof: distinct voucherNos
 * can sanitize to the same segment ('PV 001' / 'PV#001' both → 'PV_001'), and
 * an all-punctuation number sanitizes to the 'user' fallback — either would
 * silently overwrite an earlier voucher's archived PDF.
 */
export function voucherPdfKey(input: {
  prUserId: string;
  voucherId: string;
  voucherNo?: string | null;
  weekStart?: string | Date | null;
}): string {
  const label = input.voucherNo ? sanitizePathSegment(input.voucherNo) : '';
  const name = label ? `${label}-${input.voucherId}` : input.voucherId;
  return `user/${userFolder(input.prUserId)}/pv/${voucherWeekFolder(input.weekStart)}/${name}.pdf`;
}

/**
 * The week folder: the voucher's OWN `week_start`, as yyyy-mm-dd.
 *
 * Deliberately NOT "this-week" / "last-week". Those are relative to today, so a
 * file put in `this-week` on 10 Aug is in the wrong folder on 17 Aug — every
 * object would need renaming (copy + delete; object storage has no rename)
 * every Sunday and every shared link would break. Dating the folder makes "this
 * week" simply the newest one, which is exactly how the Payment screen already
 * derives its "This week · 09 Aug – 15 Aug 2026" label.
 *
 * Week-START date rather than an ISO week number on purpose: InnocenZ weeks run
 * Sunday–Saturday and ISO weeks start on Monday, so `2026-W33` would name a
 * different seven days than the voucher actually covers.
 */
export function voucherWeekFolder(weekStart: string | Date | null | undefined): string {
  if (!weekStart) return 'undated';
  // pg hands back a Date for `date` columns, but a plain yyyy-mm-dd string when
  // the value came through raw SQL — accept both rather than trust one.
  const iso =
    weekStart instanceof Date
      ? `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(
          weekStart.getDate(),
        ).padStart(2, '0')}`
      : String(weekStart).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : 'undated';
}

/**
 * Render and store. Returns the key written, or null when R2 is not configured
 * (the caller decides whether that is tolerable). THROWS on a storage failure —
 * the sign route catches and downgrades it to a warning, because a storage
 * hiccup must never un-sign a voucher; the backfill script lets it surface.
 */
export async function archiveVoucherPdf(input: {
  prUserId: string;
  voucherId: string;
  voucherNo?: string | null;
  /** The voucher's week_start — files the PDF under its week. */
  weekStart?: string | Date | null;
  document: VoucherPdfDocument;
}): Promise<string | null> {
  if (!r2Configured()) {
    logger.warn('[payment-voucher-archive] R2 not configured — PV not archived', {
      voucherId: input.voucherId,
    });
    return null;
  }
  const pdf = await buildVoucherPdf(input.document);
  const key = voucherPdfKey(input);
  await r2PutObject({ key, body: pdf, contentType: 'application/pdf' });
  return key;
}
