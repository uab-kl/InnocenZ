import { describe, expect, it } from 'vitest';
import {
  computeHistoryExtras,
  HISTORY_LINE_COMPONENTS,
  type HistoryExtrasRows,
  type HistoryLineRow,
  type HistoryReceiptRow,
  type HistoryWindow,
  OWED_RECEIPT_STATUSES,
} from './history-extras';

/**
 * PARITY — THE ACCEPTANCE TEST FOR `GET /payment-voucher/history-extras`.
 *
 * Until 30 Sep 2026 the agency History computed these figures in the browser,
 * from one `GET /payment-voucher/:id` per voucher. The server now answers them
 * in one read, and the screen's figures must not move by a sen. So one
 * realistic agency is fed through BOTH:
 *
 *   OLD  the web's own code — `LEGACY_WEB` below, a FROZEN COPY of
 *        apps/web use-agency-history.ts (`detailIds`, the penalty map) and
 *        history-take-home.ts (`commissionSenByAssignment`, `voucherPenaltyRm`),
 *        removed from the web in the same change. Copied verbatim apart from
 *        the types; do not "fix" it — it is the reference, bugs included.
 *   NEW  `computeHistoryExtras`, fed exactly the rows the repository's SQL
 *        returns (the same predicates, applied to the fixture below).
 *
 * The SQL itself cannot run here. Its predicates are pinned by
 * history-extras.repository.test.ts, and the whole path was compared live,
 * read-only, on 30 Sep 2026: every agency lane with an account got the same
 * History header both ways (the test agency RM 15,108.58, cards 11,698.48 /
 * 3,414.60 / −4.50) from the same 11 vouchers.
 */

// ---------------------------------------------------------------------------
// LEGACY_WEB — frozen copy. Types narrowed to the fields read; logic verbatim.
// ---------------------------------------------------------------------------

type LegacyLine = { amount: string; component: string | null; receiptId: string | null };
type LegacyReceipt = { id: string; status: string; shiftAssignmentId: string | null };
type LegacyDetail = { id: string; lines: LegacyLine[]; receipts?: LegacyReceipt[] };
type LegacyPv = { id: string; prId?: string; weekStartIso?: string; weekEndIso?: string };

const LEGACY_WEB = (() => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isBackedVoucherId = (id: string | null): boolean => Boolean(id && UUID_RE.test(id));

  const OWED_RECEIPT_STATUSES: ReadonlySet<string> = new Set(['approved', 'verified']);

  function sen(rm: number | string | null | undefined): number {
    const n = Number(rm);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  function commissionSenByAssignment(
    vouchers: { lines: LegacyLine[]; receipts?: LegacyReceipt[] }[],
  ): Map<string, { drink: number; tip: number }> {
    const out = new Map<string, { drink: number; tip: number }>();
    for (const v of vouchers) {
      const receiptById = new Map((v.receipts ?? []).map((r) => [r.id, r]));
      for (const line of v.lines) {
        const isDrink = line.component === 'drink_commission';
        const isTip = line.component === 'tip_commission';
        if ((!isDrink && !isTip) || !line.receiptId) continue;
        const receipt = receiptById.get(line.receiptId);
        if (!receipt?.shiftAssignmentId) continue;
        if (!OWED_RECEIPT_STATUSES.has(receipt.status)) continue;
        const cur = out.get(receipt.shiftAssignmentId) ?? { drink: 0, tip: 0 };
        out.set(receipt.shiftAssignmentId, {
          drink: cur.drink + (isDrink ? sen(line.amount) : 0),
          tip: cur.tip + (isTip ? sen(line.amount) : 0),
        });
      }
    }
    return out;
  }

  function voucherPenaltyRm(lines: Pick<LegacyLine, 'amount' | 'component'>[]): number {
    const total = lines.reduce(
      (acc, l) => acc + (l.component === 'deduction' ? sen(l.amount) : 0),
      0,
    );
    return (0 - total) / 100;
  }

  /** use-agency-history.ts `detailIds`. */
  function detailIds(
    pvs: LegacyPv[],
    wageRows: { prId: string }[],
    fromDate: string,
    toDate: string,
  ): string[] {
    const ledgerPrs = new Set(wageRows.map((r) => r.prId));
    return pvs
      .filter((v) => {
        if (!v.prId || !ledgerPrs.has(v.prId)) return false;
        if (!isBackedVoucherId(v.id)) return false;
        if (!v.weekStartIso || !v.weekEndIso) return true;
        return v.weekEndIso.slice(0, 10) >= fromDate && v.weekStartIso.slice(0, 10) <= toDate;
      })
      .map((v) => v.id)
      .sort();
  }

  /** use-agency-history.ts `voucherDeductions`' penalty map. */
  function penaltyById(loadedDetails: LegacyDetail[]): Map<string, number> {
    return new Map(loadedDetails.map((d) => [d.id, voucherPenaltyRm(d.lines ?? [])]));
  }

  return { commissionSenByAssignment, detailIds, penaltyById };
})();

