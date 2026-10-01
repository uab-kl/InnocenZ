import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ledger's WIRING for the first-partial-week rule (owner, 29 Sep 2026: a
 * first partial week is not billed in full) — what `generateMissing` actually
 * inserts, what a credit does to that row, and what a plan switch charges on
 * top of it. The rule itself is pinned in `pro-rata.test.ts`.
 *
 * The database is a stand-in that answers queued rows and records every write,
 * so nothing here touches the shared `innocenz-test` database.
 */
const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    /** One queued answer per `db.select()` call, in call order. */
    selects: [] as Row[][],
    inserts: [] as Row[][],
    updates: [] as Row[],
    /** What each UPDATE … RETURNING answers, in call order (default: no rows). */
    updateReturns: [] as Row[][],
    /** Every WHERE handed to a select, so a filter can be rendered and checked. */
    wheres: [] as unknown[],
    /** What the open-credits query (`db.execute`) answers. */
    credits: [] as Row[],
  };
  const query = (answer: () => unknown) => {
    const builder: Record<string, unknown> = {};
    for (const step of ['from', 'innerJoin', 'leftJoin', 'orderBy', 'limit', 'offset', 'groupBy', 'for']) {
      builder[step] = () => builder;
    }
    builder.where = (clause: unknown) => {
      state.wheres.push(clause);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve().then(answer).then(resolve, reject);
    return builder;
  };
  let nextId = 0;
  const db: Record<string, unknown> = {
    select: () => query(() => state.selects.shift() ?? []),
    insert: () => ({
      values: (values: Row | Row[]) => {
        const rows = Array.isArray(values) ? values : [values];
        state.inserts.push(rows);
        nextId += rows.length;
        const returned = rows.map((row, index) => ({ note: null, ...row, id: `new-${nextId - rows.length + index}` }));
        const done = Promise.resolve(returned);
        return { onConflictDoNothing: () => ({ returning: () => done }), then: done.then.bind(done) };
      },
    }),
    update: () => ({
      set: (set: Row) => ({
        where: () => {
          state.updates.push(set);
          const done = Promise.resolve(state.updateReturns.shift() ?? []);
          return Object.assign(done, { returning: () => done });
        },
      }),
    }),
    execute: () => Promise.resolve({ rows: state.credits }),
  };
  // One "transaction" is the same fake: nothing here commits or rolls back.
  db.transaction = (body: (tx: unknown) => Promise<unknown>) => body(db);
  const reset = () => {
    state.selects = [];
    state.inserts = [];
    state.updates = [];
    state.updateReturns = [];
    state.wheres = [];
    state.credits = [];
  };
  return { db, state, reset };
});

vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { SubscriptionInvoiceRepositoryClass } from './subscription-invoice.repository';

const AGENCY = '6e2cf753-0000-4000-8000-000000000000';
const OUTLET = '5787b179-0000-4000-8000-000000000000';
const PRO_RATA_NOTE = 'Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00)';

/** A `member_subscription` row as `generateMissing` selects it. */
function lane(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ms-agency',
    subscriberType: 'agency',
    subscriberId: AGENCY,
    subscriberName: 'Test Agency',
    subscriptionId: 'plan-starter',
    kind: 'plan',
    amount: '125.00',
    currency: 'MYR',
    billingCycle: 'weekly',
    // Approved on FRIDAY 7 Aug 2026, 10:00 KL — the INV-000049 shape.
    startedAt: new Date('2026-08-07T02:00:00Z'),
    billingStartsAt: new Date('2026-08-07T02:00:00Z'),
    endedAt: null,
    status: 'active',
    ...overrides,
  };
}

const repository = new SubscriptionInvoiceRepositoryClass();

beforeEach(() => fake.reset());

