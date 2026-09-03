/**
 * ── LOCALE BOUNDARY: everything this module emits is printed on the payment
 * voucher, and the voucher is ENGLISH in every UI locale. The reasoning lives in
 * the header of `pv-pdf.ts`. ──
 *
 * The three things here most likely to be mistaken for missed translations:
 *
 * - `PV_TEMPLATE_DISCLAIMER` — printed on the document, and the PR's copy
 *   carries the same English sentence from the backend exporter.
 * - `MONTH_KEYS` — date FORMATTING, deliberately the twin of the backend's
 *   `dayMonth()` and `klStamp()`. `formatPvSignStamp` also feeds on-screen text
 *   in `routes/agency/pv.tsx`, and must keep printing the same stamp on the
 *   screen as on the paper, so it is not locale-aware either. This file used to
 *   hold TWO identical local copies of that list, `LINE_DAY_MONTHS` and
 *   `MONTH_NAMES`; both now read the one shared table, imported from `pr-demo`.
 * - `monthKeyIndex` — the PARSER for those same tokens, matched against stored
 *   and demo-store strings, never rendered. It replaced `MONTH_MAP`, a THIRD
 *   local copy of the month list, which could have drifted from the two above —
 *   and from the writer that produced the strings it parses — with nothing
 *   raising an error.
 *
 * `PV_TEMPLATE_ISSUER` and the payee/line builders return DATA — names, IC,
 * bank details, line descriptions — never labels.
 */

import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	MONTH_KEYS,
	monthKeyIndex,
	PR_PROFILES,
	type PrPaymentVoucher,
	type PrProfile,
	type PrSubRole,
	resolvePrAccountFields,
} from "@agency-portal/lib/pr-demo";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";

/** Issuer block — matches PV Template.xlsx (Atmosphere Event Planner) */
export const PV_TEMPLATE_ISSUER = {
	brand: "ATMOSPHERE EVENT PLANNER",
	name: "ATMOSPHERE EVENT ENTERPRISE",
	regNo: "(CT0152091-D)",
	phone: "+60111-3396687",
	email: "inquiry.atmosphere.tc@gmail.com",
	address: "1-13-8, Jalan 1/2D, Taman Sri Murni, 68100, Kuala Lumpur",
	logoPath: "/assets/atmosphere-logo.png",
	paymentMethod: "Transfer",
} as const;

/**
 * The letterhead the voucher prints, as a shape any source can fill.
 *
 * The PR's PDF prints the agency the voucher actually belongs to, read through
 * the voucher's FK. The agency's print view used to print `PV_TEMPLATE_ISSUER`
 * — a hardcoded constant — which is why the same voucher carried two different
 * companies depending on who opened it. A real session passes its own agency
 * here; the constant stays as the demo fallback it always was.
 */
export interface PvIssuerProfile {
	brand: string;
	name: string;
	/** Printed in parentheses under the name, like the PDF's `(202301000001)`. */
	regNo: string;
	phone: string;
	email: string;
	address: string;
	logoPath: string;
	paymentMethod: string;
}

/** An em dash, matching the backend exporter's placeholder for an unset field. */
const ISSUER_DASH = "—";

/**
 * A backend agency row → the printed letterhead.
 *
 * Unset fields render as an em dash rather than being dropped or invented: a
 * blank line reads as a layout bug, and a plausible-looking substitute is how
 * this project has previously printed facts nothing stores.
 */
