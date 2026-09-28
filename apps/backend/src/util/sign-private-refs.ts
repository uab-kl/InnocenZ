import { isSensitiveR2Key, r2KeyFromStoredRef, r2SignedGetUrl } from '@/util/r2';

/**
 * Every SENSITIVE file reference in a response body, swapped for a short-lived
 * signed link — ID cards, receipt / MC / dispute proof, signed vouchers (see
 * `isSensitiveR2Key`). Everything else is returned untouched.
 *
 * Applied to the whole JSON body at one choke point (the `signPrivateFiles`
 * middleware) rather than per endpoint, because the same keys ride on dozens of
 * responses — the voucher reads, the receipts feed, the dispute queue, the
 * assignment rows, `/auth/me`, the PR roster — and a per-endpoint list is how
 * one gets missed. Clients need no change: every resolver in the web and the
 * phone already passes an absolute `https://` link through unchanged.
 *
 * ONE LINK PER KEY PER RESPONSE: a key that appears twice (a receipt's photo
 * and the same photo inherited by its line) gets the same string both times,
 * because the phone and the web de-duplicate photos by comparing strings.
 */
export async function signSensitiveRefs<T>(
  body: T,
  sign: (key: string) => Promise<string> = r2SignedGetUrl,
): Promise<T> {
  const links = new Map<string, Promise<string>>();
  const linkFor = (key: string): Promise<string> => {
    let link = links.get(key);
    if (!link) {
      link = sign(key);
      links.set(key, link);
    }
    return link;
  };

  const walk = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string') {
      const key = sensitiveKeyOf(value);
      return key ? linkFor(key) : value;
    }
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    // Only PLAIN objects are rebuilt. A Date, a Buffer or any class instance
    // passes through as it came, so `res.json` serialises it exactly as before.
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(
        async ([k, v]) => [k, await walk(v)] as const,
      ),
    );
    return Object.fromEntries(entries);
  };

  return (await walk(body)) as T;
}

/**
 * The object key behind a string, when that key is sensitive: a bare key, or a
 * legacy full public URL to one (older rows stored the URL, not the key).
 */
function sensitiveKeyOf(value: string): string | null {
  if (isSensitiveR2Key(value)) return value;
  if (!value.startsWith('http')) return null;
  const key = r2KeyFromStoredRef(value);
  return key && isSensitiveR2Key(key) ? key : null;
}
