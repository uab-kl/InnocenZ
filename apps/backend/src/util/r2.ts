import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/env';
import { logger } from '@/util/logger';

let client: S3Client | null = null;

/**
 * THE FILES NOBODY SHOULD REACH BY URL ALONE (28 Sep 2026).
 *
 * Every object used to be served by joining its key to the bucket's PUBLIC
 * address, so an ID-card photo, a receipt, an MC slip or a signed voucher was
 * readable by anyone who ever held the link — forever, from any device, logged
 * or cached anywhere it passed through. These folders hold identity documents,
 * money evidence and signed money documents; they are now served only as
 * short-lived signed links (`r2SignedGetUrl`), and live in the private bucket
 * when one is configured (`R2_PRIVATE_BUCKET_NAME`).
 *
 * Avatars, portfolio shots, comcards and organisation logos are meant to be
 * seen and stay on the public address. The user folder is one or two segments
 * (`user/<uuid>/…` legacy, `user/<lane>/<slug-id>/…` since the rename), the
 * same shape `DELETABLE_FOLDER_RE` in pv-proof-photo.ts matches.
 */
const SENSITIVE_KEY_RE =
  /^user\/(?:[^/]+\/){1,2}(?:ic-docs|id-docs|receipts|leave|disputes|pv)\//;

export function isSensitiveR2Key(key: string | null | undefined): boolean {
  return !!key && SENSITIVE_KEY_RE.test(key);
}

/** The bucket that holds `key` — the private one for sensitive keys, when configured. */
export function r2BucketFor(key: string): string {
  return isSensitiveR2Key(key) && env.R2_PRIVATE_BUCKET_NAME
    ? env.R2_PRIVATE_BUCKET_NAME
    : env.R2_BUCKET_NAME!;
}

/** Default lifetime of a signed link: long enough to read a screen, short enough to expire. */
const SIGNED_URL_TTL_SECONDS = 3600;

export function r2Configured(): boolean {
  return Boolean(
    env.R2_BUCKET_NAME &&
      env.R2_ENDPOINT &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_PUBLIC_URL,
  );
}

function getClient(): S3Client {
  if (!r2Configured()) {
    throw new Error('Cloudflare R2 is not configured (missing R2_* env vars)');
  }
  if (!client) {
    client = new S3Client({
      // R2 requires "auto" — ignore any region label like "Asia-Pacific".
      region: 'auto',
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

/** Build a browser-fetchable URL from an object key. */
export function r2PublicUrl(key: string): string {
  const base = env.R2_PUBLIC_URL!.replace(/\/$/, '');
  const path = key.replace(/^\//, '');
  return `${base}/${path}`;
}

/** True when the DB value is an R2 object key (not a full URL or /img path). */
export function isR2ObjectKey(ref: string | null | undefined): boolean {
  if (!ref) return false;
  // Org logos: agency/… outlet/… · User assets: user/…
  return (
    ref.startsWith('user/') ||
    ref.startsWith('agency/') ||
    ref.startsWith('outlet/')
  );
}

/**
 * Object key from a stored ref: the key itself, stripped from our public URL,
 * or read back out of a signed link WE issued (`r2KeyFromSignedUrl`).
 */
export function r2KeyFromStoredRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (isR2ObjectKey(ref)) return ref;
  const signed = r2KeyFromSignedUrl(ref);
  if (signed) return signed;
  if (!env.R2_PUBLIC_URL) return null;
  const base = env.R2_PUBLIC_URL.replace(/\/$/, '');
  if (!ref.startsWith(`${base}/`)) return null;
  return ref.slice(base.length + 1);
}

/**
 * A short-lived signed GET link to one object — how a sensitive file reaches a
 * screen. Signing is local arithmetic over the credentials (no network call),
 * so it is cheap enough to do per key per response.
 */
export async function r2SignedGetUrl(
  key: string,
  ttlSeconds: number = env.R2_SIGNED_URL_TTL_SECONDS ?? SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: r2BucketFor(key), Key: key }),
    { expiresIn: ttlSeconds },
  );
}

/**
 * The object key inside a signed link THIS server issued, or null.
 *
 * Needed because clients hand stored photos BACK: the phone re-sends a line's
 * existing `proofPhotos` when it edits the line, and after this change those
 * arrive as signed links rather than keys. Stored as-is they would be an
 * expiring URL in the database — and the edit's cleanup, which deletes any
 * previous key missing from the new list, would delete the object itself.
 *
 * Only our endpoint and our buckets are recognised, in both addressing styles
 * the SDK emits (`<bucket>.<host>/<key>` and `<host>/<bucket>/<key>`), and only
 * with a signature present — any other URL stays what it was.
 */
export function r2KeyFromSignedUrl(ref: string | null | undefined): string | null {
  if (!ref || !env.R2_ENDPOINT || !env.R2_BUCKET_NAME) return null;
  let url: URL;
  let endpointHost: string;
  try {
    url = new URL(ref);
    endpointHost = new URL(env.R2_ENDPOINT).host;
  } catch {
    return null;
  }
  if (!url.searchParams.has('X-Amz-Signature')) return null;
  const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const buckets = [env.R2_BUCKET_NAME, env.R2_PRIVATE_BUCKET_NAME].filter(
    (b): b is string => !!b,
  );
  for (const bucket of buckets) {
    if (url.host === `${bucket}.${endpointHost}` && path) return path;
    if (url.host === endpointHost && path.startsWith(`${bucket}/`)) {
      return path.slice(bucket.length + 1) || null;
    }
  }
  return null;
}

/** @deprecated Prefer r2KeyFromStoredRef — accepts keys or full public URLs. */
export function r2KeyFromPublicUrl(url: string | null | undefined): string | null {
  return r2KeyFromStoredRef(url);
}

/**
 * Upload to R2 and return the **object key** (store this in the DB).
 * Clients resolve display URLs as `R2_PUBLIC_URL + '/' + key`.
 */
export async function r2PutObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: r2BucketFor(input.key),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
  return input.key;
}

