/**
 * THE PURE RULES BEHIND `cleanup-test-data-29sep.ts` — no database, no env.
 *
 * Split out so every selection the clean-up makes is pinned by a unit test
 * (`cleanup-test-data-29sep-rules.test.ts`) instead of being trusted because a
 * dry run happened to print the expected rows. The house shape:
 * `migration-order.ts` beside `check-migration-order.ts`.
 *
 * Where a rule already exists in the app, this module CALLS it rather than
 * re-deriving it — the billing calendar (`billingPeriodsFor`), the notice
 * comparison (`sameJson`, `REPEAT_WINDOW_MS`) — so the clean-up and the live
 * code cannot disagree about what a period or a repeat is.
 */
import { billingPeriodsFor, klDayOf } from '@/features/subscription-invoice/subscription-period';
import { sameJson } from '@/features/notification/repeat-delivery';
import { looksLikeTestDatabase, TEST_DB_ACK_FLAG } from './test-database-guard';

// ─── Arguments ───────────────────────────────────────────────────────────────

export type CleanupArgs = {
  apply: boolean;
  /** Category keys or numbers from `--only=a,b`; null = the default set. */
  only: string[] | null;
  /** `--keep-shift=<id>` — which of the duplicate shifts survives. */
  keepShift: string | null;
  help: boolean;
  /** `--i-know-this-is-a-test-db` — required beside `--apply` (see `applyRefusal`). */
  ackTestDb: boolean;
};

/**
 * Parses the command line. An UNKNOWN flag is an error, never ignored: a typo
 * such as `--onyl=...` beside `--apply` would otherwise quietly widen the run to
 * every category.
 */
export function parseCleanupArgs(
  argv: readonly string[],
): { ok: true; args: CleanupArgs } | { ok: false; error: string } {
  const args: CleanupArgs = { apply: false, only: null, keepShift: null, help: false, ackTestDb: false };
  for (const raw of argv) {
    if (raw === '--apply') args.apply = true;
    else if (raw === TEST_DB_ACK_FLAG) args.ackTestDb = true;
    else if (raw === '--help' || raw === '-h') args.help = true;
    else if (raw.startsWith('--only=')) {
      const tokens = raw
        .slice('--only='.length)
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
      if (tokens.length === 0) return { ok: false, error: '--only= names no category' };
      args.only = [...(args.only ?? []), ...tokens];
    } else if (raw.startsWith('--keep-shift=')) {
      const value = raw.slice('--keep-shift='.length).trim().toLowerCase();
      if (!/^[0-9a-f-]{8,36}$/.test(value)) {
        return { ok: false, error: '--keep-shift= takes a shift id (at least its first 8 characters)' };
      }
      args.keepShift = value;
    } else if (raw.startsWith('-')) {
      return { ok: false, error: `unknown flag ${raw} (see --help)` };
    }
  }
  return { ok: true, args };
}

/**
 * Why `--apply` must not run, or null when it may (security review, 29 Sep
 * 2026). The house two-part guard (`test-database-guard.ts`): an explicit
 * acknowledgement flag, so a destructive run can never start from shell history
 * or a copied command line, AND a database whose name carries a `test` token,
 * so the flag pasted against production still stops. A dry run needs neither —
 * it is one READ ONLY transaction.
 */
export function applyRefusal(input: {
  apply: boolean;
  ackTestDb: boolean;
  databaseName: string | null | undefined;
}): string | null {
  if (!input.apply) return null;
  if (!input.ackTestDb) {
    return `refusing --apply: pass ${TEST_DB_ACK_FLAG} as well — this deletes and rewrites rows, so it never starts from shell history or a copied line`;
  }
  if (!looksLikeTestDatabase(input.databaseName)) {
    return `refusing --apply: database "${input.databaseName ?? '(unset)'}" is not a test database`;
  }
  return null;
}

export type CategoryRef = { key: string; num: string; defaultOn: boolean };