describe('generateMissing — the first partial week', () => {
  it('bills a Friday approval 2 of 7 days and records why', async () => {
    fake.state.selects.push([lane()], []);

    const result = await repository.generateMissing({ today: '2026-08-07' });

    expect(fake.state.inserts).toHaveLength(1);
    expect(fake.state.inserts[0]).toEqual([
      expect.objectContaining({
        memberSubscriptionId: 'ms-agency',
        periodStart: '2026-08-02',
        periodEnd: '2026-08-08',
        amount: '35.71',
        baseAmount: '35.71',
        note: PRO_RATA_NOTE,
      }),
    ]);
    expect(result.created).toBe(1);
    // The notice is handed the stored figure and the numbers behind it.
    expect(result.opened).toEqual([
      expect.objectContaining({
        amount: '35.71',
        proRata: { billedDays: 2, periodDays: 7, billedFrom: '2026-08-07', fullAmount: '125.00' },
      }),
    ]);
  });

  it('bills a Sunday approval the whole week, exactly as before, with no note', async () => {
    const sunday = new Date('2026-08-09T02:00:00Z');
    fake.state.selects.push([lane({ startedAt: sunday, billingStartsAt: sunday })], []);

    const result = await repository.generateMissing({ today: '2026-08-09' });

    expect(fake.state.inserts[0]).toEqual([
      expect.objectContaining({ periodStart: '2026-08-09', amount: '125.00', baseAmount: '125.00', note: null }),
    ]);
    expect(result.opened[0]?.proRata).toBeNull();
  });

  it('never re-prices a first week already billed in full — only the new week is minted', async () => {
    fake.state.selects.push(
      [lane()],
      // INV-000049: 2–8 Aug already on the ledger at the full RM 125.
      [{ subscriberType: 'agency', subscriberId: AGENCY, subscriptionId: 'plan-starter', kind: 'plan', periodStart: '2026-08-02' }],
    );

    await repository.generateMissing({ today: '2026-08-10' });

    expect(fake.state.inserts).toEqual([
      [expect.objectContaining({ periodStart: '2026-08-09', amount: '125.00', note: null })],
    ]);
    expect(fake.state.updates).toEqual([]);
  });

  it('leaves an outlet month alone — it starts on its own anchor day', async () => {
    const midMonth = new Date('2026-09-17T02:00:00Z');
    fake.state.selects.push(
      [
        lane({
          id: 'ms-outlet',
          subscriberType: 'outlet',
          subscriberId: OUTLET,
          billingCycle: 'monthly',
          amount: '999.00',
          startedAt: midMonth,
          billingStartsAt: midMonth,
        }),
      ],
      [],
    );

    await repository.generateMissing({ today: '2026-09-17' });

    expect(fake.state.inserts[0]).toEqual([
      expect.objectContaining({ periodStart: '2026-09-17', periodEnd: '2026-10-16', amount: '999.00', note: null }),
    ]);
  });

  it('keeps the pro-rata sentence when a downgrade credit is taken off the same week', async () => {
    fake.state.selects.push([lane()], []);
    fake.state.credits = [
      { id: 'credit-1', remaining: '10.00', reason: 'Switched Growth → Starter mid-period; Growth already billed' },
    ];

    const result = await repository.generateMissing({ today: '2026-08-07' });

    const invoiceUpdate = fake.state.updates.find((set) => 'creditApplied' in set);
    expect(invoiceUpdate).toMatchObject({
      creditApplied: '10.00',
      amount: '25.71',
      note: `${PRO_RATA_NOTE} · Switched Growth → Starter mid-period; Growth already billed`,
    });
    // …and the notice is handed what is OWED after that credit, not the minted
    // 35.71 (29 Sep 2026: the "New bill" notice quoted the figure before credits).
    expect(result.opened).toEqual([
      expect.objectContaining({
        amount: '25.71',
        creditApplied: '10.00',
        proRata: { billedDays: 2, periodDays: 7, billedFrom: '2026-08-07', fullAmount: '125.00' },
      }),
    ]);
  });

  it('a period no credit touched is handed over at its minted figure, with no credit', async () => {
    fake.state.selects.push([lane()], []);

    const result = await repository.generateMissing({ today: '2026-08-07' });

    expect(result.opened).toEqual([expect.objectContaining({ amount: '35.71', creditApplied: null })]);
  });
});

