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
import type { PaymentVoucherWithLines } from './payment-voucher.model';

export type VoucherExportAgency = {
  name: string;
  ssmNo: string;
  contactPhone: string | null;
  contactEmail: string | null;
} | null;

export type VoucherExportPr = {
  name: string;
  nickname: string | null;
  icNo: string | null;
  phone: string | null;
} | null;

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

/** Same derivation the PR app shows on screen, so paper and phone agree. */
export function voucherRef(voucher: PaymentVoucherWithLines): string {
  const end = (voucher.weekEnd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (end) return `PV-${end[1]}${end[2]}${end[3]}`;
  return `PV-${voucher.id.slice(0, 8).toUpperCase()}`;
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${voucherRef(voucher)} · Payment Voucher</title>
<style>body{font-family:Arial,sans-serif;margin:20px;color:#111;font-size:13px}h1{font-size:19px;margin:0 0 2px}
.head p{margin:2px 0}table{border-collapse:collapse;width:100%;margin-top:14px}td,th{border:1px solid #999;padding:6px 8px;font-size:12px}
th{background:#f2f2f2;text-align:left}.tot{font-weight:bold;font-size:14px}.sig{margin-top:22px}.note{margin-top:22px;font-size:11px;color:#555}
@media print{.printbar{display:none}}.printbar{margin:14px 0}.printbar button{padding:10px 16px;font-size:14px}</style></head><body>
<div class="head"><h1>Payment Voucher</h1>
<p><strong>${esc(agency?.name ?? DASH)}</strong>${agency?.ssmNo ? ` (${esc(agency.ssmNo)})` : ''}</p>
<p>Phone No: ${esc(agency?.contactPhone ?? DASH)} · Email: ${esc(agency?.contactEmail ?? DASH)}</p>
<p>Voucher No.: <strong>${voucherRef(voucher)}</strong> · Voucher Date: ${slashDate(voucher.issuedDate)}</p>
<p>Payable to: <strong>${prName}</strong>${pr?.nickname ? ` (${esc(pr.nickname)})` : ''} · IC/Passport: ${esc(pr?.icNo ?? DASH)} · Phone: ${esc(pr?.phone ?? DASH)}</p></div>
<div class="printbar"><a href="voucher.pdf" download style="display:inline-block;background:#111;color:#fff;padding:12px 18px;font-size:14px;border-radius:6px;text-decoration:none;font-weight:bold">Download PDF</a>
<button onclick="window.print()" style="margin-left:10px">Print</button></div>
<table><thead><tr><th>#</th><th>Description</th><th>Unit</th><th>Unit Price (RM)</th><th>Amount (RM)</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr class="tot"><td colspan="4">Total</td><td style="text-align:right">RM ${net.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</td></tr></tfoot></table>
<div class="sig"><p><strong>PR (Payee)</strong></p>
<p>Signature: ${signed ? prName : '____________________'}</p>
<p>Name: ${prName}</p>
<p>Date: ${signed || '____________________'}</p></div>
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
  ws.getCell('B6').value = `Address: ${DASH}`;
  ws.mergeCells('A1:A6');
  for (let r = 1; r <= 6; r++) ws.mergeCells(`B${r}:E${r}`);

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
    row.getCell(4).value = (line.commission / qty).toFixed(2);
    row.getCell(5).value = line.commission.toFixed(2);
    rowNo += 1;
    seq += 1;
  }
  const deduction = Number(voucher.deduction ?? '0');
  if (deduction > 0) {
    const row = ws.getRow(rowNo);
    row.getCell(1).value = seq;
    row.getCell(2).value = 'Deductions';
    row.getCell(3).value = 1;
    row.getCell(4).value = (-deduction).toFixed(2);
    row.getCell(5).value = (-deduction).toFixed(2);
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
    ['Bank Name:', DASH],
    ['Bank Account Name:', pr?.name ?? voucher.prName ?? DASH],
    ['Bank Account No.:', DASH],
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

  // PR signature block. Empty until pr_signed_at exists — the export never
  // shows a signature the database does not hold.
  const signed = voucher.prSignedAt ? klStamp(new Date(voucher.prSignedAt)) : '';
  const sigTitle = payEnd + 2;
  ws.getCell(`A${sigTitle}`).value = 'PR (Payee)';
  ws.getCell(`A${sigTitle}`).font = { bold: true };
  ws.mergeCells(`A${sigTitle}:E${sigTitle}`);
  const sigRows: [string, string][] = [
    ['Signature:', signed ? pr?.name ?? voucher.prName ?? '' : ''],
    ['Name:', pr?.name ?? voucher.prName ?? DASH],
    ['Date:', signed],
  ];
  sigRows.forEach(([label, value], i) => {
    const r = sigTitle + 1 + i;
    ws.getCell(`A${r}`).value = label;
    ws.getCell(`B${r}`).value = value;
    ws.mergeCells(`B${r}:E${r}`);
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
