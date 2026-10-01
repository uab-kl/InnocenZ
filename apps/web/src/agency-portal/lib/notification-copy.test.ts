import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import type { NotificationRecord } from "@/services/notification";
import { localizeOpsNotification } from "./notification-copy";

/**
 * The web bell's rows in the portal's language (29 Sep 2026: "the web bell
 * text … English only").
 *
 * Every title and body below is copied from its PRODUCER on the backend, not
 * from the resolver — a resolver that stops matching its producer must fail
 * here, not quietly fall back to English on screen.
 */
type Row = Pick<NotificationRecord, "kind" | "title" | "body" | "payload">;

const zh = (row: Row) => localizeOpsNotification(row, translations.zh, "zh");
const en = (row: Row) => localizeOpsNotification(row, translations.en, "en");

const HAS_CJK = /[㐀-鿿]/;
/** Any stored ENGLISH sentence word that must not survive into Chinese. */
const ENGLISH_PROSE =
	/\b(the|and|needs|worked|asked|voucher|bill|week|shift)\b/i;

/** A row both of whose fields are rebuilt in Chinese, keeping `keep` values. */
function expectTranslated(row: Row, keep: string[] = []) {
	const out = zh(row);
	expect(out.title).not.toBe(row.title);
	expect(out.body).not.toBe(row.body);
	for (const field of [out.title, out.body]) {
		expect(field).toMatch(HAS_CJK);
		expect(field).not.toMatch(ENGLISH_PROSE);
		expect(field).not.toContain("{");
	}
	for (const value of keep) expect(`${out.title} ${out.body}`).toContain(value);
	// English is rebuilt too, from the same dictionary, and never left empty.
	const back = en(row);
	expect(back.title.trim()).not.toBe("");
	expect(back.body.trim()).not.toBe("");
	expect(`${back.title} ${back.body}`).not.toContain("{");
}

