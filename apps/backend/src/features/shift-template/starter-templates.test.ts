import { describe, expect, test } from 'vitest';
import {
  STARTER_EVENT_TEMPLATES,
  STARTER_TEMPLATE_SLOT,
  starterTemplateRows,
} from './starter-templates';

const OUTLET = '11111111-2222-3333-4444-555555555555';

describe('starter event templates', () => {
  test('is the gallery the picker shows: 3 normal, 9 special', () => {
    const normal = STARTER_EVENT_TEMPLATES.filter((t) => t.eventKind === 'normal');
    const special = STARTER_EVENT_TEMPLATES.filter((t) => t.eventKind === 'special');
    expect(normal.map((t) => t.name)).toEqual([
      'Friday Lounge',
      'Weekend Party',
      'Ladies Night',
    ]);
    expect(special).toHaveLength(9);
  });

  test('every name is unique — unique(outlet_id, name) would drop a duplicate silently', () => {
    const names = STARTER_EVENT_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('a special card always names its sub-type, and a normal card never does', () => {
    for (const tpl of STARTER_EVENT_TEMPLATES) {
      if (tpl.eventKind === 'special') expect(tpl.specialEventType).toBeTruthy();
      else expect(tpl.specialEventType).toBeUndefined();
    }
  });

  test("an 'other' special carries the name it should display", () => {
    // Without customSpecialEventName these four render as a bare "Other".
    for (const tpl of STARTER_EVENT_TEMPLATES) {
      if (tpl.specialEventType === 'other') {
        expect(tpl.customSpecialEventName).toBe(tpl.name);
      }
    }
  });

  test('rows carry the outlet, the actor and a stable order', () => {
    const rows = starterTemplateRows(OUTLET, 'tester');
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.outletId === OUTLET)).toBe(true);
    expect(rows.every((r) => r.createdBy === 'tester' && r.updatedBy === 'tester')).toBe(true);
    expect(rows.every((r) => r.slot === STARTER_TEMPLATE_SLOT)).toBe(true);
    expect(rows.map((r) => r.sortOrder)).toEqual([...Array(12).keys()]);
  });

  test('optional fields become null, never undefined, so the insert is explicit', () => {
    const friday = starterTemplateRows(OUTLET, 'tester')[0];
    expect(friday.specialEventType).toBeNull();
    expect(friday.customSpecialEventName).toBeNull();
  });

  test('no starter card ships a cover — the venue uploads its own', () => {
    const rows = starterTemplateRows(OUTLET, 'tester');
    expect(rows.some((r) => 'coverImage' in r)).toBe(false);
  });
});