export function issuerFromAgency(
	agency: {
		name?: string | null;
		ssmNo?: string | null;
		contactPhone?: string | null;
		contactEmail?: string | null;
		addressLine1?: string | null;
		addressLine2?: string | null;
	},
	/**
	 * The agency's OWN logo, already resolved to a URL by the caller. Undefined or
	 * null prints no logo at all — see the note on `logoPath` below.
	 */
	logoUrl?: string | null,
): PvIssuerProfile {
	const address = [agency.addressLine1, agency.addressLine2]
		.filter((part): part is string => !!part && part.trim() !== "")
		.join(", ");
	return {
		// ⚠️ `brand` was `agency.name || PV_TEMPLATE_ISSUER.brand` — the ONE field
		// here that fell back to a real third party's trading name while every
		// other blank correctly became an em dash. An agency whose `name` is
		// empty is a gap in our record, not permission to print "ATMOSPHERE
		// EVENT PLANNER" across the top of their payment voucher.
		brand: agency.name || ISSUER_DASH,
		name: agency.name || ISSUER_DASH,
		regNo: agency.ssmNo ? `(${agency.ssmNo})` : ISSUER_DASH,
		phone: agency.contactPhone || ISSUER_DASH,
		email: agency.contactEmail || ISSUER_DASH,
		address: address || ISSUER_DASH,
		// ⚠️ AND THE LOGO — this was `PV_TEMPLATE_ISSUER.logoPath`, so even a
		// FULLY SUCCESSFUL fetch stamped another company's mark on a real
		// agency's voucher. The logo is the most identity-bearing thing on the
		// page and it was the one field that never even tried to read the
		// agency. Empty means print no logo; a stranger's is not a fallback.
		//
		// Resolved by the caller (`usePvIssuer`) rather than here: turning
		// `agency.logoImage` — an R2 object key — into a URL needs `apiAssetUrl`,
		// and reaching from this lib into the component layer is how this portal
		// earned its last import cycle.
		logoPath: logoUrl ?? "",
		paymentMethod: PV_TEMPLATE_ISSUER.paymentMethod,
	};
}

export const PV_TEMPLATE_DISCLAIMER =
	"Please verify the payment details. If there are no discrepancies, kindly sign and acknowledge to proceed with the payment. For any concerns, please contact our finance department.";

export interface PvPayeeProfile {
	code: string;
	name: string;
	nickname: string;
	ic: string;
	phone: string;
	bank: string;
	accountName: string;
	accountNo: string;
}

export interface PvTemplateLine {
	seq: string;
	description: string;
	unit: number;
	unitPrice: number;
	amount: number;
	/** Blank padding row — hide in-app, keep for print */
	blank?: boolean;
}

/**
 * A line's date as the printed document says it — '30 Jul', the backend
 * exporter's `dayMonth()`.
 *
 * A backed voucher's line carries an ISO `lineDate`, so the agency's copy read
 * 'Daily Wages (2026-07-30)' against the PR's 'Daily Wages (30 Jul)'. A demo
 * row already holds a display string and is passed straight through.
 */
export function formatPvLineDay(date: string): string {
	const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!m) return date;
	return `${Number(m[3])} ${MONTH_KEYS[Number(m[2]) - 1]}`;
}

/** PDF line description — matches PV-2606-001.pdf (e.g. "Salary (2nd June) - Mamba") */
export function pvPdfLineDescription(r: PrPaymentVoucher["rows"][number]) {
	const datePart = r.date ? ` (${formatPvLineDay(r.date)})` : "";
	const desc = r.desc.includes("(") ? r.desc : `${r.desc}${datePart}`;
	return r.outlet ? `${desc} - ${r.outlet}` : desc;
}

export function buildPvTemplateLines(pv: PrPaymentVoucher): PvTemplateLine[] {
	/*
	 * The "#" column is a DISPLAY sequence, counted from 1 — not the row's
	 * `i`.
	 *
	 * `i` is `payment_voucher_line.sort_order`, which is ZERO-based, so every
	 * printed voucher opened at row 0 and ended one short of its own line count
	 * (reported 3 Sep 2026: "#" ran 0…18 on a 19-line document). Numbering off
	 * the array also survives a gap in `sort_order` — a deleted line would
	 * otherwise print 0,1,3 — and it lines up with the Deductions row below,
	 * which has always used `lines.length + 1`.
	 *
	 * `i` itself is left alone: it is the STORAGE key other readers match a row
	 * back to its line by, and renumbering it to please a column heading would
	 * trade a cosmetic bug for a data one.
	 */
	const lines: PvTemplateLine[] = pv.rows.map((r, index) => ({
		seq: String(index + 1),
		description: pvPdfLineDescription(r),
		unit: r.qty,
		unitPrice: r.qty > 0 ? r.amt / r.qty : r.amt,
		amount: r.amt,
	}));

	if (pv.deduct > 0) {
		lines.push({
			seq: String(lines.length + 1),
			description: "Deductions",
			unit: 1,
			unitPrice: -pv.deduct,
			amount: -pv.deduct,
		});
	}

	return lines;
}

