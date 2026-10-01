import {
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from "axios";
import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	localiseOutletWriteMessage,
	OUTLET_WRITE_RULES,
	OUTLET_WRITE_SENTENCES,
	OUTLET_WRITE_SUCCESS_RULES,
	outletBatchRefusalText,
	outletWriteRefusalText,
	outletWriteSuccessText,
	refusedBatchItem,
} from "./outlet-write-refusal";

/**
 * Copied from the PRODUCERS (29 Sep 2026) — shift.controller, shift.schema,
 * shift-sale.controller/schema, cutlost.controller, rating.controller and the
 * lane guards — not from the module's map, so a map that forgets or misspells
 * one fails here instead of quietly showing English.
 */
const FIXED_SENTENCES = [
	"No approved agency to request PR from — link an agency in Settings first",
	"None of the selected agencies are approved for this outlet",
	"You can only create shifts for your own outlet",
	"Only an outlet can post a shift. The outlet posts the job to its agency.",
	"No organization associated with this account",
	"Unknown event template for this outlet",
	"This venue is still awaiting InnocenZ approval, so it cannot post shifts yet. You will be notified as soon as it is approved.",
	"This venue has no active subscription plan, so it cannot post shifts. Choose a plan under Settings → Subscription, or contact InnocenZ.",
	'Give the shift a time window such as "22:00 - 04:00" — a label on its own cannot be checked for clashes.',
	"Event name is too long",
	"The event name is too long",
	"Languages is too long",
	"Dress code is too long",
	// shift.schema SHIFT_BATCH_EMPTY — POST /shift/batch (30 Sep 2026).
	"Add at least one shift to post.",
	"This shift has no scheduled time, so it cannot be sealed",
	"A shift can only be sealed after it has finished",
	"This shift is today or has already passed — it can no longer be withdrawn. Contact the agency to stand the team down.",
	"Shift not found",
	"PR not found",
	"PR is not actively assigned to this shift",
	"The sales total is too large",
	"Only the venue can raise a cut-loss request",
	"One or more assignments are not on this shift",
	"One or more PRs are not on this shift",
	"Invalid request",
	"That shift does not belong to this PR at this outlet.",
	"Forbidden — not a member of this outlet",
];

/** Sentences carrying values, each with the values that must survive. */
const VALUED_SENTENCES: [string, string[]][] = [
	[
		"Your Growth plan covers 10 PRs a day. 8 already requested on 2026-09-20, so this shift can ask for at most 2 more — lower the headcount or upgrade the plan.",
		["Growth", "10", "8", "2026-09-20", "2"],
	],
	[
		"Your Starter plan covers 1 PR a day. 1 already requested on 2026-09-20, so this shift can ask for at most 0 more — lower the headcount or upgrade the plan.",
		["Starter", "2026-09-20", "0"],
	],
	[
		"The pay tiers ask for 5 PRs but this shift only has 3 slots — lower a tier's count or raise the headcount.",
		["5", "3"],
	],
	[
		"The pay tiers ask for 2 PRs but this shift only has 1 slot — lower a tier's count or raise the headcount.",
		["2", "1"],
	],
	[
		'You already have a shift at 22:00 - 04:00 on 2026-09-20 ("Ladies Night"). Raise that shift\'s headcount instead of posting a second one for the same time.',
		["22:00 - 04:00", "2026-09-20", "Ladies Night"],
	],
	[
		"You already have a shift at 22:00 - 04:00 on 2026-09-20. Raise that shift's headcount instead of posting a second one for the same time.",
		["22:00 - 04:00", "2026-09-20"],
	],
	[
		"This clashes with your shift at 21:00 - 03:00 on 2026-09-20 (\"VIP night\") — an outlet's shifts cannot overlap. Change this shift's time, or move the other one first.",
		["21:00 - 03:00", "2026-09-20", "VIP night"],
	],
	[
		"This clashes with your shift at 21:00 - 03:00 on 2026-09-20 — an outlet's shifts cannot overlap. Change this shift's time, or move the other one first.",
		["21:00 - 03:00", "2026-09-20"],
	],
	[
		"This venue is suspended and cannot post shifts. Contact InnocenZ to restore access.",
		[],
	],
	[
		"This venue is inactive and cannot post shifts. Contact InnocenZ to restore access.",
		[],
	],
	["Forbidden — requires create on module booking", ["booking", "create"]],
	["Forbidden — requires sales:create", ["sales", "create"]],
	// shift.schema SHIFT_BATCH_TOO_MANY — POST /shift/batch (30 Sep 2026).
	[
		"You can post at most 31 shifts at once — split the rest into a second post.",
		["31"],
	],
];

const ROLE_REFUSAL =
	"Forbidden — requires role: owner or finance or operations_head";

const HAS_CJK = /[㐀-鿿]/;
/** English sentence words that must not survive into the Chinese. */
const ENGLISH_PROSE =
	/\b(the|shift|venue|plan|cannot|already|requires|module|slot|PRs)\b/;

