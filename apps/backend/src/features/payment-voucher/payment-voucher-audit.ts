/**
 * Does a voucher agree with the records it was BUILT FROM?
 *
 * `payment-voucher-balance.ts` already answers a narrower question — does the
 * voucher add up against itself. It cannot catch a voucher that adds up
 * perfectly and is still wrong: 700.00 of wages for a day nobody worked sums
 * exactly as well as 700.00 for a day they did.
 *
 * So this module never reads the voucher's own arithmetic. It takes the PRIMARY
 * records — the shift assignments with their statuses, sealed pay and attendance
 * stamps, and the receipts behind the commission — and asks whether each line
 * can be justified by one of them. Everything it reports was found by hand on
 * live data on 31 Jul 2026 (TEST_SCRIPT §8 X36): a week genuinely worth RM703.60
 * that produced two vouchers totalling RM2,285.08, the `sent` one being wrong.
 *
 * ⚠️ WHERE THIS HAS TO RUN — the audit page and the original write-up both said
 * "one assertion AT GENERATION TIME would have caught every fault". Re-deriving
 * from the code shows that is false, and following it would have put this check
 * in the one place none of the faults can reach:
 *
 *   - `listCompletedForAgencyWeek` already filters `status='completed'` AND
 *     `shift_date BETWEEN weekStart AND weekEnd`, so the weekly generator can
 *     emit neither an unworked day nor an out-of-week line.
 *   - Every fault on PV-000002 came from the PR SELF-LOG path (`addMyLine` /
 *     `addMyReceipt`), which appends to a draft with a CLIENT-SUPPLIED
 *     `lineDate` and no window check at all.
 *
 * Hence `auditVoucher` for the whole-voucher sweep (generation, and any
 * after-the-fact check), and `checkLineAgainstWeek` for the per-write guard the
 * self-log paths need. One rule, two entry points, so they cannot drift.
 *
 * ALL arithmetic is in integer cents, via toCents() from the balance module, for
 * the reason set out there: a checker that repeats the float bug it exists to
 * catch will agree with it.
 *
 * Nothing here writes and nothing here throws. It reports; the caller decides.
 * A voucher is never withheld on a finding — a wrong row an agency can see beats
 * one silently deleted, which is the call the generator already makes for an
 * imbalanced voucher.
 */

import { toCents, formatCents } from './payment-voucher-balance';

/**
 * Hours in a standard shift, before overtime starts.
 *
 * ⚠️ Deliberately duplicated from `apps/mobile/src/lib/pr-rate.ts`, which cannot
 * be imported across app boundaries. The phone computes the OT it DISPLAYS; this
 * bounds the OT that reaches a voucher. They must agree — if one changes, change
 * both. The DB column behind it is `outlet_tier_rate.standard_shift_hours`; when
 * that reaches the assignment payload, both copies should read it instead.
 */
export const STANDARD_SHIFT_HOURS = 6;

/** The longest a single shift can plausibly run; past this the stamps describe something else. */
export const MAX_PLAUSIBLE_SHIFT_HOURS = 16;

/** Overtime is paid at 1.5x the derived hourly rate. */
export const OT_MULTIPLIER = 1.5;

/**
 * How far a line's amount may sit from the record behind it before it is a
 * finding. One cent absorbs rounding at the numeric(12,2) boundary; anything
 * larger is a real disagreement, not a representation artefact.
 */
const AMOUNT_TOLERANCE_CENTS = 1;

/** A voucher line as the DB returns it: numeric columns are strings. */
export type AuditLine = {
  id?: string | null;
  lineDate: string | null;
  description?: string | null;
  amount: string | number | null;
  quantity?: number | string | null;
  component?: string | null;
  ref?: string | null;
};

/**
 * One shift assignment — the primary record a wages line must answer to.
 * `payAmount` is the tier wage SEALED onto the assignment at check-out, so
 * comparing against it also proves the voucher did not re-derive a different
 * number later.
 */
export type AuditAssignment = {
  id: string;
  shiftDate: string;
  /** Assignment status; only 'completed' can justify wages. */
  status: string;
  payAmount: string | number | null;
  checkInAt: Date | string | null;
  checkOutAt: Date | string | null;
  /**
   * The overtime claim RECORDED at check-out, before the clamp (migration 0077).
   *
   * These two are load-bearing for the overtime budget below, not decoration.
   * Check-out clamps `checkOutAt` to the shift's scheduled end, so on a shift
   * that genuinely ran late the stamps describe a shift that finished on time —
   * and a budget derived from them is 0. Without these columns every approved
   * hour of overtime would be reported as money the stamps cannot justify.
   */
  overtimeMinutes?: number | null;
  /** 'pending' | 'approved' | 'rejected', or null when there was no claim. */
  overtimeStatus?: string | null;
};

