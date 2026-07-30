/**
 * Renders one payment voucher as a real PDF file — the one-tap download the
 * phone's "Save as PDF" button delivers, no print dialog involved. Shares the
 * Excel/print-view helpers so all three documents always say the same thing.
 */
import PDFDocument from 'pdfkit';
import type { PaymentVoucherWithLines } from './payment-voucher.model';
import {
  DASH,
  KIND_LABELS,
  dayMonth,
  klStamp,
  slashDate,
  voucherRef,
  type VoucherExportAgency,
  type VoucherExportLine,
  type VoucherExportPr,
} from './payment-voucher-excel.js';

const MARGIN = 40;
const PAGE_W = 595; // A4 portrait, points
const CONTENT_W = PAGE_W - MARGIN * 2;

// Column x-origins and widths for the line table.
const COLS = [
  { x: MARGIN, w: 26 }, // #
  { x: MARGIN + 26, w: 245 }, // Description
  { x: MARGIN + 271, w: 40 }, // Unit
  { x: MARGIN + 311, w: 100 }, // Unit Price
  { x: MARGIN + 411, w: CONTENT_W - 411 + MARGIN }, // Amount
] as const;

export function buildVoucherPdf(params: {
  voucher: PaymentVoucherWithLines;
  agency: VoucherExportAgency;
  pr: VoucherExportPr;
  lines: VoucherExportLine[];
}): Promise<Buffer> {
  const { voucher, agency, pr, lines } = params;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const prName = pr?.name ?? voucher.prName ?? DASH;

    doc.font('Helvetica-Bold').fontSize(18).text('Payment Voucher');
    doc.moveDown(0.3);
    doc.fontSize(11).text(`${agency?.name ?? DASH}${agency?.ssmNo ? ` (${agency.ssmNo})` : ''}`);
    doc.font('Helvetica').fontSize(9);
    doc.text(`Phone No: ${agency?.contactPhone ?? DASH} · Email: ${agency?.contactEmail ?? DASH}`);
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(10).text(`Voucher No.: ${voucherRef(voucher)}`, { continued: true });
    doc.font('Helvetica').text(`   Voucher Date: ${slashDate(voucher.issuedDate)}`);
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(9);
    doc.text(`Payable to: ${prName}${pr?.nickname ? ` (${pr.nickname})` : ''}`);
    doc.text(`IC/Passport No.: ${pr?.icNo ?? DASH} · Phone No.: ${pr?.phone ?? DASH}`);
    doc.moveDown(0.8);

    // Table header.
    const headers = ['#', 'Description', 'Unit', 'Unit Price (RM)', 'Amount (RM)'];
    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    headers.forEach((h, i) => {
      doc.text(h, COLS[i].x + 2, y, {
        width: COLS[i].w - 4,
        align: i >= 2 ? 'right' : 'left',
      });
    });
    y = doc.y + 3;
    doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).strokeColor('#999').stroke();
    y += 5;

    // Rows. A voucher week is short, but never trust that — page-break guard.
    doc.font('Helvetica').fontSize(9);
    const drawRow = (cells: string[], bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
      const descHeight = doc.heightOfString(cells[1], { width: COLS[1].w - 4 });
      const rowH = Math.max(12, descHeight) + 6;
      if (y + rowH > 780) {
        doc.addPage();
        y = MARGIN;
      }
      cells.forEach((cell, i) => {
        doc.text(cell, COLS[i].x + 2, y, {
          width: COLS[i].w - 4,
          align: i >= 2 ? 'right' : 'left',
        });
      });
      y += rowH;
      doc.moveTo(MARGIN, y - 3).lineTo(PAGE_W - MARGIN, y - 3).strokeColor('#e0e0e0').stroke();
    };

    let seq = 1;
    for (const line of lines) {
      const label = KIND_LABELS[line.kind] ?? line.kind;
      const qty = Math.max(1, line.quantity);
      drawRow([
        String(seq),
        `${label} (${dayMonth(line.lineDate)}) - ${line.outlet ?? DASH}`,
        String(qty),
        (line.commission / qty).toFixed(2),
        line.commission.toFixed(2),
      ]);
      seq += 1;
    }
    const deduction = Number(voucher.deduction ?? '0');
    if (deduction > 0) {
      drawRow([String(seq), 'Deductions', '1', (-deduction).toFixed(2), (-deduction).toFixed(2)]);
    }

    const net = Number(voucher.net ?? '0');
    drawRow(['', 'Total', '', '', `RM ${net.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`], true);

    // Signature block — empty until pr_signed_at exists in the database.
    const signed = voucher.prSignedAt ? klStamp(new Date(voucher.prSignedAt)) : '';
    y += 16;
    if (y > 700) {
      doc.addPage();
      y = MARGIN;
    }
    doc.font('Helvetica-Bold').fontSize(10).text('PR (Payee)', MARGIN, y);
    y = doc.y + 4;
    doc.font('Helvetica').fontSize(9);
    doc.text(`Signature: ${signed ? prName : '____________________'}`, MARGIN, y);
    doc.text(`Name: ${prName}`);
    doc.text(`Date: ${signed || '____________________'}`);

    doc.moveDown(1.2);
    doc
      .fontSize(7.5)
      .fillColor('#555')
      .text(
        'Please verify the payment details. If there are no discrepancies, kindly sign and acknowledge to proceed with the payment. For any concerns, please contact our finance department.',
        { width: CONTENT_W },
      );

    doc.end();
  });
}