/** Pad line items to match blank rows on the printed template */
export function padPvTemplateLines(
	lines: PvTemplateLine[],
	minRows = 5,
): PvTemplateLine[] {
	if (lines.length >= minRows) return lines;
	const padded = [...lines];
	while (padded.length < minRows) {
		padded.push({
			seq: "",
			description: "",
			unit: 0,
			unitPrice: 0,
			amount: 0,
			blank: true,
		});
	}
	return padded;
}

export function findDemoProfileForPv(
	pv: PrPaymentVoucher,
): PrProfile | undefined {
	return Object.values(PR_PROFILES).find(
		(p) => p.name === pv.prName || p.ic === pv.prIc,
	);
}

/**
 * The payee block on an agency's printed Payment Voucher.
 *
 * ⚠️ THE BANK DETAILS MUST NEVER COME FROM A DEMO FIXTURE ON A REAL SESSION.
 *
 * They used to. `findDemoProfileForPv` matches on `name === pv.prName ||
 * ic === pv.prIc`, and the seeded PRs carry the SAME ICs as the demo profiles —
 * so a real voucher for a real person matched `PR_PROFILES.pr_tied` and printed
 * its hardcoded "Maybank / 5142 8890 1123" onto the one document whose entire
 * job is to say where to send money. An agency could have paid that account.
 * (Found in testing, 2 Sep 2026; the portal rule this broke is
 * `.cursor/rules/no-demo-data-on-real-sessions.mdc`.)
 *
 * On a REAL session the bank now comes only from `realBank`, fetched from the
 * gated `/payment-voucher/:id/payee-bank`, and stays BLANK when the PR has not
 * entered it. A blank field says "we do not know where to pay this person",
 * which is true and actionable. A plausible wrong number says nothing and
 * invites a transfer.
 *
 * Demo sessions keep the fixture — that is what they are for.
 */