describe("agency rows", () => {
	it("overtime needing approval", () => {
		expectTranslated(
			{
				kind: "overtime_pending_approval",
				title: "Overtime needs approval",
				body: "Vicky worked 45 min past the scheduled end on 2026-09-20",
				payload: { overtimeMinutes: 45 },
			},
			["Vicky", "45"],
		);
	});

	it("an MC / leave request keeps the PR's own reason verbatim", () => {
		expectTranslated(
			{
				kind: "leave_requested",
				title: "MC / leave request — Vicky",
				body: 'Vicky asked to be excused from 2026-09-20 · 22:00 — 04:00: "fever, clinic slip attached". Review it on Approvals → MC/Leaves.',
				payload: { assignmentId: "a", shiftId: "s" },
			},
			["Vicky", "fever, clinic slip attached", "22:00 — 04:00"],
		);
	});

	it("a leave request for 'an upcoming shift' translates that phrase too", () => {
		const out = zh({
			kind: "leave_requested",
			title: "MC / leave request — Vicky",
			body: 'Vicky asked to be excused from an upcoming shift: "sick". Review it on Approvals → MC/Leaves.',
			payload: {},
		});
		expect(out.body).toContain(translations.zh.notifications.srvUpcomingShift);
	});

	it.each([
		["cancelled", "cancelled"],
		["leave_approved", "approved leave"],
	])("cover needed after a PR dropped off (%s)", (reason, why) => {
		const row = {
			kind: "shift_cover_needed" as const,
			title: "Cover needed — Vicky",
			body: `Vicky is off 2026-09-20 · 22:00 — 04:00 (${why}). Find a replacement on the roster's backfill list.`,
			payload: { assignmentId: "a", shiftId: "s", reason },
		};
		expectTranslated(row, ["Vicky"]);
		expect(zh(row).body).toContain(
			reason === "leave_approved" ? "请假已批准" : "已取消",
		);
	});

	it("a venue posting a new shift", () => {
		expectTranslated(
			{
				kind: "shift_cover_needed",
				title: "New shift — JK House",
				body: "JK House posted a shift on 2026-09-20 · 22:00 — 04:00 (Ladies Night) and needs 3 PRs.",
				payload: {
					shiftId: "s",
					shiftDate: "2026-09-20",
					outletName: "JK House",
					posted: true,
				},
			},
			["JK House", "Ladies Night", "3"],
		);
	});

	it("a withdrawn shift, told to the agency", () => {
		expectTranslated(
			{
				kind: "shift_cancelled",
				title: "Shift withdrawn — JK House",
				body: "JK House withdrew the shift on 2026-09-20 · 22:00 — 04:00. 2 booked PRs were released and notified.",
				payload: {
					shiftId: "s",
					shiftDate: "2026-09-20",
					outletName: "JK House",
					withdrawn: true,
					releasedCount: 2,
				},
			},
			["JK House", "2"],
		);
	});

	it("a cut-loss request, names and slots kept", () => {
		expectTranslated(
			{
				kind: "cutlost_requested",
				title: "Venue asked to cut a shift",
				body: "JK House · 2026-09-20 · release Vicky, Alice · cut 2 slot(s)",
				payload: { requestId: "r", shiftId: "s", kind: "release" },
			},
			["JK House", "Vicky, Alice", "2"],
		);
	});

	it("a PR's rating dropping below the line", () => {
		expectTranslated(
			{
				kind: "pr_rating_low",
				title: "Vicky's rating has dropped",
				body: "Average now 3.2 across 5 ratings, below the 3.5 warning line.",
				payload: { prId: "p", average: 3.2, ratingCount: 5 },
			},
			["Vicky", "3.2", "5", "3.5"],
		);
	});

	it("vouchers held by the Monday run — review AND signature", () => {
		expectTranslated(
			{
				kind: "pv_day_review_pending",
				title: "3 vouchers need review or signature",
				body: "Last week (2026-09-13 to 2026-09-19) did not go out: 2 have receipts or overtime still undecided — approve them on Payroll › Receipts; 1 is reviewed but unsigned — finance has to sign before it can reach the PR. Until then the PR sees nothing for that week.",
				payload: {
					weekStart: "2026-09-13",
					weekEnd: "2026-09-19",
					voucherIds: ["v1", "v2", "v3"],
					dayReviewVoucherIds: ["v1", "v2"],
					unsignedVoucherIds: ["v3"],
				},
			},
			["3", "2", "1"],
		);
	});

	it.each([
		["custom", "Custom", "5 PV last week · Custom"],
		["frozen", "Plus", "5 PV last week · Custom price still pending"],
		["past_rate_card", "Scale", "5 PV last week · past the rate card"],
		["unchanged", "Growth", "5 PV last week · staying on Growth"],
	])("the weekly subscription statement (%s)", (outcome, plan, title) => {
		expectTranslated(
			{
				kind: "subscription_tier_weekly",
				title,
				body: "stored English body",
				payload: {
					weekStart: "2026-09-13",
					weekEnd: "2026-09-19",
					pvCount: 5,
					planName: plan,
					outcome,
				},
			},
			["5"],
		);
	});

	it("a moved tier reads the plan it LEFT back off the stored sentence", () => {
		const row = {
			kind: "subscription_tier_weekly" as const,
			title: "12 PV last week · now on Growth",
			body: "You issued 12 PV between 2026-09-13 to 2026-09-19. That volume falls in the Growth band, so your weekly charge follows Growth from this period on — you were on Plus. Nothing to do: your tier follows the vouchers you issue, there is no plan to pick.",
			payload: {
				weekStart: "2026-09-13",
				weekEnd: "2026-09-19",
				pvCount: 12,
				planName: "Growth",
				outcome: "moved",
			},
		};
		expectTranslated(row, ["Growth", "Plus", "12"]);
	});
});

