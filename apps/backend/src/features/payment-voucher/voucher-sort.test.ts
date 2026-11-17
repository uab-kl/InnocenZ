import { describe, expect, it } from 'vitest';
import {
  parseVoucherSort,
  VOUCHER_SORT_FIELDS,
  type VoucherSortField,
} from './voucher-sort';

describe('parseVoucherSort', () => {
  it('accepts every whitelisted field', () => {
    for (const field of VOUCHER_SORT_FIELDS) {
      expect(parseVoucherSort(field, 'asc')).toEqual({
        field,
        direction: 'asc',
      });
    }
  });

  /*
   * THE ONE THAT MATTERS. `sortBy` comes from the query string and the
   * repository turns it into an ORDER BY. Anything not on the list must come
   * back null — never be passed through for the caller to interpolate.
   */
  it('refuses a field that is not on the list', () => {
    const hostile = [
      'id; DROP TABLE payment_voucher',
      'net--',
      'password',
      '(SELECT 1)',
      'ISSUEDDATE',
      'issued_date',
      '',
      '__proto__',
      'constructor',
      'toString',
    ];
    for (const value of hostile) {
      expect(parseVoucherSort(value, 'asc')).toBeNull();
    }
  });

  it('refuses a non-string field', () => {
    for (const value of [undefined, null, 42, {}, [], ['issuedDate']]) {
      expect(parseVoucherSort(value, 'asc')).toBeNull();
    }
  });

  // Newest-first everywhere: the lane that defaulted the other way opened the
  // admin inbox on the oldest voucher on the platform.
  it('defaults to descending, and only "asc" turns it round', () => {
    expect(parseVoucherSort('issuedDate', undefined)?.direction).toBe('desc');
    expect(parseVoucherSort('issuedDate', 'rubbish')?.direction).toBe('desc');
    expect(parseVoucherSort('issuedDate', 'ASC')?.direction).toBe('asc');
    expect(parseVoucherSort('issuedDate', 'asc')?.direction).toBe('asc');
    expect(parseVoucherSort('issuedDate', 99)?.direction).toBe('desc');
  });

  it('keeps the field list free of duplicates', () => {
    const unique = new Set<VoucherSortField>(VOUCHER_SORT_FIELDS);
    expect(unique.size).toBe(VOUCHER_SORT_FIELDS.length);
  });
});
