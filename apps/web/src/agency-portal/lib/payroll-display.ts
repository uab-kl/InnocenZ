import { dayMonthLabel, monthShortLabel } from "@/lib/portal-i18n/date-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * HOW THE PAYROLL SCREENS PRINT WHAT THE DATABASE HANDS THEM.
 *
 * Every helper here exists because a payroll surface printed the stored value
 * itself: a uuid as the voucher heading, a packed `ref` in the breakdown's Ref
 * column, `2026-08-16` where every other date reads `16 Aug 2026`, and a user id
 * after "Reviewed by". Each is a fact the reader needs in the portal's words —
 * the stored value stays exactly what it is, only the printing changes.
 *
 * A leaf module: no portal imports, so the route and the panels can share it
 * without importing each other.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
const UUID_ANYWHERE =
	/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * yyyy-MM-dd -> "13 Sep 2026", the portal's date shape, month word from the
 * dictionary so it follows the language switch.
 *
 * Read off the string, never through `new Date`: a bare yyyy-MM-dd parses as
 * UTC midnight and prints the previous day anywhere behind UTC. Anything that is
 * not a plain day is handed back untouched rather than guessed at.
 */
export function formatPayrollDay(
	day: string | null | undefined,
	t: PortalTranslations,
): string {
	if (!day) return "—";
	const match = ISO_DAY.exec(day);
	if (!match) return day;
	const [, year, month, date] = match;
	const name = monthShortLabel(Number(month) - 1, t);
	if (!name) return day;
	return `${Number(date)} ${name} ${year}`;
}

/**
 * A TIMESTAMP -> the local calendar day it fell on, same shape. Null when there
 * is no usable stamp, so the caller says why rather than printing a blank.
 */
export function formatPayrollStampDay(
	at: string | null | undefined,
	t: PortalTranslations,
): string | null {
	if (!at) return null;
	const d = new Date(at);
	if (Number.isNaN(d.getTime())) return null;
	return `${dayMonthLabel(d, t)} ${d.getFullYear()}`;
}

/**
 * "2 Aug – 8 Aug 2026"; the year on both sides only when the range crosses one.
 */
export function formatPayrollWeekRange(
	startIso: string | null | undefined,
	endIso: string | null | undefined,
	t: PortalTranslations,
): string {
	const s = ISO_DAY.exec(startIso ?? "");
	const e = ISO_DAY.exec(endIso ?? "");
	if (!s || !e) return [startIso, endIso].filter(Boolean).join(" – ");
	const dayMonth = (m: RegExpExecArray) =>
		`${Number(m[3])} ${monthShortLabel(Number(m[2]) - 1, t)}`;
	return s[1] === e[1]
		? `${dayMonth(s)} – ${dayMonth(e)} ${e[1]}`
		: `${dayMonth(s)} ${s[1]} – ${dayMonth(e)} ${e[1]}`;
}

/**
 * The number a voucher is known by — `PV-000003` — never its uuid.
 *
 * A demo voucher's id IS its readable number, so a non-uuid id still serves; a
 * backed voucher that was never numbered gets "" and the caller decides what
 * stands in, rather than printing a database key nobody can read.
 */
export function pvVoucherRef(pv: { id: string; voucherNo?: string }): string {
	const no = pv.voucherNo?.trim();
	if (no) return no;
	return UUID_ANYWHERE.test(pv.id) ? "" : pv.id;
}

/** Matches `REF_SEP` / `encodeRef` in the backend payment-voucher controller. */
const REF_SEP = "|";

/**
 * A voucher line's `ref`, as a person would name it.
 *
 * The backend PACKS a line's kind, source, gross sale and dedupe key into `ref`
 * (`kind|source|sales|dedupe|category`) because the reused line table has no
 * columns for them — so the breakdown printed
 * `drinks|scan|600.00|ORD1145:0|drink` and `wages|checkin|16.67|<uuid>|`. The
 * human part is the ORDER NUMBER on a receipt line (`ORD1145:0` is order 1145,
 * item 0), and the source for everything else. A uuid is never shown: it is an
 * assignment or charge key, and the description beside it already says what
 * the money is.
 *
 * A ref that is not packed (demo rows, hand-typed references) is shown as is,
 * unless it is itself a bare key.
 */