describe("agency AND outlet rows — billing", () => {
	it("a new bill, pro-rated", () => {
		expectTranslated(
			{
				kind: "subscription_invoice_opened",
				title: "New bill: RM 35.71",
				body: "2026-08-07 to 2026-08-08. Pro-rated: 2 of 7 days from 2026-08-07 (full period RM 125.00). Open Subscription to see everything still unpaid.",
				payload: {
					periodStart: "2026-08-07",
					periodEnd: "2026-08-08",
					amount: "35.71",
					currency: "MYR",
					count: 1,
				},
			},
			["RM 35.71", "RM 125.00", "2", "7"],
		);
	});

	it("a new bill across several lines", () => {
		expectTranslated(
			{
				kind: "subscription_invoice_opened",
				title: "New bill: RM 7,149.10",
				body: "2026-09-01 to 2026-09-30, across 2 lines. Open Subscription to see everything still unpaid.",
				payload: {
					periodStart: "2026-09-01",
					periodEnd: "2026-09-30",
					amount: "7149.10",
					currency: "MYR",
					count: 2,
				},
			},
			["RM 7,149.10", "2"],
		);
	});

	/*
	 * 30 Sep 2026: the bell rebuilt the body from dates + pro-rata and silently
	 * DROPPED the credit sentence announce-opened writes between them — so a
	 * RM 25.71 bill for a RM 35.71 week read as a wrong price. Bodies below are
	 * copied from announce-opened.test.ts.
	 */
	it("a new bill with a credit keeps the credit sentence, where the producer puts it", () => {
		const row = {
			kind: "subscription_invoice_opened" as const,
			title: "New bill: RM 25.71",
			body:
				"2026-08-02 to 2026-08-08. Pro-rated: 2 of 7 days from 2026-08-07 (full period RM 125.00). " +
				"RM 10.00 credit from a switch to a cheaper plan taken off (RM 35.71 before credit). " +
				"Open Subscription to see everything still unpaid.",
			payload: {
				periodStart: "2026-08-02",
				periodEnd: "2026-08-08",
				amount: "25.71",
				currency: "MYR",
				count: 1,
				creditApplied: "10.00",
			},
		};
		expectTranslated(row, ["RM 25.71", "RM 125.00", "RM 10.00", "RM 35.71"]);

		// Chinese: pro-rata, then credit, then the pointer — the producer's order.
		const body = zh(row).body;
		const proRataAt = body.indexOf("RM 125.00");
		const creditAt = body.indexOf("RM 10.00");
		const pointerAt = body.indexOf("「订阅」");
		expect(proRataAt).toBeGreaterThanOrEqual(0);
		expect(creditAt).toBeGreaterThan(proRataAt);
		expect(pointerAt).toBeGreaterThan(creditAt);

		// English reads as stored: the producer's own credit sentence, verbatim.
		expect(en(row).body).toContain(
			"(full period RM 125.00). RM 10.00 credit from a switch to a cheaper plan taken off (RM 35.71 before credit). Open Subscription to see everything still unpaid.",
		);
	});

	it("a credit across several lines — the bill before credit is the payload's sum", () => {
		const row = {
			kind: "subscription_invoice_opened" as const,
			title: "New bill: RM 165.00",
			body:
				"2026-08-09 to 2026-08-15, across 2 lines. RM 10.00 credit from a switch to a cheaper plan " +
				"taken off (RM 175.00 before credit). Open Subscription to see everything still unpaid.",
			payload: {
				periodStart: "2026-08-09",
				periodEnd: "2026-08-15",
				amount: "165.00",
				currency: "MYR",
				count: 2,
				creditApplied: "10.00",
			},
		};
		expectTranslated(row, ["RM 165.00", "RM 10.00", "RM 175.00", "2"]);
	});

	it("a credit that covers the whole bill — RM 0.00 owed, the gross named once", () => {
		const out = zh({
			kind: "subscription_invoice_opened",
			title: "New bill: RM 0.00",
			body: "2026-08-09 to 2026-08-15. RM 125.00 credit from a switch to a cheaper plan taken off (RM 125.00 before credit). Open Subscription to see everything still unpaid.",
			payload: {
				periodStart: "2026-08-09",
				periodEnd: "2026-08-15",
				amount: "0.00",
				currency: "MYR",
				count: 1,
				creditApplied: "125.00",
			},
		});
		expect(out.title).toContain("RM 0.00");
		expect(out.body).toContain(
			translations.zh.notifications.srvBillCredit
				.replace("{credit}", "RM 125.00")
				.replace("{before}", "RM 125.00"),
		);
		expect(out.body).not.toContain("{");
	});

	it("thousands are grouped in both figures", () => {
		const out = en({
			kind: "subscription_invoice_opened",
			title: "New bill: RM 7,149.10",
			body: "2026-09-01 to 2026-09-30, across 2 lines. RM 150.20 credit from a switch to a cheaper plan taken off (RM 7,299.30 before credit). Open Subscription to see everything still unpaid.",
			payload: {
				periodStart: "2026-09-01",
				periodEnd: "2026-09-30",
				amount: "7149.10",
				currency: "MYR",
				count: 2,
				creditApplied: "150.20",
			},
		});
		expect(out.body).toContain(
			"RM 150.20 credit from a switch to a cheaper plan taken off (RM 7,299.30 before credit). ",
		);
	});

	it.each([
		["no creditApplied on the payload", {}],
		["a creditApplied that is not money", { creditApplied: "ten" }],
		["a negative creditApplied", { creditApplied: "-10.00" }],
	])(
		"a credit sentence it cannot back keeps the English body (%s)",
		(_why, extra) => {
			const row = {
				kind: "subscription_invoice_opened" as const,
				title: "New bill: RM 115.00",
				body: "2026-08-09 to 2026-08-15. RM 10.00 credit from a switch to a cheaper plan taken off (RM 125.00 before credit). Open Subscription to see everything still unpaid.",
				payload: {
					periodStart: "2026-08-09",
					periodEnd: "2026-08-15",
					amount: "115.00",
					currency: "MYR",
					count: 1,
					...extra,
				},
			};
			const out = zh(row);
			// The title is still translated; only the body falls back, whole.
			expect(out.title).toBe(
				translations.zh.notifications.srvBillTitle.replace(
					"{amount}",
					"RM 115.00",
				),
			);
			expect(out.body).toBe(row.body);
		},
	);

	it("a whole-period bill with no credit names none", () => {
		const row = {
			kind: "subscription_invoice_opened" as const,
			title: "New bill: RM 125.00",
			body: "2026-08-09 to 2026-08-15. Open Subscription to see everything still unpaid.",
			payload: {
				periodStart: "2026-08-09",
				periodEnd: "2026-08-15",
				amount: "125.00",
				currency: "MYR",
				count: 1,
			},
		};
		expectTranslated(row, ["RM 125.00"]);
		expect(zh(row).body).not.toContain("抵扣");
		expect(en(row).body).not.toContain("credit");
	});

	it("a declined automatic charge keeps the gateway's own words", () => {
		expectTranslated(
			{
				kind: "subscription_autopay_failed",
				title: "Automatic payment failed: RM 150.00",
				body: "We could not charge your card for 2026-09-01 to 2026-09-07 (Insufficient funds). The bill is still unpaid — pay it by FPX or e-wallet from Subscription, Payment history.",
				payload: {
					invoiceNo: "INV-000001",
					amount: "150.00",
					currency: "MYR",
					periodStart: "2026-09-01",
					periodEnd: "2026-09-07",
					methodType: "card",
					reason: "Insufficient funds",
				},
			},
			["RM 150.00", "Insufficient funds", "FPX"],
		);
	});
});

