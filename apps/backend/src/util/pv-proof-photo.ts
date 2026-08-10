/**
 * PV / dispute / MC proof photos to Cloudflare R2.
 *
 * The phone submits photos as base64 data URLs (`data:image/jpeg;base64,…`)
 * inside JSON bodies. This converts each to an R2 object stored under the
 * owning USER, and the jsonb columns (payment_voucher_line.proof_photos,
 * payment_voucher_receipt.proof_photos, payment_voucher_dispute.proof_photos,
 * shift_assignment.leave_proof_photos) then hold the BARE OBJECT KEY — never a
 * URL. Clients join `R2_PUBLIC_URL + '/' + key`. Old rows keep their data URLs,
 * so every reader must tolerate BOTH formats.
 *
 * R2 key shapes (same style as profile-image.ts / org-logo.ts):
 *   user/{userId}/receipts/rcp-{ts}-{n}{ext}
 *   user/{userId}/disputes/dispute-{ts}-{n}{ext}
 *   user/{userId}/leave/mc-{ts}-{n}{ext}
 *
 * FAILS OPEN, never the request: when R2 is not configured, or a put throws
 * (e.g. AccessDenied while the staging token is mis-scoped), the ORIGINAL data
 * URL is stored unchanged — the feature keeps working exactly as it does today
 * until R2 access is fixed. One warn per call, not one per photo.
 */
import { logger } from '@/util/logger';
import { isOwnedUserKey, userFolder } from '@/util/user-folder';
import {
  isR2ObjectKey,
  r2Configured,
  r2DeleteObject,
  r2PutObject,
} from '@/util/r2';

export type ProofPhotoKind = 'receipts' | 'disputes' | 'leave';

const KEY_PREFIX: Record<ProofPhotoKind, string> = {
  receipts: 'rcp',
  disputes: 'dispute',
  leave: 'mc',
};

/** Max decoded payload (~5 MB) — matches the org-logo bound. */
const MAX_BYTES = 5 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,/i;

/** Decode a `data:image/…;base64,` URL. Null when it is not one we upload. */
function decodeDataUrl(
  raw: string,
): { body: Buffer; contentType: string; ext: string } | null {
  const trimmed = raw.trim();
  const match = DATA_URL_RE.exec(trimmed);
  if (!match) return null;
  const contentType = match[1]!.toLowerCase();
  const ext = EXT_BY_MIME[contentType];
  // Only JPEG / PNG / WebP go to R2; anything else stays a stored data URL.
  if (!ext) return null;
  const body = Buffer.from(trimmed.slice(trimmed.indexOf(',') + 1), 'base64');
  if (!body.length || body.length > MAX_BYTES) return null;
  return { body, contentType, ext };
}

/**
 * Upload an array of proof photos and return what the jsonb column should
 * hold, entry for entry:
 *  - an entry that is ALREADY an R2 key passes through unchanged (the gallery
 *    edit round-trips kept photos as keys — carry-forward);
 *  - a `data:image/…` URL uploads and comes back as its bare object key;
 *  - anything else (legacy https URL, unsupported mime, oversized/empty
 *    payload) is stored exactly as the client sent it — same as today;
 *  - when R2 is off or a put throws this THROWS. Evidence that quietly became
 *    a base64 blob in Postgres still looked saved to the PR who filed it.
 *
 * `bucket` and `source` shape the key so drink and tip evidence, and scanned
 * versus self-logged evidence, are separable in the bucket without opening a
 * single file:
 *   user/<id>/receipts/drinks/scan-<ts>-<i>.jpg
 *   user/<id>/receipts/tips/log-<ts>-<i>.jpg
 * Omit them and the flat legacy shape (`rcp-<ts>-<i>.jpg`) is used.
 */
export type ProofPhotoBucket = 'drinks' | 'tips';
export type ProofPhotoSource = 'scan' | 'log';

/**
 * Which folder a piece of evidence belongs in. Accepts BOTH vocabularies used
 * in this codebase — the `payment_voucher_component` enum stored on a line, and
 * the shorter `kind` the PR app posts — so callers never have to translate.
 * Anything else (wages, ot, deduction, other) has no bucket: those are not
 * PR-evidenced components and stay in the flat receipts/ folder.
 */
export function proofBucketForComponent(
  component: string | null | undefined,
): ProofPhotoBucket | undefined {
  if (component === 'drink_commission' || component === 'drinks') return 'drinks';
  if (component === 'tip_commission' || component === 'tips') return 'tips';
  return undefined;
}

