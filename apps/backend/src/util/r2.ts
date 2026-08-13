import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '@/env';
import { logger } from '@/util/logger';

let client: S3Client | null = null;

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

/** Object key from a stored ref: key itself, or stripped from our public URL. */
export function r2KeyFromStoredRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (isR2ObjectKey(ref)) return ref;
  if (!env.R2_PUBLIC_URL) return null;
  const base = env.R2_PUBLIC_URL.replace(/\/$/, '');
  if (!ref.startsWith(`${base}/`)) return null;
  return ref.slice(base.length + 1);
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
      Bucket: env.R2_BUCKET_NAME!,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
  return input.key;
}

export async function r2DeleteObject(key: string): Promise<void> {
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME!,
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
          Bucket: env.R2_BUCKET_NAME!,
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
