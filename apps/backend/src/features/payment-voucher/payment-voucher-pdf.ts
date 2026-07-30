/**
 * Renders one payment voucher as a real PDF file — the one-tap download the
 * phone's "Download PDF" button delivers. Drawn as the PROTOTYPE's boxed
 * voucher form (PV-2026-W20-L example): centered letterhead, bordered
 * payable-to grid with voucher no/date on the right, shaded line-table
 * header, payment-details block beside one tall Total cell, PR signature
 * block, centered footer note. Shares the Excel/print-view helpers so all
 * three documents always say the same thing.
 */
import PDFDocument from 'pdfkit';
import type { PaymentVoucherWithLines } from './payment-voucher.model';
import {
  DASH,
  KIND_LABELS,
  dayMonth,
  klStamp,
  pvLogoPath,
  slashDate,
  voucherRef,
  type VoucherExportAgency,
  type VoucherExportLine,
  type VoucherExportPr,
} from './payment-voucher-excel.js';

const MARGIN = 40;
const PAGE_W = 595; // A4 portrait, points
const CONTENT_W = PAGE_W - MARGIN * 2; // 515

// Column x-edges scaled from the Excel template's widths (13/30/10/14/14).
const XA = MARGIN; // labels · line #
const XB = XA + 83; // values · description
const XC = XB + 191; // unit
const XD = XC + 64; // unit price · right-hand labels
const XE = XD + 89; // amount · right-hand values
const XEND = MARGIN + CONTENT_W;