export function buildAgencyPayee(
	pv: PrPaymentVoucher,
	agencyPRs: AgencyManagedPR[],
	realBank?: {
		bankName: string | null;
		bankAccountNo: string | null;
		/** Legal name — the bank account name, never the nickname. */
		name?: string | null;
		nickname?: string | null;
		phone?: string | null;
	} | null,
): PvPayeeProfile {
	const isRealSession = getPortalSessionKind() === "real";
	const managed = agencyPRs.find(
		(p) =>
			p.name === pv.prName ||
			p.id === pv.prName ||
			(pv.prIc && p.ic === pv.prIc),
	);
	// Not consulted at all on a real session — see the note above.
	const demo = isRealSession ? undefined : findDemoProfileForPv(pv);
	// The fixture used to supply the working name and the phone as well as the
	// bank. Gating it off without replacing THOSE printed the legal name twice,
	// a payee code derived from the wrong string, and an empty phone.
	const displayName =
		managed?.name ?? realBank?.nickname ?? demo?.name ?? pv.prName;
	/*
	 * ⚠️ THE LEGAL NAME, NEVER THE NICKNAME.
	 *
	 * This feeds "Name" and "Bank Account Name" on the voucher, and a bank
	 * matches the account name against the account holder — "Vicky" would
	 * bounce a transfer that "Victoria Tan Mei Lin" completes.
	 *
	 * It used to fall back to `displayName`, which was harmless only because
	 * displayName came from the demo fixture's legal-ish name. Once displayName
	 * started preferring the real WORKING name, that fallback started putting a
	 * nickname in the account-name field.
	 */
	const icName =
		managed?.icName ??
		realBank?.name ??
		demo?.first ??
		pv.prName ??
		displayName;
	return payeeFromPaymentVoucher(pv, {
		/*
		 * DERIVED FROM REAL FACTS, on every session.
		 *
		 * Two bugs sat in the old expression. `managed?.id` printed the PR's
		 * UUID into a cell a human reads. And the fallback derived the code from
		 * `demo.ic` — the demo fixture's IC — so a REAL agency printing a REAL
		 * voucher got a code computed from demo data, which is precisely what
		 * .cursor/rules/no-demo-data-on-real-sessions.mdc forbids. It went
		 * unnoticed because the seeded PRs carry the same ICs as the fixtures,
		 * so the demo-derived answer happened to match the real one.
		 *
		 * Now: the working name and the REAL IC off the voucher. The backend
		 * export derives the identical code from the identical facts
		 * (`derivePayeeCode` in payment-voucher-excel.ts) so the agency's copy
		 * and the PR's copy cannot disagree about who this document is for.
		 */
		code: derivePrCode(displayName, managed?.ic ?? pv.prIc ?? undefined),
		phone: managed?.mobile ?? realBank?.phone ?? demo?.mobile,
		nickname: displayName,
		name: icName,
		ic: managed?.ic ?? pv.prIc ?? demo?.ic,
		// Real first, demo only as a demo-session fallback, and undefined when
		// neither exists — which renders blank rather than inventing an account.
		bank: realBank?.bankName ?? demo?.bank,
		accountNo: realBank?.bankAccountNo ?? demo?.acc,
		accountName: icName,
	});
}

function derivePrCode(name: string, ic?: string) {
	const slug = name.replace(/\s+/g, "").slice(0, 4).toUpperCase();
	const tail = (ic ?? "").replace(/\D/g, "").slice(-4);
	return tail ? `${slug}-${tail}` : slug || "PR";
}

type PayeeSource = Pick<
	PrProfile,
	"name" | "ic" | "mobile" | "bank" | "acc" | "first"
>;

export function payeeFromProfile(
	profile: PayeeSource,
	overrides?: Partial<PvPayeeProfile> & {
		mobile?: string;
		bank?: string;
		acc?: string;
		first?: string;
		phone?: string;
		accountNo?: string;
		accountName?: string;
		nickname?: string;
		code?: string;
	},
): PvPayeeProfile {
	const icName =
		overrides?.name ??
		overrides?.accountName ??
		overrides?.first ??
		profile.first ??
		profile.name;
	const displayName = overrides?.nickname ?? profile.name;
	return {
		code: overrides?.code ?? derivePrCode(displayName, profile.ic),
		name: icName,
		nickname: displayName,
		ic: overrides?.ic ?? profile.ic,
		phone: overrides?.phone ?? overrides?.mobile ?? profile.mobile,
		bank: overrides?.bank ?? profile.bank,
		accountName: overrides?.accountName ?? icName,
		accountNo: overrides?.accountNo ?? overrides?.acc ?? profile.acc,
	};
}

/** PR portal payee — display name as nickname, IC name on name / bank account, mobile as phone. */
export function payeeFromPrPortal(
	role: PrSubRole | null,
	profile: PrProfile,
	account: Parameters<typeof resolvePrAccountFields>[1] = {},
): PvPayeeProfile {
	const fields = resolvePrAccountFields(role, account);
	return payeeFromProfile(profile, {
		nickname: fields.displayName,
		name: fields.icName,
		accountName: fields.icName,
		phone: fields.mobile,
		ic: fields.ic,
		code: derivePrCode(fields.displayName, fields.ic),
	});
}