function refusal(status: number, message?: string): AxiosError {
	const config = { headers: {} } as InternalAxiosRequestConfig;
	const response: AxiosResponse = {
		data: message === undefined ? {} : { success: false, message, data: null },
		status,
		statusText: String(status),
		headers: {},
		config,
		request: {},
	};
	return new AxiosError(
		`Request failed with status code ${status}`,
		AxiosError.ERR_BAD_REQUEST,
		config,
		{},
		response,
	);
}

describe("localiseOutletWriteMessage — fixed sentences", () => {
	it.each(FIXED_SENTENCES)("translates %s", (sentence) => {
		const zh = localiseOutletWriteMessage(sentence, translations.zh);
		expect(zh).not.toBe(sentence);
		expect(zh).toMatch(HAS_CJK);
		expect(zh).not.toMatch(ENGLISH_PROSE);
	});

	it.each(
		FIXED_SENTENCES,
	)("reads in English exactly as sent: %s", (sentence) => {
		expect(localiseOutletWriteMessage(sentence, translations.en)).toBe(
			sentence,
		);
	});

	it("every fixed entry is a sentence a producer really sends", () => {
		const sent = new Set(FIXED_SENTENCES.map((s) => s.replace(/\.$/, "")));
		for (const key of Object.keys(OUTLET_WRITE_SENTENCES)) {
			expect(sent.has(key)).toBe(true);
		}
	});
});

describe("localiseOutletWriteMessage — sentences with values", () => {
	it.each(VALUED_SENTENCES)("translates %s", (sentence, values) => {
		const zh = localiseOutletWriteMessage(sentence, translations.zh);
		expect(zh).not.toBe(sentence);
		expect(zh).toMatch(HAS_CJK);
		expect(zh).not.toContain("{");
		for (const value of values) expect(zh).toContain(value);
	});

	it.each(
		VALUED_SENTENCES,
	)("reads in English exactly as sent: %s", (sentence) => {
		expect(localiseOutletWriteMessage(sentence, translations.en)).toBe(
			sentence,
		);
	});

	it("names a suspended venue's state in Chinese, not as the stored word", () => {
		const zh = localiseOutletWriteMessage(
			"This venue is suspended and cannot post shifts. Contact InnocenZ to restore access.",
			translations.zh,
		);
		expect(zh).toContain(translations.zh.outletServer.venueSuspended);
		expect(zh).not.toContain("suspended");
	});

	it("an unknown venue state passes through inside the sentence", () => {
		expect(
			localiseOutletWriteMessage(
				"This venue is archived and cannot post shifts. Contact InnocenZ to restore access.",
				translations.zh,
			),
		).toContain("archived");
	});

	it("names the lanes that may, in the reader's words", () => {
		const zh = localiseOutletWriteMessage(ROLE_REFUSAL, translations.zh);
		expect(zh).toContain(translations.zh.profile.roleOwner);
		expect(zh).toContain(translations.zh.profile.roleFinance);
		expect(zh).toContain(translations.zh.profile.roleOps);
		expect(zh).not.toContain("operations_head");
		// English names the lanes by their labels rather than their codes.
		expect(localiseOutletWriteMessage(ROLE_REFUSAL, translations.en)).toBe(
			"Forbidden — requires role: Owner or Financial Head or Ops Head",
		);
	});

	it("every pattern is exercised by a producer's sentence", () => {
		const sentences = [...VALUED_SENTENCES.map(([s]) => s), ROLE_REFUSAL].map(
			(s) => s.trim().replace(/\.$/, ""),
		);
		for (const rule of OUTLET_WRITE_RULES) {
			expect(sentences.some((s) => rule.pattern.test(s))).toBe(true);
		}
	});

	it("a sentence it does not know is shown as the server wrote it", () => {
		const unknown =
			"A PR on this shift is not available at that time — pick another time, or unassign them here.";
		expect(localiseOutletWriteMessage(unknown, translations.zh)).toBe(unknown);
	});
});

describe("outletWriteRefusalText", () => {
	const fallback = translations.zh.today.couldNotLogSale;

	it("translates the server's refusal", () => {
		expect(
			outletWriteRefusalText(
				refusal(400, "PR is not actively assigned to this shift"),
				translations.zh,
				fallback,
			),
		).toBe(translations.zh.outletServer.prNotOnShift);
	});

	it("keeps an unknown refusal as sent", () => {
		expect(
			outletWriteRefusalText(
				refusal(409, "Something a newer backend says"),
				translations.zh,
				fallback,
			),
		).toBe("Something a newer backend says");
	});

	it.each([
		["a bare status word", refusal(404, "Not Found")],
		["a 500", refusal(500, "Internal Server Error")],
		["a plain Forbidden", refusal(403, "Forbidden")],
		["no message at all", refusal(400)],
		["an empty message", refusal(400, "  ")],
		["a request that never reached the server", new Error("Network Error")],
		["nothing thrown", undefined],
	])("falls back to the caller's sentence for %s", (_label, error) => {
		expect(outletWriteRefusalText(error, translations.zh, fallback)).toBe(
			fallback,
		);
	});
});