/**
 * Read one object back, or null when it is not there.
 *
 * ⚠️ THE BROWSER CANNOT DO THIS ITSELF, which is the whole reason this exists.
 * The public r2.dev host returns NO `Access-Control-Allow-Origin` header —
 * verified against a live 200 on 9 Sep 2026 — so `fetch()` is blocked, and an
 * `<img crossOrigin="anonymous">` fails to load outright. Drawing the image
 * WITHOUT that attribute works but taints the canvas, and `toDataURL()` on a
 * tainted canvas throws. Plain `<img src>` display is unaffected, which is why
 * nothing has needed this until now: showing an avatar never reads its pixels.
 *
 * So anything that has to re-READ stored bytes (re-cropping a saved photo)
 * goes through the server. Returns null rather than throwing on a miss: a
 * caller asking "is there a source for this image?" gets an ordinary no.
 */
export async function r2GetObject(
  key: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const result = await getClient().send(
      new GetObjectCommand({ Bucket: r2BucketFor(key), Key: key }),
    );
    if (!result.Body) return null;
    const bytes = await result.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  } catch (error) {
    // A miss is the normal answer for any image saved before this feature, so
    // it is logged at debug rather than warn — otherwise every legacy logo
    // would file an error report every time someone opened Settings.
    logger.debug?.('[r2] get missed (ignored)', { key, error });
    return null;
  }
}

export async function r2DeleteObject(key: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: r2BucketFor(key),
        Key: key,
      }),
    );
  } catch (error) {
    logger.warn('[r2] delete failed (ignored)', { key, error });
  }
}

/** Delete by stored DB value (object key or legacy full public URL). */
export async function r2DeleteStoredRef(ref: string | null | undefined): Promise<void> {
  const key = r2KeyFromStoredRef(ref);
  if (key) await r2DeleteObject(key);
}

/**
 * Every object under `prefix`, paged to exhaustion (R2 caps a page at 1000).
 *
 * Returns [] and logs on failure rather than throwing: callers use this to tidy
 * up after a successful write, and a listing problem must not fail the write
 * that already landed.
 */
export async function r2ListKeys(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  try {
    let token: string | undefined;
    do {
      const page = await getClient().send(
        new ListObjectsV2Command({
          Bucket: r2BucketFor(prefix),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of page.Contents ?? []) if (obj.Key) keys.push(obj.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  } catch (error) {
    logger.warn('[r2] list failed (ignored)', { prefix, error });
  }
  return keys;
}

/**
 * Leave exactly one object under `prefix`: `keepKey`. Everything else there is
 * deleted.
 *
 * Written because "delete the previous one" was not enough. The comcard key
 * carries a `Date.now()` so each render is a NEW object, the old one was
 * removed by looking up the PREVIOUS key in the database, and
 * `r2DeleteObject` swallows its own failures — so any delete that did not
 * happen, for any reason, left an orphan nobody could see and nothing would
 * ever collect. This asks the BUCKET what is there instead of trusting a
 * column, so it also cleans up orphans it did not create.
 */
export async function r2KeepOnly(prefix: string, keepKey: string): Promise<number> {
  const keys = await r2ListKeys(prefix);
  const stale = keys.filter((k) => k !== keepKey);
  for (const key of stale) await r2DeleteObject(key);
  if (stale.length > 0) {
    logger.info('[r2] pruned stale objects', { prefix, kept: keepKey, removed: stale.length });
  }
  return stale.length;
}

/** @deprecated Prefer r2DeleteStoredRef. */
export async function r2DeleteByPublicUrl(url: string | null | undefined): Promise<void> {
  await r2DeleteStoredRef(url);
}
