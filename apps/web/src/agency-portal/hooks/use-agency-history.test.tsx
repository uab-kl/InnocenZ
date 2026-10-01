import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryExtras } from "@/services/payment-voucher/history-extras";

/**
 * THE AGENCY HISTORY'S TAKE-HOME, WIRED TO ONE SERVER READ (30 Sep 2026).
 *
 * The hook used to read one `GET /payment-voucher/:id` per voucher; it now asks
 * `GET /payment-voucher/history-extras` once for the whole window. What must
 * not change is what the screen may state: `takeHomeReady` stays false until
 * every part has loaded — including a voucher or a PR that becomes relevant
 * later — and a failed read leaves the screen on wages alone.
 */

const AGENCY = "11111111-1111-4111-8111-111111111111";
const PR = "22222222-2222-4222-8222-222222222222";
const SHIFT = "33333333-3333-4333-8333-333333333333";
const NIGHT = "44444444-4444-4444-8444-444444444444";
const VOUCHER = "55555555-5555-4555-8555-555555555555";
const OTHER_VOUCHER = "66666666-6666-4666-8666-666666666666";
const NEW_PR = "77777777-7777-4777-8777-777777777777";
const NEW_NIGHT = "88888888-8888-4888-8888-888888888888";
const NEW_VOUCHER = "99999999-9999-4999-8999-999999999999";

const h = vi.hoisted(() => ({
	fetchHistoryExtras: vi.fn(),
	pvsResult: {} as {
		pvs: Record<string, unknown>[];
		isLoading: boolean;
		isError: boolean;
	},
	assignmentsResult: {} as {
		data: { data: Record<string, unknown>[] };
		isSuccess: boolean;
		isLoading: boolean;
	},
}));

