import type { AgencyPrApproveStatus } from './pr.model.js';

/**
 * THE ONE-YEAR TIE RULE (owner, 20 Nov 2026 — "Keep rule, real admin request").
 *
 * An agency may let a PR go on its own — Manage PR → Detach — once that PR has
 * been on its roster for a year. Under a year, the agency ASKS the InnocenZ
 * admin instead (`POST /pr/:id/detach-request`), and only the admin's approval
 * ends the membership.
 *
 * Pure, so the boundary is tested without a database (pr-detach-rules.test.ts).
 * The website asks the same question of the same date (`isPrTiedUnderOneYear`,
 * agency-portal/lib/agency-pr-flags.ts) to choose which button to offer — but
 * only THIS answer decides anything: a stale screen offering Detach to a PR
 * tied eight months is refused here in words.
 */
export const TIED_MIN_DAYS = 365;
const TIED_MIN_MS = TIED_MIN_DAYS * 86_400_000;

/** A membership that is still on the roster — the only kind there is to detach. */
export const LIVE_MEMBERSHIP: readonly AgencyPrApproveStatus[] = ['approved', 'leave_pending'];

export function isLiveMembership(status: AgencyPrApproveStatus | null | undefined): boolean {
  return !!status && LIVE_MEMBERSHIP.includes(status);
}

type TiedDates = { approvedAt?: Date | null; createdAt: Date };

/**
 * When the PR became tied to this agency.
 *
 * `approved_at` (migration 0171) is stamped by a trigger on every path that
 * approves a membership. `created_at` is the fallback, and the same date the
 * migration back-filled from: it is the EARLIEST the approval can have been,
 * so a stale one only ever makes a PR look tied longer — never shorter.
 */
export function tiedSince(membership: TiedDates): Date {
  return membership.approvedAt ?? membership.createdAt;
}

/** True while the PR has been on this roster for less than a year. */
export function tiedUnderOneYear(membership: TiedDates, now: Date = new Date()): boolean {
  return now.getTime() - tiedSince(membership).getTime() < TIED_MIN_MS;
}

/** The day the agency may detach on its own — for the refusal's wording. */
export function detachableFrom(membership: TiedDates): Date {
  return new Date(tiedSince(membership).getTime() + TIED_MIN_MS);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * `DELETE /pr/:id` on a PR tied under a year. Plain words, and it names what
 * to press instead, because the website shows this sentence as it is.
 */
export function underOneYearRefusal(membership: TiedDates): string {
  return (
    `This PR joined your agency on ${ymd(tiedSince(membership))}, less than a year ago, ` +
    `so only the InnocenZ admin can detach them before ${ymd(detachableFrom(membership))}. ` +
    'Press Detach again and submit an admin request.'
  );
}

/** `POST /pr/:id/detach-request` for a PR the agency may detach itself. */
export const NO_REQUEST_NEEDED =
  'This PR has been with your agency for a year or more — Detach removes them directly, no admin request needed.';

/** A second request while one is still waiting. */
export const ALREADY_REQUESTED =
  'A detach request for this PR is already waiting for the InnocenZ admin.';

/** The membership is not live (already left, never approved). */
export const NOT_ON_ROSTER = 'This PR is no longer on your agency roster.';

/** The filing's own success line, shown as the agency's confirmation. */
export function requestFiledMessage(prName: string): string {
  return `Detach request sent for ${prName} — the InnocenZ admin will review it.`;
}

/** The admin approved: what the admin reads, and what the agency is told. */
export function approvedMessage(prName: string, agencyName: string): string {
  return `${prName} is detached from ${agencyName}.`;
}

/** The admin declined: what the admin reads, and what the agency is told. */
export function declinedMessage(prName: string, agencyName: string): string {
  return `Detach request declined — ${prName} stays on ${agencyName}.`;
}

/** Approve on a request whose PR has already left the roster by another path. */
export const NOTHING_TO_DETACH =
  'This PR is no longer on that agency roster, so there is nothing to detach — decline the request instead.';

/** Resolve is the price inboxes' "yes"; a detach is answered Approve or Decline. */
export const ANSWER_WITH_APPROVE_OR_DECLINE =
  'A detach request is answered with Approve or Decline.';

/** Filing one through the generic inbox would skip every check above. */
export const FILE_FROM_MANAGE_PR =
  'Detach requests are sent from Manage PR — open the PR and press Detach.';
