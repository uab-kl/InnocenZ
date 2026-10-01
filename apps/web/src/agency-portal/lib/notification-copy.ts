/**
 * STORED ENGLISH NOTIFICATION ROWS → THE PORTAL'S LANGUAGE, AT THE RENDER.
 *
 * The web twin of the PR app's `apps/mobile/src/lib/notification-copy.ts`, for
 * the kinds that reach AGENCY and OUTLET members — the rows the portal bells
 * show. A `notification` row is written once by the backend and persisted, so
 * the wire stays English and this maps it onto the dictionary when it is drawn.
 * Translating the producer instead would bake one language into the table.
 *
 * ⚠️ Keyed on `kind` and `payload` first. Where a producer put a fact in the
 * prose and nowhere else (a PR's name in "Cover needed — Vicky"), it is read
 * back with a pattern anchored on that producer's exact sentence — the same
 * technique, and the same fail-open rule, as the app's dispute-body parser. A
 * miss keeps the stored English, FIELD BY FIELD: half a message in the right
 * language beats a whole one we invented.
 *
 * Names, venues, plan names, amounts, voucher counts and a gateway's or a PR's
 * own words are VALUES and pass through; only the sentence around them moves.
 *
 * EVERY KIND the server writes has a resolver here, PR-addressed ones included:
 * the bell shows whatever was addressed to the signed-in USER, and a person who
 * runs a venue or an agency can also be a PR somewhere. Those used to fall
 * through to English. Where one kind has several producers whose payloads do not
 * tell them apart (`agency_join_resolved` stamps `approved` both on an accepted
 * join and on a refused departure), the resolver anchors on the producer's exact
 * TITLE rather than guess — a title it does not know keeps its English.
 *
 * Only an agency's own free-text broadcast is never touched: those are a
 * person's words, and translating them would put words in their mouth.
 *
 * Producers read on 29 Sep 2026: shift-assignment.controller (overtime, leave,
 * cover, assigned, cancelled, removed, leave and overtime decisions),
 * shift.controller (posted, withdrawn), cutlost.controller (requested, decided,
 * released early), rating.controller, weekly-payout.job, agency-tier.job,
 * payment-voucher-issue (issued, resent, paid), payment-voucher.controller
 * (dispute resolved), agency.controller + pr.controller (join and departure),
 * outlet-swap.controller (swap asked), subscription-invoice/announce-opened,
 * subscription-payment/auto-charge.
 */
import { dateLocaleTag } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalLocale } from "@/lib/portal-i18n/locale-prefs";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type {
	NotificationKind,
	NotificationRecord,
} from "@/services/notification";

export type LocalizedNotification = { title: string; body: string };

/** What a resolver may override. An omitted field keeps the stored English. */
type Localized = { title?: string; body?: string };

type Ctx = {
	payload: Record<string, unknown>;
	stored: LocalizedNotification;
	locale: PortalLocale;
	t: PortalTranslations["notifications"];
};

/** `null` = not a row we can rebuild; show it as it was stored. */
type Resolver = (ctx: Ctx) => Localized | null;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'Wed 26 Aug' / '8月26日周三' from a stored 'YYYY-MM-DD', in the ACTIVE locale.
 *
 * Built as a LOCAL date from its parts: `new Date('2026-08-26')` parses as UTC
 * midnight, which is the 25th in some zones.
 */
