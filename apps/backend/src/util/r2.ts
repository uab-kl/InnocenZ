import {
  DeleteObjectCommand,
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
  return Boolean(ref?.startsWith('user/'));
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

/** @deprecated Prefer r2DeleteStoredRef. */
export async function r2DeleteByPublicUrl(url: string | null | undefined): Promise<void> {
  await r2DeleteStoredRef(url);
}
