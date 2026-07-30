/**
 * Short-lived, voucher-scoped download tickets.
 *
 * A phone cannot attach an Authorization header to a browser download, and
 * putting the session token in a URL would leak it into browser history and
 * server logs. So the app first POSTs (authenticated) for a ticket, then opens
 * a public URL carrying only this ticket: 128 random bits that name exactly
 * one voucher for five minutes. Kept in memory on purpose — a restart merely
 * invalidates pending downloads, and nothing durable should ever make a
 * bearer-credential table out of these.
 */
import { randomBytes } from 'node:crypto';

const TICKET_TTL_MS = 5 * 60_000;

const tickets = new Map<string, { voucherId: string; expiresAt: number }>();

function sweep(): void {
  const now = Date.now();
  for (const [key, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(key);
  }
}

export function issueExportTicket(voucherId: string): string {
  sweep();
  const ticket = randomBytes(16).toString('hex');
  tickets.set(ticket, { voucherId, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

/**
 * Valid until expiry rather than single-use: Android browsers commonly issue
 * a probe request before the real download, and burning the ticket on the
 * probe would make every download "expire" on first tap.
 */
export function redeemExportTicket(ticket: string): string | null {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    tickets.delete(ticket);
    return null;
  }
  return entry.voucherId;
}