// ---------------------------------------------------------------------------
// The fixture — one agency's year, as the database holds it.
// ---------------------------------------------------------------------------

let seq = 0;
/** Deterministic uuids: the web only reads a voucher whose id IS a uuid. */
const uid = () => `00000000-0000-4000-8000-${(++seq).toString(16).padStart(12, '0')}`;

const AGENCY = uid();
const OTHER_AGENCY = uid();
const VICKY = uid();
const ALICE = uid();
const JK = uid();
const GONE = uid(); // worked for us, but not in this window
const GHOST = uid(); // booked by us on a shift we were never sent
const BELLA = uid(); // the other agency's PR

const WINDOW: HistoryWindow = { fromDate: '2025-09-29', toDate: '2026-09-29' };

type Shift = { id: string; day: string; invited: string[] };
const shift = (day: string, invited: string[] = [AGENCY]): Shift => ({ id: uid(), day, invited });
const S = {
  firstNight: shift('2025-09-30'),
  aug31: shift('2026-08-31'),
  shared: shift('2026-09-02', [AGENCY, OTHER_AGENCY]),
  sep08: shift('2026-09-08'),
  sep09: shift('2026-09-09'),
  sep15: shift('2026-09-15'),
  sep21: shift('2026-09-21'),
  sep28: shift('2026-09-28'),
  lastYear: shift('2025-08-05'),
  notOurs: shift('2026-09-10', [OTHER_AGENCY]),
};
const SHIFTS = Object.values(S);

type Assignment = { id: string; shiftId: string; prId: string; agencyId: string; status: string };
const booking = (s: Shift, prId: string, status = 'completed', agencyId = AGENCY): Assignment => ({
  id: uid(),
  shiftId: s.id,
  prId,
  agencyId,
  status,
});
const A = {
  vickySep08: booking(S.sep08, VICKY),
  vickySep09: booking(S.sep09, VICKY),
  vickySep15: booking(S.sep15, VICKY),
  aliceAug31: booking(S.aug31, ALICE),
  jkSep21: booking(S.sep21, JK),
  vickyFirstNight: booking(S.firstNight, VICKY),
  vickySep28: booking(S.sep28, VICKY),
  aliceShared: booking(S.shared, ALICE),
  goneLastYear: booking(S.lastYear, GONE),
  goneCancelled: booking(S.sep15, GONE, 'cancelled'),
  ghostNotOurs: booking(S.notOurs, GHOST),
  bellaShared: booking(S.shared, BELLA, 'completed', OTHER_AGENCY),
};
const ASSIGNMENTS = Object.values(A);

type Voucher = {
  id: string;
  agencyId: string;
  prId: string | null;
  weekStart: string | null;
  weekEnd: string | null;
  deduction: string;
};
const voucher = (
  prId: string | null,
  weekStart: string | null,
  weekEnd: string | null,
  agencyId = AGENCY,
): Voucher => ({ id: uid(), agencyId, prId, weekStart, weekEnd, deduction: '0.00' });
const V = {
  vickySep06: voucher(VICKY, '2026-09-06', '2026-09-12'),
  vickySep13: voucher(VICKY, '2026-09-13', '2026-09-19'),
  aliceAug30: voucher(ALICE, '2026-08-30', '2026-09-05'),
  aliceNoWeek: voucher(ALICE, null, null),
  jkSep20: voucher(JK, '2026-09-20', '2026-09-26'),
  vickyLastYear: voucher(VICKY, '2025-08-03', '2025-08-09'),
  goneSep06: voucher(GONE, '2026-09-06', '2026-09-12'),
  vickyStraddlesFrom: voucher(VICKY, '2025-09-28', '2025-10-04'),
  vickyStraddlesTo: voucher(VICKY, '2026-09-27', '2026-10-03'),
  noPr: voucher(null, '2026-09-06', '2026-09-12'),
  otherAgencyAlice: voucher(ALICE, '2026-08-30', '2026-09-05', OTHER_AGENCY),
  ghostSep06: voucher(GHOST, '2026-09-06', '2026-09-12'),
};
const VOUCHERS = Object.values(V);

