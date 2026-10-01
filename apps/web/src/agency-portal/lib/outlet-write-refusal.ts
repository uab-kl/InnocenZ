/**
 * THE OUTLET'S WRITES, REFUSED IN THE READER'S WORDS.
 *
 * Post Job, the shift sheet (confirm staffing, seal, withdraw), Log Sales,
 * cut-loss and ratings all show the server's own sentence when a write is
 * refused — rightly: "Your Growth plan covers 10 PRs a day…" is the whole value
 * of the refusal, and the owner's rule is that every action answers in the
 * server's words. Those sentences are English, so a 中文 venue read the one line
 * that explained a failure in a language it had not chosen.
 *
 * The same shape as `member-change-copy.ts` and `pr-write-refusal.ts`: the wire
 * stays English and the render translates, compared without a trailing full
 * stop. Fixed sentences are a lookup; sentences that carry values (a plan, a
 * date, a time window, an event name) are matched by a pattern anchored on the
 * producer's exact wording, and the values pass through. A sentence neither
 * knows is shown AS THE SERVER WROTE IT — never swallowed, never replaced by a
 * generic "failed".
 *
 * Sentences read on 29 Sep 2026 from:
 *   shift.controller      create / update / remove, `demandExceedsQuantity`,
 *                         `planCapacityRefusal`, `venueNotLiveRefusal`,
 *                         `shiftClashRefusal`
 *   shift.schema          SLOT_NEEDS_WINDOW and the length limits Post Job can hit
 *   shift-sale.controller create; shift-sale.schema
 *   cutlost.controller    create
 *   rating.controller     create
 *   middlewares           requirePermission, requireOutletPermissionIfMember,
 *                         requireOutletSubRole, requireOutletMember
 * and on 30 Sep 2026 from `POST /shift/batch`: shift.schema `SHIFT_BATCH_EMPTY`
 * and `SHIFT_BATCH_TOO_MANY`, and shift.controller `shiftsPostedMessage`.
 *
 * Leaf on purpose: the dictionary TYPE, `fill`, the role resolver and the date
 * labels — never the locale context, which imports `lib/auth` back (see
 * auth-server-copy.ts).
 */
import { weekdayDayMonthLabel } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";
import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type Label = (t: PortalTranslations) => string;

type Rule = {
	pattern: RegExp;
	render: (t: PortalTranslations, match: RegExpExecArray) => string;
};

/** Keyed on the server's exact English, compared without a trailing full stop. */
export const OUTLET_WRITE_SENTENCES: Record<string, Label> = {
	// POST /shift — Post Job.
	"No approved agency to request PR from — link an agency in Settings first": (
		t,
	) => t.outletServer.noApprovedAgency,
	"None of the selected agencies are approved for this outlet": (t) =>
		t.outletServer.selectedAgenciesNotApproved,
	"You can only create shifts for your own outlet": (t) =>
		t.outletServer.ownOutletOnly,
	"Only an outlet can post a shift. The outlet posts the job to its agency": (
		t,
	) => t.outletServer.onlyOutletPosts,
	"No organization associated with this account": (t) =>
		t.outletServer.noOrganisation,
	"Unknown event template for this outlet": (t) =>
		t.outletServer.unknownTemplate,
	"This venue is still awaiting InnocenZ approval, so it cannot post shifts yet. You will be notified as soon as it is approved":
		(t) => t.outletServer.venuePending,
	"This venue has no active subscription plan, so it cannot post shifts. Choose a plan under Settings → Subscription, or contact InnocenZ":
		(t) => t.outletServer.noPlan,
	'Give the shift a time window such as "22:00 - 04:00" — a label on its own cannot be checked for clashes':
		(t) => t.outletServer.slotNeedsWindow,
	"Event name is too long": (t) => t.outletServer.eventNameTooLong,
	"The event name is too long": (t) => t.outletServer.specialNameTooLong,
	"Languages is too long": (t) => t.outletServer.languagesTooLong,
	"Dress code is too long": (t) => t.outletServer.dressCodeTooLong,
	// POST /shift/batch — Post Job's shifts, all or nothing.
	"Add at least one shift to post": (t) => t.outletServer.batchEmpty,
	// PUT / DELETE /shift/:id — the shift sheet.
	"This shift has no scheduled time, so it cannot be sealed": (t) =>
		t.outletServer.noTimeCannotSeal,
	"A shift can only be sealed after it has finished": (t) =>
		t.outletServer.sealAfterFinish,
	"This shift is today or has already passed — it can no longer be withdrawn. Contact the agency to stand the team down":
		(t) => t.outletServer.cannotWithdrawToday,
	// POST /shift-sale — Log Sales.
	"Shift not found": (t) => t.outletServer.shiftNotFound,
	"PR not found": (t) => t.outletServer.prNotFound,
	"PR is not actively assigned to this shift": (t) =>
		t.outletServer.prNotOnShift,
	"The sales total is too large": (t) => t.outletServer.salesTotalTooLarge,
	// POST /cutlost — raising a cut-loss request.
	"Only the venue can raise a cut-loss request": (t) =>
		t.outletServer.onlyVenueCutLoss,
	"One or more assignments are not on this shift": (t) =>
		t.outletServer.assignmentsNotOnShift,
	"One or more PRs are not on this shift": (t) => t.outletServer.prsNotOnShift,
	"Invalid request": (t) => t.outletServer.invalidRequest,
	// POST /rating.
	"That shift does not belong to this PR at this outlet": (t) =>
		t.outletServer.ratingShiftMismatch,
	// Lane guards.
	"Forbidden — not a member of this outlet": (t) =>
		t.outletServer.notOutletMember,
};