/**
 * The categories a run covers, in catalogue order. Without `--only` it is the
 * default set; an opt-in category runs only when it is named.
 */
export function resolveCategoryKeys(
  only: string[] | null,
  catalogue: readonly CategoryRef[],
): { ok: true; keys: string[] } | { ok: false; error: string } {
  if (!only) return { ok: true, keys: catalogue.filter((c) => c.defaultOn).map((c) => c.key) };
  const wanted = new Set<string>();
  for (const token of only) {
    const hit = catalogue.find((c) => c.key === token || c.num === token);
    if (!hit) {
      return {
        ok: false,
        error: `unknown category "${token}" — one of: ${catalogue.map((c) => `${c.num}=${c.key}`).join(', ')}`,
      };
    }
    wanted.add(hit.key);
  }
  return { ok: true, keys: catalogue.filter((c) => wanted.has(c.key)).map((c) => c.key) };
}

// ─── Printing without personal data ─────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Job and script stamps seen in `created_by` / `updated_by`. */
const SYSTEM_ACTORS = new Set(['system', 'probe', 'seed-sample', 'backfill-a']);
/** kebab-case with at least one dash — `weekly-payout-job`, `migration-0034`. */
const SCRIPT_ACTOR_RE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/i;

/**
 * An audit-column value safe to print: an account id or a job/script stamp.
 * Anything else — an e-mail, a typed name — prints as `(person)`, because some
 * legacy rows stamped a person's e-mail into `updated_by`.
 */
export function safeActor(value: string | null | undefined): string {
  if (!value) return '—';
  if (UUID_RE.test(value)) return value;
  if (SYSTEM_ACTORS.has(value.toLowerCase()) || SCRIPT_ACTOR_RE.test(value)) return value;
  return '(person)';
}

// ─── Category 9: race spellings ─────────────────────────────────────────────

/**
 * The spelling the app itself prints for each race — the English values of
 * `races` in apps/web/src/lib/portal-i18n/translations.ts, which `raceLabel()`
 * maps every stored spelling onto (and which the demo roster uses). The
 * lower-case form is only that map's lookup KEY. Mirrored, not imported: the
 * backend cannot import the web app.
 */
export const CANONICAL_RACES = [
  'Chinese',
  'Malay',
  'Indian',
  'Indonesian',
  'Thai',
  'Vietnamese',
  'Filipino',
  'Other',
] as const;

const RACE_BY_KEY = new Map<string, string>(CANONICAL_RACES.map((race) => [race.toLowerCase(), race]));

/** The canonical spelling of a stored race, or null when it is not one the app knows. */
export function canonicalRace(raw: string | null | undefined): string | null {
  return RACE_BY_KEY.get((raw ?? '').trim().toLowerCase()) ?? null;
}

/**
 * The value to write, or null to leave the row alone. Free text the app does
 * not recognise is NEVER rewritten — inventing a race is worse than a variant.
 */
export function raceRewrite(raw: string | null | undefined): string | null {
  const canonical = canonicalRace(raw);
  return canonical !== null && canonical !== raw ? canonical : null;
}

// ─── Categories 2 + 3: seeded billing anchors ───────────────────────────────

/** The stamp `seed-sample-activity.ts` writes on every row it creates. */
export const SEED_ACTOR = 'seed-sample';

/**
 * A billing anchor that cannot be true: a seed-sample ledger row, relinked to a
 * real organisation, whose meter "starts" before that organisation existed.
 */
export function isFictionalSeedAnchor(row: {
  createdBy: string;
  billingStartsAt: Date | null;
  orgCreatedAt: Date | null;
}): boolean {
  return (
    row.createdBy === SEED_ACTOR &&
    row.billingStartsAt !== null &&
    row.orgCreatedAt !== null &&
    row.billingStartsAt.getTime() < row.orgCreatedAt.getTime()
  );
}