/**
 * 29 Sep 2026 follow-up: "a re-joined billing lane keeps its EARLIEST anchor".
 * The lane still walks one calendar from its earliest anchor, but a period no
 * row held is never billed, and the period the lane came back in is billed from
 * the day it came back.
 */
describe('generateMissing — a lane that was left and later re-joined', () => {
  const inserted = () => fake.state.inserts.flat() as Record<string, unknown>[];
  const minted = (periodStart: string) => inserted().find((row) => row.periodStart === periodStart);

  it('never bills the weeks it held nothing, and bills the re-join week from the day it came back', async () => {
    // Agency cd50e9f6's own shape (read-only, 29 Sep 2026): Enterprise from Mon
    // 1 Jun to 30 Jun, then nothing until Starter on Wed 12 Aug, 14:06 KL.
    fake.state.selects.push(
      [
        lane({
          id: 'ms-enterprise',
          subscriptionId: 'plan-enterprise',
          amount: '1000.00',
          startedAt: new Date('2026-06-01T00:00:00Z'),
          billingStartsAt: new Date('2026-06-01T00:00:00Z'),
          endedAt: new Date('2026-06-30T00:00:00Z'),
          status: 'cancelled',
        }),
        lane({
          id: 'ms-starter',
          startedAt: new Date('2026-08-12T06:06:00Z'),
          billingStartsAt: new Date('2026-08-12T06:06:00Z'),
        }),
      ],
      [],
    );

    const result = await repository.generateMissing({ today: '2026-08-16' });

    expect(inserted().map((row) => row.periodStart)).toEqual([
      '2026-05-31',
      '2026-06-07',
      '2026-06-14',
      '2026-06-21',
      '2026-06-28',
      // 5 Jul – 8 Aug: held by nothing, so on nobody's bill.
      '2026-08-09',
      '2026-08-16',
    ]);
    expect(minted('2026-06-28')).toMatchObject({ memberSubscriptionId: 'ms-enterprise', amount: '1000.00' });
    // The week it came back: Wed 12 – Sat 15 Aug, 4 of 7 days, at the plan it came back on.
    expect(minted('2026-08-09')).toMatchObject({
      memberSubscriptionId: 'ms-starter',
      amount: '71.43',
      baseAmount: '71.43',
      note: 'Pro-rated: 4 of 7 days from 2026-08-12 (full period 125.00)',
    });
    expect(minted('2026-08-16')).toMatchObject({ amount: '125.00', note: null });
    expect(result.opened.find((row) => row.periodStart === '2026-08-09')?.proRata).toEqual({
      billedDays: 4,
      periodDays: 7,
      billedFrom: '2026-08-12',
      fullAmount: '125.00',
    });
  });

  it('the gap weeks already on the ledger are left alone — only the missing held week is minted', async () => {
    const enterprise = lane({
      id: 'ms-enterprise',
      subscriptionId: 'plan-enterprise',
      amount: '1000.00',
      startedAt: new Date('2026-06-01T00:00:00Z'),
      billingStartsAt: new Date('2026-06-01T00:00:00Z'),
      endedAt: new Date('2026-06-30T00:00:00Z'),
      status: 'cancelled',
    });
    const starter = lane({
      id: 'ms-starter',
      startedAt: new Date('2026-08-12T06:06:00Z'),
      billingStartsAt: new Date('2026-08-12T06:06:00Z'),
    });
    const onLedger = (periodStart: string) => ({
      subscriberType: 'agency',
      subscriberId: AGENCY,
      subscriptionId: 'plan-starter',
      kind: 'plan',
      periodStart,
    });
    fake.state.selects.push(
      [enterprise, starter],
      ['2026-05-31', '2026-06-07', '2026-06-14', '2026-06-21', '2026-06-28', '2026-07-05', '2026-08-09'].map(
        onLedger,
      ),
    );

    await repository.generateMissing({ today: '2026-08-16' });

    expect(fake.state.inserts).toEqual([[expect.objectContaining({ periodStart: '2026-08-16', amount: '125.00' })]]);
    expect(fake.state.updates).toEqual([]);
  });

  it('a lane that came back INSIDE the week it left is billed that week once, whole', async () => {
    fake.state.selects.push(
      [
        lane({
          id: 'ms-growth',
          subscriptionId: 'plan-growth',
          amount: '250.00',
          // Sun 2 Aug 09:00 KL to Tue 4 Aug.
          startedAt: new Date('2026-08-02T01:00:00Z'),
          billingStartsAt: new Date('2026-08-02T01:00:00Z'),
          endedAt: new Date('2026-08-04T02:00:00Z'),
          status: 'cancelled',
        }),
        // Back on Thu 6 Aug.
        lane({
          id: 'ms-starter',
          startedAt: new Date('2026-08-06T02:00:00Z'),
          billingStartsAt: new Date('2026-08-06T02:00:00Z'),
        }),
      ],
      [],
    );

    await repository.generateMissing({ today: '2026-08-06' });

    // Held on the week's first day, so billed in advance as a whole week — at the
    // plan the org settled on, the rule for any switch within a period.
    expect(fake.state.inserts).toEqual([
      [expect.objectContaining({ periodStart: '2026-08-02', memberSubscriptionId: 'ms-starter', amount: '125.00', note: null })],
    ]);
  });

  it('a switch with no gap is still one whole week, as before', async () => {
    const anchor = new Date('2026-08-02T01:00:00Z');
    const switchedAt = new Date('2026-08-05T03:00:00Z');
    fake.state.selects.push(
      [
        lane({ id: 'ms-starter', startedAt: anchor, billingStartsAt: anchor, endedAt: switchedAt, status: 'expired' }),
        lane({
          id: 'ms-growth',
          subscriptionId: 'plan-growth',
          amount: '250.00',
          startedAt: switchedAt,
          billingStartsAt: anchor,
        }),
      ],
      [],
    );

    await repository.generateMissing({ today: '2026-08-05' });

    expect(fake.state.inserts).toEqual([
      [expect.objectContaining({ periodStart: '2026-08-02', memberSubscriptionId: 'ms-growth', amount: '250.00', note: null })],
    ]);
  });

  it('a re-joined MONTH is billed from the re-join day on the lane’s own calendar, then whole', async () => {
    const monthly = (overrides: Record<string, unknown>) =>
      lane({ subscriberType: 'outlet', subscriberId: OUTLET, billingCycle: 'monthly', ...overrides });
    fake.state.selects.push(
      [
        monthly({
          id: 'ms-essential',
          subscriptionId: 'plan-essential',
          amount: '999.00',
          startedAt: new Date('2026-01-05T02:00:00Z'),
          billingStartsAt: new Date('2026-01-05T02:00:00Z'),
          endedAt: new Date('2026-03-10T02:00:00Z'),
          status: 'cancelled',
        }),
        monthly({
          id: 'ms-plus',
          subscriptionId: 'plan-plus',
          amount: '1699.00',
          startedAt: new Date('2026-09-20T02:00:00Z'),
          billingStartsAt: new Date('2026-09-20T02:00:00Z'),
        }),
      ],
      ['2026-01-05', '2026-02-05', '2026-03-05'].map((periodStart) => ({
        subscriberType: 'outlet',
        subscriberId: OUTLET,
        subscriptionId: 'plan-essential',
        kind: 'plan',
        periodStart,
      })),
    );

    await repository.generateMissing({ today: '2026-10-06' });

    // Apr – Aug: held by nothing. 5 Sep – 4 Oct is the month it came back in:
    // 20 Sep – 4 Oct is 15 of its 30 days. From 5 Oct, whole again.
    expect(inserted()).toEqual([
      expect.objectContaining({
        memberSubscriptionId: 'ms-plus',
        periodStart: '2026-09-05',
        periodEnd: '2026-10-04',
        amount: '849.50',
        note: 'Pro-rated: 15 of 30 days from 2026-09-20 (full period 1699.00)',
      }),
      expect.objectContaining({ periodStart: '2026-10-05', periodEnd: '2026-11-04', amount: '1699.00', note: null }),
    ]);
  });
});