describe("outletWriteSuccessText — the server's confirmation, translated", () => {
	// Copied from the producer: SHIFT_SEALED_MESSAGE and DELETE /shift/:id.
	const SEALED = "Shift sealed — no one else can be added to it";
	const REMOVED = "Shift removed";

	it("translates the close and withdraw sentences", () => {
		expect(outletWriteSuccessText(SEALED, translations.zh, "x")).toBe(
			translations.zh.calendar.closedToast,
		);
		expect(outletWriteSuccessText(REMOVED, translations.zh, "x")).toBe(
			translations.zh.calendar.withdrawnToast,
		);
		expect(outletWriteSuccessText(SEALED, translations.en, "x")).toBe(
			translations.en.calendar.closedToast,
		);
	});

	it("shows an unknown sentence as sent, and the fallback when there is none", () => {
		expect(outletWriteSuccessText("Shift updated", translations.zh, "x")).toBe(
			translations.zh.calendar.updatedToast,
		);
		expect(outletWriteSuccessText("Something new", translations.zh, "x")).toBe(
			"Something new",
		);
		expect(outletWriteSuccessText("", translations.en, "fallback")).toBe(
			"fallback",
		);
		expect(outletWriteSuccessText(undefined, translations.en, "fallback")).toBe(
			"fallback",
		);
	});

	// Copied from the producer: `shiftsPostedMessage`, POST /shift/batch.
	it.each([
		["Posted 3 shifts", "3", "postedShiftMany"],
		["Posted 1 shift", "1", "postedShiftOne"],
	] as const)("translates the batch confirmation %s", (sentence, n, key) => {
		expect(outletWriteSuccessText(sentence, translations.zh, "x")).toBe(
			translations.zh.postJob[key].replace("{n}", n),
		);
		// English reads exactly what the server said.
		expect(outletWriteSuccessText(sentence, translations.en, "x")).toBe(
			sentence,
		);
	});

	it("every success pattern is exercised by a producer's sentence", () => {
		const sentences = ["Posted 3 shifts", "Posted 1 shift"];
		for (const rule of OUTLET_WRITE_SUCCESS_RULES) {
			expect(sentences.some((s) => rule.pattern.test(s))).toBe(true);
		}
	});
});

describe("a refused batch — POST /shift/batch", () => {
	const CLASH =
		"This clashes with your shift at 22:00 - 04:00 on 2026-10-11 — an outlet's shifts cannot overlap. Change this shift's time, or move the other one first.";

	/** A batch refusal: the sentence, plus the item it stopped on. */
	function batchRefusal(message: string, data: unknown): AxiosError {
		const error = refusal(409, message);
		(error.response as AxiosResponse).data = {
			success: false,
			message,
			data,
		};
		return error;
	}

	it("reads the item the server stopped on", () => {
		expect(
			refusedBatchItem(
				batchRefusal(CLASH, { index: 2, shiftDate: "2026-10-12" }),
			),
		).toEqual({ index: 2, shiftDate: "2026-10-12" });
		expect(
			refusedBatchItem(batchRefusal(CLASH, { index: 0, shiftDate: null })),
		).toEqual({ index: 0, shiftDate: null });
	});

	it.each([
		["an envelope refusal", refusal(400, "Add at least one shift to post.")],
		[
			"a lane guard",
			refusal(403, "Forbidden — requires create on module booking"),
		],
		["a malformed item record", batchRefusal(CLASH, { index: "2" })],
		["a request that never reached the server", new Error("Network Error")],
		["nothing thrown", undefined],
	])("names no item for %s", (_label, error) => {
		expect(refusedBatchItem(error)).toBeNull();
	});

	it("says nothing was posted and names the refused day, in English", () => {
		expect(
			outletBatchRefusalText(
				batchRefusal(CLASH, { index: 1, shiftDate: "2026-10-12" }),
				translations.en,
				"fallback",
			),
		).toBe(
			`Nothing was posted — the shift on Mon 12 Oct was refused: ${CLASH}`,
		);
	});

	it("and in Chinese — the day, the frame and the reason all translated", () => {
		const zh = outletBatchRefusalText(
			batchRefusal(CLASH, { index: 1, shiftDate: "2026-10-12" }),
			translations.zh,
			"fallback",
		);
		expect(zh).toContain(
			`${translations.zh.dates.weekdayMon} 12 ${translations.zh.dates.monShortOct}`,
		);
		expect(zh).toContain(localiseOutletWriteMessage(CLASH, translations.zh));
		expect(zh).toMatch(HAS_CJK);
		expect(zh).not.toContain("{");
		expect(zh).not.toMatch(/\b(Nothing|posted|refused)\b/);
	});

	it("is the plain refusal when no item was named", () => {
		const tooMany = refusal(
			400,
			"You can post at most 31 shifts at once — split the rest into a second post.",
		);
		expect(outletBatchRefusalText(tooMany, translations.zh, "fallback")).toBe(
			outletWriteRefusalText(tooMany, translations.zh, "fallback"),
		);
		expect(
			outletBatchRefusalText(
				batchRefusal(CLASH, { index: 0, shiftDate: null }),
				translations.en,
				"fallback",
			),
		).toBe(CLASH);
		expect(
			outletBatchRefusalText(new Error("Network Error"), translations.zh, "x"),
		).toBe("x");
	});
});
