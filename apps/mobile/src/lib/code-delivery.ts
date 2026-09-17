/**
 * Pure helpers for the verification-code screens (Forgot password, Security →
 * change phone / email). No React, no network — unit-tested in
 * code-delivery.test.ts.
 *
 * The server sends ONE code to several channels at once and reports each
 * attempt with the destination already MASKED. These helpers turn that report
 * into the sentence the PR reads ("Code sent by WhatsApp and SMS to
 * +60 ••••• 6789 and by email to o••••@atlas-agency.my"), so she knows which
 * inbox to open — and, when nothing actually went out, says so instead of
 * leaving her waiting for a message that will never come.
 */
import { formatMessage, type AppTranslations } from '../i18n';
import type { CodeChannel, CodeDelivery } from './api';

type SecurityCopy = AppTranslations['security'];

/** Phone channels first, in the order the server tries them, then email. */
const CHANNEL_ORDER: readonly CodeChannel[] = ['whatsapp', 'sms', 'email'];

function countsAsReached(d: CodeDelivery): boolean {
  return d.status === 'sent' || d.status === 'logged';
}

/**
 * Did the code go anywhere at all? The SAME count `describeCodeDelivery` uses,
 * so a screen colouring that sentence (green "sent" vs red "not delivered")
 * can never disagree with the words.
 */
export function codeReachedSomewhere(
  sentTo: readonly CodeDelivery[] | null | undefined,
): boolean {
  return (sentTo ?? []).some(countsAsReached);
}

function channelLabel(channel: CodeChannel, copy: SecurityCopy): string {
  if (channel === 'whatsapp') return copy.channelWhatsapp;
  if (channel === 'sms') return copy.channelSms;
  return copy.channelEmail;
}

/**
 * Where the code went, in the reader's language.
 *
 * - Only `sent` and `logged` attempts count. A `skipped` or `failed` channel is
 *   left out rather than claimed: telling the PR to check SMS when SMS failed
 *   is how she ends up waiting for nothing.
 * - Channels that reached the SAME masked destination are grouped
 *   ("WhatsApp and SMS to +60 ••••• 6789").
 * - If every counted attempt was only `logged` (development: the server wrote
 *   the code to its log instead of delivering it), a second line says so.
 * - If nothing counted, the "could not be delivered" sentence.
 *
 * Masked destinations are carried across verbatim, never translated.
 */
export function describeCodeDelivery(
  sentTo: readonly CodeDelivery[] | null | undefined,
  copy: SecurityCopy,
): string {
  const reached = (sentTo ?? []).filter(countsAsReached);
  if (reached.length === 0) return copy.sentNowhere;

  const ordered = [...reached].sort(
    (a, b) => CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel),
  );
  const byDestination = new Map<string, CodeChannel[]>();
  for (const d of ordered) {
    const channels = byDestination.get(d.to) ?? [];
    if (!channels.includes(d.channel)) channels.push(d.channel);
    byDestination.set(d.to, channels);
  }

  const parts = [...byDestination].map(([to, channels]) =>
    formatMessage(copy.sentVia, {
      channels: channels.map((c) => channelLabel(c, copy)).join(copy.channelJoin),
      to,
    }),
  );
  const summary = formatMessage(copy.sentSummary, {
    parts: parts.join(copy.sentPartJoin),
  });

  const loggedOnly = reached.every((d) => d.status === 'logged');
  return loggedOnly ? `${summary}\n${copy.sentLoggedOnly}` : summary;
}

const COOLDOWN_MESSAGE = /^Wait (\d+)\s*s\b/i;

/**
 * Seconds until a resend is allowed, read off a thrown 429.
 *
 * The contract puts `{retryAfterSec}` in the envelope's `data`, which `ApiError`
 * keeps as `.data`; the message ("Wait 42s before requesting another code") is
 * the fallback. Duck-typed on purpose so this stays importable without the
 * network module. Returns null when the error carries no wait at all.
 */
export function retryAfterSeconds(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const data = (error as { data?: unknown }).data;
  if (data && typeof data === 'object') {
    const raw = (data as { retryAfterSec?: unknown }).retryAfterSec;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 0) return Math.ceil(n);
  }
  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string') {
    const match = COOLDOWN_MESSAGE.exec(message.trim());
    if (match) {
      const n = Number(match[1]);
      if (n > 0) return n;
    }
  }
  return null;
}

/** Whole minutes for "valid for {m} minutes" — never 0, so a 30 s code still reads as 1. */
export function minutesFromSeconds(seconds: number | null | undefined): number {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.max(1, Math.round(seconds / 60));
}

/** The form the server stores and compares: trimmed, lowercase. */
export function normalizeEmailInput(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Same shape check the profile form used — the server's zod email is the real gate. */
export function isPlausibleEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Exactly six digits — the only code shape any of these endpoints accept. */
export function isCompleteCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}