type Receipt = HistoryReceiptRow;
const receipt = (
  v: Voucher,
  status: Receipt['status'],
  a: Assignment | null,
): Receipt => ({ id: uid(), voucherId: v.id, status, shiftAssignmentId: a?.id ?? null });
const R = {
  approvedA1: receipt(V.vickySep06, 'approved', A.vickySep08),
  verifiedA2: receipt(V.vickySep06, 'verified', A.vickySep09),
  pendingA1: receipt(V.vickySep06, 'pending', A.vickySep08),
  noAssignment: receipt(V.vickySep06, 'approved', null),
  verifiedA3: receipt(V.vickySep13, 'verified', A.vickySep15),
  approvedAlice: receipt(V.aliceAug30, 'approved', A.aliceAug31),
  zeroOnly: receipt(V.aliceAug30, 'approved', A.aliceShared),
  noWeekAlice: receipt(V.aliceNoWeek, 'verified', A.aliceAug31),
  jk: receipt(V.jkSep20, 'approved', A.jkSep21),
  lastYear: receipt(V.vickyLastYear, 'verified', A.vickyFirstNight),
  goneNamesVicky: receipt(V.goneSep06, 'approved', A.vickySep09),
  straddleFrom: receipt(V.vickyStraddlesFrom, 'verified', A.vickyFirstNight),
  straddleTo: receipt(V.vickyStraddlesTo, 'approved', A.vickySep28),
  noPr: receipt(V.noPr, 'verified', A.vickySep08),
  otherAgency: receipt(V.otherAgencyAlice, 'approved', A.aliceShared),
};
const RECEIPTS = Object.values(R);

const line = (
  v: Voucher,
  component: HistoryLineRow['component'],
  amount: string,
  r: Receipt | null = null,
): HistoryLineRow => ({ voucherId: v.id, component, amount, receiptId: r?.id ?? null });
const LINES: HistoryLineRow[] = [
  // Vicky, 6–12 Sep: the everyday week — and every way a line is NOT commission.
  line(V.vickySep06, 'wages', '500.00'),
  line(V.vickySep06, 'wages', '500.00'),
  line(V.vickySep06, 'drink_commission', '15.00', R.approvedA1),
  line(V.vickySep06, 'tip_commission', '7.50', R.approvedA1),
  line(V.vickySep06, 'tip_commission', '30.10', R.verifiedA2),
  line(V.vickySep06, 'drink_commission', '99.00', R.pendingA1),
  line(V.vickySep06, 'drink_commission', '99.00', R.noAssignment),
  line(V.vickySep06, 'deduction', '-20.00'),
  line(V.vickySep06, 'ot', '40.00'),
  line(V.vickySep06, 'other', '10.00', R.approvedA1),
  line(V.vickySep06, null, '5.00', R.approvedA1),
  line(V.vickySep06, 'tip_commission', '99.00'),
  // Vicky, 13–19 Sep: awkward cents, two penalties and a correction.
  line(V.vickySep13, 'wages', '450.25'),
  line(V.vickySep13, 'drink_commission', '0.29', R.verifiedA3),
  line(V.vickySep13, 'drink_commission', '0.01', R.verifiedA3),
  line(V.vickySep13, 'tip_commission', '12.05', R.verifiedA3),
  line(V.vickySep13, 'deduction', '-7.25'),
  line(V.vickySep13, 'deduction', '-0.30'),
  line(V.vickySep13, 'deduction', '5.00'),
  // Alice, 30 Aug – 5 Sep: a zero line, and a line pointing at ANOTHER voucher's receipt.
  line(V.aliceAug30, 'wages', '600.00'),
  line(V.aliceAug30, 'tip_commission', '123.45', R.approvedAlice),
  line(V.aliceAug30, 'drink_commission', '45.50', R.approvedAlice),
  line(V.aliceAug30, 'drink_commission', '0.00', R.zeroOnly),
  line(V.aliceAug30, 'tip_commission', '50.00', R.approvedA1),
  // Alice, a legacy voucher with NO week — read, and it credits her 31 Aug night again.
  line(V.aliceNoWeek, 'drink_commission', '2.20', R.noWeekAlice),
  line(V.aliceNoWeek, 'deduction', '-5.00'),
  // jk, 20–26 Sep: overtime, a little commission, a RM 20 penalty (the live −RM 4.50 card).
  line(V.jkSep20, 'ot', '12.50'),
  line(V.jkSep20, 'drink_commission', '3.00', R.jk),
  line(V.jkSep20, 'deduction', '-20.00'),
  // Outside the selection, each for its own reason — none of this may count.
  line(V.vickyLastYear, 'drink_commission', '50.00', R.lastYear),
  line(V.vickyLastYear, 'deduction', '-10.00'),
  line(V.goneSep06, 'tip_commission', '77.00', R.goneNamesVicky),
  line(V.goneSep06, 'deduction', '-3.00'),
  line(V.noPr, 'drink_commission', '8.88', R.noPr),
  line(V.otherAgencyAlice, 'tip_commission', '66.00', R.otherAgency),
  line(V.otherAgencyAlice, 'deduction', '-9.00'),
  line(V.ghostSep06, 'deduction', '-1.00'),
  // Weeks that straddle the window's ends ARE read.
  line(V.vickyStraddlesFrom, 'drink_commission', '12.34', R.straddleFrom),
  line(V.vickyStraddlesTo, 'tip_commission', '45.67', R.straddleTo),
  line(V.vickyStraddlesTo, 'deduction', '-12.50'),
];