describe('prorateLaneSwitch — inside a pro-rated first week, priced as any other week', () => {
  const switchInput = {
    subscriberType: 'agency' as const,
    subscriberId: AGENCY,
    newMemberSubscriptionId: 'ms-new',
    fromPlanName: 'Starter',
    toPlanName: 'Growth',
    fromAmount: '125.00',
    toAmount: '250.00',
    actor: 'admin-1',
    today: '2026-08-07',
  };
  const currentWeek = (note: string | null) => [
    {
      invoice: {
        id: 'inv-first',
        periodStart: '2026-08-02',
        periodEnd: '2026-08-08',
        currency: 'MYR',
        status: 'unpaid',
        kind: 'period',
        note,
      },
      kind: 'plan',
    },
  ];

  // Owner, 29 Sep 2026: "Charge the full weekly price difference as in any
  // other week." A switch inside a pro-rated first week is priced — and worded
  // — exactly as one in a whole week; only the week's own charge is pro-rated.
  it('an upgrade adds the FULL weekly difference, as in any other week', async () => {
    fake.state.selects.push(currentWeek(PRO_RATA_NOTE));

    const outcome = await repository.prorateLaneSwitch(switchInput);

    expect(outcome).toBe('upgrade_invoiced');
    expect(fake.state.inserts[0]).toEqual([
      expect.objectContaining({
        kind: 'upgrade',
        periodStart: '2026-08-02',
        amount: '125.00',
        baseAmount: '125.00',
        note: 'Upgrade Starter → Growth: 250.00 − 125.00 billed this period',
      }),
    ]);
  });

  it('a downgrade credits the FULL weekly difference, as in any other week', async () => {
    fake.state.selects.push(currentWeek('Pro-rated: 2 of 7 days from 2026-08-07 (full period 250.00)'));

    const outcome = await repository.prorateLaneSwitch({
      ...switchInput,
      fromPlanName: 'Growth',
      toPlanName: 'Starter',
      fromAmount: '250.00',
      toAmount: '125.00',
    });

    expect(outcome).toBe('credited');
    expect(fake.state.inserts[0]).toEqual([
      expect.objectContaining({
        amount: '125.00',
        remaining: '125.00',
        reason: 'Switched Growth → Starter mid-period; Growth already billed',
      }),
    ]);
  });

  it('a paid pro-rated week is topped up by the full difference too', async () => {
    fake.state.selects.push([
      { ...currentWeek(PRO_RATA_NOTE)[0], invoice: { ...currentWeek(PRO_RATA_NOTE)[0]!.invoice, status: 'paid' } },
    ]);

    await repository.prorateLaneSwitch(switchInput);

    expect(fake.state.inserts[0]).toEqual([
      expect.objectContaining({ amount: '125.00', note: 'Upgrade Starter → Growth: 250.00 − 125.00 already paid' }),
    ]);
  });

  it('a whole week still moves by the whole difference, worded as before', async () => {
    fake.state.selects.push(currentWeek(null));

    await repository.prorateLaneSwitch(switchInput);

    expect(fake.state.inserts[0]).toEqual([
      expect.objectContaining({
        amount: '125.00',
        note: 'Upgrade Starter → Growth: 250.00 − 125.00 billed this period',
      }),
    ]);
  });

  it('prices nothing — and reads nothing — when the two plans cost the same', async () => {
    fake.state.selects.push(currentWeek(PRO_RATA_NOTE));

    const outcome = await repository.prorateLaneSwitch({ ...switchInput, toAmount: '125.00' });

    expect(outcome).toBe('none');
    expect(fake.state.inserts).toEqual([]);
    expect(fake.state.selects).toHaveLength(1);
  });

  it('never prices a switch against a VOIDED period — the lookup asks for status <> void', async () => {
    fake.state.selects.push([]);

    const outcome = await repository.prorateLaneSwitch(switchInput);

    expect(outcome).toBe('none');
    const rendered = new PgDialect().sqlToQuery(fake.state.wheres[0] as SQL);
    expect(rendered.sql).toMatch(/"subscription_invoice"\."status" <> \$\d+/);
    expect(rendered.params).toContain('void');
  });
});