/** `payment_voucher_receipt.source` ('scan' | 'manual') -> the filename lead. */
export function proofSourceForReceipt(
  source: string | null | undefined,
): ProofPhotoSource {
  return source === 'scan' ? 'scan' : 'log';
}

export async function saveProofPhotosToR2(input: {
  userId: string;
  kind: ProofPhotoKind;
  photos: string[];
  bucket?: ProofPhotoBucket;
  source?: ProofPhotoSource;
}): Promise<string[]> {
  const { userId, kind, photos, bucket, source } = input;
  if (photos.length === 0) return photos;

  let warned = false;
  const warnOnce = (reason: string, error?: unknown) => {
    if (warned) return;
    warned = true;
    logger.warn(
      `[pv-proof-photo] ${reason} — storing data URL(s) unchanged (kind=${kind})`,
      error ?? '',
    );
  };

  if (!r2Configured()) {
    // Evidence that silently became a base64 blob in Postgres still LOOKS saved
    // to the PR who filed it. Refusing is the honest outcome: 22 proof photos
    // had to be migrated out of the database because this used to return them.
    if (photos.some((p) => DATA_URL_RE.test(p.trim()))) {
      warnOnce('R2 not configured');
      throw new Error(
        'Photo storage is not configured — the photo was not saved. Set R2_* and retry.',
      );
    }
    return photos;
  }

  // One timestamp per batch; the index keeps sibling keys unique.
  const stamp = Date.now();
  const out: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]!;
    if (isR2ObjectKey(photo)) {
      // Carry-forward, but ONLY for keys this user owns. A client can put any
      // string in proofPhotos; without this check a PR could store another
      // PR's key (or an agency/outlet logo key) on their own line, which would
      // (a) display someone else's photo as this PR's evidence and (b) let the
      // next edit/delete wipe that object off R2. Foreign keys are dropped.
      // Ownership is proven by the uuid head, which appears in BOTH the legacy
      // `user/<uuid>/…` shape and the role-foldered `user/pr/<slug>-<id8>/…`
      // one — a PR's pre-rename evidence must not start looking foreign.
      if (isOwnedUserKey(photo, userId)) out.push(photo);
      else logger.warn('[pv-proof-photo] dropped foreign R2 key', { userId });
      continue;
    }
    const decoded = decodeDataUrl(photo);
    if (!decoded) {
      out.push(photo);
      continue;
    }
    try {
      const folder = bucket ? `${kind}/${bucket}` : kind;
      const lead = bucket ? (source ?? 'log') : KEY_PREFIX[kind];
      const key = await r2PutObject({
        key: `user/${userFolder(userId)}/${folder}/${lead}-${stamp}-${i}${decoded.ext}`,
        body: decoded.body,
        contentType: decoded.contentType,
      });
      out.push(key);
    } catch (error) {
      // Was: swallow and keep the data URL. That is how AccessDenied quietly
      // filled Postgres with base64 while every screen reported success.
      warnOnce('upload failed', error);
      throw new Error('Could not save the photo to storage — nothing was recorded. Try again.');
    }
  }
  return out;
}

/** Only proof-photo objects may be deleted — never profile/id-doc/pv archives. */
const DELETABLE_FOLDER_RE = /^user\/(?:[^/]+\/){1,2}(?:receipts|disputes|leave)\//;

/**
 * Best-effort R2 cleanup for photos removed from a row. Data URLs have no
 * object behind them and are skipped; keys outside the OWNER's three
 * proof-photo folders are never touched (so a key that somehow belongs to
 * another user can never be deleted here); every failure is swallowed —
 * cleanup must not fail (or delay-fail) the request that triggered it.
 */
export async function deleteProofPhotoKeys(
  userId: string,
  photos: (string | null | undefined)[],
): Promise<void> {
  for (const photo of photos) {
    if (!photo || !isR2ObjectKey(photo)) continue;
    if (!isOwnedUserKey(photo, userId)) continue;
    // Match the kind folder anywhere after the owner segment, so this works for
    // both `user/<uuid>/receipts/…` and `user/pr/<slug>-<id8>/receipts/…`.
    if (!DELETABLE_FOLDER_RE.test(photo)) continue;
    try {
      // r2DeleteObject already logs-and-swallows; the outer catch also covers
      // the not-configured throw from getClient().
      await r2DeleteObject(photo);
    } catch {
      // ignore — best-effort only
    }
  }
}
