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
 * ⚠️ Scrubbing `params` is not the whole job. A provider's refusal ("550
 * <owner@x.my>: Recipient address rejected"), a Postgres message (`invalid
 * input syntax … "0123456789"`) and a unique violation's `detail` (`Key
 * (phone_num)=(+60123456789) already exists.`) all quote the value in plain
 * text. `maskContactText` masks emails and phone-length digit runs wherever
 * they sit, and both tools apply it.
 *
 * Deliberately a leaf module with no imports, so a repository can use it
 * without joining an import cycle.
 */

const PARAMS_MARKER = '\nparams: ';
const REDACTED = '[redacted]';

/**
 * Anything shaped like an address: local part, `@`, a dotted domain whose last
 * label starts with a letter — so a package path in a stack frame
 * (`drizzle-orm@0.45.1`) is not mistaken for one.
 *
 * ⚠️ EVERY PART IS LENGTH-BOUNDED, and that is what keeps masking LINEAR. The
 * unbounded `[…]+@` this replaced re-scanned a long run of local-part characters
 * that had no `@` from every start position — quadratic, on the event loop. A
 * 12,000-character non-uuid id in `GET /pr/:id` reached a 22P02 message that
 * `safeErrorFields` masks three times and stalled every request for half a
 * second (review, 17 Sep 2026). 64 and 63 are the RFC 5321 local-part and
 * RFC 1035 label limits, so no real address is cut short.
 */
const DOMAIN = '[A-Za-z0-9-]{1,63}(?:\\.[A-Za-z0-9-]{1,63})*\\.[A-Za-z][A-Za-z0-9-]{0,62}';
const EMAIL_SOURCE = `[A-Za-z0-9._%+-]{1,64}@${DOMAIN}`;

/**
 * Shapes made of digits that are never a contact, matched BEFORE a digit run
 * may start on them, so a log keeps what it needs to be read: a uuid, an ISO
 * date (with its time and zone), a clock time, an IPv4 address (with its port)
 * and a stack frame's `file.js:line:col` — a minified bundle's column runs to
 * seven digits.
 *
 * Each is anchored to its exact shape (month 01-12, octet 0-255, no digit
 * straight after), so a phone typed to resemble one — `0123-45-6789`,
 * `012.345.678.9` — does not pass as one.
 *
 * Two details that each broke a real line in testing:
 *  - an optional `(` in front — a digit run may START at `(`, and would
 *    otherwise swallow the first character of `Key (id)=(5f3c9a2e-…)` and then
 *    mask the rest of the uuid as a number;
 *  - an address this function already masked (`o••••@atlas123456789.my`):
 *    `redactQueryError` masks a message and `safeErrorFields` masks it again,
 *    and the second pass must not take the domain's digits for a phone.
 */
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const NOT_A_CONTACT_SOURCE = `\\(?(?:${[
  '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}',
  '(?:19|20)\\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])(?!\\d)' +
    '(?:[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?(?:Z|[+-]\\d{2}:?\\d{2}(?!\\d))?)?',
  '\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?(?!\\d)',
  `(?:${OCTET}\\.){3}${OCTET}(?!\\d|\\.\\d)(?::\\d{1,5})?`,
  '\\.[cm]?[jt]sx?:\\d+(?::\\d+)?',
  `••••@${DOMAIN}`,
].join('|')})`;

/**
 * A run of digits in ANY spelling a person gives a phone number: an optional
 * `+`, then digits joined by brackets, dots, hyphens (Unicode dashes too) and
 * up to three whitespace characters — `+60123456789`, `(012) 345-6789`,
 * `012.345.6789`, `+60 12  345 6789`.
 *
 * Deliberately NOT bounded by word characters: `0123456789abc` and
 * `phone_0123456789` are still the number. The run always matches (there is no
 * failing tail to backtrack from), so each run is scanned once; whether it is
 * long enough to mask is decided in `maskDigitRun`.
 */
const DIGIT_RUN_SOURCE = '\\+?\\(?\\+?\\d(?:[\\s().\\u2010-\\u2015-]{0,3}\\d)*';

/**
 * One pass, alternatives in priority order: an address, a protected shape, a
 * digit run. One pass rather than two so a digit run never starts inside an
 * address this pass is about to mask (`owner@atlas123456789.my`).
 */
const CONTACT_IN_TEXT = new RegExp(
  `(${EMAIL_SOURCE})|(${NOT_A_CONTACT_SOURCE})|(${DIGIT_RUN_SOURCE})`,
  'g',
);

/**
 * SEVEN digits is the floor: the shortest number a person types without an
 * area code (`345 6789`). The old floor of nine let the 8-digit value already
 * stored in `user.phone_num` through. Over-masking a count or an epoch in a log
 * is not a leak; a date, time, uuid, address or stack position is protected
 * above.
 */
const MIN_PHONE_DIGITS = 7;

function maskDigitRun(run: string, next: string | undefined): string {
  let head = run;
  let tail = '';
  // `0123456789 10:30` — the run swallowed the hour of the clock time after it.
  // Give the hour back so the tail kept below is the number's own.
  if (next === ':') {
    const hour = /\s+\d{1,2}$/.exec(run);
    if (hour) {
      head = run.slice(0, hour.index);
      tail = hour[0];
    }
  }
  const digits = head.replace(/\D/g, '');
  if (digits.length < MIN_PHONE_DIGITS) return run;
  // `(0198887777)` — the `)` is outside the run, so keep the `(` to match it.
  const open = /^\+?\(/.test(head) && !head.includes(')') ? '(' : '';
  return `${open}••••• ${digits.slice(-4)}${tail}`;
}

/**
 * Masks every email address and phone number inside free text, keeping just
 * enough to recognise it: the first character and the domain of an address
 * (`o••••@atlas-agency.my`, the `maskEmail` shape) and the last four digits of
 * a number (`••••• 6789`). Linear in the length of the text. Never throws;
 * anything that is not a string comes back as its `String()`.
 */
export function maskContactText(text: unknown): string {
  const value = typeof text === 'string' ? text : String(text);
  return value.replace(
    CONTACT_IN_TEXT,
    (match: string, email: string | undefined, keep: string | undefined, _run, offset: number) => {
      if (email !== undefined) {
        const at = email.lastIndexOf('@');
        return `${email[0]}••••${email.slice(at).toLowerCase()}`;
      }
      if (keep !== undefined) return keep;
      return maskDigitRun(match, value[offset + match.length]);
    },
  );
}

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  params?: unknown;
  query?: unknown;
  code?: unknown;
  constraint?: unknown;
  detail?: unknown;
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
 * Idempotent, never throws, and leaves any other error's message and stack
 * untouched. Follows `cause` a few levels, because a transaction may rethrow a
 * wrapped error.
 *
 * The plain-text copies are masked too (`maskContactText`), because drizzle
 * keeps the pg error as `cause` and winston serialises `cause` with its own
 * fields: a unique violation's `detail` quotes the email or phone that
 * collided, and a message like `invalid input syntax … "owner@x.my"` quotes the
 * bound value itself. `detail` is masked on every level; the message and stack
 * of an error UNDER a query error are masked as well. An error with no query
 * error above it keeps its message and stack.
 */
export function redactQueryError<T>(error: T, depth = 0, underQueryError = false): T {
  if (!error || typeof error !== 'object' || depth > 3) return error;
  const e = error as ErrorLike;
  const isQueryError = looksLikeQueryError(e);
  try {
    if (isQueryError) {
      const originalMessage = typeof e.message === 'string' ? e.message : null;
      const name = typeof e.name === 'string' ? e.name : 'Error';
      if (typeof e.stack === 'string') e.stack = scrubStack(e.stack, name, originalMessage);
      if (originalMessage !== null) e.message = scrubMessage(originalMessage);
      if ('params' in e) e.params = REDACTED;
    } else if (underQueryError) {
      if (typeof e.stack === 'string') e.stack = maskContactText(e.stack);
      if (typeof e.message === 'string') e.message = maskContactText(e.message);
    }
    if (typeof e.detail === 'string') e.detail = maskContactText(e.detail);
  } catch {
    // A frozen or accessor-only error: nothing to do here. The log lines use
    // `safeErrorFields`, which never prints the object itself.
  }
  if (e.cause && e.cause !== error) {
    redactQueryError(e.cause, depth + 1, underQueryError || isQueryError);
  }
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
 * object, `params`, or `detail` — and every email or phone number left in the
 * message text is masked (`maskContactText`).
 */
export function safeErrorFields(error: unknown): SafeErrorFields {
  if (!error || typeof error !== 'object') return { error: maskContactText(error) };
  redactQueryError(error);
  const e = error as ErrorLike;
  const cause = (e.cause && typeof e.cause === 'object' ? e.cause : {}) as ErrorLike;
  const name = typeof e.name === 'string' ? e.name : 'Error';
  const message = typeof e.message === 'string' ? maskContactText(scrubMessage(e.message)) : '';
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
  if (typeof cause.message === 'string' && cause !== e) {
    fields.cause = maskContactText(scrubMessage(cause.message));
  }
  return fields;
}