vi.mock("@agency-portal/lib/agency-identity", () => ({
	getAgencyIdentity: () => ({ agencyId: AGENCY, orgName: "Agency" }),
}));
vi.mock("@agency-portal/lib/roster-availability", () => ({
	DEFAULT_ROSTER_DATE_ISO: "2026-09-30",
}));
vi.mock("@/lib/auth-context", () => ({
	useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock("@/services/payment-voucher/history-extras", () => ({
	fetchHistoryExtras: h.fetchHistoryExtras,
}));
vi.mock("@/services/shift", () => ({
	fetchShifts: vi.fn(async () => ({
		data: [{ id: SHIFT, shiftDate: "2026-09-15", outletId: "outlet-1" }],
		pagination: { page: 1, totalPages: 1, hasNextPage: false },
	})),
}));
vi.mock("@/services/shift-sale", () => ({
	fetchShiftSales: vi.fn(async () => []),
}));
vi.mock("./use-agency-outlets", () => ({
	useAgencyOutlets: () => ({ outlets: [{ id: "outlet-1", name: "Venue" }] }),
}));
vi.mock("./use-agency-prs", () => ({
	useAgencyPrs: () => ({ prs: [{ id: PR, name: "PR" }] }),
}));
// The REAL `PV_KEY` stays: the key this hook nests under must be the list's.
vi.mock("./use-agency-pvs", async (importOriginal) => ({
	...(await importOriginal<typeof import("./use-agency-pvs")>()),
	useAgencyPvs: () => h.pvsResult,
}));
vi.mock("./use-all-shift-assignments", () => ({
	useAllShiftAssignments: () => h.assignmentsResult,
}));

import { useAgencyHistory } from "./use-agency-history";
import { PV_KEY } from "./use-agency-pvs";

const voucher = (
	id: string,
	prId: string,
	weekStartIso: string,
	weekEndIso: string,
	deduct = 0,
) => ({ id, prId, weekStartIso, weekEndIso, deduct });
const night = (id: string, prId: string, overtimeAmount: string | null) => ({
	id,
	shiftId: SHIFT,
	prId,
	status: "completed",
	payAmount: "500.00",
	checkInAt: null,
	checkOutAt: null,
	overtimeStatus: overtimeAmount ? "approved" : null,
	overtimeAmount,
});
const setPvs = (pvs: Record<string, unknown>[], isLoading = false) => {
	h.pvsResult = { pvs, isLoading, isError: false };
};
const setNights = (nights: Record<string, unknown>[]) => {
	h.assignmentsResult = {
		data: { data: nights },
		isSuccess: true,
		isLoading: false,
	};
};

const EXTRAS: HistoryExtras = {
	fromDate: "2025-09-30",
	toDate: "2026-09-30",
	assignments: [
		{ assignmentId: NIGHT, drinkCommissionSen: 4550, tipCommissionSen: 1205 },
	],
	vouchers: [{ voucherId: VOUCHER, penaltySen: 2000 }],
};

/** A reply the test settles itself, to look at the screen while it is out. */
function deferred() {
	let resolve: (value: HistoryExtras) => void = () => undefined;
	const promise = new Promise<HistoryExtras>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function renderHistory() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return { client, ...renderHook(() => useAgencyHistory(), { wrapper }) };
}

beforeEach(() => {
	h.fetchHistoryExtras.mockReset();
	setPvs([
		voucher(VOUCHER, PR, "2026-09-13", "2026-09-19"),
		voucher(OTHER_VOUCHER, PR, "2026-09-20", "2026-09-26", 5),
	]);
	setNights([night(NIGHT, PR, "30.00")]);
});

describe("useAgencyHistory — the take-home extras", () => {
	it("asks ONE read for the whole ledger window", async () => {
		h.fetchHistoryExtras.mockResolvedValue(EXTRAS);
		const { result } = renderHistory();
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));
		expect(h.fetchHistoryExtras).toHaveBeenCalledTimes(1);
		expect(h.fetchHistoryExtras.mock.calls[0]?.[0]).toEqual({
			fromDate: "2025-09-30",
			toDate: "2026-09-30",
		});
	});

	it("states wages alone until the extras arrive, then seals each night's OT and commission", async () => {
		const reply = deferred();
		h.fetchHistoryExtras.mockReturnValue(reply.promise);
		const { result } = renderHistory();
		await waitFor(() => expect(h.fetchHistoryExtras).toHaveBeenCalled());
		expect(result.current.shiftRows).toHaveLength(1);
		expect(result.current.takeHomeReady).toBe(false);
		expect(result.current.shiftRows[0]).toMatchObject({ totalPayout: 500 });

		reply.resolve(EXTRAS);
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));
		expect(result.current.shiftRows[0]).toMatchObject({
			wagesRm: 500,
			otRm: 30,
			drinkCommissionRm: 45.5,
			tipCommissionRm: 12.05,
			totalPayout: 587.55,
			serverSealed: true,
		});
	});

	it("carries each voucher's penalty in RM — 0 for a voucher the server did not read", async () => {
		h.fetchHistoryExtras.mockResolvedValue(EXTRAS);
		const { result } = renderHistory();
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));
		expect(result.current.voucherDeductions).toEqual([
			{
				prId: PR,
				weekStartIso: "2026-09-13",
				weekEndIso: "2026-09-19",
				deduct: 0,
				penaltyRm: 20,
			},
			{
				prId: PR,
				weekStartIso: "2026-09-20",
				weekEndIso: "2026-09-26",
				deduct: 5,
				penaltyRm: 0,
			},
		]);
	});

	it("a failed read leaves the screen on wages alone", async () => {
		h.fetchHistoryExtras.mockRejectedValue(new Error("offline"));
		const { client, result } = renderHistory();
		// Settled as FAILED, not merely still in flight. (The entry keyed while the
		// lists were still loading is never fetched, so look for the one that was.)
		await waitFor(() =>
			expect(
				client
					.getQueryCache()
					.findAll({ queryKey: [...PV_KEY, "history-extras"] })
					.map((q) => q.state.status),
			).toContain("error"),
		);
		expect(h.fetchHistoryExtras).toHaveBeenCalledTimes(1);
		expect(result.current.shiftRows).toHaveLength(1);
		expect(result.current.takeHomeReady).toBe(false);
		expect(result.current.shiftRows[0]).toMatchObject({ totalPayout: 500 });
		expect(result.current.shiftRows[0]?.serverSealed).toBeUndefined();
	});

	it("refreshes whenever the voucher list is refreshed", async () => {
		h.fetchHistoryExtras.mockResolvedValue(EXTRAS);
		const { client, result } = renderHistory();
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));
		// What every voucher write (receipt review, fee waiver, dispute, …) does.
		await client.invalidateQueries({ queryKey: PV_KEY });
		await waitFor(() => expect(h.fetchHistoryExtras).toHaveBeenCalledTimes(2));
	});

	it("waits for the vouchers before asking — once, not once per list", async () => {
		h.fetchHistoryExtras.mockResolvedValue(EXTRAS);
		setPvs([], true);
		const { result, rerender } = renderHistory();
		await waitFor(() => expect(result.current.shiftRows).toHaveLength(1));
		expect(h.fetchHistoryExtras).not.toHaveBeenCalled();

		setPvs([
			voucher(VOUCHER, PR, "2026-09-13", "2026-09-19"),
			voucher(OTHER_VOUCHER, PR, "2026-09-20", "2026-09-26", 5),
		]);
		rerender();
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));
		expect(h.fetchHistoryExtras).toHaveBeenCalledTimes(1);

		// Fresh copies of the same lists change nothing it depends on.
		setPvs([
			voucher(VOUCHER, PR, "2026-09-13", "2026-09-19"),
			voucher(OTHER_VOUCHER, PR, "2026-09-20", "2026-09-26", 5),
		]);
		setNights([night(NIGHT, PR, "30.00")]);
		rerender();
		expect(h.fetchHistoryExtras).toHaveBeenCalledTimes(1);
		expect(result.current.takeHomeReady).toBe(true);
	});

	it("re-asks when a PR joins the ledger, and states wages alone until the answer is in", async () => {
		h.fetchHistoryExtras.mockResolvedValueOnce(EXTRAS);
		const { result, rerender } = renderHistory();
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));

		const reply = deferred();
		h.fetchHistoryExtras.mockReturnValueOnce(reply.promise);
		setNights([night(NIGHT, PR, "30.00"), night(NEW_NIGHT, NEW_PR, null)]);
		rerender();
		await waitFor(() => expect(h.fetchHistoryExtras).toHaveBeenCalledTimes(2));
		expect(result.current.takeHomeReady).toBe(false);

		reply.resolve({
			...EXTRAS,
			assignments: [
				...EXTRAS.assignments,
				{
					assignmentId: NEW_NIGHT,
					drinkCommissionSen: 1000,
					tipCommissionSen: 0,
				},
			],
		});
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));
		const newRow = result.current.shiftRows.find((r) => r.id === NEW_NIGHT);
		expect(newRow).toMatchObject({ drinkCommissionRm: 10, totalPayout: 510 });
	});

	it("re-asks when a ledger PR gets a new voucher", async () => {
		h.fetchHistoryExtras.mockResolvedValue(EXTRAS);
		const { result, rerender } = renderHistory();
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));

		setPvs([
			voucher(VOUCHER, PR, "2026-09-13", "2026-09-19"),
			voucher(OTHER_VOUCHER, PR, "2026-09-20", "2026-09-26", 5),
			voucher(NEW_VOUCHER, PR, "2026-09-27", "2026-10-03"),
		]);
		rerender();
		await waitFor(() => expect(h.fetchHistoryExtras).toHaveBeenCalledTimes(2));
	});

	it("does not re-ask for a voucher of a PR who is not on the ledger", async () => {
		h.fetchHistoryExtras.mockResolvedValue(EXTRAS);
		const { result, rerender } = renderHistory();
		await waitFor(() => expect(result.current.takeHomeReady).toBe(true));

		setPvs([
			voucher(VOUCHER, PR, "2026-09-13", "2026-09-19"),
			voucher(OTHER_VOUCHER, PR, "2026-09-20", "2026-09-26", 5),
			voucher(NEW_VOUCHER, NEW_PR, "2026-09-27", "2026-10-03"),
		]);
		rerender();
		expect(h.fetchHistoryExtras).toHaveBeenCalledTimes(1);
		expect(result.current.takeHomeReady).toBe(true);
	});
});
