/**
 * KEEP A FAILED QUERY'S BOUND VALUES OUT OF THE LOG.
 *
 * drizzle-orm 0.45 wraps every statement that fails in `DrizzleQueryError`,
 * whose message is
 *
 *     Failed query: insert into "user" (...) values ($1, $2, ...)
 *     params: owner@x.my,$2b$10$...
 *
 * and whose `params` array and stack repeat every value. winston prints all
 * three, so a `logger.error('[X] Error:', error)` beside a password write put
 * the bcrypt hash in the application log — and beside a code write, the
 * sha256 of a six-digit code, which is the code. The success-path logging was
 * already cleaned; the catch blocks were not.
 *
 * Two tools, used together:
 *
 *  • `redactQueryError(error)` — scrubs the values IN PLACE (message, stack and
 *    `params`), keeping the object, its class, `code` and `cause`. Used where an
 *    error carrying a secret is RETHROWN, so every caller further up — including
 *    ones outside this feature that still log the raw error — prints nothing.
 *  • `safeErrorFields(error)` — a plain object for the log line itself: the
 *    scrubbed message plus the Postgres code and constraint, never `detail`
 *    (which quotes the conflicting value) and never `params`.
 *
 * Deliberately a leaf module with no imports, so a repository can use it
 * without joining an import cycle.
 */

const PARAMS_MARKER = '\nparams: ';
const REDACTED = '[redacted]';

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  params?: unknown;
  query?: unknown;
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
};

function scrubMessage(message: string): string {
  const at = message.indexOf(PARAMS_MARKER);
  return at < 0 ? message : `${message.slice(0, at)}${PARAMS_MARKER}${REDACTED}`;
}

function scrubStack(stack: string, name: string, originalMessage: string | null): string {
  // Exact header first: `${name}: ${message}` is how V8 starts the stack.
  if (originalMessage !== null) {
    const header = `${name}: ${originalMessage}`;
    if (stack.startsWith(header)) {
      return `${name}: ${scrubMessage(originalMessage)}${stack.slice(header.length)}`;
    }
  }
  // Fallback: cut from the marker to the first frame line.
  const at = stack.indexOf(PARAMS_MARKER);
  if (at < 0) return stack;
  const frames = stack.indexOf('\n    at ', at + PARAMS_MARKER.length);
  const tail = frames < 0 ? '' : stack.slice(frames);
  return `${stack.slice(0, at)}${PARAMS_MARKER}${REDACTED}${tail}`;
}

function looksLikeQueryError(e: ErrorLike): boolean {
  return (
    (typeof e.query === 'string' && 'params' in e) ||
    (typeof e.message === 'string' && e.message.includes(PARAMS_MARKER)) ||
    (typeof e.stack === 'string' && e.stack.includes(PARAMS_MARKER))
  );
}

/**
 * Scrub a query error's bound values in place and return the same object.
 * Idempotent, never throws, and leaves any other error untouched. Follows
 * `cause` a few levels, because a transaction may rethrow a wrapped error.
 */
export function redactQueryError<T>(error: T, depth = 0): T {
  if (!error || typeof error !== 'object' || depth > 3) return error;
  const e = error as ErrorLike;
  try {
    if (looksLikeQueryError(e)) {
      const originalMessage = typeof e.message === 'string' ? e.message : null;
      const name = typeof e.name === 'string' ? e.name : 'Error';
      if (typeof e.stack === 'string') e.stack = scrubStack(e.stack, name, originalMessage);
      if (originalMessage !== null) e.message = scrubMessage(originalMessage);
      if ('params' in e) e.params = REDACTED;
    }
  } catch {
    // A frozen or accessor-only error: nothing to do here. The log lines use
    // `safeErrorFields`, which never prints the object itself.
  }
  if (e.cause && e.cause !== error) redactQueryError(e.cause, depth + 1);
  return error;
}

export type SafeErrorFields = {
  error: string;
  pgCode?: string;
  constraint?: string;
  cause?: string;
};

/**
 * What a catch block may log about an error: its scrubbed message, and the
 * Postgres code and constraint (from the error or its `cause`). Never the
 * object, `params`, or `detail`.
 */
export function safeErrorFields(error: unknown): SafeErrorFields {
  if (!error || typeof error !== 'object') return { error: String(error) };
  redactQueryError(error);
  const e = error as ErrorLike;
  const cause = (e.cause && typeof e.cause === 'object' ? e.cause : {}) as ErrorLike;
  const name = typeof e.name === 'string' ? e.name : 'Error';
  const message = typeof e.message === 'string' ? scrubMessage(e.message) : '';
  const pgCode = typeof e.code === 'string' ? e.code : typeof cause.code === 'string' ? cause.code : undefined;
  const constraint =
    typeof e.constraint === 'string'
      ? e.constraint
      : typeof cause.constraint === 'string'
        ? cause.constraint
        : undefined;
  const fields: SafeErrorFields = { error: message ? `${name}: ${message}` : name };
  if (pgCode) fields.pgCode = pgCode;
  if (constraint) fields.constraint = constraint;
  if (typeof cause.message === 'string' && cause !== e) fields.cause = scrubMessage(cause.message);
  return fields;
}