// ---------------------------------------------------------------------------
// OLD path inputs — what the browser held.
// ---------------------------------------------------------------------------

const shiftById = new Map(SHIFTS.map((s) => [s.id, s]));

/** `GET /shift?fromDate&toDate` for this agency: invited through shift_agency, day in the window. */
const listedShiftIds = new Set(
  SHIFTS.filter(
    (s) => s.invited.includes(AGENCY) && s.day >= WINDOW.fromDate && s.day <= WINDOW.toDate,
  ).map((s) => s.id),
);

/** The hook's `wageRows`: this agency's COMPLETED assignments joined to a listed shift. */
const wageRows = ASSIGNMENTS.filter(
  (a) => a.agencyId === AGENCY && a.status === 'completed' && listedShiftIds.has(a.shiftId),
).map((a) => ({ id: a.id, prId: a.prId }));

/** `GET /payment-voucher` for this agency, through `managedPvFromBackend`. */
const pvs: LegacyPv[] = VOUCHERS.filter((v) => v.agencyId === AGENCY).map((v) => ({
  id: v.id,
  prId: v.prId ?? undefined,
  weekStartIso: v.weekStart ?? undefined,
  weekEndIso: v.weekEnd ?? undefined,
}));

/** `GET /payment-voucher/:id` — every line and every receipt of the voucher. */
const detailOf = (id: string): LegacyDetail => ({
  id,
  lines: LINES.filter((l) => l.voucherId === id).map((l) => ({
    amount: l.amount,
    component: l.component,
    receiptId: l.receiptId,
  })),
  receipts: RECEIPTS.filter((r) => r.voucherId === id).map((r) => ({
    id: r.id,
    status: r.status,
    shiftAssignmentId: r.shiftAssignmentId,
  })),
});

// ---------------------------------------------------------------------------
// NEW path inputs — what history-extras.repository.ts's SQL returns.
// ---------------------------------------------------------------------------

function sqlRows(): HistoryExtrasRows {
  // listLedgerPrIds: DISTINCT pr_id — agency, completed, shift_agency, KL day in window.
  const ledgerPrIds = [
    ...new Set(
      ASSIGNMENTS.filter((a) => {
        const s = shiftById.get(a.shiftId);
        return (
          a.agencyId === AGENCY &&
          a.status === 'completed' &&
          !!s &&
          s.invited.includes(AGENCY) &&
          s.day >= WINDOW.fromDate &&
          s.day <= WINDOW.toDate
        );
      }).map((a) => a.prId),
    ),
  ];
  // voucherWhere: agency, pr_id IN ledger, (no week OR week overlaps).
  const candidates = VOUCHERS.filter(
    (v) =>
      v.agencyId === AGENCY &&
      v.prId !== null &&
      ledgerPrIds.includes(v.prId) &&
      (v.weekStart === null ||
        v.weekEnd === null ||
        (v.weekEnd >= WINDOW.fromDate && v.weekStart <= WINDOW.toDate)),
  );
  const candidateIds = new Set(candidates.map((v) => v.id));
  return {
    ledgerPrIds,
    vouchers: candidates.map(({ id, prId, weekStart, weekEnd }) => ({ id, prId, weekStart, weekEnd })),
    lines: LINES.filter(
      (l) =>
        candidateIds.has(l.voucherId) &&
        l.component !== null &&
        (HISTORY_LINE_COMPONENTS as readonly string[]).includes(l.component),
    ),
    receipts: RECEIPTS.filter(
      (r) =>
        candidateIds.has(r.voucherId) &&
        (OWED_RECEIPT_STATUSES as readonly string[]).includes(r.status) &&
        r.shiftAssignmentId !== null,
    ),
  };
}