export function pvRefLabel(
	ref: string | null | undefined,
	t: PortalTranslations,
): string {
	const raw = (ref ?? "").trim();
	if (!raw) return "—";
	if (!raw.includes(REF_SEP)) return UUID_ANYWHERE.test(raw) ? "—" : raw;
	const [, source = "", , dedupe = ""] = raw.split(REF_SEP);
	// The suffixes the backend's own classifier keys off (`-ot`, `-pen`).
	if (dedupe.endsWith("-ot")) return t.payroll.overtimeShort;
	if (source === "penalty" || dedupe.endsWith("-pen")) {
		return t.payroll.refPenalty;
	}
	if (source === "checkin") return t.receipts.checkIn;
	const order = dedupe.replace(/:\d+$/, "").trim();
	if (order && !UUID_ANYWHERE.test(order)) return order;
	if (source === "scan") return t.receipts.scanned;
	if (source === "manual") return t.receipts.selfLogged;
	return "—";
}

/**
 * A copy of a voucher whose line DATE and REF read as words, for the on-screen
 * breakdown only.
 *
 * A copy, never an edit: the voucher's own rows keep the packed ref, which is
 * what a line edit writes back and what the server dedupes on. Only the table
 * a person reads is given the readable form.
 */
export function withReadableLines<
	V extends { rows: readonly { date: string; ref: string }[] },
>(pv: V, t: PortalTranslations): V {
	// The spread keeps every row field; only `date` and `ref` change value, never
	// type — which TypeScript cannot see through a generic spread, hence the cast.
	return {
		...pv,
		rows: pv.rows.map((row) => ({
			...row,
			date: row.date ? formatPayrollDay(row.date, t) : row.date,
			ref: pvRefLabel(row.ref, t),
		})),
	} as V;
}

/**
 * The working day a receipt belongs to, as a yyyy-MM-dd — or null.
 *
 * THE SAME ORDER as `workingDayIso` on the Receipts feed: a line's own date
 * first (the day the money was earned), the printed `receipt_date` second.
 * The verify panel read `receipt_date` alone, and two live receipts have none —
 * RCP-000036 printed "—" while both of its lines are dated 14 Sep 2026.
 */
export function receiptDayIso(
	receiptDate: string | null | undefined,
	lines: readonly { lineDate?: string | null }[],
): string | null {
	return lines.find((line) => line.lineDate)?.lineDate ?? receiptDate ?? null;
}

/**
 * A copy whose breakdown rows are numbered 1, 2, 3 — the way a person counts.
 *
 * `i` comes off `payment_voucher_line.sort_order`, which starts at 0, so the
 * "#" column of every live voucher began at 0 (paid PV-000002, -000003 and
 * -000006 all did). The stored order is untouched; only the printed number
 * changes, and it stays unique, so it can still key the row.
 */
export function withRowNumbersFromOne<
	V extends { rows: readonly { i: number }[] },
>(pv: V): V {
	return {
		...pv,
		rows: pv.rows.map((row, index) => ({ ...row, i: index + 1 })),
	} as V;
}

/**
 * Where a voucher's line items stand on screen.
 *
 * `demo` — a demo voucher, whose rows are already its lines. `ready` — the
 * detail request answered. `loading` / `error` — the screen still holds the LIST
 * row, which carries one summary row standing in for the week's total and
 * nothing else.
 */
export type PvLinesState = "demo" | "loading" | "error" | "ready";

/**
 * Which state the detail request is in. A failure is its own answer, never
 * "no lines": the list row's stand-in must not be presented as the voucher.
 */
export function pvLinesStateOf(request: {
	isBacked: boolean;
	hasDetail: boolean;
	isError: boolean;
}): PvLinesState {
	if (!request.isBacked) return "demo";
	if (request.hasDetail) return "ready";
	return request.isError ? "error" : "loading";
}

/** True once the rows on screen are the voucher's real lines. */
export function pvLinesReady(state: PvLinesState): boolean {
	return state === "ready" || state === "demo";
}

/**
 * The list row's stand-in, said honestly while the lines are not there.
 *
 * The list endpoint omits lines, so the mapper carries the stored subtotal on
 * ONE summary row (it keeps every total right). That row's text was a fixed
 * English sentence promising line items "if you open the voucher" — printed on
 * the very screen that had opened it, and never replaced, because History never
 * asked for them. Until the lines arrive the row now says what is actually
 * happening, in the reader's language: still loading, or could not be loaded.
 */
export function withLinesStateNote<
	V extends { rows: readonly { desc: string }[] },