export function payeeFromPaymentVoucher(
	pv: PrPaymentVoucher,
	overrides?: Partial<PvPayeeProfile> & {
		mobile?: string;
		bank?: string;
		acc?: string;
		first?: string;
		phone?: string;
		accountNo?: string;
		accountName?: string;
		nickname?: string;
		code?: string;
	},
): PvPayeeProfile {
	/*
	 * ⚠️ NEVER A DEMO FIXTURE ON A REAL SESSION.
	 *
	 * This is the demo lookup that actually leaked. `buildAgencyPayee` gates its
	 * own copy, but it then calls THIS function, which looked the fixture up
	 * again and used it as the BASE profile — so passing `bank: undefined` as an
	 * override simply fell through to `demo.bank`. The printed voucher kept
	 * showing "Maybank / 5142 8890 1123" for a real PR whose bank is unset.
	 *
	 * Fixing one of the two lookups changed nothing on screen, which is the
	 * whole reason this is gated at the root instead.
	 */
	const demo =
		getPortalSessionKind() === "real" ? undefined : findDemoProfileForPv(pv);
	return payeeFromProfile(
		demo ?? {
			name: pv.prName,
			ic: pv.prIc ?? "",
			mobile: "",
			bank: "",
			acc: "",
			first: pv.prName.split(" ")[0] ?? pv.prName,
		},
		overrides,
	);
}

/** Display helper — blank cells instead of raw dashes in the UI */
export function formatPayeeField(value: string | undefined) {
	const v = value?.trim();
	if (!v || v === "—") return "";
	return v;
}

export function formatPvAmount(n: number) {
	if (!n) return "";
	return n.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

/**
 * Voucher date on PDF — DD/MM/YYYY, the same `slashDate()` the backend exporter
 * prints.
 *
 * The ISO branch is why the agency's voucher used to read `2026-07-31` where the
 * PR's read `31/07/2026`: a backed voucher's `issuedDate` is a plain date column,
 * and this only ever recognised the demo store's `31 Jul 2026`, so it handed the
 * raw string through untouched.
 */
export function formatPvVoucherDate(issued: string) {
	const value = issued.trim();
	if (!value) return "";
	if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
	const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
	const m = value.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
	if (m) {
		const mi = monthKeyIndex(m[2]);
		if (mi >= 0) {
			const mm = String(mi + 1).padStart(2, "0");
			return `${m[1].padStart(2, "0")}/${mm}/${m[3]}`;
		}
	}
	return value;
}

/**
 * A signing timestamp as '4 Aug 2026 · 16:30' in Kuala Lumpur time — the web
 * twin of the backend's `klStamp()`, so the two documents date a signature
 * identically.
 *
 * Kuala Lumpur is UTC+8 with no DST, so the shift is a constant rather than a
 * locale lookup. Anything that is not a parsable instant (a demo store's
 * already-formatted string) is returned as-is: reformatting it would be a guess.
 */
export function formatPvSignStamp(at: string | undefined | null): string {
	const value = at?.trim();
	if (!value) return "";
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) return value;
	const kl = new Date(ms + 8 * 60 * 60 * 1000);
	const hh = String(kl.getUTCHours()).padStart(2, "0");
	const mm = String(kl.getUTCMinutes()).padStart(2, "0");
	return `${kl.getUTCDate()} ${MONTH_KEYS[kl.getUTCMonth()]} ${kl.getUTCFullYear()} · ${hh}:${mm}`;
}

/**
 * What the Voucher No. box prints — the web twin of the backend's
 * `voucherRef()`.
 *
 * The stored `voucher_no` when there is one, and only then the id. A backed
 * voucher's id is a uuid, and printing it is what put `7e71a469-5030-450f-…` on
 * a payment document where `PV-000004` belonged.
 */
export function formatPvVoucherRef(pv: {
	voucherNo?: string;
	id: string;
}): string {
	return pv.voucherNo?.trim() || pv.id;
}

/** Empty PDF table cell — template shows "-" */
export function formatPvPdfDash(
	value: string | number | undefined,
	blank = false,
) {
	if (blank) return "-";
	if (value === undefined || value === "" || value === 0) return "-";
	if (typeof value === "number") return formatPvAmount(value);
	return value;
}
