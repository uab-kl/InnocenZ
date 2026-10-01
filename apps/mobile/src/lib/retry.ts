/**
 * Try a request again when the failure was the NETWORK's, not the request's.
 *
 * Pure apart from the timer, which is injectable, so the rule is tested without
 * waiting. Written for the sign-up uploads: the ID card photos go up in the few
 * seconds after the account is created, on a phone that may just have left
 * Wi-Fi, and a single dropped connection used to lose them for good — the
 * failure was caught, named in a toast the screen then unmounted before anyone
 * could read it, and nothing anywhere offered to send them again.
 */
import { ApiError } from './api';

/**
 * Worth another try: no connection at all (status 0), a timeout, the limiter,
 * or the server's own fault. Never a 4xx the request earned — a file too large
 * or refused is refused again, and retrying only delays the message.
 */
export function isTransientFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  const { status } = error;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * `work()`, and up to `attempts - 1` more tries after a transient failure,
 * `delayMs` apart and doubling. The LAST error is what the caller sees.
 */
export async function withRetries<T>(
  work: () => Promise<T>,
  opts: {
    attempts: number;
    delayMs: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const sleep = opts.sleep ?? wait;
  const attempts = Math.max(1, Math.floor(opts.attempts));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await work();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientFailure(error)) break;
      await sleep(opts.delayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}
