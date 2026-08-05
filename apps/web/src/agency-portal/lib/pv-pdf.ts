import type {
	PrPaymentVoucher,
	PrProfile,
	PrReceiptScan,
} from "@agency-portal/lib/pr-demo";
import {
	buildPvTemplateLines,
	formatPvPdfDash,
	formatPvSignStamp,
	formatPvVoucherDate,
	formatPvVoucherRef,
	PV_TEMPLATE_DISCLAIMER,
	PV_TEMPLATE_ISSUER,
	type PvIssuerProfile,
	type PvPayeeProfile,
	padPvTemplateLines,
	payeeFromPaymentVoucher,
	payeeFromProfile,
} from "@agency-portal/lib/pv-template";
import { renderSignatureInk } from "@agency-portal/lib/signature-ink";
import ExcelJS from "exceljs";

/** @deprecated Use PV_TEMPLATE_ISSUER */
export const PV_PDF_AGENCY = {
	name: PV_TEMPLATE_ISSUER.name,
	regNo: PV_TEMPLATE_ISSUER.regNo,
	address: PV_TEMPLATE_ISSUER.address,
	tel: PV_TEMPLATE_ISSUER.phone,
	logoPath: PV_TEMPLATE_ISSUER.logoPath,
} as const;

function escapeHtml(s: string) {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function amt(n: number) {
	return n.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function csvCell(value: string | number) {
	const s = String(value ?? "");
	if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

function csvRow(cells: (string | number)[]) {
	return cells.map(csvCell).join(",");
}

function prSigned(pv: PrPaymentVoucher) {
	return Boolean(
		pv.prSignedAt || pv.status === "PAID" || pv.status === "SIGNED",
	);
}

/** One party's half of the dual signature, resolved the way the PR's PDF does. */
interface PvSignatory {
	/** Column heading — 'Agency (Approved by)' or 'PR (Received by)'. */
	role: string;
	name: string;
	/** Ready-to-print mark: inline SVG ink, a demo image, or a printed name. */
	mark: string;
	date: string;
}

const SIG_DASH = "—";

/**
 * Resolve what goes on one signature line.
 *
 * The order is the point. The stored INK wins, because it is the only artefact
 * the signer actually produced; a demo data URL is second, because it exists
 * only on vouchers with no backend row behind them; and the printed-name
 * fallback is last and applies ONLY to a voucher that really was signed before
 * strokes were stored. An unsigned voucher gets a blank rule — the document
 * never draws a mark nobody made, which is exactly what it used to do for
 * anyone whose name was on file.
 */
function resolveSignatory(params: {
	role: string;
	name: string;
	signed: boolean;
	signedAt?: string;
	ink?: string;
	dataUrl?: string;
}): PvSignatory {
	const name = params.name?.trim() || SIG_DASH;
	if (!params.signed) {
		return { role: params.role, name, mark: "", date: "" };
	}
	const svg = renderSignatureInk(params.ink, { title: `${name} signature` });
	const mark = svg
		? svg
		: params.dataUrl
			? `<img src="${params.dataUrl}" alt="${escapeHtml(name)} signature" />`
			: `<span class="esig">${escapeHtml(name)}</span>`;
	return {
		role: params.role,
		name,
		mark,
		date: formatPvSignStamp(params.signedAt),
	};
}

/** One party's signature column — mark over a rule, then Name and Date rows. */
function signatureColumn(sig: PvSignatory) {
	return `<div class="sig-col">
      <div class="sig-role">${escapeHtml(sig.role)}</div>
      <div class="sig-mark">${sig.mark}</div>
      <div class="sig-fld"><span class="sig-lbl">Name:</span><span class="sig-val">${escapeHtml(sig.name)}</span></div>
      <div class="sig-fld"><span class="sig-lbl">Date:</span><span class="sig-val">${escapeHtml(sig.date)}</span></div>
    </div>`;
}

/**
 * Print/PDF HTML for a payment voucher.
 *
 * Laid out cell-for-cell after the backend's `payment-voucher-pdf.ts` — the
 * document the PR downloads from their phone. Before this, the two halves of the
 * same transaction printed differently enough to look like different documents:
 * a hardcoded letterhead, the raw uuid where the voucher number belongs, an ISO
 * date, invented blank rows, and a signature drawn from a name. Everything here
 * now comes from the same facts the PR's copy prints, so the two agree.
 *
 * The five columns are the PDF's, in the PDF's proportions (83/191/64/89/88pt of
 * a 515pt content width).
 */
export function buildPvBreakdownHtml(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	_receipts: PrReceiptScan[] = [],
	issuer: PvIssuerProfile = PV_TEMPLATE_ISSUER,
) {
	const logoUrl =
		typeof window !== "undefined"
			? `${window.location.origin}${issuer.logoPath}`
			: issuer.logoPath;

	// No blank padding rows: the PR's PDF prints the lines the voucher has and
	// stops. Padding a money document with dashes invites the reader to wonder
	// what was meant to be there.
	const templateLines = buildPvTemplateLines(pv);
	const voucherDate = formatPvVoucherDate(pv.issued);

	const agencySig = resolveSignatory({
		role: "Agency (Approved by)",
		name: pv.financeHeadName,
		signed: Boolean(pv.financeHeadSignedAt),
		signedAt: pv.financeHeadSignedAt,
		ink: pv.financeHeadSignatureInk,
		dataUrl: pv.financeHeadSignatureDataUrl,
	});
	const prSig = resolveSignatory({
		role: "PR (Received by)",
		name: payee.name,
		signed: prSigned(pv),
		signedAt: pv.prSignedAt,
		ink: pv.prSignatureInk,
		dataUrl: pv.prSignatureDataUrl,
	});

	const rowHtml = templateLines
		.map(
			(line) => `<tr>
      <td class="c">${escapeHtml(line.seq)}</td>
      <td>${escapeHtml(line.description)}</td>
      <td class="c">${line.unit || "-"}</td>
      <td class="r">${formatPvPdfDash(line.unitPrice)}</td>
      <td class="r">${formatPvPdfDash(line.amount)}</td>
    </tr>`,
		)
		.join("");

	const payableRows: [string, string, string, string][] = [
		["Code:", payee.code, "Voucher Date:", voucherDate],
		["Name:", payee.name, "", ""],
		["Nickname:", payee.nickname, "", ""],
		["IC/Passport No.:", payee.ic, "", ""],
		["Phone No.:", payee.phone, "", ""],
	];

	const payableHtml = payableRows
		.map(
			([label, value, rLabel, rValue]) => `<tr>
      <td>${escapeHtml(label)}</td>
      <td colspan="2">${escapeHtml(value || "-")}</td>
      <td${rLabel ? ' class="hd"' : ""}>${escapeHtml(rLabel)}</td>
      <td>${escapeHtml(rValue)}</td>
    </tr>`,
		)
		.join("");

	const payRows: [string, string][] = [
		["Payment Method:", issuer.paymentMethod],
		["Bank Name:", payee.bank],
		["Bank Account Name:", payee.accountName],
		["Bank Account No.:", payee.accountNo],
	];

	// The Total cell spans the whole payment-details block on the right, exactly
	// as the PDF's merged D:E rectangle does — starting on the 'Payment Details:'
	// header row, so the remaining rows carry no right-hand cells at all.
	const payHtml = payRows
		.map(
			([label, value]) => `<tr>
      <td>${escapeHtml(label)}</td>
      <td colspan="2">${escapeHtml(value || "-")}</td>
    </tr>`,
		)
		.join("");

	const totalCell = `<td class="total" colspan="2" rowspan="${payRows.length + 1}"><span class="total-lbl">Total</span><span class="total-val">RM ${amt(pv.net)}</span></td>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(formatPvVoucherRef(pv))} · Payment Voucher</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      color: #111;
      background: #fff;
    }
    .doc { max-width: 190mm; margin: 0 auto; }
    /* ── Letterhead: logo left, everything else centered (PDF rows 1–6) ── */
    .hdr { position: relative; text-align: center; margin-bottom: 12px; }
    .hdr-logo {
      position: absolute;
      left: 0;
      top: 0;
      width: 72px;
      height: auto;
    }
    .hdr-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .hdr-name { font-size: 11px; font-weight: 700; }
    .hdr-line { font-size: 10px; line-height: 1.5; }
    /* ── One 5-column grid for payable-to, line items and payment details ── */
    table.grid {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 10px;
    }
    table.grid td {
      border: 1px solid #777;
      padding: 4px 6px;
      vertical-align: middle;
      word-break: break-word;
    }
    table.grid td.hd {
      background: #ececec;
      font-weight: 700;
    }
    table.grid td.c { text-align: center; }
    table.grid td.r {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    table.grid td.total { text-align: center; }
    .total-lbl {
      display: block;
      font-size: 13px;
      font-weight: 700;
    }
    .total-val {
      display: block;
      margin-top: 5px;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    /* ── Dual signature: agency (approved by) left, PR (payee) right ── */
    table.sigs {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 16px;
    }
    table.sigs > tbody > tr > td {
      width: 50%;
      vertical-align: top;
      padding: 0;
    }
    table.sigs > tbody > tr > td:first-child { padding-right: 14px; }
    table.sigs > tbody > tr > td:last-child { padding-left: 14px; }
    .sig-role {
      font-size: 9px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .sig-mark {
      height: 34px;
      border-bottom: 1px solid #bbb;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
    }
    .sig-mark img { max-height: 32px; max-width: 100%; object-fit: contain; }
    .sig-mark .esig {
      font-family: "Times New Roman", Times, serif;
      font-style: italic;
      font-size: 13px;
      color: #2b3a67;
      padding-bottom: 2px;
    }
    .sig-fld {
      display: flex;
      gap: 6px;
      align-items: baseline;
      border-bottom: 1px solid #bbb;
      padding: 3px 0;
      font-size: 10px;
    }
    .sig-lbl { min-width: 38px; }
    .sig-val { flex: 1; word-break: break-word; }
    .disclaimer {
      margin-top: 18px;
      font-size: 9px;
      line-height: 1.5;
      text-align: center;
      color: #2b4a8c;
    }
    .no-print { display: none; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="doc">
    <div class="hdr">
      <img class="hdr-logo" src="${logoUrl}" alt="${escapeHtml(issuer.brand)}" />
      <div class="hdr-title">Payment Voucher</div>
      <div class="hdr-name">${escapeHtml(issuer.name)}</div>
      <div class="hdr-line">${escapeHtml(issuer.regNo)}</div>
      <div class="hdr-line">Phone No: ${escapeHtml(issuer.phone)}</div>
      <div class="hdr-line">Email Address: ${escapeHtml(issuer.email)}</div>
      <div class="hdr-line">Address: ${escapeHtml(issuer.address)}</div>
    </div>

    <table class="grid">
      <colgroup>
        <col style="width:16.1%" />
        <col style="width:37.1%" />
        <col style="width:12.4%" />
        <col style="width:17.3%" />
        <col style="width:17.1%" />
      </colgroup>
      <tbody>
        <tr>
          <td class="hd" colspan="3">Payable to:</td>
          <td class="hd">Voucher No.:</td>
          <td><b>${escapeHtml(formatPvVoucherRef(pv))}</b></td>
        </tr>
        ${payableHtml}
        <tr>
          <td class="hd c">#</td>
          <td class="hd">Description</td>
          <td class="hd c">Unit</td>
          <td class="hd r">Unit Price (RM)</td>
          <td class="hd r">Amount (RM)</td>
        </tr>
        ${rowHtml}
        <tr>
          <td class="hd" colspan="3">Payment Details:</td>
          ${totalCell}
        </tr>
        ${payHtml}
      </tbody>
    </table>

    <table class="sigs">
      <tbody>
        <tr>
          <td>${signatureColumn(agencySig)}</td>
          <td>${signatureColumn(prSig)}</td>
        </tr>
      </tbody>
    </table>

    <p class="disclaimer">${escapeHtml(PV_TEMPLATE_DISCLAIMER)}</p>
  </div>

  <p class="no-print" style="margin-top:12px;font-size:8px;color:#aaa;text-align:center;">
    Print → Save as PDF · ${escapeHtml(formatPvVoucherRef(pv))}
  </p>
</body>
</html>`;
}

const PV_SHEET_COLS = 5;

const PV_EX_GRAY: ExcelJS.Fill = {
	type: "pattern",
	pattern: "solid",
	fgColor: { argb: "FFD8D8D8" },
};
const PV_EX_THIN: ExcelJS.BorderStyle = "thin";
const PV_EX_MEDIUM: ExcelJS.BorderStyle = "medium";
const PV_EX_BORDER_THIN: Partial<ExcelJS.Borders> = {
	top: { style: PV_EX_THIN },
	left: { style: PV_EX_THIN },
	bottom: { style: PV_EX_THIN },
	right: { style: PV_EX_THIN },
};
const PV_EX_BORDER_MEDIUM: Partial<ExcelJS.Borders> = {
	top: { style: PV_EX_MEDIUM },
	left: { style: PV_EX_MEDIUM },
	bottom: { style: PV_EX_MEDIUM },
	right: { style: PV_EX_MEDIUM },
};
const PV_EX_FONT = { name: "Arial", size: 10, color: { argb: "FF000000" } };

function pvExCell(
	ws: ExcelJS.Worksheet,
	row: number,
	col: number,
	value: string | number = "",
	style?: {
		bold?: boolean;
		size?: number;
		italic?: boolean;
		color?: string;
		fontName?: string;
		align?: Partial<ExcelJS.Alignment>;
		fill?: ExcelJS.Fill;
		border?: Partial<ExcelJS.Borders>;
		numFmt?: string;
	},
) {
	const cell = ws.getRow(row).getCell(col);
	cell.value = value;
	cell.font = {
		name: style?.fontName ?? PV_EX_FONT.name,
		size: style?.size ?? PV_EX_FONT.size,
		bold: style?.bold,
		italic: style?.italic,
		color: style?.color ? { argb: style.color } : PV_EX_FONT.color,
	};
	if (style?.align) cell.alignment = style.align;
	if (style?.fill) cell.fill = style.fill;
	if (style?.border) cell.border = style.border;
	if (style?.numFmt) cell.numFmt = style.numFmt;
	return cell;
}

function pvExMerge(
	ws: ExcelJS.Worksheet,
	r1: number,
	c1: number,
	r2: number,
	c2: number,
	value: string | number = "",
	style?: Parameters<typeof pvExCell>[4],
) {
	if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
	return pvExCell(ws, r1, c1, value, style);
}

function pvExBox(
	ws: ExcelJS.Worksheet,
	r1: number,
	c1: number,
	r2: number,
	c2: number,
	weight: "thin" | "medium" = "thin",
) {
	const edge = weight === "medium" ? PV_EX_BORDER_MEDIUM : PV_EX_BORDER_THIN;
	for (let r = r1; r <= r2; r++) {
		for (let c = c1; c <= c2; c++) {
			const cell = ws.getRow(r).getCell(c);
			const border: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) };
			if (r === r1) border.top = edge.top;
			if (r === r2) border.bottom = edge.bottom;
			if (c === c1) border.left = edge.left;
			if (c === c2) border.right = edge.right;
			cell.border = border;
		}
	}
}

async function fetchPvLogoBase64(
	logoPath: string = PV_TEMPLATE_ISSUER.logoPath,
): Promise<string | null> {
	if (typeof window === "undefined") return null;
	try {
		const res = await fetch(`${window.location.origin}${logoPath}`);
		if (!res.ok) return null;
		const buf = await res.arrayBuffer();
		const bytes = new Uint8Array(buf);
		let binary = "";
		for (let i = 0; i < bytes.length; i++)
			binary += String.fromCharCode(bytes[i]!);
		return btoa(binary);
	} catch {
		return null;
	}
}

function triggerPvExcelDownload(buffer: ArrayBuffer, filename: string) {
	const blob = new Blob([buffer], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

function padSheetRow(cells: (string | number)[]): (string | number)[] {
	const row = [...cells];
	while (row.length < PV_SHEET_COLS) row.push("");
	return row.slice(0, PV_SHEET_COLS);
}

/** Worksheet rows — 5-column layout matching the official PV PDF / template */
export function buildPvBreakdownSheetRows(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	issuer: PvIssuerProfile = PV_TEMPLATE_ISSUER,
): (string | number)[][] {
	const templateLines = padPvTemplateLines(buildPvTemplateLines(pv), 5);
	const voucherDate = formatPvVoucherDate(pv.issued);
	const prOk = prSigned(pv);
	const financeOk = Boolean(pv.financeHeadSignedAt);
	const rows: (string | number)[][] = [];
	const push = (...cells: (string | number)[]) => rows.push(padSheetRow(cells));

	push("", "", "Payment Voucher", "", "");
	push("", `${issuer.name} ${issuer.regNo}`, "", "", "");
	push(
		`Phone No: ${issuer.phone}`,
		"",
		`Email Address: ${issuer.email}`,
		"",
		"",
	);
	push(`Address: ${issuer.address}.`, "", "", "", "");
	push("");

	push("Payable to:", "", "Voucher No.:", formatPvVoucherRef(pv), "");
	push("Code:", payee.code, "Voucher Date:", voucherDate, "");
	push("Name:", payee.name, "", "", "");
	push("Nickname:", payee.nickname, "", "", "");
	push("IC/Passport No.:", payee.ic, "", "", "");
	push("Phone No.:", payee.phone, "", "", "");

	push("#", "Description", "Unit", "Unit Price (RM)", "Amount (RM)");
	for (const line of templateLines) {
		if (line.blank) {
			push("", "", "-", "-", "-");
		} else {
			push(
				line.seq,
				line.description,
				line.unit || "-",
				formatPvPdfDash(line.unitPrice),
				formatPvPdfDash(line.amount),
			);
		}
	}

	push("");
	push("Payment Details:", "", "Total", `RM ${amt(pv.net)}`, "");
	push("Payment Method:", issuer.paymentMethod, "", "", "");
	push("Bank Name:", payee.bank, "", "", "");
	push("Bank Account Name:", payee.accountName, "", "", "");
	push("Bank Account No.:", payee.accountNo, "", "", "");

	// Both signatures, side by side and in the same order as the printed
	// document: agency on the left (columns A/B), PR on the right (D/E).
	push("");
	push("Agency (Approved by)", "", "", "PR (Received by)", "");
	push(
		"Signature:",
		financeOk ? pv.financeHeadName : "",
		"",
		"Signature:",
		prOk ? payee.name : "",
	);
	push("Name:", pv.financeHeadName, "", "Name:", payee.name);
	push(
		"Date:",
		formatPvSignStamp(financeOk ? pv.financeHeadSignedAt : ""),
		"",
		"Date:",
		formatPvSignStamp(prOk ? pv.prSignedAt : ""),
	);

	push("");
	push(PV_TEMPLATE_DISCLAIMER, "", "", "", "");

	return rows;
}

/** Styled Excel workbook — borders, grey headers, hidden gridlines (PDF-like) */
export async function buildPvBreakdownWorkbook(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	issuer: PvIssuerProfile = PV_TEMPLATE_ISSUER,
) {
	const templateLines = padPvTemplateLines(buildPvTemplateLines(pv), 5);
	const voucherDate = formatPvVoucherDate(pv.issued);
	const prOk = prSigned(pv);
	const financeOk = Boolean(pv.financeHeadSignedAt);

	const wb = new ExcelJS.Workbook();
	wb.creator = issuer.name;
	const ws = wb.addWorksheet("Payment Voucher", {
		views: [{ showGridLines: false, zoomScale: 100 }],
		pageSetup: {
			paperSize: 9,
			orientation: "portrait",
			fitToPage: true,
			fitToWidth: 1,
			fitToHeight: 0,
			margins: {
				left: 0.5,
				right: 0.5,
				top: 0.5,
				bottom: 0.5,
				header: 0.3,
				footer: 0.3,
			},
		},
	});

	ws.columns = [
		{ width: 13 },
		{ width: 30 },
		{ width: 10 },
		{ width: 14 },
		{ width: 14 },
	];

	// Logo in column A only; header text uses full width B:E
	pvExMerge(ws, 1, 1, 6, 1, "", { align: { vertical: "middle" } });

	const logoBase64 = await fetchPvLogoBase64(issuer.logoPath);
	if (logoBase64) {
		const imageId = wb.addImage({ base64: logoBase64, extension: "png" });
		ws.addImage(imageId, {
			tl: { col: 0.15, row: 0.2 },
			ext: { width: 64, height: 64 },
		});
	}

	ws.getRow(1).height = 30;
	pvExMerge(ws, 1, 2, 1, 5, "Payment Voucher", {
		bold: true,
		size: 20,
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(2).height = 16;
	pvExMerge(ws, 2, 2, 2, 5, issuer.name, {
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(3).height = 16;
	pvExMerge(ws, 3, 2, 3, 5, issuer.regNo, {
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(4).height = 16;
	pvExMerge(ws, 4, 2, 4, 5, `Phone No: ${issuer.phone}`, {
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(5).height = 16;
	pvExMerge(ws, 5, 2, 5, 5, `Email Address: ${issuer.email}`, {
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(6).height = 18;
	pvExMerge(ws, 6, 2, 6, 5, `Address: ${issuer.address}.`, {
		align: { horizontal: "center", vertical: "middle", wrapText: true },
	});

	ws.getRow(7).height = 8;
	for (let c = 1; c <= 5; c++) {
		pvExCell(ws, 7, c, "", { border: { bottom: { style: PV_EX_THIN } } });
	}

	// Payable + voucher meta
	const payeeStartRow = 8;
	ws.getRow(payeeStartRow).height = 22;
	pvExMerge(ws, payeeStartRow, 1, payeeStartRow, 3, "Payable to:", {
		bold: true,
		fill: PV_EX_GRAY,
		align: { vertical: "middle", horizontal: "left" },
		border: PV_EX_BORDER_THIN,
	});
	pvExCell(ws, payeeStartRow, 4, "Voucher No.:", {
		bold: true,
		fill: PV_EX_GRAY,
		align: { vertical: "middle", horizontal: "left" },
		border: PV_EX_BORDER_THIN,
	});
	pvExCell(ws, payeeStartRow, 5, formatPvVoucherRef(pv), {
		align: { vertical: "middle", horizontal: "left", wrapText: true },
		border: PV_EX_BORDER_THIN,
	});

	const payeeRows: [string, string][] = [
		["Code:", payee.code],
		["Name:", payee.name],
		["Nickname:", payee.nickname],
		["IC/Passport No.:", payee.ic],
		["Phone No.:", payee.phone],
	];

	for (let i = 0; i < payeeRows.length; i++) {
		const row = payeeStartRow + 1 + i;
		ws.getRow(row).height = 20;
		const [label, value] = payeeRows[i]!;
		pvExCell(ws, row, 1, label, {
			align: { vertical: "middle", horizontal: "left" },
			border: PV_EX_BORDER_THIN,
		});
		pvExMerge(ws, row, 2, row, 3, value, {
			align: { vertical: "middle", horizontal: "left", wrapText: true },
			border: PV_EX_BORDER_THIN,
		});

		if (i === 0) {
			pvExCell(ws, row, 4, "Voucher Date:", {
				bold: true,
				fill: PV_EX_GRAY,
				align: { vertical: "middle", horizontal: "left" },
				border: PV_EX_BORDER_THIN,
			});
			pvExCell(ws, row, 5, voucherDate, {
				align: { vertical: "middle", horizontal: "left" },
				border: PV_EX_BORDER_THIN,
			});
		} else {
			pvExCell(ws, row, 4, "", { border: PV_EX_BORDER_THIN });
			pvExCell(ws, row, 5, "", { border: PV_EX_BORDER_THIN });
		}
	}

	// Line items
	const itemsHeaderRow = payeeStartRow + payeeRows.length + 1;
	ws.getRow(itemsHeaderRow).height = 24;
	const itemHeaders = [
		"#",
		"Description",
		"Unit",
		"Unit Price (RM)",
		"Amount (RM)",
	];
	itemHeaders.forEach((header, idx) => {
		pvExCell(ws, itemsHeaderRow, idx + 1, header, {
			bold: true,
			fill: PV_EX_GRAY,
			align: {
				horizontal: idx >= 2 ? "center" : "left",
				vertical: "middle",
				wrapText: true,
			},
			border: { bottom: { style: PV_EX_THIN }, top: { style: PV_EX_THIN } },
		});
	});
	pvExBox(ws, itemsHeaderRow, 1, itemsHeaderRow, 5);

	let row = itemsHeaderRow + 1;
	for (const line of templateLines) {
		const descLines = line.blank
			? 1
			: Math.max(1, Math.ceil(line.description.length / 32));
		ws.getRow(row).height = Math.max(22, descLines * 15);
		if (line.blank) {
			pvExCell(ws, row, 1, "", { border: { bottom: { style: PV_EX_THIN } } });
			pvExCell(ws, row, 2, "", { border: { bottom: { style: PV_EX_THIN } } });
			pvExCell(ws, row, 3, "-", {
				align: { horizontal: "center", vertical: "middle" },
				border: { bottom: { style: PV_EX_THIN } },
			});
			pvExCell(ws, row, 4, "-", {
				align: { horizontal: "right", vertical: "middle" },
				border: { bottom: { style: PV_EX_THIN } },
			});
			pvExCell(ws, row, 5, "-", {
				align: { horizontal: "right", vertical: "middle" },
				border: { bottom: { style: PV_EX_THIN } },
			});
		} else {
			pvExCell(ws, row, 1, line.seq, {
				align: { horizontal: "center", vertical: "middle" },
				border: { bottom: { style: PV_EX_THIN } },
			});
			pvExCell(ws, row, 2, line.description, {
				align: { vertical: "middle", horizontal: "left", wrapText: true },
				border: { bottom: { style: PV_EX_THIN } },
			});
			pvExCell(ws, row, 3, line.unit || "-", {
				align: { horizontal: "center", vertical: "middle" },
				border: { bottom: { style: PV_EX_THIN } },
			});
			pvExCell(ws, row, 4, formatPvPdfDash(line.unitPrice), {
				align: { horizontal: "right", vertical: "middle" },
				border: { bottom: { style: PV_EX_THIN } },
			});
			pvExCell(ws, row, 5, formatPvPdfDash(line.amount), {
				align: { horizontal: "right", vertical: "middle" },
				border: { bottom: { style: PV_EX_THIN } },
			});
		}
		pvExBox(ws, row, 1, row, 5);
		row++;
	}

	// Payment details + total (total box spans full height on the right)
	const paymentStartRow = row;
	const paymentBlockEnd = paymentStartRow + 4;
	for (let r = paymentStartRow; r <= paymentBlockEnd; r++) {
		ws.getRow(r).height = 24;
	}

	pvExMerge(ws, paymentStartRow, 1, paymentStartRow, 3, "Payment Details:", {
		bold: true,
		fill: PV_EX_GRAY,
		align: { vertical: "middle", horizontal: "left" },
		border: PV_EX_BORDER_THIN,
	});
	ws.mergeCells(paymentStartRow, 4, paymentBlockEnd, 5);
	pvExBox(ws, paymentStartRow, 4, paymentBlockEnd, 5, "medium");
	const totalCell = ws.getCell(paymentStartRow, 4);
	totalCell.value = `Total\n\nRM ${amt(pv.net)}`;
	totalCell.font = {
		name: "Arial",
		size: 18,
		bold: true,
		color: { argb: "FF000000" },
	};
	totalCell.alignment = {
		horizontal: "center",
		vertical: "middle",
		wrapText: true,
	};
	row++;

	const paymentRows: [string, string][] = [
		["Payment Method:", issuer.paymentMethod],
		["Bank Name:", payee.bank],
		["Bank Account Name:", payee.accountName],
		["Bank Account No.:", payee.accountNo],
	];
	for (const [label, value] of paymentRows) {
		pvExCell(ws, row, 1, label, {
			align: { vertical: "middle", horizontal: "left" },
			border: PV_EX_BORDER_THIN,
		});
		pvExMerge(ws, row, 2, row, 3, value, {
			align: { vertical: "middle", horizontal: "left", wrapText: true },
			border: PV_EX_BORDER_THIN,
		});
		row++;
	}
	pvExBox(ws, paymentStartRow, 1, paymentBlockEnd, 3);

	// ── Both signatures, side by side and in the printed document's order:
	// agency (approved by) in columns A/B, PR (payee) in D/E. A spreadsheet
	// cannot carry the drawn ink, so a signed line prints the signer's name in a
	// script face and an UNSIGNED one stays empty — the sheet never asserts a
	// signature the row does not hold.
	row++;
	ws.getRow(row).height = 20;
	pvExMerge(ws, row, 1, row, 2, "Agency (Approved by)", {
		bold: true,
		size: 9,
		align: { vertical: "middle", horizontal: "left" },
	});
	pvExMerge(ws, row, 4, row, 5, "PR (Received by)", {
		bold: true,
		size: 9,
		align: { vertical: "middle", horizontal: "left" },
	});
	row++;

	const sigRows: [string, string, string][] = [
		["Signature:", financeOk ? pv.financeHeadName : "", prOk ? payee.name : ""],
		["Name:", pv.financeHeadName, payee.name],
		[
			"Date:",
			formatPvSignStamp(financeOk ? pv.financeHeadSignedAt : ""),
			formatPvSignStamp(prOk ? pv.prSignedAt : ""),
		],
	];

	for (const [label, agencyValue, prValue] of sigRows) {
		const isMark = label === "Signature:";
		ws.getRow(row).height = isMark ? 34 : 20;
		const write = (
			labelCol: number,
			valueCol: number,
			valueColEnd: number,
			value: string,
		) => {
			pvExCell(ws, row, labelCol, label, {
				align: { vertical: "middle", horizontal: "left" },
			});
			pvExMerge(ws, row, valueCol, row, valueColEnd, value, {
				fontName: isMark && value ? "Segoe Script" : undefined,
				size: isMark && value ? 15 : undefined,
				color: isMark && value ? "FF1A1A6E" : undefined,
				align: { horizontal: "left", vertical: "bottom", wrapText: true },
				border: { bottom: { style: PV_EX_THIN } },
			});
		};
		write(1, 2, 3, agencyValue);
		write(4, 5, 5, prValue);
		row++;
	}

	row++;
	ws.getRow(row).height = 10;
	for (let c = 1; c <= 5; c++) {
		pvExCell(ws, row, c, "", { border: { top: { style: PV_EX_THIN } } });
	}
	row++;

	ws.getRow(row).height = 44;
	pvExMerge(ws, row, 1, row, 5, PV_TEMPLATE_DISCLAIMER, {
		size: 9,
		align: { horizontal: "center", vertical: "middle", wrapText: true },
	});

	pvExBox(ws, 1, 1, row, 5, "thin");

	return wb;
}

export async function downloadPvBreakdownExcel(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	issuer?: PvIssuerProfile,
) {
	const wb = await buildPvBreakdownWorkbook(pv, payee, issuer);
	const buffer = await wb.xlsx.writeBuffer();
	triggerPvExcelDownload(
		buffer,
		`${formatPvVoucherRef(pv)}-payment-voucher.xlsx`,
	);
}

/** Legacy CSV string — same 5-column layout as the Excel export */
export function buildPvBreakdownCsv(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	issuer?: PvIssuerProfile,
): string {
	return buildPvBreakdownSheetRows(pv, payee, issuer)
		.map((row) => csvRow(row))
		.join("\r\n");
}

/** Downloads styled Excel (.xlsx) matching the official PV template layout */
export function downloadPvBreakdownCsv(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	issuer?: PvIssuerProfile,
) {
	void downloadPvBreakdownExcel(pv, payee, issuer);
}

/** Open print-ready PV in a new tab for viewing (Print → Save as PDF to download). */
export function viewPvBreakdownPdf(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	receipts: PrReceiptScan[] = [],
	issuer?: PvIssuerProfile,
) {
	const html = buildPvBreakdownHtml(pv, payee, receipts, issuer);
	const viewWin = window.open("", "_blank");
	if (viewWin) {
		viewWin.document.open();
		viewWin.document.write(html);
		viewWin.document.close();
		viewWin.focus();
		return;
	}
	const blob = new Blob([html], { type: "text/html;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `${formatPvVoucherRef(pv)}-payment-voucher.html`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** @deprecated Prefer viewPvBreakdownPdf — same behavior (view first, no auto-print). */
export function downloadPvBreakdownPdf(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	receipts: PrReceiptScan[] = [],
	issuer?: PvIssuerProfile,
) {
	viewPvBreakdownPdf(pv, payee, receipts, issuer);
}

export function downloadAgencyPvPdf(
	pv: PrPaymentVoucher,
	payeeOverrides?: Partial<PvPayeeProfile> & {
		mobile?: string;
		bank?: string;
		acc?: string;
		first?: string;
	},
) {
	const payee = payeeOverrides?.name
		? payeeFromProfile(
				{
					name: payeeOverrides.name,
					ic: payeeOverrides.ic ?? pv.prIc ?? "—",
					mobile: payeeOverrides.mobile ?? payeeOverrides.phone ?? "",
					bank: payeeOverrides.bank ?? "",
					acc: payeeOverrides.acc ?? payeeOverrides.accountNo ?? "",
					first: payeeOverrides.first ?? payeeOverrides.nickname ?? "",
				},
				payeeOverrides,
			)
		: payeeFromPaymentVoucher(pv, payeeOverrides);

	downloadPvBreakdownPdf(pv, payee, []);
}

export function downloadPvReceipt(
	pv: PrPaymentVoucher,
	profile: Pick<PrProfile, "name" | "ic" | "mobile" | "bank" | "acc" | "first">,
	receipts: PrReceiptScan[] = [],
) {
	downloadPvBreakdownPdf(pv, payeeFromProfile(profile), receipts);
}
