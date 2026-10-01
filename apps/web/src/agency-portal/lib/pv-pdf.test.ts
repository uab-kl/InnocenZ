import type { PrPaymentVoucher } from "@agency-portal/lib/pr-demo";
import type {
	PvIssuerProfile,
	PvPayeeProfile,
} from "@agency-portal/lib/pv-template";
import { describe, expect, it } from "vitest";
import {
	buildPvBreakdownHtml,
	buildPvBreakdownSheetRows,
	buildPvBreakdownWorkbook,
} from "./pv-pdf";

/**
 * A NEGATIVE VOUCHER TOTAL, ONE SIGN, BEFORE THE CURRENCY (30 Sep 2026).
 *
 * The agency's printed voucher and its workbook printed a negative net as
 * "RM -4.50". They now read "−RM 4.50" — the same string the backend twin
 * prints (`formatVoucherRm`, pinned by payment-voucher-export-sign.test.ts), so
 * the two documents behind one voucher number still agree. The PR's PDFKit copy
 * alone prints an en dash in that place; its font has no U+2212.
 */

const MINUS = "−";

/** A week the deductions outran: 15.50 earned, a 20.00 fee — net −4.50. */
function voucher(net: number): PrPaymentVoucher {
	return {
		id: "7bf3962e-591e-452f-b781-edbe1cbe6ef0",
		voucherNo: "PV-000012",
		prName: "Payee",
		outlet: "UAB Emhub",
		cycle: "Weekly",
		issued: "2026-10-04",
		due: "2026-10-11",
		rows: [
			{
				i: 0,
				date: "2026-09-29",
				day: "Tue",
				outlet: "UAB Emhub",
				desc: "Daily wages",
				qty: 1,
				amt: 15.5,
				ref: "",
			},
			{
				i: 1,
				date: "2026-09-30",
				day: "Wed",
				outlet: "UAB Emhub",
				desc: "Cancellation fee",
				qty: 1,
				amt: -20,
				ref: "",
				component: "deduction",
			},
		],
		subtotal: net,
		deduct: 0,
		net,
		status: "SENT",
		financeHeadName: "",
		financeHeadSignedAt: "",
	} as PrPaymentVoucher;
}

const PAYEE: PvPayeeProfile = {
	code: "PAYE",
	name: "Payee",
	nickname: "",
	ic: "",
	phone: "",
	bank: "",
	accountName: "",
	accountNo: "",
};

/** No logo path: the workbook then fetches nothing. */
const ISSUER: PvIssuerProfile = {
	brand: "Agency",
	name: "Agency Sdn Bhd",
	regNo: "(0000)",
	phone: "—",
	email: "—",
	address: "—",
	logoPath: "",
	paymentMethod: "Transfer",
};

describe("the printed voucher", () => {
	it("totals a negative week as −RM 4.50, never RM -4.50", () => {
		const html = buildPvBreakdownHtml(voucher(-4.5), PAYEE, [], ISSUER);
		expect(html).toContain(`<span class="total-val">${MINUS}RM 4.50</span>`);
		expect(html).not.toContain("RM -");
	});

	it("prints a positive total exactly as before", () => {
		const html = buildPvBreakdownHtml(voucher(1234.5), PAYEE, [], ISSUER);
		expect(html).toContain('<span class="total-val">RM 1,234.50</span>');
	});
});

describe("the sheet rows", () => {
	it("carry the same total the backend twin prints", () => {
		const rows = buildPvBreakdownSheetRows(voucher(-4.5), PAYEE, ISSUER);
		const total = rows.find((row) => row[2] === "Total");
		expect(total?.[3]).toBe(`${MINUS}RM 4.50`);
	});
});

describe("the workbook", () => {
	it("keeps the total a TEXT cell reading −RM 4.50, as the backend twin's", async () => {
		const wb = await buildPvBreakdownWorkbook(voucher(-4.5), PAYEE, ISSUER);
		const ws = wb.getWorksheet("Payment Voucher");
		let total: unknown;
		ws?.eachRow((row) =>
			row.eachCell((cell) => {
				if (
					total === undefined &&
					typeof cell.value === "string" &&
					cell.value.startsWith("Total")
				) {
					total = cell.value;
				}
			}),
		);
		expect(total).toBe(`Total\n\n${MINUS}RM 4.50`);
	});
});