function calendarDay(value: unknown, locale: PortalLocale): string | null {
	if (typeof value !== "string") return null;
	const parts = YMD.exec(value.trim().slice(0, 10));
	if (!parts) return null;
	const date = new Date(
		Number(parts[1]),
		Number(parts[2]) - 1,
		Number(parts[3]),
	);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(dateLocaleTag(locale), {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

function text(payload: Record<string, unknown>, key: string): string | null {
	const value = payload[key];
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

/** A finite number off the payload; the numeric-as-string shape too. */
function count(payload: Record<string, unknown>, key: string): number | null {
	const value = payload[key];
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (typeof value !== "string" || value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function idCount(payload: Record<string, unknown>, key: string): number | null {
	const value = payload[key];
	return Array.isArray(value) ? value.length : null;
}

/** 'RM 6,950.00' — the producers' own money format, cents always shown. */
function money(amount: unknown, currency: unknown): string | null {
	const n = typeof amount === "number" ? amount : Number(amount);
	if (typeof amount === "string" && amount.trim() === "") return null;
	if (!Number.isFinite(n)) return null;
	const symbol =
		currency === "MYR" || currency == null ? "RM" : String(currency);
	return `${symbol} ${n.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

/**
 * A producer's `when`: '2026-09-20', '2026-09-20 · 22:00 — 04:00', or the
 * fallback phrase 'an upcoming shift'. The date is re-rendered, the slot (a
 * value) is kept, the phrase is translated. Anything else: null.
 */
function shiftWhen(raw: string, ctx: Ctx): string | null {
	const trimmed = raw.trim();
	if (trimmed === "an upcoming shift") return ctx.t.srvUpcomingShift;
	const match = /^(\d{4}-\d{2}-\d{2})(.*)$/.exec(trimmed);
	if (!match) return null;
	const day = calendarDay(match[1], ctx.locale);
	return day ? `${day}${match[2] ?? ""}` : null;
}

/**
 * The day a PR's own shift notice is about: the payload's `shiftDate`, else a
 * body that is a BARE date and nothing else — `shift_assigned` and a PR's
 * `shift_cancelled` carry the date only there. A body that is anything more
 * than a date is not read as one.
 */
function bareShiftDay(ctx: Ctx): string | null {
	const fromPayload = calendarDay(ctx.payload.shiftDate, ctx.locale);
	if (fromPayload) return fromPayload;
	const body = ctx.stored.body.trim();
	return YMD.test(body) ? calendarDay(body, ctx.locale) : null;
}

/** 'A PR' is a producer's stand-in for a PR with no name on record; a real name passes through. */
function person(name: string, ctx: Ctx): string {
	return name === "A PR" ? ctx.t.aPr : name;
}

/** Stored text compared the way a sentence is: trimmed, one trailing full stop dropped. */
function sentence(value: string): string {
	return value.trim().replace(/\.$/, "");
}

// ─── Agency ────────────────────────────────────────────────────────────────

/** shift-assignment.controller `checkOutMine`. */
const overtimePending: Resolver = (ctx) => {
	const out: Localized = { title: ctx.t.srvOvertimeTitle };
	const match =
		/^(.+) worked (\d+) min past the scheduled end(?: on (\d{4}-\d{2}-\d{2}))?$/.exec(
			ctx.stored.body.trim(),
		);
	if (!match) return out;
	const name = match[1] ?? "";
	const minutes = count(ctx.payload, "overtimeMinutes") ?? Number(match[2]);
	const date = match[3] ? calendarDay(match[3], ctx.locale) : null;
	out.body = date
		? fill(ctx.t.srvOvertimeBody, { name, minutes, date })
		: fill(ctx.t.srvOvertimeBodyNoDate, { name, minutes });
	return out;
};

/** shift-assignment.controller `notifyAgencyLeaveRequested`. */
const leaveRequested: Resolver = (ctx) => {
	const out: Localized = {};
	const title = /^MC \/ leave request — (.+)$/.exec(ctx.stored.title.trim());
	if (title) out.title = fill(ctx.t.srvLeaveTitle, { name: title[1] ?? "" });
	const body =
		/^(.+?) asked to be excused from (.+?): "([\s\S]*)"\. Review it on Approvals → MC\/Leaves\.$/.exec(
			ctx.stored.body.trim(),
		);
	const when = body ? shiftWhen(body[2] ?? "", ctx) : null;
	if (body && when) {
		// The reason is the PR's own words — carried across verbatim.
		out.body = fill(ctx.t.srvLeaveBody, {
			name: body[1] ?? "",
			when,
			reason: body[3] ?? "",
		});
	}
	return out;
};

/**
 * Two producers share `shift_cover_needed`: a venue POSTING a shift
 * (shift.controller, `posted: true`) and a PR dropping OFF one
 * (shift-assignment.controller, `reason`). The payload tells them apart.
 */
const coverNeeded: Resolver = (ctx) => {
	if (ctx.payload.posted === true) {
		const venue = text(ctx.payload, "outletName") ?? ctx.t.srvAVenue;
		const out: Localized = { title: fill(ctx.t.srvNewShiftTitle, { venue }) };
		const body = /^.+? posted a shift on (.+?) and needs (\d+) PRs?\.$/.exec(
			ctx.stored.body.trim(),
		);
		const when = body ? shiftWhen(body[1] ?? "", ctx) : null;
		if (body && when) {
			const n = Number(body[2]);
			out.body = fill(
				n === 1 ? ctx.t.srvNewShiftBodyOne : ctx.t.srvNewShiftBodyMany,
				{ venue, when, n },
			);
		}
		return out;
	}
	const out: Localized = {};
	const title = /^Cover needed — (.+)$/.exec(ctx.stored.title.trim());
	if (title)
		out.title = fill(ctx.t.srvCoverTitle, {
			name: person(title[1] ?? "", ctx),
		});
	const body =
		/^(.+?) is off (.+) \((approved leave|cancelled)\)\. Find a replacement on the roster's backfill list\.$/.exec(
			ctx.stored.body.trim(),
		);
	const when = body ? shiftWhen(body[2] ?? "", ctx) : null;
	if (body && when) {
		const reason = text(ctx.payload, "reason");
		const onLeave =
			reason === "leave_approved" ||
			(reason === null && body[3] === "approved leave");
		out.body = fill(
			onLeave ? ctx.t.srvCoverBodyLeave : ctx.t.srvCoverBodyCancelled,
			{ name: person(body[1] ?? "", ctx), when },
		);
	}
	return out;
};

/**
 * shift.controller `notifyShiftWithdrawn` — ONE kind, two audiences. The
 * agency's copy carries `releasedCount`; the PR's does not.
 */
const shiftWithdrawn = (ctx: Ctx): Localized => {
	const venue = text(ctx.payload, "outletName") ?? ctx.t.srvTheVenue;
	const whenMatch = /withdrew the shift on (.+?)\. /.exec(ctx.stored.body);
	const when =
		(whenMatch ? shiftWhen(whenMatch[1] ?? "", ctx) : null) ??
		calendarDay(ctx.payload.shiftDate, ctx.locale);
	const released = count(ctx.payload, "releasedCount");
	if (released === null) {
		const out: Localized = { title: ctx.t.srvWithdrawnPrTitle };
		if (when) out.body = fill(ctx.t.srvWithdrawnPrBody, { venue, when });
		return out;
	}
	const out: Localized = { title: fill(ctx.t.srvWithdrawnTitle, { venue }) };
	if (when) {
		out.body = fill(
			released === 0
				? ctx.t.srvWithdrawnBodyNone
				: released === 1
					? ctx.t.srvWithdrawnBodyOne
					: ctx.t.srvWithdrawnBodyMany,
			{ venue, when, n: released },
		);
	}
	return out;
};

/**
 * The two PR-addressed cancellations — shift-assignment.controller `update`
 * (the agency cancelled the assignment) and `remove` (the agency took the PR
 * off). Both send `{ assignmentId, shiftId }` and the shift's date as the body,
 * so only the TITLE tells them apart.
 */
const PR_CANCEL_TITLES: Record<
	string,
	(t: PortalTranslations["notifications"]) => string
> = {
	"A shift was cancelled": (t) => t.srvShiftCancelledTitle,
	"You were removed from a shift": (t) => t.srvShiftRemovedTitle,
};

/**
 * `shift_cancelled` has THREE producers: the venue withdrawing a whole shift
 * (`withdrawn: true`, told to the agency and to the PRs), and the two
 * PR-addressed cancellations above. A title none of them wrote keeps its
 * English.
 */
const shiftCancelled: Resolver = (ctx) => {
	if (ctx.payload.withdrawn === true) return shiftWithdrawn(ctx);
	const title = PR_CANCEL_TITLES[ctx.stored.title.trim()];
	if (!title) return null;
	const out: Localized = { title: title(ctx.t) };
	const day = bareShiftDay(ctx);
	if (day) out.body = fill(ctx.t.srvShiftCancelledBody, { date: day });
	return out;
};

/** cutlost.controller `notifyAgency`. */
const cutlostRequested: Resolver = (ctx) => {
	const out: Localized = { title: ctx.t.srvCutRequestTitle };
	const match =
		/^(.+?) · (\d{4}-\d{2}-\d{2})(?: · release (.+?))?(?: · cut (\d+) slot\(s\))?$/.exec(
			ctx.stored.body.trim(),
		);
	const day = match ? calendarDay(match[2], ctx.locale) : null;
	if (!match || !day) return out;
	const venue = match[1] === "A venue" ? ctx.t.srvAVenue : (match[1] ?? "");
	const parts = [venue, day];
	if (match[3]) {
		// Names are values; "a PR" is the producer's stand-in for a missing one.
		const names = match[3]
			.split(", ")
			.map((name) => (name === "a PR" ? ctx.t.srvAPr : name))
			.join(", ");
		parts.push(fill(ctx.t.srvCutRelease, { names }));
	}
	if (match[4]) {
		const n = Number(match[4]);
		parts.push(
			fill(n === 1 ? ctx.t.srvCutSlotsOne : ctx.t.srvCutSlotsMany, { n }),
		);
	}
	out.body = parts.join(" · ");
	return out;
};

/** rating.controller `notifyOneAgencyIfRatingLow`. */
const ratingLow: Resolver = (ctx) => {
	const out: Localized = {};
	const title = /^(.+)'s rating has dropped$/.exec(ctx.stored.title.trim());
	if (title)
		out.title = fill(ctx.t.srvRatingLowTitle, { name: title[1] ?? "" });
	const average = count(ctx.payload, "average");
	const n = count(ctx.payload, "ratingCount");
	const line = /below the ([\d.]+) warning line\.$/.exec(
		ctx.stored.body.trim(),
	);
	if (average !== null && n !== null && line) {
		out.body = fill(ctx.t.srvRatingLowBody, {
			avg: average.toFixed(1),
			n,
			line: line[1] ?? "",
		});
	}
	return out;
};

/** weekly-payout.job — the Monday run held this agency's vouchers. */
const dayReviewPending: Resolver = (ctx) => {
	const review = idCount(ctx.payload, "dayReviewVoucherIds");
	const sign = idCount(ctx.payload, "unsignedVoucherIds");
	if (review === null || sign === null || review + sign === 0) return null;
	const total = review + sign;
	const t = ctx.t;
	const title =
		sign > 0 && review === 0
			? fill(
					sign === 1 ? t.srvDayReviewTitleSignOne : t.srvDayReviewTitleSignMany,
					{ n: sign },
				)
			: review > 0 && sign === 0
				? fill(
						review === 1
							? t.srvDayReviewTitleReviewOne
							: t.srvDayReviewTitleReviewMany,
						{ n: review },
					)
				: fill(t.srvDayReviewTitleBoth, { n: total });
	const out: Localized = { title };
	const start = calendarDay(ctx.payload.weekStart, ctx.locale);
	const end = calendarDay(ctx.payload.weekEnd, ctx.locale);
	if (!start || !end) return out;
	const parts: string[] = [];
	if (review > 0) {
		parts.push(
			fill(
				review === 1
					? t.srvDayReviewPartReviewOne
					: t.srvDayReviewPartReviewMany,
				{ n: review },
			),
		);
	}
	if (sign > 0) {
		parts.push(
			fill(
				sign === 1 ? t.srvDayReviewPartSignOne : t.srvDayReviewPartSignMany,
				{ n: sign },
			),
		);
	}
	out.body = fill(t.srvDayReviewBody, {
		start,
		end,
		parts: parts.join(t.srvListSep),
	});
	return out;
};

/** agency-tier.job — the weekly subscription statement, one of five outcomes. */
const tierWeekly: Resolver = (ctx) => {
	const n = count(ctx.payload, "pvCount");
	const plan = text(ctx.payload, "planName");
	const outcome = text(ctx.payload, "outcome");
	if (n === null || !plan || !outcome) return null;
	const t = ctx.t;
	const start = calendarDay(ctx.payload.weekStart, ctx.locale);
	const end = calendarDay(ctx.payload.weekEnd, ctx.locale);
	// The plan a MOVED agency left is in the prose only — the payload names the
	// plan it moved TO.
	const previous = /you were on (.+?)\. Nothing to do/.exec(ctx.stored.body);
	const values = {
		n,
		plan,
		start: start ?? "",
		end: end ?? "",
		previous: previous?.[1] ?? "",
	};
	const pick = (): { title: string; body: string | null } | null => {
		switch (outcome) {
			case "custom":
				return { title: t.srvTierTitleCustom, body: t.srvTierBodyCustom };
			case "frozen":
				return { title: t.srvTierTitleFrozen, body: t.srvTierBodyFrozen };
			case "past_rate_card":
				return { title: t.srvTierTitlePast, body: t.srvTierBodyPast };
			case "unchanged":
				return { title: t.srvTierTitleUnchanged, body: t.srvTierBodyUnchanged };
			case "moved":
				return {
					title: t.srvTierTitleMoved,
					body: previous ? t.srvTierBodyMoved : null,
				};
			default:
				return null;
		}
	};
	const copy = pick();
	if (!copy) return null;
	const out: Localized = { title: fill(copy.title, values) };
	if (copy.body && start && end) out.body = fill(copy.body, values);
	return out;
};

// ─── Agency AND outlet ─────────────────────────────────────────────────────

/** A money value in INTEGER cents, or null — so two amounts add exactly. */
function cents(value: unknown): number | null {
	if (typeof value !== "number" && typeof value !== "string") return null;
	if (typeof value === "string" && value.trim() === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** The producer's own words for the credit sentence — the anchor for a row this cannot rebuild. */
const BILL_CREDIT_MARK = "credit from a switch to a cheaper plan taken off";

/**
 * announce-opened's credit sentence, rebuilt from the payload: `creditApplied`
 * is the credit, and `amount` is already NET of it, so the bill before credit is
 * their sum — added in cents, never as floats. `""` when no credit was taken;
 * `null` when the body names a credit this cannot rebuild, and the caller keeps
 * the stored English rather than silently dropping it.
 */
function billCredit(ctx: Ctx): string | null {
	const creditCents = cents(ctx.payload.creditApplied);
	if (!creditCents) {
		return ctx.stored.body.includes(BILL_CREDIT_MARK) ? null : "";
	}
	const amountCents = cents(ctx.payload.amount);
	if (amountCents === null || creditCents < 0) return null;
	const credit = money(creditCents / 100, ctx.payload.currency);
	const before = money((amountCents + creditCents) / 100, ctx.payload.currency);
	if (!credit || !before) return null;
	return fill(ctx.t.srvBillCredit, { credit, before });
}

/**
 * subscription-invoice/announce-opened — a new billing period. The body is
 * rebuilt in the producer's order: dates, pro-rata, credit, then the pointer.
 */
const invoiceOpened: Resolver = (ctx) => {
	const amount = money(ctx.payload.amount, ctx.payload.currency);
	if (!amount) return null;
	const out: Localized = { title: fill(ctx.t.srvBillTitle, { amount }) };
	const start = calendarDay(ctx.payload.periodStart, ctx.locale);
	const end = calendarDay(ctx.payload.periodEnd, ctx.locale);
	if (!start || !end) return out;
	let proRata = "";
	if (ctx.stored.body.includes("Pro-rated:")) {
		const match =
			/Pro-rated: (\d+) of (\d+) days from (\d{4}-\d{2}-\d{2}) \(full period (.+?)\)\. /.exec(
				ctx.stored.body,
			);
		const from = match ? calendarDay(match[3], ctx.locale) : null;
		// A pro-rated bill whose sentence will not parse keeps its English body:
		// dropping "pro-rated" would make a RM 35.71 bill read as a wrong price.
		if (!match || !from) return out;
		proRata = fill(ctx.t.srvBillProRata, {
			billed: match[1] ?? "",
			days: match[2] ?? "",
			from,
			full: match[4] ?? "",
		});
	}
	// Same rule as the pro-rata sentence: a credit that cannot be rebuilt keeps
	// the English body — dropping it quotes a net bill with no reason for it.
	const credit = billCredit(ctx);
	if (credit === null) return out;
	const lines = count(ctx.payload, "count") ?? 1;
	out.body = fill(lines > 1 ? ctx.t.srvBillBodyLines : ctx.t.srvBillBody, {
		start,
		end,
		n: lines,
		proRata,
		credit,
	});
	return out;
};

/** subscription-payment/auto-charge — a saved card or e-wallet was declined. */
const autopayFailed: Resolver = (ctx) => {
	const amount = money(ctx.payload.amount, ctx.payload.currency);
	if (!amount) return null;
	const out: Localized = { title: fill(ctx.t.srvAutopayTitle, { amount }) };
	const start = calendarDay(ctx.payload.periodStart, ctx.locale);
	const end = calendarDay(ctx.payload.periodEnd, ctx.locale);
	if (!start || !end) return out;
	// The gateway's own words, verbatim, in the locale's brackets.
	const reason = text(ctx.payload, "reason");
	out.body = fill(
		text(ctx.payload, "methodType") === "ewallet"
			? ctx.t.srvAutopayBodyWallet
			: ctx.t.srvAutopayBodyCard,
		{
			start,
			end,
			why: reason ? fill(ctx.t.srvAutopayReason, { reason }) : "",
		},
	);
	return out;
};

// ─── Outlet ────────────────────────────────────────────────────────────────

/** cutlost.controller `notifyOutcome` — the venue's copy. */
const cutlostDecided: Resolver = (ctx) => {
	const decision = text(ctx.payload, "decision");
	const out: Localized = {};
	if (decision === "approve") out.title = ctx.t.srvCutApprovedTitle;
	else if (decision === "reject") out.title = ctx.t.srvCutDeclinedTitle;
	const match = /^(.+?) · (\d{4}-\d{2}-\d{2})$/.exec(ctx.stored.body.trim());
	const day = match ? calendarDay(match[2], ctx.locale) : null;
	if (match && day) {
		const venue =
			match[1] === "Your venue" ? ctx.t.srvYourVenue : (match[1] ?? "");
		out.body = `${venue} · ${day}`;
	}
	return out;
};

// ─── PR-addressed ──────────────────────────────────────────────────────────

/** shift-assignment.controller `create` — the PR was put on a shift. */
const shiftAssigned: Resolver = (ctx) => {
	const out: Localized = { title: ctx.t.srvShiftAssignedTitle };
	const day = bareShiftDay(ctx);
	if (day) out.body = fill(ctx.t.srvShiftAssignedBody, { date: day });
	return out;
};

/**
 * shift-assignment.controller `approveLeave` / `rejectLeave`. Two fixed
 * sentences, told apart by `decision` — a value this does not know keeps the
 * row as stored rather than telling the PR the wrong outcome.
 */
const leaveDecided: Resolver = (ctx) => {
	const decision = text(ctx.payload, "decision");
	if (decision === "approved") {
		return {
			title: ctx.t.srvLeaveApprovedTitle,
			body: ctx.t.srvLeaveApprovedBody,
		};
	}
	if (decision === "rejected") {
		return {
			title: ctx.t.srvLeaveRejectedTitle,
			body: ctx.t.srvLeaveRejectedBody,
		};
	}
	return null;
};

/** shift-assignment.controller `notifyPrOvertimeDecided` — rebuilt from its payload. */
const overtimeDecided: Resolver = (ctx) => {
	const decision = text(ctx.payload, "decision");
	if (decision !== "approve" && decision !== "reject") return null;
	const approved = decision === "approve";
	const out: Localized = {
		title: approved
			? ctx.t.srvOvertimeApprovedTitle
			: ctx.t.srvOvertimeRejectedTitle,
	};
	const minutes = count(ctx.payload, "overtimeMinutes");
	const date = calendarDay(ctx.payload.shiftDate, ctx.locale);
	if (minutes === null || !date) return out;
	if (!approved) {
		out.body = fill(ctx.t.srvOvertimeRejectedBody, { minutes, date });
		return out;
	}
	// The approved half names money; without a usable figure it keeps its English.
	const amount = money(ctx.payload.amount, "MYR");
	if (amount) {
		out.body = fill(ctx.t.srvOvertimeApprovedBody, { minutes, date, amount });
	}
	return out;
};

/** The stored `payment_voucher_dispute_component` values → their labels. */
const DISPUTE_PART: Record<
	string,
	(t: PortalTranslations["notifications"]) => string
> = {
	wages: (t) => t.srvPartWages,
	drinks: (t) => t.srvPartDrinks,
	tips: (t) => t.srvPartTips,
	others: (t) => t.srvPartOthers,
};

/**
 * payment-voucher.controller `resolveDispute`. The payload carries only the
 * outcome, so the component, the day and the agency's note are read back off
 * `${component} on ${disputeDate}` (+ ` — ${note}`). The note is the agency's
 * own words and passes through verbatim.
 */
const disputeResolved: Resolver = (ctx) => {
	const outcome = text(ctx.payload, "outcome");
	if (outcome !== "accepted" && outcome !== "rejected") return null;
	const out: Localized = {
		title:
			outcome === "accepted"
				? ctx.t.srvDisputeAcceptedTitle
				: ctx.t.srvDisputeRejectedTitle,
	};
	const match =
		/^(wages|drinks|tips|others) on (\d{4}-\d{2}-\d{2})(?: — ([\s\S]*))?$/.exec(
			ctx.stored.body.trim(),
		);
	const date = match ? calendarDay(match[2], ctx.locale) : null;
	const label = match ? DISPUTE_PART[match[1] ?? ""] : undefined;
	if (!match || !date || !label) return out;
	const part = label(ctx.t);
	const note = (match[3] ?? "").trim();
	out.body = note
		? fill(ctx.t.srvDisputeBodyNote, { part, date, note })
		: fill(ctx.t.srvDisputeBody, { part, date });
	return out;
};

/**
 * payment-voucher-issue `issuedNotice` — the Sunday issue and the agency's "Send
 * to PR", and its `resent` reminder. The week is on the payload.
 */
const voucherIssued: Resolver = (ctx) => {
	const out: Localized = {
		title:
			ctx.payload.resent === true
				? ctx.t.srvPvResentTitle
				: ctx.t.srvPvIssuedTitle,
	};
	const start = calendarDay(ctx.payload.weekStart, ctx.locale);
	const end = calendarDay(ctx.payload.weekEnd, ctx.locale);
	if (start && end) {
		out.body = fill(ctx.t.srvPvIssuedBody, { start, end });
	} else if (
		sentence(ctx.stored.body) ===
		"Check the amounts and raise a dispute if anything is wrong"
	) {
		out.body = ctx.t.srvPvIssuedBodyNoWeek;
	}
	return out;
};

/** payment-voucher-issue `paidNotice` — both paid lanes word it the same way. */
const voucherPaid: Resolver = (ctx) => {
	const out: Localized = { title: ctx.t.srvPvPaidTitle };
	const amount = money(ctx.payload.amount, "MYR");
	if (!amount) return out;
	out.body = fill(ctx.t.srvPvPaidBody, {
		voucher: text(ctx.payload, "voucherNo") ?? ctx.t.srvYourVoucher,
		amount,
	});
	return out;
};

/**
 * cutlost.controller `notifyOutcome` — the PR's copy. The venue and the day are
 * in the prose only; the sealed wage is on the payload too.
 */
const releasedEarly: Resolver = (ctx) => {
	const out: Localized = { title: ctx.t.srvReleasedTitle };
	const match =
		/^(.+?) on (\d{4}-\d{2}-\d{2}) — wages sealed at RM([\d.,]+) for the hours you worked$/.exec(
			ctx.stored.body.trim(),
		);
	const date = match ? calendarDay(match[2], ctx.locale) : null;
	if (!match || !date) return out;
	const amount = money(
		ctx.payload.payAmount ?? (match[3] ?? "").replace(/,/g, ""),
		"MYR",
	);
	if (!amount) return out;
	const venue =
		match[1] === "The venue" ? ctx.t.srvTheVenueStart : (match[1] ?? "");
	out.body = fill(ctx.t.srvReleasedBody, { venue, date, amount });
	return out;
};

/**
 * agency.controller (a join decided, a departure decided) and pr.controller (a
 * join decided). The payload cannot separate an ACCEPTED join from a REFUSED
 * departure — both stamp `approveStatus: 'approved'` — so this anchors on the
 * producer's exact title. A refusal's body is the agency's own reason, left as
 * written.
 */
const joinResolved: Resolver = (ctx) => {
	const t = ctx.t;
	const body = sentence(ctx.stored.body);
	switch (ctx.stored.title.trim()) {
		case "You were accepted by the agency":
			return {
				title: t.srvJoinAcceptedTitle,
				body:
					body === "You can now be scheduled for shifts"
						? t.srvJoinAcceptedBody
						: undefined,
			};
		case "Your agency application was declined":
			return { title: t.srvJoinDeclinedTitle };
		case "Your departure from the agency was approved":
			return {
				title: t.srvDepartureApprovedTitle,
				body:
					body === "You are no longer under this agency"
						? t.srvDepartureApprovedBody
						: undefined,
			};
		case "Your departure request was declined":
			return { title: t.srvDepartureDeclinedTitle };
		default:
			return null;
	}
};

/**
 * Two very different messages ride on `agency_broadcast`. A `swapId` marks the
 * outlet-swap ask (outlet-swap.controller reuses the kind rather than migrating
 * the enum) — ours to word. Everything else is an AGENCY'S OWN BROADCAST, free
 * text a person typed, and is never touched.
 */
const agencyBroadcast: Resolver = (ctx) => {
	if (!text(ctx.payload, "swapId")) return null;
	const out: Localized = { title: ctx.t.srvSwapTitle };
	const match =
		/^Your agency asks to move your (\d{4}-\d{2}-\d{2}) shift \((.+?)\) to another venue(?: at (.+?))?\. Accept or decline in the app BEFORE the shift starts — an unanswered request expires at start time\.$/.exec(
			ctx.stored.body.trim(),
		);
	const date = match ? calendarDay(match[1], ctx.locale) : null;
	if (!match || !date) return out;
	const slot = match[2] === "time TBC" ? ctx.t.srvTimeTbc : (match[2] ?? "");
	out.body = match[3]
		? fill(ctx.t.srvSwapBodyAt, { date, slot, to: match[3] })
		: fill(ctx.t.srvSwapBody, { date, slot });
	return out;
};

/**
 * EVERY kind — total on purpose, so a kind added to the enum without a resolver
 * is a compile error rather than a row that quietly stays English.
 */
const RESOLVERS: Record<NotificationKind, Resolver> = {
	overtime_pending_approval: overtimePending,
	leave_requested: leaveRequested,
	shift_cover_needed: coverNeeded,
	shift_cancelled: shiftCancelled,
	cutlost_requested: cutlostRequested,
	cutlost_decided: cutlostDecided,
	pr_rating_low: ratingLow,
	pv_day_review_pending: dayReviewPending,
	subscription_tier_weekly: tierWeekly,
	subscription_invoice_opened: invoiceOpened,
	subscription_autopay_failed: autopayFailed,
	shift_assigned: shiftAssigned,
	leave_decided: leaveDecided,
	overtime_decided: overtimeDecided,
	payment_voucher_dispute_resolved: disputeResolved,
	payment_voucher_issued: voucherIssued,
	payment_voucher_paid: voucherPaid,
	shift_released_early: releasedEarly,
	agency_join_resolved: joinResolved,
	agency_broadcast: agencyBroadcast,
};

/**
 * One stored notification, in the portal's language.
 *
 * `locale` and `t` are both required: `t` supplies the words, `locale` the date
 * format, and a default on either would pin one language — the bug this file
 * exists to undo.
 */
export function localizeOpsNotification(
	record: Pick<NotificationRecord, "kind" | "title" | "body" | "payload">,
	t: PortalTranslations,
	locale: PortalLocale,
): LocalizedNotification {
	const stored: LocalizedNotification = {
		title: record.title,
		body: record.body ?? "",
	};
	const resolve = RESOLVERS[record.kind];
	if (!resolve) return stored;
	try {
		const localized = resolve({
			payload: record.payload ?? {},
			stored,
			locale,
			t: t.notifications,
		});
		if (!localized) return stored;
		return {
			title: localized.title ?? stored.title,
			body: localized.body ?? stored.body,
		};
	} catch {
		// A malformed payload must never blank the bell; the stored row is
		// always a correct answer, just not a translated one.
		return stored;
	}
}
