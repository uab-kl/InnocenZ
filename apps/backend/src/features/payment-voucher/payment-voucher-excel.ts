/**
 * Renders one payment voucher as an .xlsx workbook, cell-for-cell after the
 * prototype's export (PV-2026-W20-L-payment-voucher.xlsx): agency letterhead,
 * payable-to block, numbered line table, payment details beside a merged
 * total, PR signature block, footer note.
 *
 * Agency and PR facts arrive via the voucher's FKs (getExportBundle) — the
 * voucher never duplicates them. Fields the schema does not hold yet (agency
 * address, PR bank account) render as an em dash rather than invented data.
 */
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import type { PaymentVoucherWithLines } from './payment-voucher.model';

export type VoucherExportAgency = {
  name: string;
  ssmNo: string;
  contactPhone: string | null;
  contactEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  state: string | null;
  country: string | null;
} | null;

export type VoucherExportPr = {
  name: string;
  nickname: string | null;
  icNo: string | null;
  phone: string | null;
  /** Where this person is paid — user_profile, reached by FK (migration 0077). */
  bankName: string | null;
  bankAccountNo: string | null;
} | null;

/**
 * Agency company address as one string, or '' when nothing is set.
 *
 * Returns EMPTY rather than a dash so each caller decides its own placeholder —
 * the workbook and the print HTML render an unset field differently, and baking
 * one in here would make the other lie about which it is.
 */
export function joinAddress(agency: VoucherExportAgency): string {
  const locality = [agency?.postcode, agency?.city, agency?.state]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(' ');
  return [agency?.addressLine1, agency?.addressLine2, locality, agency?.country]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(', ');
}

/** One table row, already decoded from the packed line ref by the controller. */
export type VoucherExportLine = {
  kind: string;
  lineDate: string | null;
  outlet: string | null;
  quantity: number;
  commission: number;
};