describe("outlet rows", () => {
	it.each([
		["approve", "Cut-loss approved", "已批准"],
		["reject", "Cut-loss declined", "已拒绝"],
	])("the agency's cut-loss answer (%s)", (decision, title, word) => {
		const row = {
			kind: "cutlost_decided" as const,
			title,
			body: "Your venue · 2026-09-20",
			payload: { requestId: "r", shiftId: "s", decision },
		};
		expectTranslated(row);
		expect(zh(row).title).toContain(word);
	});
});

describe("PR-addressed rows — a venue or agency member who is also a PR", () => {
	it("a new shift, the date read off the payload", () => {
		expectTranslated({
			kind: "shift_assigned",
			title: "You have a new shift",
			body: "2026-09-20",
			payload: { assignmentId: "a", shiftId: "s", shiftDate: "2026-09-20" },
		});
	});

	it.each([
		["A shift was cancelled", "srvShiftCancelledTitle"],
		["You were removed from a shift", "srvShiftRemovedTitle"],
	] as const)("the agency taking a PR off: %s", (title, key) => {
		// Both producers send the same payload and the date as a BARE body.
		const row = {
			kind: "shift_cancelled" as const,
			title,
			body: "2026-09-20",
			payload: { assignmentId: "a", shiftId: "s" },
		};
		expectTranslated(row);
		expect(zh(row).title).toBe(translations.zh.notifications[key]);
	});

	it("a cancellation whose shift had no date keeps an empty body", () => {
		const out = zh({
			kind: "shift_cancelled",
			title: "A shift was cancelled",
			body: null,
			payload: { assignmentId: "a", shiftId: "s" },
		});
		expect(out.title).toBe(
			translations.zh.notifications.srvShiftCancelledTitle,
		);
		expect(out.body).toBe("");
	});

	it.each([
		[
			"approved",
			"MC / leave approved",
			"Your agency approved the request — you are excused from this shift with no penalty.",
		],
		[
			"rejected",
			"MC / leave rejected",
			"Your agency rejected the request — you are still on this shift.",
		],
	])("the agency's MC / leave decision (%s)", (decision, title, body) => {
		expectTranslated({
			kind: "leave_decided",
			title,
			body,
			payload: { assignmentId: "a", shiftId: "s", decision },
		});
	});

	it("overtime approved, with the money it adds", () => {
		expectTranslated(
			{
				kind: "overtime_decided",
				title: "Overtime approved",
				body: "Your 45 min of overtime on 2026-09-20 was approved — RM37.50 is on that week's payment voucher.",
				payload: {
					assignmentId: "a",
					decision: "approve",
					overtimeMinutes: 45,
					shiftDate: "2026-09-20",
					amount: "37.50",
				},
			},
			["45", "RM 37.50"],
		);
	});

	it("overtime not approved", () => {
		expectTranslated(
			{
				kind: "overtime_decided",
				title: "Overtime not approved",
				body: "Your 45 min of overtime on 2026-09-20 was not approved. Ask your agency if you think this is wrong.",
				payload: {
					assignmentId: "a",
					decision: "reject",
					overtimeMinutes: 45,
					shiftDate: "2026-09-20",
					amount: "0.00",
				},
			},
			["45"],
		);
	});

	it("a dispute accepted keeps the agency's note verbatim", () => {
		const row = {
			kind: "payment_voucher_dispute_resolved" as const,
			title: "Your dispute was accepted",
			body: "drinks on 2026-09-20 — receipt RCP-000012 confirmed",
			payload: { voucherId: "v", disputeId: "d", outcome: "accepted" },
		};
		expectTranslated(row, ["receipt RCP-000012 confirmed"]);
		expect(zh(row).body).toContain(translations.zh.notifications.srvPartDrinks);
	});

	it("a dispute rejected, no note", () => {
		expectTranslated({
			kind: "payment_voucher_dispute_resolved",
			title: "Your dispute was rejected",
			body: "tips on 2026-09-20",
			payload: { voucherId: "v", disputeId: "d", outcome: "rejected" },
		});
	});

	it("a voucher ready, and its resent reminder", () => {
		const body =
			"Week 2026-09-13 to 2026-09-19. Check the amounts and raise a dispute if anything is wrong.";
		const payload = {
			voucherId: "v",
			voucherNo: "PV-000123",
			weekStart: "2026-09-13",
			weekEnd: "2026-09-19",
		};
		expectTranslated({
			kind: "payment_voucher_issued",
			title: "Your payment voucher is ready",
			body,
			payload,
		});
		const reminder = zh({
			kind: "payment_voucher_issued",
			title: "Reminder: your payment voucher is waiting",
			body,
			payload: { ...payload, resent: true },
		});
		expect(reminder.title).toBe(translations.zh.notifications.srvPvResentTitle);
	});

	it("a voucher with no week keeps the sentence it was sent", () => {
		expectTranslated({
			kind: "payment_voucher_issued",
			title: "Your payment voucher is ready",
			body: "Check the amounts and raise a dispute if anything is wrong.",
			payload: {
				voucherId: "v",
				voucherNo: null,
				weekStart: null,
				weekEnd: null,
			},
		});
	});

	it("paid — the voucher number and the amount are values", () => {
		expectTranslated(
			{
				kind: "payment_voucher_paid",
				title: "You have been paid",
				body: "PV-000123 — RM 1234.50 has been transferred to your bank.",
				payload: { voucherId: "v", voucherNo: "PV-000123", amount: "1234.50" },
			},
			["PV-000123", "RM 1,234.50"],
		);
		const noNumber = zh({
			kind: "payment_voucher_paid",
			title: "You have been paid",
			body: "Your voucher — RM 50.00 has been transferred to your bank.",
			payload: { voucherId: "v", voucherNo: null, amount: "50.00" },
		});
		expect(noNumber.body).toContain(
			translations.zh.notifications.srvYourVoucher,
		);
	});

	it("released early by a cut-loss — venue, day and sealed wage kept", () => {
		expectTranslated(
			{
				kind: "shift_released_early",
				title: "You were released early",
				body: "JK House on 2026-09-20 — wages sealed at RM120.00 for the hours you worked",
				payload: {
					requestId: "r",
					assignmentId: "a",
					shiftId: "s",
					payAmount: "120.00",
				},
			},
			["JK House", "RM 120.00"],
		);
		const unnamed = zh({
			kind: "shift_released_early",
			title: "You were released early",
			body: "The venue on 2026-09-20 — wages sealed at RM0.00 for the hours you worked",
			payload: { requestId: "r", assignmentId: "a", shiftId: "s" },
		});
		expect(unnamed.body).toContain(
			translations.zh.notifications.srvTheVenueStart,
		);
	});

	it.each([
		[{ agencyId: "g", userId: "u", approveStatus: "approved" }],
		[{ prId: "p", agencyId: "g", userId: "u", status: "active" }],
	])("accepted into the agency (both producers)", (payload) => {
		expectTranslated({
			kind: "agency_join_resolved",
			title: "You were accepted by the agency",
			body: "You can now be scheduled for shifts.",
			payload,
		});
	});

	it("a departure approved", () => {
		expectTranslated({
			kind: "agency_join_resolved",
			title: "Your departure from the agency was approved",
			body: "You are no longer under this agency.",
			payload: { agencyId: "g", userId: "u", approveStatus: "left" },
		});
	});

	it.each([
		[
			"Your agency application was declined",
			"srvJoinDeclinedTitle",
			{ agencyId: "g", userId: "u", approveStatus: "rejected" },
		],
		[
			"Your departure request was declined",
			"srvDepartureDeclinedTitle",
			// The SAME approveStatus an accepted join sends — only the title differs.
			{ agencyId: "g", userId: "u", approveStatus: "approved" },
		],
	] as const)(
		"a refusal (%s) keeps the agency's own reason",
		(title, key, payload) => {
			const row = {
				kind: "agency_join_resolved" as const,
				title,
				body: "Roster full until December",
				payload,
			};
			expect(zh(row)).toEqual({
				title: translations.zh.notifications[key],
				body: "Roster full until December",
			});
		},
	);

	it("an outlet swap ask — both time windows kept", () => {
		expectTranslated(
			{
				kind: "agency_broadcast",
				title: "Outlet swap — your answer is needed",
				body: "Your agency asks to move your 2026-09-20 shift (22:00 - 04:00) to another venue at 23:00 - 05:00. Accept or decline in the app BEFORE the shift starts — an unanswered request expires at start time.",
				payload: { swapId: "w", assignmentId: "a", shiftDate: "2026-09-20" },
			},
			["22:00 - 04:00", "23:00 - 05:00"],
		);
		const untimed = zh({
			kind: "agency_broadcast",
			title: "Outlet swap — your answer is needed",
			body: "Your agency asks to move your 2026-09-20 shift (time TBC) to another venue. Accept or decline in the app BEFORE the shift starts — an unanswered request expires at start time.",
			payload: { swapId: "w", assignmentId: "a", shiftDate: "2026-09-20" },
		});
		expect(untimed.body).toContain(translations.zh.notifications.srvTimeTbc);
	});

	it("a cover notice for a PR with no name on record says so in Chinese", () => {
		const out = zh({
			kind: "shift_cover_needed",
			title: "Cover needed — A PR",
			body: "A PR is off 2026-09-20 · 22:00 — 04:00 (approved leave). Find a replacement on the roster's backfill list.",
			payload: { assignmentId: "a", shiftId: "s", reason: "leave_approved" },
		});
		expect(out.title).toContain(translations.zh.notifications.aPr);
		expect(out.body).toContain(translations.zh.notifications.aPr);
	});
});