>(pv: V, state: PvLinesState, t: PortalTranslations): V {
	if (pvLinesReady(state)) return pv;
	const note =
		state === "loading"
			? t.agencyPv.weekTotalLinesLoading
			: t.agencyPv.weekTotalLinesFailed;
	return {
		...pv,
		rows: pv.rows.map((row) => ({ ...row, desc: note })),
	} as V;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_ONLY =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * WHO SIGNED FOR THE AGENCY, BY NAME — never an email, never a key.
 *
 * `finance_head_name` is written at signing as the signer's profile name, or,
 * when they have none, their USERNAME — which on an agency account is often
 * the sign-in email (paid PV-000003 printed one under "Agency signed"). Rows
 * signed before 3 Sep 2026 can hold the signer's user id instead.
 *
 * Either is resolved through the agency's own member list where it can be — a
 * member whose email/username/user id is the stored value, and whose username
 * is a name. Otherwise null, and the caller names the capacity (Owner, Finance)
 * or "the agency's signatory" rather than printing the stored value.
 */
export function signerDisplayName(
	stored: string | null | undefined,
	members?:
		| readonly {
				userId?: string | null;
				username?: string | null;
				email?: string | null;
		  }[]
		| null,
): string | null {
	const value = stored?.trim();
	if (!value) return null;
	const isKey = UUID_ONLY.test(value);
	if (!isKey && !EMAIL_SHAPE.test(value)) return value;
	const wanted = value.toLowerCase();
	const member = members?.find((m) =>
		isKey
			? m.userId === value
			: m.email?.trim().toLowerCase() === wanted ||
				m.username?.trim().toLowerCase() === wanted,
	);
	const name = member?.username?.trim();
	return name && !EMAIL_SHAPE.test(name) && !UUID_ONLY.test(name) ? name : null;
}

/**
 * A copy of a voucher whose header reads as words, for the on-screen summary.
 *
 * - "Week" — `cycle` holds the literal "Weekly" on every live voucher, so the
 *   summary printed "Week: Weekly". The voucher's own `week_start`/`week_end`
 *   are the week; `cycle` stays the fallback for a voucher that has none.
 * - "Agency signed" — the resolved name from `signerDisplayName`. With no name
 *   to show, an empty string lets the capacity stand alone ("Owner · 3 Aug
 *   2026"), and with no capacity either, the agency's signatory is named as
 *   such. An unsigned voucher is left alone: that row only shows when signed.
 */
export function withReadableHeader<
	V extends {
		cycle: string;
		weekStartIso?: string;
		weekEndIso?: string;
		financeHeadName: string;
		financeHeadRole?: string | null;
		financeHeadSignedAt: string;
	},
>(pv: V, signerName: string | null, t: PortalTranslations): V {
	const week =
		pv.weekStartIso && pv.weekEndIso
			? formatPayrollWeekRange(pv.weekStartIso, pv.weekEndIso, t)
			: "";
	const signed = Boolean(pv.financeHeadSignedAt);
	return {
		...pv,
		cycle: week || pv.cycle,
		financeHeadName: signed
			? (signerName ?? (pv.financeHeadRole ? "" : t.agencyPv.agencySignatory))
			: pv.financeHeadName,
	};
}

/**
 * The SPAN a list of vouchers actually covers — its oldest week's start to its
 * newest week's end — or null when none carries a week (demo vouchers).
 *
 * For the Payment Week heading: that tab is a catch-all for everything still
 * unpaid, so naming only its own seven days described a list holding vouchers
 * from months before them.
 */
export function listedWeekSpan(
	weeks: readonly { weekStartIso?: string; weekEndIso?: string }[],
): { startIso: string; endIso: string } | null {
	let start: string | null = null;
	let end: string | null = null;
	for (const week of weeks) {
		const s = week.weekStartIso;
		const e = week.weekEndIso ?? week.weekStartIso;
		if (s && (start === null || s < start)) start = s;
		if (e && (end === null || e > end)) end = e;
	}
	return start && end ? { startIso: start, endIso: end } : null;
}

/**
 * The days a catch-all list holds BEFORE its own week, oldest first, once each.
 *
 * The payment week's receipts include aged pending ones, so a day strip built
 * from the week alone offered seven greyed chips for a list that sat entirely
 * outside them. These are the chips that make those rows selectable.
 */
export function olderStripDays(
	listedDays: Iterable<string>,
	weekStartIso: string,
): string[] {
	const days = new Set<string>();
	for (const day of listedDays) {
		const iso = day.slice(0, 10);
		if (ISO_DAY.test(iso) && iso < weekStartIso) days.add(iso);
	}
	return [...days].sort();
}

/**
 * A member's display name by USER id — what `reviewed_by` and the other actor
 * columns hold. Null when the id is not one of this organisation's members (an
 * admin, a system sweep, an account since removed): the caller words that
 * generically rather than printing the id.
 */
export function memberDisplayName(
	members:
		| readonly { userId: string; username?: string | null }[]
		| null
		| undefined,
	userId: string | null | undefined,
): string | null {
	if (!userId || !members) return null;
	const name = members.find((m) => m.userId === userId)?.username?.trim();
	return name || null;
}
