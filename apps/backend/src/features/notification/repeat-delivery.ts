import type { NotificationKind } from './notification.model.js';

/**
 * How close together two identical notices must land to be ONE delivery made
 * twice rather than two events. Every duplicate on file arrived under a second
 * apart; the closest genuine repeat — a PR re-filing leave after the agency
 * refused it — came ten minutes after the first. Two minutes sits well clear of
 * both, and leaves room for two hosts whose clocks disagree by seconds.
 */
export const REPEAT_WINDOW_MS = 2 * 60 * 1000;

/** The fields that make two notices say the same thing. */
export type NoticeContent = {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
};

/**
 * Is `next` the notice `latest` already delivered?
 *
 * `latest` must be the recipient's MOST RECENT notification, of any kind, and
 * recent — the caller's query decides both. That ordering is what keeps a real
 * change of heart from being swallowed: accepted → declined → accepted again
 * repeats the first notice, but the latest one is the "declined" in between, so
 * the second "accepted" still goes out.
 *
 * And it must still be UNREAD. Every duplicate on file landed before anyone
 * could read the first; once the first HAS been read, the same words again are
 * a new call to act — a voucher re-sent after an Override the PR had already
 * signed says "sign again", and staying silent would leave her signature gone
 * with nothing telling her.
 *
 * Everything that is shown is compared — kind, title, body and payload — so two
 * different broadcasts from one agency, or two PRs' leave requests to one owner,
 * are never mistaken for each other.
 */
export function isRepeatDelivery(
  latest: NoticeContent & { readAt?: Date | string | null },
  next: NoticeContent,
): boolean {
  return (
    latest.readAt == null &&
    latest.kind === next.kind &&
    latest.title === next.title &&
    (latest.body ?? null) === (next.body ?? null) &&
    sameJson(latest.payload ?? null, next.payload ?? null)
  );
}

/**
 * Structural equality for a jsonb payload. Postgres hands jsonb keys back in its
 * own order, never the order they were written in, so a plain stringify of the
 * stored row and of the fresh input would disagree about the same object.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      // An `undefined` field is dropped by JSON on the way into the column.
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
