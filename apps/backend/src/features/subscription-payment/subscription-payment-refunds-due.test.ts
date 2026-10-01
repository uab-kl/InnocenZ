import type { Request, Response } from 'express';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MONEY INNOCENZ OWES BACK (30 Sep 2026). `recordAttempt` records money that
 * lands on a VOIDED bill, or on one already PAID, with a refund-due note — and
 * until now only logged it. `GET /subscription-payment/refunds-due` is the read
 * the admin's Plan Payment page puts at the top in red.
 *
 * The database is faked: no row is read or written by this file.
 */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    // listRefundsDue — one SELECT, recorded as it is built
    selected: null as Row | null,
    joins: [] as { kind: 'inner' | 'left'; on: unknown }[],
    where: null as unknown,
    limit: null as number | null,
    rows: [] as Row[],
    failRead: false,
    // recordAttempt — the transaction
    txSelects: [] as Row[][],
    inserts: [] as Row[],
    updates: [] as Row[],
  };
  const read: Record<string, unknown> = {
    from: () => read,
    innerJoin: (_table: unknown, on: unknown) => {
      state.joins.push({ kind: 'inner', on });
      return read;
    },
    leftJoin: (_table: unknown, on: unknown) => {
      state.joins.push({ kind: 'left', on });
      return read;
    },
    where: (where: unknown) => {
      state.where = where;
      return read;
    },
    orderBy: () => read,
    limit: async (n: number) => {
      state.limit = n;
      if (state.failRead) throw new Error('connection reset');
      return state.rows;
    },
  };
  const txQuery = (answer: () => unknown) => {
    const builder: Record<string, unknown> = {};
    for (const step of ['from', 'where', 'orderBy', 'limit', 'for']) builder[step] = () => builder;
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(answer).then(resolve, reject);
    return builder;
  };
  const tx = {
    select: () => txQuery(() => state.txSelects.shift() ?? []),
    insert: () => ({
      values: (values: Row) => {
        state.inserts.push(values);
        return { returning: async () => [{ id: 'pay-new', ...values }] };
      },
    }),
    update: () => ({
      set: (set: Row) => ({
        where: () => {
          state.updates.push(set);
          const done = Promise.resolve([{ id: 'pay-prior', ...set }]);
          return Object.assign(done, { returning: () => done });
        },
      }),
    }),
  };
  const db = {
    select: (fields: Row) => {
      state.selected = fields;
      return read;
    },
    transaction: (body: (t: typeof tx) => Promise<unknown>) => body(tx),
  };
  return { state, db, error: vi.fn(), scope: { isAdmin: true } };
});

vi.mock('@/db/index.js', () => ({ db: h.db }));
vi.mock('@/env.js', () => ({ env: {} }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: h.error, debug: vi.fn() },
}));
vi.mock('./auto-charge.js', () => ({
  AUTO_CHARGE_ACTOR: 'job:auto-charge',
  autoChargeInFlight: () => false,
  notifyAutoChargeFailed: vi.fn(),
}));
vi.mock('./payment-gateway.js', () => ({ getGateway: () => null, listGateways: () => [] }));
vi.mock('@/util/org-scope.js', () => ({
  resolveOrgScope: async () => ({ isAdmin: h.scope.isAdmin, agencyId: null, outletIds: [] }),
  pickedOrgKind: () => null,
  resolveActingOrgId: async () => null,
}));

import { AgencyTable } from '@/features/agency/agency.model.js';
import { MemberSubscriptionTable } from '@/features/member-subscription/member-subscription.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { SubscriptionPaymentControllerClass } from './subscription-payment.controller';
import {
  REFUND_DUE_PAID_TWICE_PREFIX,
  REFUND_DUE_VOIDED_BILL_PREFIX,
  REFUNDS_DUE_LIMIT,
  refundDueKind,
} from './refund-due.repository';
import { SubscriptionPaymentRepositoryClass } from './subscription-payment.repository';

const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

const repository = new SubscriptionPaymentRepositoryClass();

const PAID_AT = new Date('2026-09-29T10:00:00Z');

/** One row as the SELECT hands it back, before mapping. */
function readRow(over: Record<string, unknown> = {}) {
  return {
    paymentId: 'pay-1',
    invoiceId: 'inv-1',
    invoiceNo: 'INV-000049',
    subscriberType: 'agency',
    agencyName: 'Atlas Agency',
    outletName: null,
    amount: '125.00',
    currency: 'MYR',
    methodType: 'fpx',
    gateway: 'fiuu',
    paidAt: PAID_AT,
    failureReason: `${REFUND_DUE_VOIDED_BILL_PREFIX}money taken for INV-000049, which was voided; refund due`,
    ...over,
  };
}

