import type {
	PrPaymentVoucher,
	PrProfile,
	PrReceiptScan,
} from "@agency-portal/lib/pr-demo";
import {
	buildPvTemplateLines,
	formatPvPdfDash,
	formatPvVoucherDate,
	PV_TEMPLATE_DISCLAIMER,
	PV_TEMPLATE_ISSUER,
	type PvPayeeProfile,
	padPvTemplateLines,
	payeeFromPaymentVoucher,
	payeeFromProfile,
} from "@agency-portal/lib/pv-template";
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

function fieldRow(label: string, value: string) {
	return `<div class="fld"><span class="fld-lbl">${escapeHtml(label)}</span><span class="fld-val">${escapeHtml(value || "-")}</span></div>`;
}

/** Print/PDF HTML — matches PV Template.xlsx + PV-2606-001.pdf */
export function buildPvBreakdownHtml(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	_receipts: PrReceiptScan[] = [],
) {
	const logoUrl =
		typeof window !== "undefined"
			? `${window.location.origin}${PV_TEMPLATE_ISSUER.logoPath}`
			: PV_TEMPLATE_ISSUER.logoPath;

	const templateLines = padPvTemplateLines(buildPvTemplateLines(pv), 5);
	const voucherDate = formatPvVoucherDate(pv.issued);
	const prOk = prSigned(pv);

	const rowHtml = templateLines
		.map((line) => {
			const blank = line.blank;
			return `<tr>
      <td class="c">${blank ? "" : escapeHtml(line.seq)}</td>
      <td class="desc">${blank ? "" : escapeHtml(line.description)}</td>
      <td class="c">${blank ? "-" : line.unit || "-"}</td>
      <td class="r">${formatPvPdfDash(blank ? undefined : line.unitPrice, blank)}</td>
      <td class="r">${formatPvPdfDash(blank ? undefined : line.amount, blank)}</td>
    </tr>`;
		})
		.join("");

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pv.id)} — Payment Voucher</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      color: #000;
      background: #fff;
      padding: 0;
    }
    .doc {
      border: 1px solid #000;
      padding: 14px 16px 12px;
      max-width: 210mm;
      margin: 0 auto;
    }
    /* ── Header: logo left, title + issuer centered ── */
    .hdr {
      display: table;
      width: 100%;
      margin-bottom: 10px;
    }
    .hdr-logo {
      display: table-cell;
      width: 110px;
      vertical-align: top;
    }
    .hdr-logo img { width: 100px; height: auto; }
    .hdr-mid {
      display: table-cell;
      vertical-align: top;
      text-align: center;
      padding: 0 8px;
    }
    .hdr-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: 0.02em;
    }
    .hdr-issuer {
      font-size: 10px;
      line-height: 1.55;
      color: #000;
    }
    .hdr-rule {
      border: none;
      border-top: 1px solid #000;
      margin: 0 0 10px;
    }
    /* ── Payable + voucher meta ── */
    .top-row {
      display: table;
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
    }
    .payable-cell {
      display: table-cell;
      width: 62%;
      vertical-align: top;
      padding-right: 0;
    }
    .meta-cell {
      display: table-cell;
      width: 38%;
      vertical-align: top;
    }
    .box {
      border: 1px solid #000;
    }
    .box-h {
      background: #d8d8d8;
      border-bottom: 1px solid #000;
      padding: 5px 8px;
      font-size: 11px;
      font-weight: 700;
    }
    .box-body { padding: 6px 10px 8px; }
    .fld {
      display: table;
      width: 100%;
      margin-bottom: 3px;
      font-size: 10px;
      line-height: 1.5;
    }
    .fld:last-child { margin-bottom: 0; }
    .fld-lbl {
      display: table-cell;
      width: 118px;
      font-weight: 400;
      vertical-align: top;
      white-space: nowrap;
    }
    .fld-val {
      display: table-cell;
      vertical-align: top;
      word-break: break-word;
    }
    .meta-tbl {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      border: 1px solid #000;
      border-left: none;
    }
    .meta-tbl th,
    .meta-tbl td {
      border: 1px solid #000;
      padding: 5px 8px;
      vertical-align: middle;
    }
    .meta-tbl th {
      background: #d8d8d8;
      font-weight: 700;
      text-align: left;
      width: 42%;
      white-space: nowrap;
    }
    .meta-tbl td { font-weight: 400; }
    /* ── Line items — horizontal rules only (per PDF sample) ── */
    .items-wrap {
      border-left: 1px solid #000;
      border-right: 1px solid #000;
      border-bottom: 1px solid #000;
    }
    table.items {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }
    table.items th {
      background: #d8d8d8;
      border-bottom: 1px solid #000;
      padding: 6px 8px;
      font-weight: 700;
      text-align: left;
    }
    table.items td {
      padding: 7px 8px;
      vertical-align: middle;
      border: none;
    }
    table.items .c { text-align: center; width: 36px; }
    table.items .desc { text-align: left; }
    table.items .r {
      text-align: right;
      white-space: nowrap;
      width: 90px;
      font-variant-numeric: tabular-nums;
    }
    table.items tbody tr:last-child td {
      padding-bottom: 10px;
    }
    /* ── Payment details + total ── */
    .bot-row {
      display: table;
      width: 100%;
      border-collapse: collapse;
    }
    .pay-cell {
      display: table-cell;
      width: 62%;
      vertical-align: top;
    }
    .total-cell {
      display: table-cell;
      width: 38%;
      vertical-align: top;
      padding-left: 0;
    }
    .pay-box {
      border: 1px solid #000;
      border-top: none;
    }
    .total-box {
      border: 2px solid #000;
      border-top: none;
      border-left: none;
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      gap: 12px;
    }
    .total-box .lbl {
      font-size: 22px;
      font-weight: 700;
      white-space: nowrap;
    }
    .total-box .val {
      font-size: 22px;
      font-weight: 700;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    /* ── Signature — PR payee only ── */
    .sig-row {
      display: block;
      width: 100%;
      margin-top: 0;
      padding: 12px 0 8px;
      text-align: right;
    }
    .sig-right {
      display: inline-block;
      vertical-align: top;
      text-align: right;
    }
    .sig-inner {
      display: inline-block;
      width: 240px;
      text-align: left;
    }
    .sig-left .sig-inner { margin-left: 4px; }
    .sig-right .sig-inner { margin-right: 4px; }
    .sig-role {
      font-size: 9px;
      font-weight: 700;
      margin-bottom: 6px;
      color: #333;
    }
    .sig-wrap {
      margin-top: 0;
      padding: 0;
      text-align: right;
    }
    .sig-line {
      border-bottom: 1px solid #000;
      height: 36px;
      margin-bottom: 6px;
      display: flex;
      align-items: flex-end;
      justify-content: flex-end;
      overflow: hidden;
    }
    .sig-line img {
      max-height: 34px;
      max-width: 100%;
      object-fit: contain;
      object-position: right bottom;
    }
    .sig-line .esig {
      font-family: "Segoe Script", "Brush Script MT", cursive;
      font-size: 18px;
      color: #1a1a6e;
      padding-bottom: 2px;
    }
    .sig-fld {
      display: flex;
      gap: 6px;
      margin-bottom: 4px;
      font-size: 10px;
    }
    .sig-fld .lbl { font-weight: 400; min-width: 38px; }
    .sig-fld .val {
      flex: 1;
      border-bottom: 1px solid #000;
      min-height: 16px;
      padding-bottom: 1px;
    }
    /* ── Footer ── */
    .ftr-rule {
      border: none;
      border-top: 1px solid #000;
      margin: 8px 0 10px;
    }
    .disclaimer {
      font-size: 9px;
      line-height: 1.5;
      text-align: center;
      color: #000;
      padding: 0 4px;
    }
    .no-print { display: none; }
    @media print {
      body { padding: 0; }
      .doc { border: 1px solid #000; }
    }
  </style>
</head>
<body>
  <div class="doc">
    <div class="hdr">
      <div class="hdr-logo">
        <img src="${logoUrl}" alt="${escapeHtml(PV_TEMPLATE_ISSUER.brand)}" />
      </div>
      <div class="hdr-mid">
        <div class="hdr-title">Payment Voucher</div>
        <div class="hdr-issuer">
          ${escapeHtml(PV_TEMPLATE_ISSUER.name)} ${escapeHtml(PV_TEMPLATE_ISSUER.regNo)}<br />
          Phone No: ${escapeHtml(PV_TEMPLATE_ISSUER.phone)} Email Address: ${escapeHtml(PV_TEMPLATE_ISSUER.email)}<br />
          Address: ${escapeHtml(PV_TEMPLATE_ISSUER.address)}.
        </div>
      </div>
    </div>

    <hr class="hdr-rule" />

    <div class="top-row">
      <div class="payable-cell">
        <div class="box">
          <div class="box-h">Payable to:</div>
          <div class="box-body">
            ${fieldRow("Code:", payee.code)}
            ${fieldRow("Name:", payee.name)}
            ${fieldRow("Nickname:", payee.nickname)}
            ${fieldRow("IC/Passport No.:", payee.ic)}
            ${fieldRow("Phone No.:", payee.phone)}
          </div>
        </div>
      </div>
      <div class="meta-cell">
        <table class="meta-tbl">
          <tr><th>Voucher No.:</th><td>${escapeHtml(pv.id)}</td></tr>
          <tr><th>Voucher Date:</th><td>${escapeHtml(voucherDate)}</td></tr>
        </table>
      </div>
    </div>

    <div class="items-wrap">
      <table class="items">
        <thead>
          <tr>
            <th class="c">#</th>
            <th>Description</th>
            <th class="c">Unit</th>
            <th class="r">Unit Price (RM)</th>
            <th class="r">Amount (RM)</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml}
        </tbody>
      </table>
    </div>

    <div class="bot-row">
      <div class="pay-cell">
        <div class="pay-box">
          <div class="box-h">Payment Details:</div>
          <div class="box-body">
            ${fieldRow("Payment Method:", PV_TEMPLATE_ISSUER.paymentMethod)}
            ${fieldRow("Bank Name:", payee.bank)}
            ${fieldRow("Bank Account Name:", payee.accountName)}
            ${fieldRow("Bank Account No.:", payee.accountNo)}
          </div>
        </div>
      </div>
      <div class="total-cell">
        <div class="total-box">
          <span class="lbl">Total</span>
          <span class="val">RM ${amt(pv.net)}</span>
        </div>
      </div>
    </div>

    <div class="sig-row">
      <div class="sig-right">
        <div class="sig-inner">
          <div class="sig-role">PR (Payee)</div>
          <div class="sig-line">${
						prOk
							? pv.prSignatureDataUrl
								? `<img src="${pv.prSignatureDataUrl}" alt="PR signature" />`
								: `<span class="esig">${escapeHtml(payee.name)}</span>`
							: ""
					}</div>
          <div class="sig-fld">
            <span class="lbl">Name:</span>
            <span class="val">${escapeHtml(prOk ? payee.name : "")}</span>
        </div>
        <div class="sig-fld">
          <span class="lbl">Date:</span>
            <span class="val">${escapeHtml(prOk ? (pv.prSignedAt ?? "") : "")}</span>
          </div>
        </div>
      </div>
    </div>

    <hr class="ftr-rule" />
    <p class="disclaimer">${escapeHtml(PV_TEMPLATE_DISCLAIMER)}</p>
  </div>

  <p class="no-print" style="margin-top:12px;font-size:8px;color:#aaa;text-align:center;">
    Print → Save as PDF · ${escapeHtml(pv.id)}
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

async function fetchPvLogoBase64(): Promise<string | null> {
	if (typeof window === "undefined") return null;
	try {
		const res = await fetch(
			`${window.location.origin}${PV_TEMPLATE_ISSUER.logoPath}`,
		);
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
): (string | number)[][] {
	const templateLines = padPvTemplateLines(buildPvTemplateLines(pv), 5);
	const voucherDate = formatPvVoucherDate(pv.issued);
	const prOk = prSigned(pv);
	const rows: (string | number)[][] = [];
	const push = (...cells: (string | number)[]) => rows.push(padSheetRow(cells));

	push("", "", "Payment Voucher", "", "");
	push(
		"",
		`${PV_TEMPLATE_ISSUER.name} ${PV_TEMPLATE_ISSUER.regNo}`,
		"",
		"",
		"",
	);
	push(
		`Phone No: ${PV_TEMPLATE_ISSUER.phone}`,
		"",
		`Email Address: ${PV_TEMPLATE_ISSUER.email}`,
		"",
		"",
	);
	push(`Address: ${PV_TEMPLATE_ISSUER.address}.`, "", "", "", "");
	push("");

	push("Payable to:", "", "Voucher No.:", pv.id, "");
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
	push("Payment Method:", PV_TEMPLATE_ISSUER.paymentMethod, "", "", "");
	push("Bank Name:", payee.bank, "", "", "");
	push("Bank Account Name:", payee.accountName, "", "", "");
	push("Bank Account No.:", payee.accountNo, "", "", "");

	push("");
	push("PR (Payee)", "", "", "", "");
	push("Signature:", prOk ? payee.name : "", "", "", "");
	push("Name:", prOk ? payee.name : "", "", "", "");
	push("Date:", prOk ? (pv.prSignedAt ?? "") : "", "", "", "");

	push("");
	push(PV_TEMPLATE_DISCLAIMER, "", "", "", "");

	return rows;
}

/** Styled Excel workbook — borders, grey headers, hidden gridlines (PDF-like) */
export async function buildPvBreakdownWorkbook(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
) {
	const templateLines = padPvTemplateLines(buildPvTemplateLines(pv), 5);
	const voucherDate = formatPvVoucherDate(pv.issued);
	const prOk = prSigned(pv);

	const wb = new ExcelJS.Workbook();
	wb.creator = PV_TEMPLATE_ISSUER.name;
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

	const logoBase64 = await fetchPvLogoBase64();
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
	pvExMerge(ws, 2, 2, 2, 5, PV_TEMPLATE_ISSUER.name, {
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(3).height = 16;
	pvExMerge(ws, 3, 2, 3, 5, PV_TEMPLATE_ISSUER.regNo, {
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(4).height = 16;
	pvExMerge(ws, 4, 2, 4, 5, `Phone No: ${PV_TEMPLATE_ISSUER.phone}`, {
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(5).height = 16;
	pvExMerge(ws, 5, 2, 5, 5, `Email Address: ${PV_TEMPLATE_ISSUER.email}`, {
		align: { horizontal: "center", vertical: "middle" },
	});

	ws.getRow(6).height = 18;
	pvExMerge(ws, 6, 2, 6, 5, `Address: ${PV_TEMPLATE_ISSUER.address}.`, {
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
	pvExCell(ws, payeeStartRow, 5, pv.id, {
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
		["Payment Method:", PV_TEMPLATE_ISSUER.paymentMethod],
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

	row++;
	ws.getRow(row).height = 20;
	pvExMerge(ws, row, 1, row, 5, "PR (Payee)", {
		bold: true,
		size: 9,
		align: { vertical: "middle", horizontal: "left" },
	});
	row++;

	const sigRows: [string, string][] = [
		["Signature:", prOk ? payee.name : ""],
		["Name:", prOk ? payee.name : ""],
		["Date:", prOk ? (pv.prSignedAt ?? "") : ""],
	];

	for (const [label, value] of sigRows) {
		ws.getRow(row).height = label === "Signature:" ? 34 : 20;
		pvExCell(ws, row, 1, label, {
			align: { vertical: "middle", horizontal: "left" },
		});
		pvExMerge(ws, row, 2, row, 5, value, {
			fontName: label === "Signature:" && value ? "Segoe Script" : undefined,
			size: label === "Signature:" && value ? 15 : undefined,
			color: label === "Signature:" && value ? "FF1A1A6E" : undefined,
			align: { horizontal: "left", vertical: "bottom", wrapText: true },
			border: { bottom: { style: PV_EX_THIN } },
		});
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
) {
	const wb = await buildPvBreakdownWorkbook(pv, payee);
	const buffer = await wb.xlsx.writeBuffer();
	triggerPvExcelDownload(buffer, `${pv.id}-payment-voucher.xlsx`);
}

/** Legacy CSV string — same 5-column layout as the Excel export */
export function buildPvBreakdownCsv(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
): string {
	return buildPvBreakdownSheetRows(pv, payee)
		.map((row) => csvRow(row))
		.join("\r\n");
}

/** Downloads styled Excel (.xlsx) matching the official PV template layout */
export function downloadPvBreakdownCsv(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
) {
	void downloadPvBreakdownExcel(pv, payee);
}

/** Open print-ready PV in a new tab for viewing (Print → Save as PDF to download). */
export function viewPvBreakdownPdf(
	pv: PrPaymentVoucher,
	payee: PvPayeeProfile,
	receipts: PrReceiptScan[] = [],
) {
	const html = buildPvBreakdownHtml(pv, payee, receipts);
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
	a.download = `${pv.id}-payment-voucher.html`;
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
) {
	viewPvBreakdownPdf(pv, payee, receipts);
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
