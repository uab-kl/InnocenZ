import { describe, expect, it } from 'vitest';
import {
  type VoidFacts,
  VOID_NOTE_PREFIX,
  voidedMessage,
  voidNote,
  voidRefusal,
} from './invoice-void';

/**
 * Owner, 29 Sep 2026: "Add Void" — an admin voids an UNPAID bill with a reason;
 * it stops counting as owed and stays on record. Only a bill nothing has
 * touched may be voided.
 */
const unpaid = (overrides: Partial<VoidFacts> = {}): VoidFacts => ({
  invoiceNo: 'INV-000049',
  status: 'unpaid',
  creditApplied: '0.00',
  attempts: [],
  creditRefs: 0,
  ...overrides,
});

describe('voidRefusal — only a bill nothing has touched', () => {
  it('an unpaid bill with no attempts and no credit may be voided', () => {
    expect(voidRefusal(unpaid())).toBeNull();
  });

  it('a declined or a withdrawn attempt is history, not money — it does not block', () => {
    expect(voidRefusal(unpaid({ attempts: ['failed', 'voided'] }))).toBeNull();
  });

  it('a PAID bill is refused — that is a refund, not a void', () => {
    const refusal = voidRefusal(unpaid({ status: 'paid' }));
    expect(refusal).toEqual({ status: 409, message: expect.stringMatching(/INV-000049 is paid — only an unpaid bill/) });
  });

  it('a bill already void is refused, and says so', () => {
    expect(voidRefusal(unpaid({ status: 'void' }))?.message).toMatch(/already void/);
  });

  it.each(['initiated', 'pending'] as const)('a payment still %s is refused — it could settle after the void', (attempt) => {
    expect(voidRefusal(unpaid({ attempts: ['failed', attempt] }))?.message).toMatch(/still in progress/);
  });

  it.each(['succeeded', 'refunded'] as const)('money recorded (%s) is refused', (attempt) => {
    expect(voidRefusal(unpaid({ attempts: [attempt] }))?.message).toMatch(/Money has been recorded against INV-000049/);
  });

  it('a credit taken off the bill, or a credit minted from it, is refused', () => {
    expect(voidRefusal(unpaid({ creditApplied: '10.00' }))?.message).toMatch(/credit is tied to INV-000049/);
    expect(voidRefusal(unpaid({ creditRefs: 1 }))?.message).toMatch(/credit is tied/);
  });

  it('every refusal is a 409 that says nothing was changed', () => {
    for (const facts of [
      unpaid({ status: 'paid' }),
      unpaid({ status: 'void' }),
      unpaid({ attempts: ['pending'] }),
      unpaid({ attempts: ['succeeded'] }),
      unpaid({ creditRefs: 2 }),
    ]) {
      const refusal = voidRefusal(facts);
      expect(refusal?.status).toBe(409);
      expect(refusal?.message).toMatch(/Nothing was changed\.$/);
    }
  });
});

describe('voidNote — the reason joins whatever the bill already said', () => {
  it('on a bare bill it is the reason alone', () => {
    expect(voidNote(null, '  Billed before the venue existed ')).toBe(`${VOID_NOTE_PREFIX}Billed before the venue existed`);
  });

  it('a pro-rata sentence is kept first, whole — so the bill still reads back as pro-rated', () => {
    expect(voidNote('Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00)', 'Duplicate charge')).toBe(
      'Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00) · Voided: Duplicate charge',
    );
  });

  it('never outgrows the varchar(255) column', () => {
    expect(voidNote('x'.repeat(200), 'y'.repeat(200)).length).toBeLessThanOrEqual(255);
  });
});

describe('voidedMessage', () => {
  it('names the bill and what the void means', () => {
    expect(voidedMessage('INV-000049')).toBe(
      'INV-000049 voided — it no longer counts as owed, and the reason is kept on its record.',
    );
  });
});
