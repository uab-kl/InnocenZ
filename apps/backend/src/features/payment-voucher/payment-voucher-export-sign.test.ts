import { inflateSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  buildVoucherPrintHtml,
  buildVoucherWorkbook,
  formatVoucherRm,
  type VoucherExportLine,
} from './payment-voucher-excel';
import { buildVoucherPdf, winAnsiMinus } from './payment-voucher-pdf';

/**
 * A NEGATIVE VOUCHER TOTAL, ONE SIGN, BEFORE THE CURRENCY (30 Sep 2026).
 *
 * The three renderings of a voucher — print view, workbook and PDF — printed a
 * negative net as "RM -4.50", the sign inside the amount. They now read
 * "−RM 4.50", as the portals and the PR app do, and as the web twin of this
 * document (`pv-pdf.ts`) does. The PDF prints the en dash in that place: its
 * WinAnsi font has no code for U+2212. Built in memory from fixtures — no
 * agency, so no logo fetch; nothing touches a database.
 */

const MINUS = '−';
const EN_DASH = '–';

/** A week the deductions outran: 15.50 earned, a 20.00 fee — net −4.50. */
const LINES: VoucherExportLine[] = [
  {
    kind: 'wages',
    component: 'wages',
    item: 'Daily wages',
    lineDate: '2026-09-29',
    outlet: 'UAB Emhub',
    quantity: 1,
    commission: 15.5,
  },
  {
    kind: 'others',
    component: 'deduction',
    item: 'Cancellation fee',
    lineDate: '2026-09-30',
    outlet: 'UAB Emhub',
    quantity: 1,
    commission: -20,
  },
];

function voucher(net: string) {
  return {
    id: '7bf3962e-591e-452f-b781-edbe1cbe6ef0',
    voucherNo: 'PV-000012',
    prName: 'Payee',
    prIc: null,
    weekStart: '2026-09-27',
    weekEnd: '2026-10-03',
    issuedDate: '2026-10-04',
    subtotal: net,
    deduction: '0.00',
    net,
    status: 'sent',
    financeHeadName: null,
    financeHeadSignedAt: null,
    financeHeadSignature: null,
    prSignedAt: null,
    prSignature: null,
    lines: [],
  } as never;
}

const bundle = (net: string) => ({ voucher: voucher(net), agency: null, pr: null, lines: LINES });

describe('formatVoucherRm — the same table the web twin (format-rm.test.ts) pins', () => {
  it.each([
    [-4.5, `${MINUS}RM 4.50`],
    [0, 'RM 0.00'],
    [-0, 'RM 0.00'],
    [-0.004, 'RM 0.00'],
    [4.5, 'RM 4.50'],
    [1234.5, 'RM 1,234.50'],
    [-1234.5, `${MINUS}RM 1,234.50`],
  ])('%d prints %s', (n, expected) => {
    expect(formatVoucherRm(n)).toBe(expected);
  });
});

describe('the print view', () => {
  it('totals a negative week as −RM 4.50, never RM -4.50', () => {
    const html = buildVoucherPrintHtml(bundle('-4.50'));
    expect(html).toContain(`<td style="text-align:right">${MINUS}RM 4.50</td>`);
    expect(html).not.toContain('RM -');
  });
});

describe('the workbook', () => {
  async function sheetOf(net: string) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildVoucherWorkbook(bundle(net))) as never);
    const ws = wb.getWorksheet('Payment Voucher');
    if (!ws) throw new Error('no Payment Voucher sheet');
    return ws;
  }

  function totalText(ws: ExcelJS.Worksheet): unknown {
    let found: unknown;
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        if (found === undefined && typeof cell.value === 'string' && cell.value.startsWith('Total')) {
          found = cell.value;
        }
      }),
    );
    return found;
  }

  it('keeps the total a TEXT cell reading −RM 4.50', async () => {
    expect(totalText(await sheetOf('-4.50'))).toBe(`Total\n\n${MINUS}RM 4.50`);
  });

  it('leaves the line amounts real NUMBERS — the fee is still −20, summable', async () => {
    const ws = await sheetOf('-4.50');
    // Header on row 14, lines from row 15 (`buildVoucherWorkbook`).
    expect(ws.getRow(15).getCell(5).value).toBe(15.5);
    expect(ws.getRow(16).getCell(5).value).toBe(-20);
    expect(ws.getRow(16).getCell(5).numFmt).toBe('#,##0.00');
  });

  it('prints a positive total exactly as before', async () => {
    expect(totalText(await sheetOf('1234.50'))).toBe('Total\n\nRM 1,234.50');
  });
});

/** WinAnsi codes, as PDFKit writes them into its TJ hex strings. */
const WIN_ANSI: Record<string, number> = { [EN_DASH]: 0x96 };
const hexOf = (text: string) =>
  [...text].map((c) => (WIN_ANSI[c] ?? c.charCodeAt(0)).toString(16).padStart(2, '0')).join('');

/** Every string the PDF draws, in drawing order, as one run of WinAnsi hex. */
function drawnHex(pdf: Buffer): string {
  const runs: string[] = [];
  for (const match of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1] ?? '', 'latin1')).toString('latin1');
    } catch {
      continue; // not a deflated content stream (a font, an image)
    }
    for (const tj of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      for (const hex of (tj[1] ?? '').matchAll(/<([0-9a-fA-F]*)>/g)) {
        runs.push((hex[1] ?? '').toLowerCase());
      }
    }
  }
  return runs.join('');
}

/** The same run, byte by byte, so a search cannot straddle two characters. */
const bytesOf = (hex: string) => (hex.match(/../g) ?? []).join(' ');

describe('the PDF', () => {
  it('swaps only the minus, for the en dash its WinAnsi font can encode', () => {
    expect(winAnsiMinus(`${MINUS}RM 4.50`)).toBe(`${EN_DASH}RM 4.50`);
    expect(winAnsiMinus('RM 4.50 — Payee')).toBe('RM 4.50 — Payee');
  });

  it('draws a negative total as –RM 4.50: the sign before the currency, no stray bytes', async () => {
    const drawn = drawnHex(await buildVoucherPdf(bundle('-4.50')));
    expect(drawn).toContain(hexOf(`${EN_DASH}RM 4.50`));
    expect(drawn).not.toContain(hexOf('RM -'));
    // U+2212 through a WinAnsi font comes out as the bytes 22 12.
    expect(bytesOf(drawn)).not.toContain('22 12');
  });

  it('draws a positive total exactly as before, unsigned', async () => {
    const drawn = drawnHex(await buildVoucherPdf(bundle('1234.50')));
    expect(drawn).toContain(hexOf('RM 1,234.50'));
    expect(drawn).not.toContain(hexOf(`${EN_DASH}RM`));
  });
});