/** One `member_subscription` row of one billing lane. */
export type LaneRow = {
  startedAt: Date;
  endedAt: Date | null;
  billingStartsAt: Date | null;
  billingCycle: string;
  /** Treated as unanchored — the state the seed-anchors category leaves it in. */
  fictionalAnchor: boolean;
};

/** Far enough ahead that `billingPeriodsFor` always reaches the lane's first period. */
const OPEN_END_DAY = '9999-12-31';

/**
 * Where a lane's billing calendar STARTS once fictional anchors are withdrawn —
 * mirroring `generateMissing`: rows that ended on or before the KL day they
 * started are dropped, the anchor is the earliest `billing_starts_at` left, the
 * cycle is the latest row's, and the first period comes from the same
 * `billingPeriodsFor` the invoice job walks.
 *
 * `firstPeriodStart: null` means the lane has no anchor at all — the job then
 * bills NOTHING on it, so every invoice it holds is outside its calendar.
 */
export function laneCalendarStart(rows: readonly LaneRow[]): {
  anchor: Date | null;
  firstPeriodStart: string | null;
} {
  const held = rows.filter((row) => !(row.endedAt && klDayOf(row.endedAt) <= klDayOf(row.startedAt)));
  const ordered = [...held].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const latest = ordered[ordered.length - 1];
  const anchor = ordered.reduce<Date | null>((earliest, row) => {
    const own = row.fictionalAnchor ? null : row.billingStartsAt;
    return own && (!earliest || own < earliest) ? own : earliest;
  }, null);
  if (!latest || !anchor) return { anchor: null, firstPeriodStart: null };
  const [first] = billingPeriodsFor({
    billingCycle: latest.billingCycle,
    startedAt: anchor,
    endedAt: null,
    today: OPEN_END_DAY,
    maxPeriods: 1,
  });
  return { anchor, firstPeriodStart: first?.periodStart ?? null };
}

/**
 * Is this invoice's period one the lane's (corrected) calendar would never have
 * opened? Such a period exists only because a fictional anchor stretched the
 * calendar backwards — and, once that anchor is withdrawn, the nightly job
 * cannot mint it again.
 */
export function isBeforeLaneCalendar(periodStart: string, firstPeriodStart: string | null): boolean {
  return firstPeriodStart === null || periodStart < firstPeriodStart;
}

/**
 * Categories 3 and 3b VOID these invoices now — they used to DELETE them
 * (owner, 29 Sep 2026: "Add Void"; migration 0169). A void keeps the row and
 * the record of what was once charged, and keeps the period's slot taken so the
 * nightly job can never mint it again. The reason is written onto the bill's
 * own note ("Voided: …") by the app's `voidNote`.
 */
export const SEED_INVOICE_VOID_REASON =
  'billed from a test anchor before the organisation existed (29 Sep 2026 test-data clean-up)';
export const GAP_INVOICE_VOID_REASON =
  'billed for weeks the organisation held no plan on this lane (29 Sep 2026 test-data clean-up)';

/**
 * What the clean-up does with one pre-calendar invoice. Stricter than the
 * admin's Void on purpose — ANY attempt row leaves it, not only a live or a
 * settled one — because a script acting on a whole category must never be the
 * thing that decides an ambiguous case.
 */
export function preCalendarInvoiceAction(invoice: {
  status: string;
  payments: number;
  creditRefs: number;
}): 'void' | 'already-void' | 'leave' {
  if (invoice.status === 'void') return 'already-void';
  if (invoice.status !== 'unpaid' || invoice.payments > 0 || invoice.creditRefs > 0) return 'leave';
  return 'void';
}

// ─── Category 4: the duplicate shift ────────────────────────────────────────

export type ShiftCandidate = {
  id: string;
  /** Rows that mean the shift was WORKED or costed — assignments, sales, cut-loss, swaps, … */
  substantive: number;
};

export type ShiftChoice =
  | { kind: 'keep'; keep: string; drop: string; reason: string }
  | { kind: 'tie'; reason: string }
  | { kind: 'refuse'; reason: string };