export const KIND_LABELS: Record<string, string> = {
  wages: 'Daily Wages',
  drinks: 'Commission – Drinks',
  tips: 'Commission – Tips',
  others: 'Others',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DASH = '—';

export function dayMonth(iso: string | null): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return DASH;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

export function slashDate(iso: string | null): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return DASH;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** '30 Jun 2026 · 14:22' in Kuala Lumpur time (UTC+8, no DST). */
export function klStamp(at: Date | null): string {
  if (!at) return '';
  const kl = new Date(at.getTime() + 8 * 60 * 60 * 1000);
  const hh = String(kl.getUTCHours()).padStart(2, '0');
  const mm = String(kl.getUTCMinutes()).padStart(2, '0');
  return `${kl.getUTCDate()} ${MONTHS[kl.getUTCMonth()]} ${kl.getUTCFullYear()} · ${hh}:${mm}`;
}

/**
 * The PV letterhead logo (PV documents ONLY, per the user's instruction).
 * Null when the file is missing — the export renders without it rather than
 * failing a money document over a picture.
 */
export function pvLogoPath(): string | null {
  const p = path.join(process.cwd(), 'public', 'img', 'agencies', 'atmosphere-logo.png');
  return fs.existsSync(p) ? p : null;
}

/**
 * The voucher's number, as printed and as used for the download filename.
 *
 * Reads the STORED `voucher_no` (migration 0075). It used to derive
 * `PV-<weekEnd>`, which meant every PR's voucher for a week carried the same
 * number and downloaded over the top of the last one — a voucher number that
 * cannot identify the voucher.
 *
 * The week fallback is kept only for a row that predates the column or whose
 * allocation failed. It is wrong in the same way as before, and deliberately so:
 * printing nothing where a document expects a number is worse, and the fallback
 * is now visible in exactly one place instead of five.
 */
export function voucherRef(voucher: PaymentVoucherWithLines): string {
  if (voucher.voucherNo) return voucher.voucherNo;
  const end = (voucher.weekEnd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (end) return `PV-${end[1]}${end[2]}${end[3]}`;
  return `PV-${voucher.id.slice(0, 8).toUpperCase()}`;
}

/**
 * Write a money cell as a NUMBER, formatted for display.
 *
 * Every amount in this workbook used to be `.toFixed(2)`, which is a string —
 * so the Amount column of a payment voucher could not be summed, sorted or
 * charted by the person whose job is precisely to sum it. The value carries the
 * cell's meaning; `#,##0.00` only decides how it looks.
 *
 * Rounded to cents on the way in, because a unit price derived by division
 * (commission ÷ quantity) is otherwise stored to full float precision and shows
 * one figure while holding another.
 */
function money(cell: { value: unknown; numFmt?: string }, amount: number): void {
  cell.value = Math.round(amount * 100) / 100;
  cell.numFmt = '#,##0.00';
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The same voucher as a printable HTML page. The phone opens this in its
 * browser via a short-lived ticket URL and the print dialog appears — "Save
 * as PDF" is the built-in Android/iOS print target, so no PDF library and no
 * new native module (which would strand every installed APK).
 */
export function buildVoucherPrintHtml(params: {
  voucher: PaymentVoucherWithLines;
  agency: VoucherExportAgency;
  pr: VoucherExportPr;
  lines: VoucherExportLine[];
}): string {
  const { voucher, agency, pr, lines } = params;
  const rows = lines
    .map((line, i) => {
      const label = KIND_LABELS[line.kind] ?? line.kind;
      const qty = Math.max(1, line.quantity);
      return `<tr><td>${i + 1}</td><td>${esc(`${label} (${dayMonth(line.lineDate)}) - ${line.outlet ?? DASH}`)}</td><td style="text-align:center">${qty}</td><td style="text-align:right">${(line.commission / qty).toFixed(2)}</td><td style="text-align:right">${line.commission.toFixed(2)}</td></tr>`;
    })
    .join('');
  const net = Number(voucher.net ?? '0');
  const prName = esc(pr?.name ?? voucher.prName ?? DASH);
  const signed = voucher.prSignedAt ? klStamp(new Date(voucher.prSignedAt)) : '';
  const financeName = esc(voucher.financeHeadName ?? DASH);
  const financeSigned = voucher.financeHeadSignedAt
    ? klStamp(new Date(voucher.financeHeadSignedAt))
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${voucherRef(voucher)} · Payment Voucher</title>
<style>body{font-family:Arial,sans-serif;margin:20px;color:#111;font-size:13px}h1{font-size:19px;margin:0 0 2px}
.head p{margin:2px 0}table{border-collapse:collapse;width:100%;margin-top:14px}td,th{border:1px solid #999;padding:6px 8px;font-size:12px}
th{background:#f2f2f2;text-align:left}.tot{font-weight:bold;font-size:14px}.sig{margin-top:22px}.note{margin-top:22px;font-size:11px;color:#555}
@media print{.printbar{display:none}}.printbar{margin:14px 0}.printbar button{padding:10px 16px;font-size:14px}</style></head><body>
<div class="head"><h1>Payment Voucher</h1>
<p><strong>${esc(agency?.name ?? DASH)}</strong>${agency?.ssmNo ? ` (${esc(agency.ssmNo)})` : ''}</p>
<p>Phone No: ${esc(agency?.contactPhone ?? DASH)} · Email: ${esc(agency?.contactEmail ?? DASH)}</p>
<p>Address: ${esc(joinAddress(agency) || DASH)}</p>
<p>Voucher No.: <strong>${voucherRef(voucher)}</strong> · Voucher Date: ${slashDate(voucher.issuedDate)}</p>
<p>Payable to: <strong>${prName}</strong>${pr?.nickname ? ` (${esc(pr.nickname)})` : ''} · IC/Passport: ${esc(pr?.icNo ?? DASH)} · Phone: ${esc(pr?.phone ?? DASH)}</p></div>
<div class="printbar"><a href="voucher.pdf" download style="display:inline-block;background:#111;color:#fff;padding:12px 18px;font-size:14px;border-radius:6px;text-decoration:none;font-weight:bold">Download PDF</a>
<button onclick="window.print()" style="margin-left:10px">Print</button></div>
<table><thead><tr><th>#</th><th>Description</th><th>Unit</th><th>Unit Price (RM)</th><th>Amount (RM)</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr class="tot"><td colspan="4">Total</td><td style="text-align:right">RM ${net.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td></tr></tfoot></table>
<table class="sig"><tr>
<td style="border:none;width:50%;vertical-align:top;padding-left:0"><p><strong>Agency (Approved by)</strong></p>
<p>Signature: ${financeSigned ? financeName : '____________________'}</p>
<p>Name: ${financeName}</p>
<p>Date: ${financeSigned || '____________________'}</p></td>
<td style="border:none;width:50%;vertical-align:top"><p><strong>PR (Received by)</strong></p>
<p>Signature: ${signed ? prName : '____________________'}</p>
<p>Name: ${prName}</p>
<p>Date: ${signed || '____________________'}</p></td>
</tr></table>
<p class="note">Please verify the payment details. If there are no discrepancies, kindly sign and acknowledge to proceed with the payment. For any concerns, please contact our finance department.</p>
</body></html>`;
}

export async function buildVoucherWorkbook(params: {
  voucher: PaymentVoucherWithLines;
  agency: VoucherExportAgency;
  pr: VoucherExportPr;
  lines: VoucherExportLine[];
}): Promise<ExcelJS.Buffer> {
  const { voucher, agency, pr, lines } = params;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payment Voucher');
  ws.columns = [{ width: 13 }, { width: 30 }, { width: 10 }, { width: 14 }, { width: 14 }];

  // Letterhead (rows 1–6). A1:A6 stays merged/empty like the prototype's logo gutter.
  ws.getCell('B1').value = 'Payment Voucher';
  ws.getCell('B1').font = { bold: true, size: 16 };
  ws.getCell('B2').value = agency?.name ?? DASH;
  ws.getCell('B2').font = { bold: true };
  ws.getCell('B3').value = agency?.ssmNo ? `(${agency.ssmNo})` : DASH;
  ws.getCell('B4').value = `Phone No: ${agency?.contactPhone ?? DASH}`;
  ws.getCell('B5').value = `Email Address: ${agency?.contactEmail ?? DASH}`;
  // A real column since migration 0077. Still an em dash when the agency has not
  // filled it in — an empty field is honest; an invented address is the defect
  // this project keeps hitting.
  ws.getCell('B6').value = `Address: ${joinAddress(agency) || DASH}`;
  ws.mergeCells('A1:A6');
  for (let r = 1; r <= 6; r++) ws.mergeCells(`B${r}:E${r}`);

  // The agency logo sits in the template's A1:A6 gutter, top-left.
  const logo = pvLogoPath();
  if (logo) {
    const imageId = wb.addImage({ filename: logo, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 86, height: 86 },
    });
  }

  // Payable-to block (rows 8–13) with voucher no/date on the right.
  ws.getCell('A8').value = 'Payable to:';
  ws.getCell('A8').font = { bold: true };
  ws.mergeCells('A8:C8');
  ws.getCell('D8').value = 'Voucher No.:';
  ws.getCell('E8').value = voucherRef(voucher);
  const payable: [string, string][] = [
    ['Code:', DASH],
    ['Name:', pr?.name ?? voucher.prName ?? DASH],
    ['Nickname:', pr?.nickname ?? DASH],
    ['IC/Passport No.:', pr?.icNo ?? DASH],
    ['Phone No.:', pr?.phone ?? DASH],
  ];
  payable.forEach(([label, value], i) => {
    const r = 9 + i;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`B${r}`).value = value;
    ws.mergeCells(`B${r}:C${r}`);
  });
  ws.getCell('D9').value = 'Voucher Date:';
  ws.getCell('E9').value = slashDate(voucher.issuedDate);

  // Line table (header row 14).
  const header = ['#', 'Description', 'Unit', 'Unit Price (RM)', 'Amount (RM)'];
  header.forEach((h, i) => {
    const cell = ws.getRow(14).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.border = { bottom: { style: 'thin' } };
  });
  let rowNo = 15;
  let seq = 1;
  for (const line of lines) {
    const label = KIND_LABELS[line.kind] ?? line.kind;
    const qty = Math.max(1, line.quantity);
    const row = ws.getRow(rowNo);
    row.getCell(1).value = seq;
    row.getCell(2).value = `${label} (${dayMonth(line.lineDate)}) - ${line.outlet ?? DASH}`;
    row.getCell(3).value = qty;
    money(row.getCell(4), line.commission / qty);
    money(row.getCell(5), line.commission);
    rowNo += 1;
    seq += 1;
  }
  const deduction = Number(voucher.deduction ?? '0');
  if (deduction > 0) {
    const row = ws.getRow(rowNo);
    row.getCell(1).value = seq;
    row.getCell(2).value = 'Deductions';
    row.getCell(3).value = 1;
    money(row.getCell(4), -deduction);
    money(row.getCell(5), -deduction);
    rowNo += 1;
  }

  // Payment details beside the merged total block.
  const net = Number(voucher.net ?? '0');
  const totalText = `Total\n\nRM ${net.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;
  const payStart = rowNo;
  ws.getCell(`A${payStart}`).value = 'Payment Details:';
  ws.getCell(`A${payStart}`).font = { bold: true };
  ws.mergeCells(`A${payStart}:C${payStart}`);
  const payRows: [string, string][] = [
    ['Payment Method:', 'Transfer'],
    // Real columns since migration 0077 (user_profile). An em dash here now
    // means the PR has not entered their bank details, which is a thing someone
    // can go and fix — before, it meant the system had nowhere to put them.
    ['Bank Name:', pr?.bankName || DASH],
    ['Bank Account Name:', pr?.name ?? voucher.prName ?? DASH],
    ['Bank Account No.:', pr?.bankAccountNo || DASH],
  ];
  payRows.forEach(([label, value], i) => {
    const r = payStart + 1 + i;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`B${r}`).value = value;
    ws.mergeCells(`B${r}:C${r}`);
  });
  const payEnd = payStart + payRows.length;
  ws.mergeCells(`D${payStart}:E${payEnd}`);
  const totalCell = ws.getCell(`D${payStart}`);
  totalCell.value = totalText;
  totalCell.font = { bold: true, size: 12 };
  totalCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // Dual signature block, in the same left/right order as the PDF: agency
  // (approved by) in columns A/B, PR (payee) in D/E. Each half stays empty until
  // its own signed-at exists — the export never shows a signature the database
  // does not hold, and the agency's half used to be missing altogether.
  const signed = voucher.prSignedAt ? klStamp(new Date(voucher.prSignedAt)) : '';
  const financeSigned = voucher.financeHeadSignedAt
    ? klStamp(new Date(voucher.financeHeadSignedAt))
    : '';
  const financeName = voucher.financeHeadName ?? DASH;
  const prDisplayName = pr?.name ?? voucher.prName ?? DASH;
  const sigTitle = payEnd + 2;
  ws.getCell(`A${sigTitle}`).value = 'Agency (Approved by)';
  ws.getCell(`A${sigTitle}`).font = { bold: true };
  ws.mergeCells(`A${sigTitle}:B${sigTitle}`);
  ws.getCell(`D${sigTitle}`).value = 'PR (Received by)';
  ws.getCell(`D${sigTitle}`).font = { bold: true };
  ws.mergeCells(`D${sigTitle}:E${sigTitle}`);
  const sigRows: [string, string, string][] = [
    ['Signature:', financeSigned ? financeName : '', signed ? prDisplayName : ''],
    ['Name:', financeName, prDisplayName],
    ['Date:', financeSigned, signed],
  ];
  sigRows.forEach(([label, agencyValue, prValue], i) => {
    const r = sigTitle + 1 + i;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`B${r}`).value = agencyValue;
    ws.mergeCells(`B${r}:C${r}`);
    ws.getCell(`D${r}`).value = label;
    ws.getCell(`E${r}`).value = prValue;
  });

  const noteRow = sigTitle + sigRows.length + 2;
  const note = ws.getCell(`A${noteRow}`);
  note.value =
    'Please verify the payment details. If there are no discrepancies, kindly sign and acknowledge to proceed with the payment. For any concerns, please contact our finance department.';
  note.alignment = { wrapText: true };
  ws.mergeCells(`A${noteRow}:E${noteRow}`);
  ws.getRow(noteRow).height = 40;

  return wb.xlsx.writeBuffer();
}