/** A stored venue status, named in the reader's words; an unknown one as sent. */
function venueStatus(status: string, t: PortalTranslations): string {
	if (status === "suspended") return t.outletServer.venueSuspended;
	if (status === "inactive") return t.outletServer.venueInactive;
	return status;
}

/** Exported for the test, which checks each against the backend's own wording. */
export const OUTLET_WRITE_RULES: readonly Rule[] = [
	{
		// planCapacityRefusal — the plan's daily PR allowance.
		pattern:
			/^Your (.+) plan covers (\d+) PRs? a day\. (\d+) already requested on (\d{4}-\d{2}-\d{2}), so this shift can ask for at most (\d+) more — lower the headcount or upgrade the plan$/,
		render: (t, m) =>
			fill(
				m[2] === "1"
					? t.outletServer.planCapacityOne
					: t.outletServer.planCapacityMany,
				{
					plan: m[1] ?? "",
					limit: m[2] ?? "",
					used: m[3] ?? "",
					date: m[4] ?? "",
					left: m[5] ?? "",
				},
			),
	},
	{
		// demandExceedsQuantity — the tier rows ask for more than the headcount.
		pattern:
			/^The pay tiers ask for (\d+) PRs but this shift only has (\d+) slots? — lower a tier's count or raise the headcount$/,
		render: (t, m) =>
			fill(
				m[2] === "1"
					? t.outletServer.tiersOverAskedOne
					: t.outletServer.tiersOverAskedMany,
				{ asked: m[1] ?? "", slots: m[2] ?? "" },
			),
	},
	{
		// shiftClashRefusal — the same time twice.
		pattern:
			/^You already have a shift at (.+?) on (\d{4}-\d{2}-\d{2})(?: \("(.*)"\))?\. Raise that shift's headcount instead of posting a second one for the same time$/,
		render: (t, m) =>
			fill(m[3] ? t.outletServer.sameWindowNamed : t.outletServer.sameWindow, {
				slot: m[1] ?? "",
				date: m[2] ?? "",
				event: m[3] ?? "",
			}),
	},
	{
		// shiftClashRefusal — an overlap.
		pattern:
			/^This clashes with your shift at (.+?) on (\d{4}-\d{2}-\d{2})(?: \("(.*)"\))? — an outlet's shifts cannot overlap\. Change this shift's time, or move the other one first$/,
		render: (t, m) =>
			fill(m[3] ? t.outletServer.overlapNamed : t.outletServer.overlap, {
				slot: m[1] ?? "",
				date: m[2] ?? "",
				event: m[3] ?? "",
			}),
	},
	{
		// SHIFT_BATCH_TOO_MANY — more shifts than one post may carry.
		pattern:
			/^You can post at most (\d+) shifts at once — split the rest into a second post$/,
		render: (t, m) => fill(t.outletServer.batchTooMany, { max: m[1] ?? "" }),
	},
	{
		// venueNotLiveRefusal — a suspended or inactive venue.
		pattern:
			/^This venue is (\S+) and cannot post shifts\. Contact InnocenZ to restore access$/,
		render: (t, m) =>
			fill(t.outletServer.venueBlocked, {
				status: venueStatus(m[1] ?? "", t),
			}),
	},
	{
		// requirePermission.
		pattern:
			/^Forbidden — requires (create|read|update|delete) on module (\S+)$/,
		render: (t, m) =>
			fill(t.outletServer.forbiddenPermission, {
				verb: m[1] ?? "",
				module: m[2] ?? "",
			}),
	},
	{
		// requireOutletPermissionIfMember.
		pattern: /^Forbidden — requires ([\w-]+):(create|read|update|delete)$/,
		render: (t, m) =>
			fill(t.outletServer.forbiddenPermissionShort, {
				module: m[1] ?? "",
				verb: m[2] ?? "",
			}),
	},
	{
		// requireOutletSubRole — the lanes that may, e.g. "owner or finance".
		pattern: /^Forbidden — requires role: (.+)$/,
		render: (t, m) =>
			fill(t.outletServer.forbiddenRole, {
				roles: (m[1] ?? "")
					.split(" or ")
					.map((role) => portalRoleLabel(role, t))
					.join(t.outletServer.forbiddenRoleJoin),
			}),
	},
];

/** One outlet-write sentence in the reader's language; unknown ones verbatim. */
export function localiseOutletWriteMessage(
	message: string,
	t: PortalTranslations,
): string {
	const key = message.trim().replace(/\.$/, "");
	const label = OUTLET_WRITE_SENTENCES[key];
	if (label) return label(t);
	for (const rule of OUTLET_WRITE_RULES) {
		const match = rule.pattern.exec(key);
		if (match) return rule.render(t, match);
	}
	return message;
}