/**
 * One row per kind the server can write — the list is copied from
 * apps/backend/src/features/notification/notification.model.ts (29 Sep 2026),
 * each with its producer's exact title. A kind the bell can receive and this
 * module cannot word shows here as an English title.
 */
const BACKEND_KINDS = [
	"payment_voucher_issued",
	"payment_voucher_paid",
	"payment_voucher_dispute_resolved",
	"overtime_pending_approval",
	"overtime_decided",
	"shift_assigned",
	"shift_cancelled",
	"agency_join_resolved",
	"pr_rating_low",
	"cutlost_requested",
	"cutlost_decided",
	"shift_released_early",
	"shift_cover_needed",
	"pv_day_review_pending",
	"leave_requested",
	"leave_decided",
	"agency_broadcast",
	"subscription_tier_weekly",
	"subscription_invoice_opened",
	"subscription_autopay_failed",
] as const;

const ONE_PER_KIND: Record<NotificationRecord["kind"], Row> = {
	payment_voucher_issued: {
		kind: "payment_voucher_issued",
		title: "Your payment voucher is ready",
		body: "",
		payload: {},
	},
	payment_voucher_paid: {
		kind: "payment_voucher_paid",
		title: "You have been paid",
		body: "",
		payload: {},
	},
	payment_voucher_dispute_resolved: {
		kind: "payment_voucher_dispute_resolved",
		title: "Your dispute was accepted",
		body: "",
		payload: { outcome: "accepted" },
	},
	overtime_pending_approval: {
		kind: "overtime_pending_approval",
		title: "Overtime needs approval",
		body: "",
		payload: {},
	},
	overtime_decided: {
		kind: "overtime_decided",
		title: "Overtime approved",
		body: "",
		payload: { decision: "approve" },
	},
	shift_assigned: {
		kind: "shift_assigned",
		title: "You have a new shift",
		body: "",
		payload: {},
	},
	shift_cancelled: {
		kind: "shift_cancelled",
		title: "You were removed from a shift",
		body: "",
		payload: {},
	},
	agency_join_resolved: {
		kind: "agency_join_resolved",
		title: "You were accepted by the agency",
		body: "",
		payload: {},
	},
	pr_rating_low: {
		kind: "pr_rating_low",
		title: "Vicky's rating has dropped",
		body: "",
		payload: {},
	},
	cutlost_requested: {
		kind: "cutlost_requested",
		title: "Venue asked to cut a shift",
		body: "",
		payload: {},
	},
	cutlost_decided: {
		kind: "cutlost_decided",
		title: "Cut-loss approved",
		body: "",
		payload: { decision: "approve" },
	},
	shift_released_early: {
		kind: "shift_released_early",
		title: "You were released early",
		body: "",
		payload: {},
	},
	shift_cover_needed: {
		kind: "shift_cover_needed",
		title: "Cover needed — Vicky",
		body: "",
		payload: {},
	},
	pv_day_review_pending: {
		kind: "pv_day_review_pending",
		title: "1 voucher waiting for your signature",
		body: "",
		payload: { dayReviewVoucherIds: [], unsignedVoucherIds: ["v"] },
	},
	leave_requested: {
		kind: "leave_requested",
		title: "MC / leave request — Vicky",
		body: "",
		payload: {},
	},
	leave_decided: {
		kind: "leave_decided",
		title: "MC / leave approved",
		body: "",
		payload: { decision: "approved" },
	},
	agency_broadcast: {
		kind: "agency_broadcast",
		title: "Outlet swap — your answer is needed",
		body: "",
		payload: { swapId: "w" },
	},
	subscription_tier_weekly: {
		kind: "subscription_tier_weekly",
		title: "5 PV last week · staying on Growth",
		body: "",
		payload: { pvCount: 5, planName: "Growth", outcome: "unchanged" },
	},
	subscription_invoice_opened: {
		kind: "subscription_invoice_opened",
		title: "New bill: RM 10.00",
		body: "",
		payload: { amount: "10.00", currency: "MYR" },
	},
	subscription_autopay_failed: {
		kind: "subscription_autopay_failed",
		title: "Automatic payment failed: RM 10.00",
		body: "",
		payload: { amount: "10.00", currency: "MYR" },
	},
};