/** One receipt behind the commission lines, as stored. */
export type AuditReceipt = {
  receiptNo: string;
  orderNo: string | null;
  shiftAssignmentId?: string | null;
};

export type AuditVoucher = {
  id?: string | null;
  voucherNo?: string | null;
  weekStart: string;
  weekEnd: string;
};

/** A single finding. `code` is stable for tests and log greps; `message` is for people. */
export type AuditFinding = {
  code:
    | 'wages_without_completed_shift'
    | 'wages_amount_mismatch'
    | 'completed_shift_without_wages'
    | 'line_outside_week'
    /** The line's date disagrees with the shift its own `ref` names. */
    | 'line_date_contradicts_shift'
    | 'duplicate_order_no'
    | 'overtime_exceeds_shift_window'
    | 'duplicate_voucher_for_week'
    | 'unreadable_amount';
  message: string;
  /** The offending line, when the finding is about one. */
  lineId?: string | null;
  lineDate?: string | null;
};

export type AuditReport = {
  ok: boolean;
  findings: AuditFinding[];
  /** Reasons only, for logging beside the balance report's `problems`. */
  problems: string[];
};

/**
 * Characters OCR confuses, folded to one representative each.
 *
 * `ORD0389` and `ORDO389` are the same paper receipt — letter O read as digit
 * zero — and the exact-match dedupe saw two orders and paid the drink twice.
 * The fold is deliberately ONE-WAY and lossy: it exists to decide "same paper?",
 * never to reconstruct what was printed. The stored `order_no` keeps whatever
 * OCR actually read.
 *
 * Case is folded too and separators dropped, so `ord-0389` matches as well.
 */
const OCR_CONFUSABLES: ReadonlyArray<readonly [RegExp, string]> = [
  [/[oO]/g, '0'],
  [/[iIlL]/g, '1'],
  [/[sS]/g, '5'],
  [/[bB]/g, '8'],
  [/[zZ]/g, '2'],
];

/**
 * The comparison key for an order number.
 *
 * Returns '' for nothing usable, and callers MUST treat '' as "cannot compare"
 * rather than as a key — otherwise every receipt with no order number would
 * collide with every other one and a whole week would read as duplicated.
 */
export function normaliseOrderNo(orderNo: string | null | undefined): string {
  if (!orderNo) return '';
  let key = orderNo.trim().replace(/[\s\-_/.]/g, '').toUpperCase();
  if (!key) return '';
  for (const [pattern, replacement] of OCR_CONFUSABLES) {
    key = key.replace(pattern, replacement);
  }
  return key;
}

/** Do two order numbers describe the same paper receipt? */
export function isSameOrderNo(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normaliseOrderNo(a);
  const right = normaliseOrderNo(b);
  return left !== '' && left === right;
}

/** Inclusive yyyy-MM-dd window test. ISO dates compare correctly as strings. */
export function isWithinWeek(
  date: string | null | undefined,
  weekStart: string,
  weekEnd: string,
): boolean {
  if (!date) return false;
  return date >= weekStart && date <= weekEnd;
}

/**
 * The per-write guard: may this line's date go on this voucher?
 *
 * Returns null when the line is fine, or the reason it is not — shaped for a
 * controller to return as a 400. This is the half of the rule that has to run on
 * the SELF-LOG paths, where `lineDate` arrives from the client; see the
 * placement note at the top of this file for why generation-time alone is not
 * enough.
 */
export function checkLineAgainstWeek(
  lineDate: string | null | undefined,
  voucher: { weekStart: string; weekEnd: string },
): string | null {
  if (isWithinWeek(lineDate, voucher.weekStart, voucher.weekEnd)) return null;
  return (
    `Date ${lineDate ?? '(none)'} is outside this voucher's week ` +
    `(${voucher.weekStart} to ${voucher.weekEnd}).`
  );
}

/**
 * A shift-assignment id embedded in a line's `ref`, or null if there isn't one.
 *
 * `ref` is not one format, which is why this matches a UUID anywhere in the
 * string rather than splitting on a separator:
 *   - the generator writes a bare assignment id
 *   - the self-log writes `wages|checkin|700.00|<uuid>|`
 *   - overtime writes `others|checkin|678.78|<uuid>-ot|` (suffix after the uuid)
 *   - a scanned drink writes `drinks|scan|30.00|ORD0389:0|drink` — no uuid, and
 *     correctly yields null: an order slip is not a claim about a shift.
 */