beforeEach(() => {
  h.state.selected = null;
  h.state.joins = [];
  h.state.where = null;
  h.state.limit = null;
  h.state.rows = [];
  h.state.failRead = false;
  h.state.txSelects = [];
  h.state.inserts = [];
  h.state.updates = [];
  h.scope.isAdmin = true;
  h.error.mockReset();
});

describe('the refund-due markers', () => {
  it('carry no LIKE wildcard, and neither is the start of the other', () => {
    for (const prefix of [REFUND_DUE_VOIDED_BILL_PREFIX, REFUND_DUE_PAID_TWICE_PREFIX]) {
      expect(prefix).not.toMatch(/[%_\\]/);
    }
    expect(REFUND_DUE_VOIDED_BILL_PREFIX.startsWith(REFUND_DUE_PAID_TWICE_PREFIX)).toBe(false);
    expect(REFUND_DUE_PAID_TWICE_PREFIX.startsWith(REFUND_DUE_VOIDED_BILL_PREFIX)).toBe(false);
  });

  it('classify a stored reason — and leave every other reason alone', () => {
    expect(refundDueKind(`${REFUND_DUE_VOIDED_BILL_PREFIX}money taken for INV-1`)).toBe('voided');
    expect(refundDueKind(`${REFUND_DUE_PAID_TWICE_PREFIX}money taken but INV-1 was already paid`)).toBe(
      'paid_twice',
    );
    expect(refundDueKind('Insufficient funds')).toBeNull();
    expect(refundDueKind('Marked unpaid by admin')).toBeNull();
    expect(refundDueKind(null)).toBeNull();
  });
});

describe('recordAttempt writes what listRefundsDue reads — one spelling, both sides', () => {
  const VOID_BILL = { id: 'inv-1', invoiceNo: 'INV-000049', status: 'void', amount: '125.00', currency: 'MYR' };
  const PAID_BILL = { ...VOID_BILL, status: 'paid' };

  it('money for a VOIDED bill is stored under the voided marker', async () => {
    h.state.txSelects.push([VOID_BILL], []);

    await repository.recordAttempt({
      subscriptionInvoiceId: 'inv-1',
      methodType: 'fpx',
      gateway: 'fiuu',
      gatewayPaymentId: 'fiuu-1',
      outcome: 'succeeded',
      actor: 'gateway:fiuu',
    });

    const stored = String(h.state.inserts[0]?.failureReason);
    // Byte for byte what the writer stored before the prefix was extracted.
    expect(stored).toBe('PAID FOR A VOIDED BILL — money taken for INV-000049, which was voided; refund due');
    expect(refundDueKind(stored)).toBe('voided');
  });

  it('a pending checkout that clears on a PAID bill is flagged under the paid-twice marker', async () => {
    h.state.txSelects.push([PAID_BILL], [{ id: 'pay-prior', status: 'pending', reference: 'chk_1' }]);

    const result = await repository.recordAttempt({
      subscriptionInvoiceId: 'inv-1',
      methodType: 'fpx',
      gateway: 'fiuu',
      gatewayPaymentId: 'fiuu-1',
      outcome: 'succeeded',
      actor: 'gateway:fiuu',
    });

    expect(result).toMatchObject({ ok: true, paidTwice: true });
    const stored = String(h.state.updates[0]?.failureReason);
    expect(stored).toBe('PAID TWICE — money taken but INV-000049 was already paid; refund due');
    expect(refundDueKind(stored)).toBe('paid_twice');
  });
});