describe("every kind the bell can receive", () => {
	it("the web enum still matches the backend's list", () => {
		expect(Object.keys(ONE_PER_KIND).sort()).toEqual([...BACKEND_KINDS].sort());
	});

	it.each(BACKEND_KINDS)("%s is worded in Chinese", (kind) => {
		const row = ONE_PER_KIND[kind];
		const out = zh(row);
		expect(out.title).not.toBe(row.title);
		expect(out.title).toMatch(HAS_CJK);
	});
});

describe("what falls through to the stored English", () => {
	it("an agency's own broadcast — a person's words, never translated", () => {
		const row = {
			kind: "agency_broadcast" as const,
			title: "Team meeting",
			body: "Friday 5pm at the office",
			payload: { agencyId: "g" },
		};
		expect(zh(row)).toEqual({ title: row.title, body: row.body });
	});

	it("a kind the server added after this build", () => {
		const row = {
			kind: "brand_new_kind" as NotificationRecord["kind"],
			title: "Something new",
			body: "body",
			payload: null,
		};
		expect(zh(row)).toEqual({ title: "Something new", body: "body" });
	});

	it("a body that no longer matches its producer keeps its English, field by field", () => {
		const out = zh({
			kind: "overtime_pending_approval",
			title: "Overtime needs approval",
			body: "A reworded sentence from a newer backend",
			payload: { overtimeMinutes: 45 },
		});
		expect(out.title).toBe(translations.zh.notifications.srvOvertimeTitle);
		expect(out.body).toBe("A reworded sentence from a newer backend");
	});

	it("a malformed payload never blanks the row", () => {
		const row = {
			kind: "subscription_invoice_opened" as const,
			title: "New bill: RM 10.00",
			body: "stored",
			payload: { amount: "not money", currency: "MYR" },
		};
		expect(zh(row)).toEqual({ title: row.title, body: row.body });
		expect(
			zh({ ...row, kind: "pv_day_review_pending", payload: { weekStart: 7 } }),
		).toEqual({ title: row.title, body: row.body });
	});

	it("a shift_cancelled title no producer wrote is left alone", () => {
		const row = {
			kind: "shift_cancelled" as const,
			title: "Your shift was cancelled",
			body: "2026-09-20",
			payload: { assignmentId: "a", shiftId: "s" },
		};
		expect(zh(row)).toEqual({ title: row.title, body: row.body });
	});

	it("a decision word the producers never send keeps the row as stored", () => {
		for (const row of [
			{
				kind: "leave_decided" as const,
				title: "MC / leave approved",
				body: "stored",
				payload: { decision: "maybe" },
			},
			{
				kind: "overtime_decided" as const,
				title: "Overtime approved",
				body: "stored",
				payload: { decision: "approved" },
			},
			{
				kind: "payment_voucher_dispute_resolved" as const,
				title: "Your dispute was accepted",
				body: "stored",
				payload: {},
			},
			{
				kind: "agency_join_resolved" as const,
				title: "A newer backend's title",
				body: "stored",
				payload: { approveStatus: "approved" },
			},
		]) {
			expect(zh(row)).toEqual({ title: row.title, body: row.body });
		}
	});
});
