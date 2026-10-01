import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	indexShiftSales,
	shiftHistoryRowFromAssignment,
	shiftSaleKey,
} from "@agency-portal/lib/agency-shift-history-map";
import { addDaysToIso } from "@agency-portal/lib/demo-clock";
import {
	approvedOvertimeSenByAssignment,
	type HistoryVoucherDeduction,
	historyExtrasInputsDigest,
	withNightExtras,
} from "@agency-portal/lib/history-take-home";
import type { PrPaymentVoucher } from "@agency-portal/lib/pr-demo";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import type { ShiftHistoryRow } from "@agency-portal/lib/shift-history-utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchHistoryExtras } from "@/services/payment-voucher/history-extras";
import { fetchShifts } from "@/services/shift";
import { fetchShiftSales } from "@/services/shift-sale";
import { useAgencyOutlets } from "./use-agency-outlets";
import { useAgencyPrs } from "./use-agency-prs";
import { PV_KEY, useAgencyPvs } from "./use-agency-pvs";
import { useAllShiftAssignments } from "./use-all-shift-assignments";

// How far back to pull shifts for the History tabs. The join to assignments
// bounds which nights become rows; a year covers the demo's ledger horizon.
// ⚠️ The history-extras read refuses a window wider than 366 days
// (backend MAX_HISTORY_WINDOW_DAYS) — widen both together.
const HISTORY_LOOKBACK_DAYS = 365;

export interface AgencyHistoryData {
	backed: boolean;
	/**
	 * One row per COMPLETED night. Once `takeHomeReady`, each row carries that
	 * night's own approved overtime and commission (`withNightExtras`), so its
	 * `totalPayout` is wages + OT + commission; before then it is the wage alone.
	 */
	shiftRows: ShiftHistoryRow[];
	pvs: PrPaymentVoucher[];
	agencyPRs: AgencyManagedPR[];
	/**
	 * This agency's vouchers with what each takes off the PR: the `deduction`
	 * field AND its penalty lines. What the take-home subtracts.
	 */
	voucherDeductions: HistoryVoucherDeduction[];
	/**
	 * Every source the take-home needs has LOADED — the vouchers, the server's
	 * commission and penalty figures (`GET /payment-voucher/history-extras`),
	 * and the assignments. False while any is in flight or failed: a take-home
	 * missing a part is a wrong figure, so the screen states wages alone until
	 * it can state the whole.
	 */
	takeHomeReady: boolean;
	isLoading: boolean;
}

/**
 * Backend-driven data for the agency History screen. Gated on a real session
 * (`getAgencyIdentity()` non-null): backed sessions get live data, demo sessions
 * get `backed: false` so the screen falls back to its demo store.
 *
 * - **Shift tabs (By PR / By outlet):** rebuilt as `ShiftHistoryRow[]` from
 *   COMPLETED shift-assignments (the roster chain) — one sealed night per
 *   assignment, wage from `payAmount`. The RECEIVED side joins `shift_sale`
 *   on (shift, PR): drinks, tips and service entitlements, mirrored there from
 *   the PR's approved receipts (see the map).
 * - **Take-home:** each night's approved overtime (the assignment row itself)
 *   and commission (the voucher's own lines, through the receipt that names the
 *   assignment), and each voucher's deductions — see history-take-home.ts. The
 *   commission and the penalty lines arrive in ONE server read for the whole
 *   window (backend history-extras.ts), not one voucher detail per voucher.
 * - **Paid PVs tab:** the already-wired PV backend (`useAgencyPvs`) + PR roster
 *   (`useAgencyPrs`), which the Paid-PV view filters to PAID + scopes by PR.
 */