// ---------------------------------------------------------------------------

function runOld() {
  const ids = LEGACY_WEB.detailIds(pvs, wageRows, WINDOW.fromDate, WINDOW.toDate);
  const details = ids.map(detailOf);
  const commission = LEGACY_WEB.commissionSenByAssignment(details);
  const penalty = LEGACY_WEB.penaltyById(details);
  return {
    ids,
    assignments: [...commission.entries()]
      .map(([assignmentId, c]) => ({
        assignmentId,
        drinkCommissionSen: c.drink,
        tipCommissionSen: c.tip,
      }))
      .sort((a, b) => (a.assignmentId < b.assignmentId ? -1 : 1)),
    penaltyRmById: penalty,
  };
}

describe('history-extras parity with the web computation it replaces', () => {
  const old = runOld();
  const fresh = computeHistoryExtras(sqlRows(), WINDOW);

  it('reads the same vouchers', () => {
    expect(fresh.vouchers.map((v) => v.voucherId)).toEqual(old.ids);
  });

  it('credits every assignment the same commission, to the sen', () => {
    expect(fresh.assignments).toEqual(old.assignments);
  });

  it('gives every voucher the same penalty — and the same RM the screen subtracts', () => {
    expect(fresh.vouchers.map((v) => v.voucherId).sort()).toEqual(
      [...old.penaltyRmById.keys()].sort(),
    );
    for (const v of fresh.vouchers) {
      // The hook now states `penaltySen / 100` where it stated `voucherPenaltyRm`.
      expect(v.penaltySen / 100).toBe(old.penaltyRmById.get(v.voucherId));
    }
  });

  it('is not vacuous — the fixture exercises every rule', () => {
    const byName = (a: { id: string }) =>
      fresh.assignments.find((x) => x.assignmentId === a.id);
    expect(byName(A.vickySep08)).toEqual({
      assignmentId: A.vickySep08.id,
      drinkCommissionSen: 1500,
      tipCommissionSen: 750,
    });
    expect(byName(A.vickySep09)?.tipCommissionSen).toBe(3010);
    expect(byName(A.vickySep15)).toMatchObject({ drinkCommissionSen: 30, tipCommissionSen: 1205 });
    // 45.50 on the dated voucher + 2.20 on the week-less one.
    expect(byName(A.aliceAug31)).toMatchObject({ drinkCommissionSen: 4770, tipCommissionSen: 12345 });
    expect(byName(A.aliceShared)).toMatchObject({ drinkCommissionSen: 0, tipCommissionSen: 0 });
    expect(byName(A.jkSep21)).toMatchObject({ drinkCommissionSen: 300 });
    // Only the straddling voucher's 12.34 — last year's 50.00 is not read.
    expect(byName(A.vickyFirstNight)).toMatchObject({ drinkCommissionSen: 1234 });
    expect(byName(A.vickySep28)).toMatchObject({ tipCommissionSen: 4567 });
    expect(fresh.assignments).toHaveLength(8);

    const penalty = new Map(fresh.vouchers.map((v) => [v.voucherId, v.penaltySen]));
    expect(penalty.get(V.vickySep06.id)).toBe(2000);
    expect(penalty.get(V.vickySep13.id)).toBe(255);
    expect(penalty.get(V.aliceNoWeek.id)).toBe(500);
    expect(penalty.get(V.jkSep20.id)).toBe(2000);
    expect(penalty.get(V.vickyStraddlesTo.id)).toBe(1250);
    expect(penalty.size).toBe(7);
    for (const excluded of [V.vickyLastYear, V.goneSep06, V.noPr, V.otherAgencyAlice, V.ghostSep06]) {
      expect(penalty.has(excluded.id)).toBe(false);
    }
  });

  it('the SQL pushdowns drop only rows the rules drop anyway', () => {
    // Every one of this agency's vouchers, every line, every receipt — unfiltered.
    const unfiltered = computeHistoryExtras(
      {
        ledgerPrIds: sqlRows().ledgerPrIds,
        vouchers: VOUCHERS.filter((v) => v.agencyId === AGENCY).map(
          ({ id, prId, weekStart, weekEnd }) => ({ id, prId, weekStart, weekEnd }),
        ),
        lines: LINES,
        receipts: RECEIPTS,
      },
      WINDOW,
    );
    expect(unfiltered).toEqual(fresh);
  });
});