/**
 * Owner, 29 Sep 2026: "Add Void". The repository half — the facts read under
 * the row lock, the refusal, the one UPDATE. The rule itself is pinned in
 * `invoice-void.test.ts`.
 */
describe('voidUnpaid — an admin voids an unpaid bill raised in error', () => {
  const invoice = (overrides: Record<string, unknown> = {}) => ({
    id: 'inv-1',
    invoiceNo: 'INV-000049',
    memberSubscriptionId: 'ms-agency',
    periodStart: '2026-08-02',
    periodEnd: '2026-08-08',
    amount: '35.71',
    baseAmount: '35.71',
    creditApplied: '0.00',
    currency: 'MYR',
    kind: 'period',
    note: PRO_RATA_NOTE,
    status: 'unpaid',
    ...overrides,
  });
  const facts = (
    row: Record<string, unknown>,
    attempts: { status: string }[] = [],
    creditRefs = 0,
  ) => fake.state.selects.push([row], attempts, [{ n: creditRefs }]);

  it('voids it: status void, the reason after the note it already had, stamped by the admin', async () => {
    facts(invoice());
    fake.state.updateReturns.push([invoice({ status: 'void' })]);

    const result = await repository.voidUnpaid({ id: 'inv-1', reason: 'Duplicate charge', actor: 'admin-1' });

    expect(result).toMatchObject({ ok: true, before: { status: 'unpaid' }, after: { status: 'void' } });
    expect(fake.state.updates).toEqual([
      expect.objectContaining({
        status: 'void',
        note: `${PRO_RATA_NOTE} · Voided: Duplicate charge`,
        updatedBy: 'admin-1',
      }),
    ]);
  });

  it('a failed attempt is history — the bill still voids', async () => {
    facts(invoice(), [{ status: 'failed' }, { status: 'voided' }]);
    fake.state.updateReturns.push([invoice({ status: 'void' })]);

    expect((await repository.voidUnpaid({ id: 'inv-1', reason: 'Wrong plan', actor: 'admin-1' })).ok).toBe(true);
  });

  it.each([
    ['a paid bill', invoice({ status: 'paid' }), [], 0, /is paid/],
    ['a payment still pending', invoice(), [{ status: 'pending' }], 0, /still in progress/],
    ['money recorded', invoice(), [{ status: 'succeeded' }], 0, /Money has been recorded/],
    ['a credit minted from it', invoice(), [], 1, /credit is tied/],
    ['a credit taken off it', invoice({ creditApplied: '10.00' }), [], 0, /credit is tied/],
  ])('refuses %s and writes nothing', async (_label, row, attempts, creditRefs, message) => {
    facts(row, attempts as { status: string }[], creditRefs);

    const result = await repository.voidUnpaid({ id: 'inv-1', reason: 'Duplicate charge', actor: 'admin-1' });

    expect(result).toEqual({ ok: false, refusal: { status: 409, message: expect.stringMatching(message) } });
    expect(fake.state.updates).toEqual([]);
  });

  it('an id that names no bill is not found', async () => {
    fake.state.selects.push([]);
    expect(await repository.voidUnpaid({ id: 'nope', reason: 'Duplicate', actor: 'admin-1' })).toEqual({
      ok: false,
      notFound: true,
    });
  });

  it('an UPDATE that matched no unpaid row THROWS — never "voided" over nothing', async () => {
    facts(invoice());
    fake.state.updateReturns.push([]);

    await expect(
      repository.voidUnpaid({ id: 'inv-1', reason: 'Duplicate charge', actor: 'admin-1' }),
    ).rejects.toThrow(/matched no unpaid row/);
  });
});

describe('generateMissing — a voided period is never billed again', () => {
  it('the void row keeps the period’s slot: nothing is minted for it', async () => {
    fake.state.selects.push(
      [lane()],
      [{ subscriberType: 'agency', subscriberId: AGENCY, subscriptionId: 'plan-starter', kind: 'plan', periodStart: '2026-08-02', status: 'void' }],
    );

    const result = await repository.generateMissing({ today: '2026-08-07' });

    expect(fake.state.inserts).toEqual([]);
    expect(result.created).toBe(0);
  });
});