export function assignmentIdFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const match = ref.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * The check that was missing, and the direct cause of every fictional wage day:
 * a line whose `ref` names a shift assignment MUST be dated that shift's date.
 *
 * `checkLineAgainstWeek` cannot catch this and never could — the live fault was
 * wages dated 2026-07-28 whose ref named the 23 Jul assignment, and 28 Jul is
 * inside the same week, so the window guard passed it. The line carried its own
 * evidence and nothing compared the two.
 *
 * Returns null when fine, or the reason — shaped for a controller to 400.
 * Unknown ids return null deliberately: a ref pointing at an assignment we were
 * not given is a different fault (and one `auditVoucher` reports separately),
 * not grounds to refuse a write on a record we cannot see.
 */
export function checkLineAgainstShift(
  lineDate: string | null | undefined,
  ref: string | null | undefined,
  shiftDateById: ReadonlyMap<string, string>,
): string | null {
  const assignmentId = assignmentIdFromRef(ref);
  if (!assignmentId) return null;
  const shiftDate = shiftDateById.get(assignmentId);
  if (!shiftDate) return null;
  if (lineDate === shiftDate) return null;
  return (
    `Date ${lineDate ?? '(none)'} does not match the shift this line is for ` +
    `(assignment ${assignmentId} is on ${shiftDate}).`
  );
}

/**
 * Thrown when a line about to be WRITTEN contradicts the shift its own ref names.
 *
 * A distinct class rather than a plain Error because it is the one failure here
 * that is the caller's fault: every route that writes lines maps it to a 400,
 * and anything else out of the repository stays a 500. `reason` is carried
 * separately from `message` so the HTTP body matches the `checkLineAgainstWeek`
 * refusals these same routes already return — the two halves of one rule must
 * not drift into two error formats.
 */
export class LineDateConflictError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = 'LineDateConflictError';
    this.reason = reason;
  }
}

/** Elapsed hours between two stamps, or null when they cannot be trusted. */
function elapsedHours(from: Date | string | null, to: Date | string | null): number | null {
  if (!from || !to) return null;
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  const hours = (toMs - fromMs) / 3_600_000;
  // Out of order is as untrustworthy as impossibly long.
  if (hours <= 0 || hours > MAX_PLAUSIBLE_SHIFT_HOURS) return null;
  return hours;
}

/**
 * What N minutes of overtime are worth against a sealed daily wage, in cents.
 *
 * The ONE place this arithmetic lives. The rate is the daily wage over a
 * standard shift, times 1.5 — the same derivation the phone displays and the
 * approval endpoint freezes onto the assignment, so a PR, an agency and this
 * auditor can never quote three different figures for the same hour.
 *
 * Returns 0 rather than throwing on an unreadable or absent wage: a
 * commission-only PR has no daily wage at all, and that is not an error.
 */
export function overtimeAmountCents(
  payAmount: string | number | null | undefined,
  minutes: number | null | undefined,
): number {
  if (!minutes || minutes <= 0) return 0;
  let dailyWageCents: number;
  try {
    dailyWageCents = toCents(payAmount ?? 0);
  } catch {
    return 0;
  }
  if (dailyWageCents <= 0) return 0;
  const hourlyCents = dailyWageCents / STANDARD_SHIFT_HOURS;
  return Math.round((hourlyCents * OT_MULTIPLIER * minutes) / 60);
}

/**
 * The most overtime this assignment can justify, in cents.
 *
 * TWO sources, and the order matters. A row that carries an overtime DECISION
 * (migration 0077) is answered from that decision; only a row with no decision
 * at all falls back to deriving hours from the attendance stamps.
 *
 * ⚠️ The fallback cannot be the primary rule any more, and this is the trap that
 * would otherwise flag every legitimate approval. Check-out CLAMPS `checkOutAt`
 * to the shift's scheduled end — that is deliberate, it seals wages to the shift
 * window — so a PR who worked two hours late leaves stamps describing a shift
 * that finished exactly on time. Derived from those, the budget is 0, and the
 * approved `component='ot'` line reads as money invented out of a stamp gap.
 * The recorded minutes ARE the evidence the clamp destroys, which is the whole
 * reason check-out writes them.
 *
 * A claim that is `pending` or `rejected` budgets 0 on purpose: overtime becomes
 * money at approval and at no other moment, so a line that exists before the
 * agency decided is exactly the fault worth reporting.
 *
 * The stamp fallback stays for rows written before 0077 (and for any path that
 * does not record a claim), where returning 0 would raise a finding against a
 * voucher nobody can now explain. Stamps that cannot be trusted still yield 0
 * rather than a capped figure — at that point the record says nothing, and a
 * capped number is still invented money that lands on a voucher looking
 * deliberate.
 */
