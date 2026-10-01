import { describe, expect, it } from 'vitest';
import { CreateShiftSchema, SLOT_NEEDS_WINDOW, UpdateShiftSchema } from './shift.schema';

/**
 * A SLOT IS A TIME WINDOW OR NOTHING (29 Sep 2026 audit: "slot-label-only shifts
 * never clash").
 *
 * Every clash, travel-gap, seal and pay-window guard reads the slot's clock. A
 * bare label gave them nothing to compare, so "Late night" collided with nothing
 * — not the venue's own 22:00 - 04:00, not a PR's other booking. The label is
 * now refused at the door instead of being taught to each guard.
 */
const base = {
  outletId: '11111111-1111-4111-8111-111111111111',
  shiftDate: '2026-10-01',
};

describe('shift slot must carry a readable window', () => {
  it.each([
    ['22:00 - 04:00'],
    ['11:00 - 12:00'],
    ['8pm - 2am'],
    ['10:00 PM - 4:00 AM'],
    ['Friday 22:00 - 04:00'],
  ])('accepts the window %s', (slot) => {
    expect(CreateShiftSchema.safeParse({ ...base, slot }).success).toBe(true);
    expect(UpdateShiftSchema.safeParse({ slot }).success).toBe(true);
  });

  it.each([['Late night'], ['VIP'], ['TBC'], ['22:00']])('refuses the label %s', (slot) => {
    const created = CreateShiftSchema.safeParse({ ...base, slot });
    expect(created.success).toBe(false);
    expect(created.error?.issues[0]?.message).toBe(SLOT_NEEDS_WINDOW);

    const edited = UpdateShiftSchema.safeParse({ slot });
    expect(edited.success).toBe(false);
    expect(edited.error?.issues[0]?.message).toBe(SLOT_NEEDS_WINDOW);
  });

  it('still allows an untimed shift — no slot, or an empty one', () => {
    expect(CreateShiftSchema.safeParse(base).success).toBe(true);
    expect(CreateShiftSchema.safeParse({ ...base, slot: '' }).success).toBe(true);
    // A status-only edit (confirm / seal) sends no slot and must be untouched.
    expect(UpdateShiftSchema.safeParse({ status: 'confirmed' }).success).toBe(true);
  });
});