export function useAgencyHistory(): AgencyHistoryData {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyName = identity?.orgName ?? "";
	const toDate = DEFAULT_ROSTER_DATE_ISO;
	// toDate is a module constant, so this only computes once.
	const fromDate = useMemo(
		() => addDaysToIso(toDate, -HISTORY_LOOKBACK_DAYS),
		[],
	);

	// Real outlet + PR directories supply the id -> name maps and the Paid-PV
	// scoping roster; both self-gate / are gated on the real session.
	const { outlets } = useAgencyOutlets();
	const { prs } = useAgencyPrs({ enabled: backed });
	const {
		pvs,
		isLoading: pvsLoading,
		isError: pvsError,
	} = useAgencyPvs({ enabled: backed });

	const shiftsQuery = useQuery({
		queryKey: ["agency", "history", "shifts", fromDate, toDate],
		// ⚠️ Paged to exhaustion. This asked for `pageSize: 500` in ONE page, and
		// the server clamps every list to 100 and answers the short page with no
		// error (lib/fetch-all-pages.ts) — so past a hundred shifts in the year,
		// every assignment on a later shift found no shift here and fell out of
		// the ledger, and out of the header's totals with it.
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShifts({ fromDate, toDate, page, pageSize: 100 }, logout),
			),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});

	// The shared assignments cache. History reading a truncated set is its own
	// bug — the oldest 100 rows are exactly the ones history is least about — and
	// the hook is what guarantees it is paged out here and on every other screen.
	// It also carries each night's overtime decision, which the take-home reads.
	const assignmentsQuery = useAllShiftAssignments({ enabled: backed });

	// Floor sales (the RECEIVED side) — receipts, mirrored onto shift_sale by the
	// backend. Bounded by the SAME window as the shifts query above: a sale
	// outside it has no history row to attach to, so a narrower fetch cannot
	// silently zero a row that is on screen.
	const salesQuery = useQuery({
		queryKey: ["agency", "history", "shift-sales", fromDate, toDate],
		queryFn: () => fetchShiftSales({ fromDate, toDate }, logout),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});

	const wageRows = useMemo<ShiftHistoryRow[]>(() => {
		if (!backed) return [];
		const shifts = shiftsQuery.data?.data ?? [];
		const assignments = assignmentsQuery.data?.data ?? [];
		const saleByShiftPr = indexShiftSales(salesQuery.data ?? []);
		const shiftById = new Map(shifts.map((s) => [s.id, s]));
		const prNameById = new Map(prs.map((p) => [p.id, p.name]));
		const outletNameById = new Map(outlets.map((o) => [o.id, o.name]));

		const rows: ShiftHistoryRow[] = [];
		for (const a of assignments) {
			// Only sealed (completed) nights are history — assigned/confirmed are
			// still upcoming; no_show / cancelled aren't worked shifts.
			if (a.status !== "completed") continue;
			const shift = shiftById.get(a.shiftId);
			// Assignment's shift is outside the lookback window — skip.
			if (!shift) continue;
			rows.push(
				shiftHistoryRowFromAssignment({
					assignment: a,
					shiftDate: shift.shiftDate,
					prName: prNameById.get(a.prId) ?? "Unknown PR",
					outletName: outletNameById.get(shift.outletId) ?? shift.outletId,
					agencyName,
					sale: saleByShiftPr.get(shiftSaleKey(a.shiftId, a.prId)),
				}),
			);
		}
		return rows;
	}, [
		backed,
		agencyName,
		shiftsQuery.data,
		assignmentsQuery.data,
		salesQuery.data,
		prs,
		outlets,
	]);

	/*
	 * Each night's commission and each voucher's penalty lines — the parts of
	 * the take-home that live on voucher LINES, which the list endpoint omits.
	 *
	 * ONE read for the whole window, answered server-side (backend
	 * history-extras.ts) with the rules this hook used to apply itself over one
	 * `GET /payment-voucher/:id` per voucher: the vouchers of a PR on the ledger
	 * whose week touches the window (or that carry no week), drink + tip
	 * commission on approved / verified receipts naming their night, and the
	 * negated sum of each voucher's `deduction` lines. The rules are pinned to
	 * the sen against a frozen copy of the old code
	 * (history-extras.parity.test.ts), the SQL by
	 * history-extras.repository.test.ts.
	 *
	 * Keyed UNDER the voucher list's key (`PV_KEY`), so every write that
	 * refreshes the list — a receipt or day review, a receipt edit, a fee
	 * waiver, a dispute, a signature, an overtime decision — refreshes this too.
	 *
	 * The key also carries a digest of the ledger PRs' vouchers and the ledger's
	 * PRs, so one that becomes relevant re-asks — and, as when each voucher was
	 * read on its own, the take-home waits for that answer. Asked only once
	 * those lists have loaded, so it is asked once rather than as each arrives.
	 */
	const extrasInputs = useMemo(() => {
		const ledgerPrs = new Set(wageRows.map((r) => r.prId));
		return historyExtrasInputsDigest(
			pvs
				.filter((v) => v.prId !== undefined && ledgerPrs.has(v.prId))
				.map((v) => v.id),
			[...ledgerPrs],
		);
	}, [pvs, wageRows]);
	const extrasInputsLoaded =
		!pvsLoading &&
		!pvsError &&
		shiftsQuery.isSuccess &&
		assignmentsQuery.isSuccess;

	const extrasQuery = useQuery({
		queryKey: [...PV_KEY, "history-extras", fromDate, toDate, extrasInputs],
		queryFn: () => fetchHistoryExtras({ fromDate, toDate }, logout),
		enabled: backed && extrasInputsLoaded,
		staleTime: 60_000,
	});
	const extras = extrasQuery.data;

	const takeHomeReady =
		backed &&
		!pvsLoading &&
		!pvsError &&
		assignmentsQuery.isSuccess &&
		extrasQuery.isSuccess;

	const shiftRows = useMemo<ShiftHistoryRow[]>(() => {
		if (!takeHomeReady || !extras) return wageRows;
		const overtime = approvedOvertimeSenByAssignment(
			assignmentsQuery.data?.data ?? [],
		);
		const commission = new Map(
			extras.assignments.map((a) => [a.assignmentId, a]),
		);
		return withNightExtras(wageRows, (assignmentId) => {
			const c = commission.get(assignmentId);
			return {
				overtime: overtime.get(assignmentId) ?? 0,
				drinkCommission: c?.drinkCommissionSen ?? 0,
				tipCommission: c?.tipCommissionSen ?? 0,
			};
		});
	}, [takeHomeReady, wageRows, assignmentsQuery.data, extras]);

	const voucherDeductions = useMemo<HistoryVoucherDeduction[]>(() => {
		// A voucher the server did not read cannot count toward a listed week,
		// so its penalty is 0 here — as it was when its detail went unread.
		const penaltySenById = new Map(
			(extras?.vouchers ?? []).map((v) => [v.voucherId, v.penaltySen]),
		);
		return pvs.map((v) => ({
			prId: v.prId,
			weekStartIso: v.weekStartIso,
			weekEndIso: v.weekEndIso,
			deduct: v.deduct,
			penaltyRm: (penaltySenById.get(v.id) ?? 0) / 100,
		}));
	}, [pvs, extras]);

	return {
		backed,
		shiftRows,
		pvs,
		agencyPRs: prs,
		voucherDeductions,
		takeHomeReady,
		isLoading:
			backed &&
			(shiftsQuery.isLoading ||
				assignmentsQuery.isLoading ||
				// Without this the screen paints Received RM 0.00 for a beat before
				// the sales land — a wrong number, not a pending one.
				salesQuery.isLoading),
	};
}