/**
 * Status words the error enum sends when it has nothing to say — "Not Found",
 * "Forbidden". The caller's own sentence ("Could not log this sale") says more.
 */
const GENERIC = new Set([
	"Not Found",
	"Internal Server Error",
	"Unauthorized",
	"Forbidden",
	"Bad Request",
]);

/** The `message` of a refused request's body, when the server sent one. */
function refusalSentence(error: unknown): string {
	const message = (
		error as { response?: { data?: { message?: unknown } } } | null | undefined
	)?.response?.data?.message;
	return typeof message === "string" ? message.trim() : "";
}

/**
 * An outlet write's SUCCESS sentences, keyed on the server's exact English
 * (confirm-every-action: show the server's own line, in the reader's language).
 */
export const OUTLET_WRITE_SUCCESS_SENTENCES: Record<string, Label> = {
	// `SHIFT_SEALED_MESSAGE`, backend shift.controller.ts — change both together.
	"Shift sealed — no one else can be added to it": (t) =>
		t.calendar.closedToast,
	"Shift removed": (t) => t.calendar.withdrawnToast,
	// A close that lands on a night another tab already closed answers the plain
	// update sentence (code review, 29 Sep) — translated too.
	"Shift updated": (t) => t.calendar.updatedToast,
};

/** Success sentences that carry a value — matched like `OUTLET_WRITE_RULES`. */
export const OUTLET_WRITE_SUCCESS_RULES: readonly Rule[] = [
	{
		// `shiftsPostedMessage`, backend shift.controller.ts — POST /shift/batch.
		pattern: /^Posted (\d+) shifts?$/,
		render: (t, m) =>
			fill(
				m[1] === "1" ? t.postJob.postedShiftOne : t.postJob.postedShiftMany,
				{ n: m[1] ?? "" },
			),
	},
];

/**
 * The confirmation of an outlet write, translated — or `fallback` (already in
 * the reader's language) when the server sent no sentence. An unknown sentence
 * is shown as the server wrote it.
 */
export function outletWriteSuccessText(
	message: string | null | undefined,
	t: PortalTranslations,
	fallback: string,
): string {
	const key = (message ?? "").trim().replace(/\.$/, "");
	if (!key) return fallback;
	const label = OUTLET_WRITE_SUCCESS_SENTENCES[key];
	if (label) return label(t);
	for (const rule of OUTLET_WRITE_SUCCESS_RULES) {
		const match = rule.pattern.exec(key);
		if (match) return rule.render(t, match);
	}
	return key;
}

/**
 * The refusal of an outlet write, translated — or `fallback` (already in the
 * reader's language) when the server gave no reason: a dropped connection, a
 * bare status word, an error thrown before the request left.
 */
export function outletWriteRefusalText(
	error: unknown,
	t: PortalTranslations,
	fallback: string,
): string {
	const message = refusalSentence(error);
	if (!message || GENERIC.has(message.replace(/\.$/, ""))) return fallback;
	return localiseOutletWriteMessage(message, t);
}

/**
 * The item a `POST /shift/batch` refusal stopped on — its `data: { index,
 * shiftDate }` — or null when the refusal named none (the envelope, a lane
 * guard, a dropped connection).
 */
export function refusedBatchItem(
	error: unknown,
): { index: number; shiftDate: string | null } | null {
	const data = (
		error as { response?: { data?: { data?: unknown } } } | null | undefined
	)?.response?.data?.data as
		| { index?: unknown; shiftDate?: unknown }
		| null
		| undefined;
	if (!data || typeof data.index !== "number") return null;
	return {
		index: data.index,
		shiftDate: typeof data.shiftDate === "string" ? data.shiftDate : null,
	};
}

/** "Mon 12 Oct" / "周一 12 10月" — a batch item's day, in the reader's words. */
function batchItemDayLabel(iso: string, t: PortalTranslations): string {
	const day = new Date(`${iso.slice(0, 10)}T00:00:00`);
	if (Number.isNaN(day.getTime())) return iso;
	const { weekday, dayMonth } = weekdayDayMonthLabel(day, t);
	return `${weekday} ${dayMonth}`;
}

/**
 * A refused BATCH of shifts, translated: the server's reason, prefixed with the
 * fact that NOTHING was posted and the day of the shift it stopped on — so a
 * venue that sent a week of shifts knows which one to fix, and that none of the
 * others went through either. The plain translated refusal when the server
 * named no item.
 */
export function outletBatchRefusalText(
	error: unknown,
	t: PortalTranslations,
	fallback: string,
): string {
	const reason = outletWriteRefusalText(error, t, fallback);
	const shiftDate = refusedBatchItem(error)?.shiftDate;
	if (!shiftDate) return reason;
	return fill(t.postJob.batchRefusedOn, {
		date: batchItemDayLabel(shiftDate, t),
		reason,
	});
}
