import { describe, expect, it } from 'vitest';
import { UpdateMemberSubscriptionSchema } from './member-subscription.schema';

/**
 * The billing anchor is the day every future period of a lane is derived from,
 * and until now nothing could change it after `/approve` stamped it — an org
 * approved by mistake was anchored on a day only SQL could move.
 *
 * Tested at the parse, not by firing the endpoint: this is admin-only and it
 * re-dates real invoicing, so it is not a gate to probe with a write.
 */
describe('UpdateMemberSubscriptionSchema — billingStartsAt', () => {
  it('accepts a corrected anchor', () => {
    const parsed = UpdateMemberSubscriptionSchema.parse({
      billingStartsAt: '2026-09-01T00:00:00.000Z',
    });
    expect(parsed.billingStartsAt).toBeInstanceOf(Date);
    expect(parsed.billingStartsAt?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('accepts null — "enrolled, not yet billable" is a real state', () => {
    // An anchor set in error can be WITHDRAWN rather than moved to another wrong
    // day. The invoice job reports every live org missing one, so this does not
    // go unnoticed.
    const parsed = UpdateMemberSubscriptionSchema.parse({ billingStartsAt: null });
    expect(parsed.billingStartsAt).toBeNull();
  });

  it('leaves the anchor ALONE when the field is absent', () => {
    // The distinction that matters: every other field of this PUT is optional
    // too, and an edit to `status` must not move the billing date.
    const parsed = UpdateMemberSubscriptionSchema.parse({ status: 'active' });
    expect('billingStartsAt' in parsed).toBe(false);
    expect(parsed.billingStartsAt).toBeUndefined();
  });

  it('refuses a value that is not a date', () => {
    expect(() =>
      UpdateMemberSubscriptionSchema.parse({ billingStartsAt: 'not a date' }),
    ).toThrow();
  });

  it('still accepts a payload with no anchor in it at all', () => {
    const parsed = UpdateMemberSubscriptionSchema.parse({ planName: 'Starter' });
    expect(parsed.planName).toBe('Starter');
  });
});