/** Does `flag` name this shift — its full id, or a prefix of at least 8 characters? */
function names(flag: string, id: string): boolean {
  return flag.length >= 8 && id.toLowerCase().startsWith(flag.toLowerCase());
}

/**
 * Which of two duplicate shifts to keep. The owner's rule: keep the one with
 * work or money attached. When BOTH are bare the rule cannot choose, so nothing
 * is deleted unless `--keep-shift` names the survivor. The shift that goes must
 * carry nothing substantive — deleting it cascades.
 */
export function chooseShiftToKeep(
  a: ShiftCandidate,
  b: ShiftCandidate,
  keepFlag: string | null,
): ShiftChoice {
  if (keepFlag) {
    const keepA = names(keepFlag, a.id);
    const keepB = names(keepFlag, b.id);
    if (keepA === keepB) {
      return { kind: 'refuse', reason: `--keep-shift=${keepFlag} names neither (or both) of the pair` };
    }
    const [keep, drop] = keepA ? [a, b] : [b, a];
    if (drop.substantive > 0) {
      return {
        kind: 'refuse',
        reason: `the shift --keep-shift would delete (${drop.id}) carries ${drop.substantive} attached row(s)`,
      };
    }
    return { kind: 'keep', keep: keep.id, drop: drop.id, reason: 'named by --keep-shift' };
  }
  if (a.substantive === b.substantive) {
    return a.substantive === 0
      ? { kind: 'tie', reason: 'neither shift has assignments, sales or money attached' }
      : { kind: 'refuse', reason: 'both shifts carry work — owner decides' };
  }
  const [keep, drop] = a.substantive > b.substantive ? [a, b] : [b, a];
  if (drop.substantive > 0) {
    return { kind: 'refuse', reason: 'both shifts carry work — owner decides' };
  }
  return { kind: 'keep', keep: keep.id, drop: drop.id, reason: `only ${keep.id} has work attached` };
}

// ─── Category 8: notices delivered twice ────────────────────────────────────

export type NoticeRow = {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  payload: unknown;
  createdAt: Date;
  readAt: Date | null;
};

export type NoticeGroup = {
  keep: NoticeRow;
  /** Later copies of the same notice — the clean-up deletes these. */
  drop: NoticeRow[];
  /** Copies the person READ while the kept original is unread — left alone. */
  leftRead: NoticeRow[];
};

function sameNotice(a: NoticeRow, b: NoticeRow): boolean {
  return (
    a.userId === b.userId &&
    a.kind === b.kind &&
    a.title === b.title &&
    (a.body ?? null) === (b.body ?? null) &&
    sameJson(a.payload ?? null, b.payload ?? null)
  );
}

/**
 * ONE event delivered more than once: the same user, kind, title, body and
 * payload, landing within `windowMs` of the FIRST copy. The first copy is kept.
 *
 * Unlike the live guard (`isRepeatDelivery`), this does not require the copy to
 * follow the original directly: on 13 Sep two backend processes interleaved the
 * tier statements and the day-review notices, so an original and its copy can
 * have a different notice between them.
 */
export function groupRepeatNotices(rows: readonly NoticeRow[], windowMs: number): NoticeGroup[] {
  const ordered = [...rows].sort(
    (a, b) =>
      a.userId.localeCompare(b.userId) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  const groups: NoticeGroup[] = [];
  for (const row of ordered) {
    const group = groups.find(
      (g) =>
        sameNotice(g.keep, row) &&
        row.createdAt.getTime() - g.keep.createdAt.getTime() <= windowMs,
    );
    if (!group) {
      groups.push({ keep: row, drop: [], leftRead: [] });
      continue;
    }
    if (row.readAt !== null && group.keep.readAt === null) group.leftRead.push(row);
    else group.drop.push(row);
  }
  return groups.filter((g) => g.drop.length > 0 || g.leftRead.length > 0);
}