export function maxOvertimeCents(assignment: AuditAssignment): number {
  if (assignment.overtimeStatus != null) {
    if (assignment.overtimeStatus !== 'approved') return 0;
    return overtimeAmountCents(assignment.payAmount, assignment.overtimeMinutes);
  }

  const hours = elapsedHours(assignment.checkInAt, assignment.checkOutAt);
  if (hours === null) return 0;
  const overtimeHours = Math.max(0, hours - STANDARD_SHIFT_HOURS);
  if (overtimeHours === 0) return 0;

  return overtimeAmountCents(assignment.payAmount, overtimeHours * 60);
}

/**
 * Audits one voucher against its source records.
 *
 * `sources.assignments` should be EVERY assignment for this PR in this week
 * regardless of status — not just the completed ones. A wages line whose day has
 * an `assigned` row with no stamps is the exact fault this was written for, and
 * passing only completed rows would report it as "no record at all", which is
 * true but far less useful than "that day was never worked".
 */
export function auditVoucher(input: {
  voucher: AuditVoucher;
  lines: AuditLine[];
  sources: {
    assignments: AuditAssignment[];
    receipts?: AuditReceipt[];
    /** Other vouchers for the same PR + week. Non-empty is a finding. */
    siblingVouchers?: Array<{ id: string; voucherNo: string | null; status: string }>;
  };
}): AuditReport {
  const { voucher, lines, sources } = input;
  const findings: AuditFinding[] = [];
  const add = (finding: AuditFinding) => findings.push(finding);

  const assignmentsByDate = new Map<string, AuditAssignment[]>();
  for (const assignment of sources.assignments) {
    const list = assignmentsByDate.get(assignment.shiftDate) ?? [];
    list.push(assignment);
    assignmentsByDate.set(assignment.shiftDate, list);
  }

  // --- every line falls inside the voucher's own week -----------------------
  // Checked first and for every line, because a line six weeks out of range
  // makes every other comparison about it meaningless.
  for (const line of lines) {
    const reason = checkLineAgainstWeek(line.lineDate, voucher);
    if (reason) {
      add({
        code: 'line_outside_week',
        lineId: line.id,
        lineDate: line.lineDate,
        message: reason,
      });
    }
  }

  // --- a line's date agrees with the shift its own ref names -----------------
  // Strictly narrower than the week check above and NOT implied by it: the live
  // fault was wages dated 28 Jul whose ref named the 23 Jul assignment, which is
  // in-week and so passed. Reported separately from wages_without_completed_shift
  // because this names the CAUSE (the date contradicts the line's own evidence)
  // rather than the symptom (a day with no completed shift).
  const shiftDateById = new Map<string, string>(
    sources.assignments.map((a) => [a.id.toLowerCase(), a.shiftDate]),
  );
  for (const line of lines) {
    const reason = checkLineAgainstShift(line.lineDate, line.ref, shiftDateById);
    if (reason) {
      add({
        code: 'line_date_contradicts_shift',
        lineId: line.id,
        lineDate: line.lineDate,
        message: reason,
      });
    }
  }

  // --- wages lines reconcile against completed assignments ------------------
  const wagesLines = lines.filter((line) => line.component === 'wages');
  const justifiedAssignmentIds = new Set<string>();

  for (const line of wagesLines) {
    const sameDay = line.lineDate ? (assignmentsByDate.get(line.lineDate) ?? []) : [];
    const completed = sameDay.filter((a) => a.status === 'completed');

    if (completed.length === 0) {
      const what = sameDay.length
        ? `that day's assignment is '${sameDay.map((a) => a.status).join("', '")}'`
        : 'that day has no assignment at all';
      add({
        code: 'wages_without_completed_shift',
        lineId: line.id,
        lineDate: line.lineDate,
        message: `wages on ${line.lineDate ?? '(no date)'} but ${what} — nobody worked it`,
      });
      continue;
    }

    let lineCents: number;
    try {
      lineCents = toCents(line.amount);
    } catch (error) {
      add({
        code: 'unreadable_amount',
        lineId: line.id,
        lineDate: line.lineDate,
        message: `wages line amount is unreadable: ${(error as Error).message}`,
      });
      continue;
    }

    // Matched against ANY not-yet-claimed completed assignment on the day rather
    // than positionally: a PR may work several shifts in one day, and a wages
    // line carries no assignment id to pair with once the generator's bare ref
    // has been through an agency edit.
    const match = completed.find((assignment) => {
      if (justifiedAssignmentIds.has(assignment.id)) return false;
      try {
        return Math.abs(toCents(assignment.payAmount) - lineCents) <= AMOUNT_TOLERANCE_CENTS;
      } catch {
        return false;
      }
    });

    if (match) {
      justifiedAssignmentIds.add(match.id);
      continue;
    }

    const expected = completed
      .map((a) => {
        try {
          return formatCents(toCents(a.payAmount));
        } catch {
          return '(unreadable)';
        }
      })
      .join(' / ');
    add({
      code: 'wages_amount_mismatch',
      lineId: line.id,
      lineDate: line.lineDate,
      message:
        `wages ${formatCents(lineCents)} on ${line.lineDate ?? '(no date)'} matches no sealed ` +
        `pay for that day (assignment says ${expected})`,
    });
  }

  // The other direction: a completed shift with no wages line is unpaid work.
  // Same class of fault pointing the other way, and invisible to any check that
  // only walks the lines.
  for (const assignment of sources.assignments) {
    if (assignment.status !== 'completed') continue;
    if (justifiedAssignmentIds.has(assignment.id)) continue;
    if (!isWithinWeek(assignment.shiftDate, voucher.weekStart, voucher.weekEnd)) continue;
    add({
      code: 'completed_shift_without_wages',
      lineDate: assignment.shiftDate,
      message:
        `completed shift on ${assignment.shiftDate} (assignment ${assignment.id}) has no ` +
        'matching wages line — the PR worked it and is not being paid for it',
    });
  }

  // --- no duplicate order references ---------------------------------------
  // Compared on the OCR-folded key, scoped PER SHIFT: outlets reuse order
  // numbers across nights, so the same number on a different shift is a
  // different paper receipt — the same scoping findReceiptByOrderNo uses.
  const seenOrders = new Map<string, string>();
  for (const receipt of sources.receipts ?? []) {
    const key = normaliseOrderNo(receipt.orderNo);
    // '' means "cannot compare", never a key — see normaliseOrderNo.
    if (!key) continue;
    const scoped = `${receipt.shiftAssignmentId ?? 'no-shift'}::${key}`;
    const previous = seenOrders.get(scoped);
    if (previous) {
      add({
        code: 'duplicate_order_no',
        message:
          `receipts ${previous} and ${receipt.receiptNo} are the same order ` +
          `(${receipt.orderNo}) on one shift — counted twice`,
      });
      continue;
    }
    seenOrders.set(scoped, receipt.receiptNo);
  }

  // --- overtime is bounded by the shift window ------------------------------
  // A stamp gap is not hours worked. Budgeted per DAY rather than per line,
  // because a day may carry several OT lines that are individually plausible and
  // jointly impossible.
  const otByDate = new Map<string, { cents: number; lines: AuditLine[] }>();
  for (const line of lines) {
    if (line.component !== 'ot' || !line.lineDate) continue;
    let cents: number;
    try {
      cents = toCents(line.amount);
    } catch (error) {
      add({
        code: 'unreadable_amount',
        lineId: line.id,
        lineDate: line.lineDate,
        message: `overtime line amount is unreadable: ${(error as Error).message}`,
      });
      continue;
    }
    const bucket = otByDate.get(line.lineDate) ?? { cents: 0, lines: [] };
    bucket.cents += cents;
    bucket.lines.push(line);
    otByDate.set(line.lineDate, bucket);
  }

  for (const [date, bucket] of otByDate) {
    const budget = (assignmentsByDate.get(date) ?? [])
      .filter((a) => a.status === 'completed')
      .reduce((sum, assignment) => sum + maxOvertimeCents(assignment), 0);
    if (bucket.cents - budget <= AMOUNT_TOLERANCE_CENTS) continue;
    add({
      code: 'overtime_exceeds_shift_window',
      lineId: bucket.lines[0]?.id,
      lineDate: date,
      message:
        `overtime ${formatCents(bucket.cents)} on ${date} exceeds what the attendance ` +
        `stamps can justify (${formatCents(budget)}) — a stamp gap is not hours worked`,
    });
  }

  // --- one voucher per PR per week -----------------------------------------
  for (const sibling of sources.siblingVouchers ?? []) {
    if (voucher.id && sibling.id === voucher.id) continue;
    add({
      code: 'duplicate_voucher_for_week',
      message:
        `a second voucher exists for this PR and week: ${sibling.voucherNo ?? sibling.id} ` +
        `(${sibling.status}) — one of the two is a double payment`,
    });
  }

  return {
    ok: findings.length === 0,
    findings,
    problems: findings.map((f) => f.message),
  };
}