const ROW_H = 16;
const FILL = '#ececec';
const BORDER = '#777777';

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
    let y = MARGIN;

    /** One bordered cell. Single-line text is vertically centered. */
    const cell = (
      x: number,
      w: number,
      h: number,
      text: string,
      opts: {
        bold?: boolean;
        align?: 'left' | 'center' | 'right';
        fill?: boolean;
        size?: number;
        font?: string;
        wrap?: boolean;
      } = {},
    ) => {
      if (opts.fill) doc.rect(x, y, w, h).fillAndStroke(FILL, BORDER);
      else doc.rect(x, y, w, h).stroke(BORDER);
      if (!text) return;
      let size = opts.size ?? 8;
      doc
        .fillColor('#111')
        .font(opts.font ?? (opts.bold ? 'Helvetica-Bold' : 'Helvetica'))
        .fontSize(size);
      // pdfkit wraps whenever `width` is set (lineBreak:false does not stop
      // it) — so a single-line cell auto-shrinks its font until the text fits
      // on one line: "Bank Account Name:" must never spill across the border.
      if (!opts.wrap) {
        while (size > 6 && doc.widthOfString(text) > w - 8) {
          size -= 0.5;
          doc.fontSize(size);
        }
      }
      const ty = opts.wrap ? y + 4 : y + (h - size) / 2 - 0.5;
      doc.text(text, x + 4, ty, { width: w - 8, align: opts.align ?? 'left' });
    };

    // ── Letterhead: everything centered, like the template's merged B:E rows.
    const centered = (text: string, size: number, bold = false, gap = 2) => {
      doc
        .fillColor('#111')
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(size)
        .text(text, MARGIN, y, { width: CONTENT_W, align: 'center' });
      y = doc.y + gap;
    };
    // The agency logo, top-left beside the centered letterhead — same gutter
    // as the Excel template's merged A1:A6.
    const logo = pvLogoPath();
    if (logo) doc.image(logo, XA, MARGIN - 8, { fit: [72, 72] });

    centered('Payment Voucher', 16, true, 4);
    centered(agency?.name ?? DASH, 9, true);
    centered(agency?.ssmNo ? `(${agency.ssmNo})` : DASH, 8);
    centered(`Phone No: ${agency?.contactPhone ?? DASH}`, 8);
    centered(`Email Address: ${agency?.contactEmail ?? DASH}`, 8);
    centered(`Address: ${DASH}`, 8, false, 10);

    // ── Payable-to grid (6 rows), voucher no/date in the right two columns.
    cell(XA, XC - XA, ROW_H, 'Payable to:', { bold: true, fill: true });
    cell(XC, XD - XC, ROW_H, 'Voucher No.:', { bold: true, fill: true });
    cell(XD, XEND - XD, ROW_H, voucherRef(voucher), { bold: true });
    y += ROW_H;
    const payableRows: [string, string, string, string][] = [
      ['Code:', DASH, 'Voucher Date:', slashDate(voucher.issuedDate)],
      ['Name:', prName, '', ''],
      ['Nickname:', pr?.nickname ?? DASH, '', ''],
      ['IC/Passport No.:', pr?.icNo ?? DASH, '', ''],
      ['Phone No.:', pr?.phone ?? DASH, '', ''],
    ];
    for (const [label, value, rLabel, rValue] of payableRows) {
      cell(XA, XB - XA, ROW_H, label);
      cell(XB, XC - XB, ROW_H, value);
      cell(XC, XD - XC, ROW_H, rLabel, rLabel ? { bold: true, fill: true } : {});
      cell(XD, XEND - XD, ROW_H, rValue);
      y += ROW_H;
    }

    // ── Line table. Shaded header, bordered rows, wrap-aware description.
    cell(XA, XB - XA, ROW_H, '#', { bold: true, fill: true, align: 'center' });
    cell(XB, XC - XB, ROW_H, 'Description', { bold: true, fill: true });
    cell(XC, XD - XC, ROW_H, 'Unit', { bold: true, fill: true, align: 'center' });
    cell(XD, XE - XD, ROW_H, 'Unit Price (RM)', { bold: true, fill: true, align: 'right' });
    cell(XE, XEND - XE, ROW_H, 'Amount (RM)', { bold: true, fill: true, align: 'right' });
    y += ROW_H;

    const itemRow = (no: string, desc: string, unit: string, price: string, amount: string) => {
      doc.font('Helvetica').fontSize(8);
      const descH = doc.heightOfString(desc, { width: XC - XB - 8 });
      const h = Math.max(ROW_H, descH + 8);
      if (y + h > 790) {
        doc.addPage();
        y = MARGIN;
      }
      cell(XA, XB - XA, h, no, { align: 'center' });
      cell(XB, XC - XB, h, desc, { wrap: true });
      cell(XC, XD - XC, h, unit, { align: 'center' });
      cell(XD, XE - XD, h, price, { align: 'right' });
      cell(XE, XEND - XE, h, amount, { align: 'right' });
      y += h;
    };

    let seq = 1;
    for (const line of lines) {
      const label = KIND_LABELS[line.kind] ?? line.kind;
      const qty = Math.max(1, line.quantity);
      itemRow(
        String(seq),
        `${label} (${dayMonth(line.lineDate)}) - ${line.outlet ?? DASH}`,
        String(qty),
        (line.commission / qty).toFixed(2),
        line.commission.toFixed(2),
      );
      seq += 1;
    }
    const deduction = Number(voucher.deduction ?? '0');
    if (deduction > 0) {
      itemRow(String(seq), 'Deductions', '1', (-deduction).toFixed(2), (-deduction).toFixed(2));
    }

    // ── Payment details beside one tall Total cell (template rows 23–27).
    const payRows: [string, string][] = [
      ['Payment Method:', 'Transfer'],
      ['Bank Name:', DASH],
      ['Bank Account Name:', prName],
      ['Bank Account No.:', DASH],
    ];
    const blockH = ROW_H * (payRows.length + 1);
    if (y + blockH + 90 > 790) {
      doc.addPage();
      y = MARGIN;
    }
    const blockTop = y;
    cell(XA, XC - XA, ROW_H, 'Payment Details:', { bold: true, fill: true });
    y += ROW_H;
    for (const [label, value] of payRows) {
      cell(XA, XB - XA, ROW_H, label);
      cell(XB, XC - XB, ROW_H, value);
      y += ROW_H;
    }
    // The merged D:E total cell spanning the whole block.
    doc.rect(XC, blockTop, XEND - XC, blockH).stroke(BORDER);
    const net = Number(voucher.net ?? '0');
    doc
      .fillColor('#111')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Total', XC, blockTop + blockH / 2 - 20, { width: XEND - XC, align: 'center' });
    doc
      .fontSize(13)
      .text(
        `RM ${net.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`,
        XC,
        blockTop + blockH / 2 + 4,
        { width: XEND - XC, align: 'center' },
      );

    // ── PR (Payee) signature block — script-style name only once the database
    // holds pr_signed_at; the export never invents a signature.
    const signed = voucher.prSignedAt ? klStamp(new Date(voucher.prSignedAt)) : '';
    y += 14;
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(8).text('PR (Payee)', XA, y);
    y = doc.y + 4;
    const sigRow = (label: string, value: string, script = false) => {
      doc.font('Helvetica').fontSize(8).fillColor('#111').text(label, XA, y + 3);
      if (value) {
        doc
          .font(script ? 'Times-Italic' : 'Helvetica')
          .fontSize(script ? 13 : 8)
          .fillColor(script ? '#2b3a67' : '#111')
          .text(value, XB, script ? y - 1 : y + 3, { width: XEND - XB - 4 });
      }
      y += ROW_H;
      doc.moveTo(XA, y).lineTo(XEND, y).strokeColor('#bbb').stroke();
      y += 2;
    };
    sigRow('Signature:', signed ? prName : '', true);
    sigRow('Name:', prName);
    sigRow('Date:', signed);

    y += 16;
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#2b4a8c')
      .text(
        'Please verify the payment details. If there are no discrepancies, kindly sign and acknowledge to proceed with the payment. For any concerns, please contact our finance department.',
        MARGIN,
        y,
        { width: CONTENT_W, align: 'center' },
      );

    doc.end();
  });
}
