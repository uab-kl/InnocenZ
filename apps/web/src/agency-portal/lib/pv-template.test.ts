import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A REAL SESSION MUST NEVER PRINT DEMO BANK DETAILS ON A PAYMENT VOUCHER.
 *
 * Found in testing, 2 Sep 2026: a real agency opening a real voucher for a real
 * PR saw "Maybank / 5142 8890 1123" — the hardcoded `PR_PROFILES.pr_tied`
 * fixture — on the one document whose entire job is to say where to send money.
 * The PR's actual bank fields were null.
 *
 * `findDemoProfileForPv` matches on `name === pv.prName || ic === pv.prIc`, and
 * the seeded PRs carry the SAME ICs as the demo profiles, so the match was
 * guaranteed rather than unlucky.
 *
 * Worth knowing while reading this: there were TWO demo lookups, and gating
 * only the outer one (`buildAgencyPayee`) changed nothing on screen — the inner
 * `payeeFromPaymentVoucher` looked the fixture up again and used it as the BASE
 * profile, so `bank: undefined` fell straight through to `demo.bank`. These
 * tests assert the OUTPUT, not the internals, so they would have caught that
 * half-fix.
 */

const mockKind = vi.fn<() => string | null>();
vi.mock("@/lib/auth/agency-demo-session", () => ({
	getPortalSessionKind: () => mockKind(),
}));

const { buildAgencyPayee } = await import("./pv-template");

/** Matches PR_PROFILES.pr_tied on BOTH name and ic — the real-world case. */
const pv = {
	id: "62663ee7-02b5-4160-92f3-eaa32b3508f3",
	prName: "Vicky",
	prIc: "950312-14-8821",
	rows: [],
	deduct: 0,
	status: "PENDING_REVIEW",
} as never;

afterEach(() => vi.clearAllMocks());

describe("buildAgencyPayee — demo bank details", () => {
	it("does NOT print demo bank details on a real session", () => {
		mockKind.mockReturnValue("real");
		const payee = buildAgencyPayee(pv, []);
		expect(payee.bank ?? "").not.toContain("Maybank");
		expect(payee.accountNo ?? "").not.toContain("5142");
	});

	it("leaves bank BLANK when the PR has not entered one", () => {
		// Blank says "we do not know where to pay this person" — true and
		// actionable. A plausible wrong number says nothing and invites a
		// transfer to somebody else's account.
		mockKind.mockReturnValue("real");
		const payee = buildAgencyPayee(pv, [], {
			bankName: null,
			bankAccountNo: null,
		});
		expect(payee.bank ?? "").toBe("");
		expect(payee.accountNo ?? "").toBe("");
	});

	it("prints the REAL bank details when the PR has entered them", () => {
		mockKind.mockReturnValue("real");
		const payee = buildAgencyPayee(pv, [], {
			bankName: "Public Bank",
			bankAccountNo: "0123456789",
		});
		expect(payee.bank).toBe("Public Bank");
		// Full number, not masked: this document is what a bank is paid from.
		expect(payee.accountNo).toBe("0123456789");
	});

	/**
	 * The fixture supplied MORE than the bank. Gating it off without replacing
	 * the rest printed the legal name twice, an empty phone, and a payee code
	 * derived from the wrong string — the second incomplete fix in a row on this
	 * function, which is why these are asserted together now.
	 */
	it("prints the real nickname and phone, not blanks", () => {
		mockKind.mockReturnValue("real");
		const payee = buildAgencyPayee(pv, [], {
			bankName: null,
			bankAccountNo: null,
			nickname: "Vicky",
			phone: "+60123456789",
		});
		expect(payee.nickname).toBe("Vicky");
		expect(payee.phone).toBe("+60123456789");
		// The code derives from the working name, so a wrong nickname silently
		// changes the payee code too (VICK-8821 became VICT-8821).
		expect(payee.code).toContain("VICK");
	});

	it("still uses the fixture on a DEMO session — that is what demo is for", () => {
		mockKind.mockReturnValue("demo");
		const payee = buildAgencyPayee(pv, []);
		expect(payee.bank).toBe("Maybank");
		expect(payee.accountNo).toBe("5142 8890 1123");
	});
});

/**
 * THE "#" COLUMN COUNTS FROM 1.
 *
 * Reported 3 Sep 2026: a 19-line voucher printed rows 0…18. `PrPvRow.i` is
 * `payment_voucher_line.sort_order`, which is zero-based, and the template was
 * printing it raw — so every PR received a document whose first item was "0"
 * and whose last number was one short of its own line count.
 */
describe("buildPvTemplateLines — the printed sequence", () => {
	const row = (i: number, desc: string, amt: number) => ({
		i,
		date: "2026-08-23",
		day: "",
		outlet: "JK House",
		desc,
		qty: 1,
		amt,
		ref: "",
	});

	it("numbers from 1 even though sort_order starts at 0", async () => {
		const { buildPvTemplateLines } = await import("./pv-template");
		const lines = buildPvTemplateLines({
			rows: [row(0, "Tips", 7.5), row(1, "Havoc", 300), row(2, "Donjulio", 20)],
			deduct: 0,
		} as never);
		expect(lines.map((l) => l.seq)).toEqual(["1", "2", "3"]);
	});

	it("stays contiguous when sort_order has a gap", async () => {
		const { buildPvTemplateLines } = await import("./pv-template");
		const lines = buildPvTemplateLines({
			rows: [row(0, "Tips", 7.5), row(3, "Havoc", 300)],
			deduct: 0,
		} as never);
		expect(lines.map((l) => l.seq)).toEqual(["1", "2"]);
	});

	it("continues the sequence onto the deductions row", async () => {
		const { buildPvTemplateLines } = await import("./pv-template");
		const lines = buildPvTemplateLines({
			rows: [row(0, "Tips", 7.5), row(1, "Havoc", 300)],
			deduct: 50,
		} as never);
		expect(lines.map((l) => l.seq)).toEqual(["1", "2", "3"]);
		expect(lines.at(-1)?.description).toBe("Deductions");
	});
});
