import { describe, expect, test } from 'vitest';
import type { PayoutBatchItemType } from './payout-batch.model';
import {
  matchResponseToItems,
  normaliseAccount,
  parsePayoutResponseCsv,
} from './payout-response-csv';

/**
 * A response file decides who gets marked paid. Every case here is a way a
 * plausible file marks the WRONG person paid, or quietly settles a run it only
 * half understood.
 */

const item = (id: string, account: string): PayoutBatchItemType =>
  ({ id, bankAccountNo: account }) as PayoutBatchItemType;

describe('parsePayoutResponseCsv', () => {
  test('reads the common shape', () => {
    const { rows, errors } = parsePayoutResponseCsv(
      'Account Number,Status,Reference\r\n512345678901,Paid,IBG123\r\n',
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        line: 1,
        accountNo: '512345678901',
        status: 'paid',
        bankRef: 'IBG123',
        failureReason: null,
        amount: null,
      },
    ]);
  });

  test('accepts the words banks actually use, in any case', () => {
    const { rows } = parsePayoutResponseCsv(
      'account no,result\n111,SUCCESSFUL\n222,Rejected\n333,credited\n',
    );
    expect(rows.map((r) => r.status)).toEqual(['paid', 'failed', 'paid']);
  });

  test('an UNRECOGNISED status is an error, never assumed failed', () => {
    // Guessing 'failed' would un-pay someone the bank actually paid.
    const { rows, errors } = parsePayoutResponseCsv(
      'Account Number,Status\n512345678901,In progress\n',
    );
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain('Unrecognised status');
  });

  test('missing required columns refuses the whole file', () => {
    const { rows, errors } = parsePayoutResponseCsv('Name,Amount\nVicky,875.00\n');
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain('account-number column');
  });

  test('an empty file is an error, not an empty success', () => {
    expect(parsePayoutResponseCsv('').errors[0].reason).toBe('File is empty');
  });

  test('quoted fields and embedded commas survive', () => {
    const { rows } = parsePayoutResponseCsv(
      'Account Number,Status,Reason\n"0123456789",Failed,"Account closed, contact payee"\n',
    );
    expect(rows[0].accountNo).toBe('0123456789');
    expect(rows[0].failureReason).toBe('Account closed, contact payee');
  });

  test('unreadable rows are reported alongside the good ones, not dropped', () => {
    const { rows, errors } = parsePayoutResponseCsv(
      'Account Number,Status\n111,Paid\n,Paid\n333,Maybe\n',
    );
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });
});

describe('normaliseAccount', () => {
  test('strips whatever the bank decorated the number with', () => {
    expect(normaliseAccount(" '5123-4567 8901")).toBe('512345678901');
  });
});

describe('matchResponseToItems', () => {
  const items = [item('i1', '512345678901'), item('i2', '0123456789')];

  test('matches by account, tolerating the bank reformatting it', () => {
    const parsed = parsePayoutResponseCsv(
      'Account Number,Status,Reference\n5123-4567-8901,Paid,IBG9\n',
    );
    const { matches, unmatched } = matchResponseToItems(items, parsed);
    expect(unmatched).toEqual([]);
    expect(matches).toEqual([
      { itemId: 'i1', status: 'paid', bankRef: 'IBG9', failureReason: null },
    ]);
  });

  test('an account not in this run is reported, not silently ignored', () => {
    const parsed = parsePayoutResponseCsv('Account Number,Status\n999,Paid\n');
    const { matches, unmatched } = matchResponseToItems(items, parsed);
    expect(matches).toEqual([]);
    expect(unmatched[0].reason).toContain('No line in this run');
  });

  test('TWO lines on one account are refused as ambiguous', () => {
    // Guessing would mark the wrong person paid and ring the wrong phone.
    const shared = [item('a', '777'), item('b', '777')];
    const parsed = parsePayoutResponseCsv('Account Number,Status\n777,Paid\n');
    const { matches, unmatched } = matchResponseToItems(shared, parsed);
    expect(matches).toEqual([]);
    expect(unmatched[0].reason).toContain('settle them by hand');
  });

  test('parse errors are carried through to the caller', () => {
    const parsed = parsePayoutResponseCsv('Account Number,Status\n111,Maybe\n');
    expect(matchResponseToItems(items, parsed).unmatched).toHaveLength(1);
  });
});
