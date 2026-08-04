import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	PR_PROFILES,
	type PrPaymentVoucher,
	type PrProfile,
	type PrSubRole,
	resolvePrAccountFields,
} from "@agency-portal/lib/pr-demo";

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

/** PDF line description — matches PV-2606-001.pdf (e.g. "Salary (2nd June) - Mamba") */
export function pvPdfLineDescription(r: PrPaymentVoucher["rows"][number]) {
	const datePart = r.date ? ` (${r.date})` : "";
	const desc = r.desc.includes("(") ? r.desc : `${r.desc}${datePart}`;
	return r.outlet ? `${desc} - ${r.outlet}` : desc;
}

export function buildPvTemplateLines(pv: PrPaymentVoucher): PvTemplateLine[] {
	const lines: PvTemplateLine[] = pv.rows.map((r) => ({
		seq: String(r.i),
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

export function buildAgencyPayee(
	pv: PrPaymentVoucher,
	agencyPRs: AgencyManagedPR[],
): PvPayeeProfile {
	const managed = agencyPRs.find(
		(p) =>
			p.name === pv.prName ||
			p.id === pv.prName ||
			(pv.prIc && p.ic === pv.prIc),
	);
	const demo = findDemoProfileForPv(pv);
	const displayName = managed?.name ?? demo?.name ?? pv.prName;
	const icName = managed?.icName ?? demo?.first ?? displayName;
	return payeeFromPaymentVoucher(pv, {
		code:
			managed?.id ?? (demo ? derivePrCode(displayName, demo.ic) : undefined),
		phone: managed?.mobile ?? demo?.mobile,
		nickname: displayName,
		name: icName,
		ic: managed?.ic ?? pv.prIc ?? demo?.ic,
		bank: demo?.bank,
		accountNo: demo?.acc,
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
	const demo = findDemoProfileForPv(pv);
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

const MONTH_MAP: Record<string, string> = {
	jan: "01",
	feb: "02",
	mar: "03",
	apr: "04",
	may: "05",
	jun: "06",
	jul: "07",
	aug: "08",
	sep: "09",
	oct: "10",
	nov: "11",
	dec: "12",
};

/** Voucher date on PDF — DD/MM/YYYY per PV Template.xlsx */
export function formatPvVoucherDate(issued: string) {
	if (/^\d{2}\/\d{2}\/\d{4}$/.test(issued.trim())) return issued.trim();
	const m = issued.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
	if (m) {
		const mm = MONTH_MAP[m[2].slice(0, 3).toLowerCase()];
		if (mm) return `${m[1].padStart(2, "0")}/${mm}/${m[3]}`;
	}
	return issued;
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
