import { describe, expect, test } from 'vitest';
import {
  type DrinkMenuRowInput,
  isTipsMenuRow,
  TIPS_MENU_CATEGORY,
  withTipsMenuRow,
} from './tips-menu-row.js';

/**
 * UAB Emhub's menu as it is stored today (14 Sep 2026), trimmed to three rows:
 * priced drinks and services, and no tips row of any kind. Seven of the eight
 * live venues look like this.
 */
const MENU_WITHOUT_TIPS: DrinkMenuRowInput[] = [
  {
    slug: 'cosmo',
    name: 'Cosmo',
    priceRm: '150.00',
    category: 'drink',
    sortOrder: 0,
  },
  {
    slug: 'service-1789349832636',
    name: 'Booking commission',
    priceRm: '100.00',
    category: 'service',
    sortOrder: 1,
  },
  {
    slug: 'havoc',
    name: 'Havoc',
    priceRm: '1000.00',
    category: 'service',
    sortOrder: 2,
  },
];

/** JK House's tips row: added by the venue itself, so a generated slug. */
const JK_HOUSE_TIPS = {
  slug: 'service-1785132698158',
  name: 'Tips',
  priceRm: '50.00',
};

const tipsRows = (menu: DrinkMenuRowInput[]) => menu.filter(isTipsMenuRow);

describe('isTipsMenuRow', () => {
  test('matches the seeded row by its slug', () => {
    expect(
      isTipsMenuRow({ slug: 'tips', name: 'Trinkgeld', category: 'service' }),
    ).toBe(true);
  });

  test("matches a venue's own row by its category", () => {
    expect(
      isTipsMenuRow({
        slug: 'service-1785132698158',
        name: 'Tips',
        category: 'tip',
      }),
    ).toBe(true);
  });

  test('matches a row that is only NAMED tips', () => {
    expect(
      isTipsMenuRow({ slug: 'service-1', name: ' tips ', category: 'service' }),
    ).toBe(true);
  });

  test('leaves an ordinary service alone', () => {
    expect(
      isTipsMenuRow({ slug: 'havoc', name: 'Havoc', category: 'service' }),
    ).toBe(false);
  });
});

describe('withTipsMenuRow', () => {
  test('adds an unpriced tips row to a menu that has never had one', () => {
    const next = withTipsMenuRow(MENU_WITHOUT_TIPS, null);
    expect(next).toHaveLength(MENU_WITHOUT_TIPS.length + 1);
    const [tips] = tipsRows(next);
    expect(tips).toMatchObject({
      slug: 'tips',
      name: 'Tips',
      priceRm: '0',
      category: TIPS_MENU_CATEGORY,
      sortOrder: 3,
    });
  });

  test('a venue that clears its whole menu still keeps tips', () => {
    expect(tipsRows(withTipsMenuRow([], null))).toHaveLength(1);
  });

  test("puts a deleted tips row back at the venue's own price", () => {
    const next = withTipsMenuRow(MENU_WITHOUT_TIPS, JK_HOUSE_TIPS);
    expect(tipsRows(next)).toEqual([
      {
        slug: JK_HOUSE_TIPS.slug,
        name: 'Tips',
        priceRm: '50.00',
        category: TIPS_MENU_CATEGORY,
        sortOrder: 3,
      },
    ]);
  });

  test('keeps a re-priced tips row exactly as sent', () => {
    const sent: DrinkMenuRowInput[] = [
      ...MENU_WITHOUT_TIPS,
      {
        slug: JK_HOUSE_TIPS.slug,
        name: 'Tips',
        priceRm: '80.00',
        category: 'tip',
        sortOrder: 3,
      },
    ];
    expect(withTipsMenuRow(sent, JK_HOUSE_TIPS)).toEqual(sent);
  });

  /**
   * The regression this guard exists for: the portal's mapper folded the three
   * stored categories into two, so the row came back as a `service` — which
   * would file that venue's tips as service sales from the next save on.
   */
  test('pins a tips row the client flattened to service back to the tip bucket', () => {
    const flattened: DrinkMenuRowInput[] = [
      ...MENU_WITHOUT_TIPS,
      {
        slug: JK_HOUSE_TIPS.slug,
        name: 'Tips',
        priceRm: '50.00',
        category: 'service',
        sortOrder: 3,
      },
    ];
    const next = withTipsMenuRow(flattened, JK_HOUSE_TIPS);
    expect(next).toHaveLength(flattened.length);
    expect(tipsRows(next)).toEqual([
      { ...flattened[3], category: TIPS_MENU_CATEGORY },
    ]);
  });

  /**
   * A flattened row plus a stale `stored` read must not produce TWO tips rows —
   * the venue would see a duplicate they cannot delete.
   */
  test('never leaves the menu with two tips rows', () => {
    const sent: DrinkMenuRowInput[] = [
      {
        slug: 'tips',
        name: 'Tips',
        priceRm: '60.00',
        category: 'service',
        sortOrder: 0,
      },
    ];
    expect(tipsRows(withTipsMenuRow(sent, null))).toHaveLength(1);
    expect(
      tipsRows(
        withTipsMenuRow(sent, { slug: 'tips', name: 'Tips', priceRm: '60.00' }),
      ),
    ).toHaveLength(1);
  });

  test('does not disturb the rest of the menu', () => {
    const next = withTipsMenuRow(MENU_WITHOUT_TIPS, null);
    expect(next.slice(0, 3)).toEqual(MENU_WITHOUT_TIPS);
  });
});