describe('listRefundsDue — the query', () => {
  it('asks for rows carrying either marker, not yet refunded, bounded by the limit', async () => {
    await repository.listRefundsDue();

    const where = render(h.state.where);
    expect(where.sql).toBe(
      '("main"."subscription_payment"."status" <> $1 and ' +
        '("main"."subscription_payment"."failure_reason" like $2 or ' +
        '"main"."subscription_payment"."failure_reason" like $3))',
    );
    expect(where.params).toEqual([
      'refunded',
      `${REFUND_DUE_VOIDED_BILL_PREFIX}%`,
      `${REFUND_DUE_PAID_TWICE_PREFIX}%`,
    ]);
    expect(h.state.limit).toBe(REFUNDS_DUE_LIMIT);
  });

  it('reads the org name LIVE from agency/outlet, never the subscription snapshot', async () => {
    await repository.listRefundsDue();

    expect(h.state.selected?.agencyName).toBe(AgencyTable.name);
    expect(h.state.selected?.outletName).toBe(OutletTable.name);
    expect(Object.values(h.state.selected ?? {})).not.toContain(MemberSubscriptionTable.subscriberName);

    // payment -> invoice -> subscription by FK; then the org, matched on its KIND.
    const [invoice, subscription, agency, outlet] = h.state.joins.map((join) => ({
      kind: join.kind,
      ...render(join.on),
    }));
    expect(invoice).toMatchObject({
      kind: 'inner',
      sql: '"main"."subscription_invoice"."id" = "main"."subscription_payment"."subscription_invoice_id"',
    });
    expect(subscription).toMatchObject({
      kind: 'inner',
      sql: '"main"."member_subscription"."id" = "main"."subscription_invoice"."member_subscription_id"',
    });
    expect(agency).toMatchObject({
      kind: 'left',
      sql:
        '("main"."member_subscription"."subscriber_type" = $1 and ' +
        '"main"."agency"."id" = "main"."member_subscription"."subscriber_id")',
      params: ['agency'],
    });
    expect(outlet).toMatchObject({
      kind: 'left',
      sql:
        '("main"."member_subscription"."subscriber_type" = $1 and ' +
        '"main"."outlet"."id" = "main"."member_subscription"."subscriber_id")',
      params: ['outlet'],
    });
  });

  it('a smaller limit is honoured', async () => {
    await repository.listRefundsDue(5);
    expect(h.state.limit).toBe(5);
  });
});

describe('listRefundsDue — the rows', () => {
  it('names each org by its kind and says WHY a refund is owed', async () => {
    h.state.rows = [
      readRow(),
      readRow({
        paymentId: 'pay-2',
        invoiceId: 'inv-2',
        invoiceNo: 'INV-000050',
        subscriberType: 'outlet',
        agencyName: null,
        outletName: 'JK House',
        amount: '300.00',
        methodType: 'card',
        paidAt: null,
        failureReason: `${REFUND_DUE_PAID_TWICE_PREFIX}money taken but INV-000050 was already paid; refund due`,
      }),
    ];

    const rows = await repository.listRefundsDue();

    expect(rows).toEqual([
      {
        paymentId: 'pay-1',
        invoiceId: 'inv-1',
        invoiceNo: 'INV-000049',
        subscriberType: 'agency',
        subscriberName: 'Atlas Agency',
        amount: '125.00',
        currency: 'MYR',
        methodType: 'fpx',
        gateway: 'fiuu',
        paidAt: PAID_AT,
        reason: 'voided',
      },
      {
        paymentId: 'pay-2',
        invoiceId: 'inv-2',
        invoiceNo: 'INV-000050',
        subscriberType: 'outlet',
        subscriberName: 'JK House',
        amount: '300.00',
        currency: 'MYR',
        methodType: 'card',
        gateway: 'fiuu',
        paidAt: null,
        reason: 'paid_twice',
      },
    ]);
  });

  it('an org whose row is gone still lists the refund — with no name rather than a copied one', async () => {
    h.state.rows = [readRow({ agencyName: null })];

    const rows = await repository.listRefundsDue();

    expect(rows?.[0]).toMatchObject({ paymentId: 'pay-1', subscriberName: null, reason: 'voided' });
  });

  it('a failed read is NULL — never an empty list that reads as "nothing owed"', async () => {
    h.state.failRead = true;

    expect(await repository.listRefundsDue()).toBeNull();
    expect(h.error).toHaveBeenCalledTimes(1);
  });
});

describe('GET /subscription-payment/refunds-due — the handler', () => {
  function call(payments: { listRefundsDue: () => Promise<unknown> }) {
    const controller = new SubscriptionPaymentControllerClass(
      payments as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const out = { status: 0, body: null as null | { success: boolean; data: unknown } };
    const res = {
      status(code: number) {
        out.status = code;
        return res;
      },
      json(payload: { success: boolean; data: unknown }) {
        out.body = payload;
        return res;
      },
    } as unknown as Response;
    return controller
      .refundsDue({ user: { id: 'admin-1' } } as unknown as Request, res)
      .then(() => out);
  }

  it('an admin gets the rows', async () => {
    const rows = [{ paymentId: 'pay-1', reason: 'voided' }];
    const out = await call({ listRefundsDue: vi.fn(async () => rows) });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ success: true, data: rows });
  });

  it('a non-admin is refused even if the route guard were missing — and nothing is read', async () => {
    h.scope.isAdmin = false;
    const listRefundsDue = vi.fn(async () => []);

    const out = await call({ listRefundsDue });

    expect(out.status).toBe(403);
    expect(listRefundsDue).not.toHaveBeenCalled();
  });

  it('a read that failed answers 500, not an empty list', async () => {
    const out = await call({ listRefundsDue: vi.fn(async () => null) });

    expect(out.status).toBe(500);
    expect(out.body).toMatchObject({ success: false, data: null });
  });
});
