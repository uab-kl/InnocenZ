import { describe, expect, test } from 'vitest';
import { buildPayoutCsv, payoutCsvFilename, payoutStatementReference } from './payout-csv';
import type { PayoutBatchItemType } from './payout-batch.model';

/**
 * The bank file is the one artefact in this lane a MACHINE reads, at a bank,
 * with money attached. Every case below is a way a plausible-looking CSV pays
 * the wrong person the wrong amount — and none of them throws.
 */

const item = (over: Partial<PayoutBatchItemType> = {}): PayoutBatchItemType =>
  ({
    id: 'i1',
    batchId: 'b1',
    voucherId: 'v1',
    payeeName: 'Vicky Tan',
    payeeIc: '950312-14-8821',
    bankName: 'Maybank',
    bankAccountNo: '512345678901',
    amount: '875.00',
    status: 'pending',
    failureReason: null,
    providerPayoutId: null,
    bankRef: null,
    paidAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
    updatedBy: 'test',
    ...over,
  }) as PayoutBatchItemType;

const batch = { reference: 'PO-000001', weekStart: '2026-08-16', weekEnd: '2026-08-22' };

const dataRow = (csv: string) => csv.split('\r\n')[1];

describe('buildPayoutCsv', () => {
  test('emits a header and one row per item', () => {
    const csv = buildPayoutCsv(batch, [item(), item({ id: 'i2', payeeName: 'Alice' })]);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'No,Payee Name,ID / IC No,Bank,Account Number,Amount (MYR),Reference',
    );
    expect(lines[1].startsWith('1,')).toBe(true);
    expect(lines[2].startsWith('2,')).toBe(true);
  });

  test('a comma in a payee name is quoted, not allowed to shift every column', () => {
    // The failure this guards: "Tan, Mei Lin" unquoted becomes two columns and
    // every field after it slides left — the account number lands in the amount.
    const csv = buildPayoutCsv(batch, [item({ payeeName: 'Tan, Mei Lin' })]);
    expect(dataRow(csv)).toContain('"Tan, Mei Lin"');
    expect(dataRow(csv)).toContain('875.00');
  });

  test('an embedded quote is doubled, per RFC 4180', () => {
    const csv = buildPayoutCsv(batch, [item({ payeeName: 'Ann "AJ" Lee' })]);
    expect(dataRow(csv)).toContain('"Ann ""AJ"" Lee"');
  });

  test('the account number is ALWAYS quoted so a leading zero survives Excel', () => {
    // Unquoted, 0123456789 is read as the number 123456789 and the branch digit
    // is gone before a human ever looks at the file.
    const csv = buildPayoutCsv(batch, [item({ bankAccountNo: '0123456789' })]);
    expect(dataRow(csv)).toContain('"0123456789"');
  });

  test('the amount is passed through as stored — no float, no separators', () => {
    const csv = buildPayoutCsv(batch, [item({ amount: '1203.30' })]);
    // Not 1203.2999999999999, and not "1,203.30" (which would be two columns).
    expect(dataRow(csv)).toContain('1203.30');
    expect(dataRow(csv)).not.toContain('1,203');
  });

  test('lines end CRLF — several bank portals reject a bare-LF file', () => {
    const csv = buildPayoutCsv(batch, [item()]);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  test('null payee fields become empty cells rather than the string "null"', () => {
    const csv = buildPayoutCsv(batch, [
      item({ payeeName: null, payeeIc: null, bankName: null, bankAccountNo: null }),
    ]);
    expect(dataRow(csv)).not.toContain('null');
  });

  test('no items still produces a header, not an empty file', () => {
    // An empty file uploads as "0 payments" at some banks and errors at others;
    // a header-only file is unambiguous.
    expect(buildPayoutCsv(batch, []).split('\r\n')[0]).toContain('Payee Name');
  });
});

describe('payoutStatementReference', () => {
  test('names the week, because that is what a payee actually asks', () => {
    expect(payoutStatementReference(batch)).toBe('PR wages 2026-08-16 to 2026-08-22');
  });

  test('falls back to the run number when the batch has no week', () => {
    expect(
      payoutStatementReference({ reference: 'PO-000009', weekStart: null, weekEnd: null }),
    ).toBe('PR wages PO-000009');
  });
});

describe('payoutCsvFilename', () => {
  test('is stable, sortable, and says what it is', () => {
    expect(payoutCsvFilename(batch)).toBe('payout-PO-000001-2026-08-16.csv');
  });

  test('strips anything that is not filename-safe', () => {
    expect(payoutCsvFilename({ reference: 'PO/000001 ..\\x', weekStart: null })).toBe(
      'payout-PO000001x.csv',
    );
  });

  test('survives a batch with no reference', () => {
    expect(payoutCsvFilename({ reference: null, weekStart: null })).toBe('payout-batch.csv');
  });
});
