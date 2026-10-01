import { describe, expect, it } from 'vitest';
import { CreateShiftSaleSchema, SALES_CEILING_RM, SALES_UNITS_CEILING } from './shift-sale.schema';

/**
 * `POST /shift-sale` refuses a number its numeric(12,2) columns cannot hold with
 * a 400 that says so, instead of the INSERT failing as a raw 500 (security
 * review, 29 Sep 2026). The controller writes drinks + tips into ONE total
 * column, so the sum is capped as well as each part.
 */
const base = {
  shiftId: '4ff48fdd-1111-4222-8333-944455556666',
  userId: '93ea08b0-1111-4222-8333-944455556666',
};

describe('CreateShiftSaleSchema — money the columns can hold', () => {
  it('accepts an everyday sale', () => {
    const parsed = CreateShiftSaleSchema.safeParse({
      ...base,
      drinkUnits: 12,
      drinkSalesRm: 1_500,
      tipUnits: 2,
      tipSalesRm: 40,
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts each part AT the ceiling', () => {
    expect(CreateShiftSaleSchema.safeParse({ ...base, drinkSalesRm: SALES_CEILING_RM }).success).toBe(true);
    expect(CreateShiftSaleSchema.safeParse({ ...base, tipUnits: SALES_UNITS_CEILING }).success).toBe(true);
  });

  it('refuses a part past the ceiling, and a unit count past its cap', () => {
    expect(CreateShiftSaleSchema.safeParse({ ...base, tipSalesRm: SALES_CEILING_RM + 1 }).success).toBe(false);
    expect(CreateShiftSaleSchema.safeParse({ ...base, drinkUnits: SALES_UNITS_CEILING + 1 }).success).toBe(false);
  });

  it('refuses two parts that fit alone but not as the one total column', () => {
    const parsed = CreateShiftSaleSchema.safeParse({
      ...base,
      drinkSalesRm: SALES_CEILING_RM,
      tipSalesRm: 1,
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe('The sales total is too large');
  });

  it('still needs a PR to attribute the sale to', () => {
    const parsed = CreateShiftSaleSchema.safeParse({ shiftId: base.shiftId, drinkSalesRm: 10 });
    expect(parsed.success).toBe(false);
  });
});
