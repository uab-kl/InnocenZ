/**
 * English → active-locale copy for the errors the REST client throws.
 *
 * `lib/api.ts` is a plain module with no React, so it cannot call `useLocale`.
 * It keeps throwing ENGLISH — which is also what a developer reads in the logs
 * and what a bug report can be searched for — and the RENDER site maps that
 * message onto a dictionary key here. Same shape as `localizeLoginError` in
 * `i18n/translations.ts`, which already does this for the auth messages.
 *
 * ⚠️ An unrecognised message comes back UNTOUCHED, on purpose. Most `ApiError`
 * messages are the SERVER's own refusal text — "RCP-000007 has already been
 * reviewed by the agency", the 409 listing what is still unsettled before an
 * agency can be left, "You are 137 m from the venue…" — and screens are
 * required to show those verbatim. Only the handful of messages this client
 * writes itself are mapped.
 *
 * Every {placeholder} stays a placeholder: the backend URL, the status code and
 * the underlying network detail are filled back in at render time, never baked
 * into the translated sentence.
 */
import { formatMessage, type AppTranslations } from '../i18n';

/** `Cannot reach the InnocenZ backend at ${API_BASE}. Is it running?` */
const UNREACHABLE =
  /^Cannot reach the InnocenZ backend at (\S+)\. Is it running\?$/;

/**
 * `Upload failed — could not finish talking to ${API_BASE} (${detail}). …`
 *
 * Matched loosely across the dash: the thrown string carries an em dash and a
 * non-breaking hyphen in "Wi‑Fi", and a resolver that silently stops matching
 * because someone retyped one of those would ship English with no warning.
 */
const UPLOAD_UNREACHABLE =
  /^Upload failed\b.*could not finish talking to (\S+) \(([\s\S]*)\)\./;

/** `That photo is too large — pick one under 5 MB` (multer's 5 MB cap). */
const PHOTO_TOO_LARGE = /^That photo is too large\b/;

const REQUEST_FAILED = /^Request failed \((\d+)\)$/;
const UPLOAD_FAILED = /^Upload failed \((\d+)\)$/;
const PDF_EXPORT_FAILED = /^PDF export failed \((\d+)\)$/;
const EXCEL_EXPORT_FAILED = /^Excel export failed \((\d+)\)$/;

/** `lib/session.tsx` — no token/user yet, so the call was never sent. */
const NOT_SIGNED_IN = 'Not signed in';

/** api.ts's own fallback when the thrown cause carries no message of its own. */
const NETWORK_ERROR = 'network error';

/**
 * Localise one thrown API message. `errors` is passed in (never defaulted) so
 * the caller's live locale decides — a default would pin one language forever.
 */
export function localizeApiError(
  message: string,
  errors: AppTranslations['errors'],
): string {
  const trimmed = message.trim();

  if (trimmed === NOT_SIGNED_IN) return errors.notSignedIn;
  if (PHOTO_TOO_LARGE.test(trimmed)) return errors.photoTooLarge;

  const unreachable = UNREACHABLE.exec(trimmed);
  if (unreachable) {
    return formatMessage(errors.backendUnreachable, { base: unreachable[1] });
  }

  const uploadUnreachable = UPLOAD_UNREACHABLE.exec(trimmed);
  if (uploadUnreachable) {
    const detail = uploadUnreachable[2].trim();
    return formatMessage(errors.uploadUnreachable, {
      base: uploadUnreachable[1],
      // Only OUR fallback word is translated. A real platform message
      // ("Network request failed") is evidence — show it as it was thrown.
      detail: detail === NETWORK_ERROR ? errors.networkError : detail,
    });
  }

  const requestFailed = REQUEST_FAILED.exec(trimmed);
  if (requestFailed) {
    return formatMessage(errors.requestFailed, { status: requestFailed[1] });
  }

  const uploadFailed = UPLOAD_FAILED.exec(trimmed);
  if (uploadFailed) {
    return formatMessage(errors.uploadFailed, { status: uploadFailed[1] });
  }

  const pdfFailed = PDF_EXPORT_FAILED.exec(trimmed);
  if (pdfFailed) {
    return formatMessage(errors.pdfExportFailed, { status: pdfFailed[1] });
  }

  const excelFailed = EXCEL_EXPORT_FAILED.exec(trimmed);
  if (excelFailed) {
    return formatMessage(errors.excelExportFailed, { status: excelFailed[1] });
  }

  return trimmed;
}
