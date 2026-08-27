/**
 * Exercises the FPX MANDATE SAVE PATH end to end — the one lane 0133/0134 shipped
 * without ever being run.
 *
 * It walks the same three layers a real save walks, in the same order, against
 * the live database: the zod schema at the edge, the controller's field mapping,
 * and the repository write that the CHECK constraints and the partial unique
 * index have to accept. Everything it creates is deleted again at the end.
 *
 * Why a probe rather than a unit test: the failures worth catching here live in
 * the DATABASE — a CHECK that disagrees with the zod refinement, a partial unique
 * index that rejects the second rail — and none of those exist in a mocked
 * repository. This is the same reason `check-schema-drift.ts` opens a connection.
 */
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import {
  PaymentMethodTable,
  fpxBankByCode,
  isChargeable,
} from '@/features/payment-method/payment-method.model.js';
import { PaymentMethodRepositoryClass } from '@/features/payment-method/payment-method.repository.js';
import { UpsertPaymentMethodSchema } from '@/schema/payment-method.schema.js';

const repo = new PaymentMethodRepositoryClass();
const ACTOR = 'probe:fpx-save';
const created: string[] = [];

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`, detail === undefined ? '' : detail);
  }
}

/**
 * The controller's own mapping, lifted verbatim from `upsertMine`. Kept as a
 * copy on purpose: if the controller changes and this probe does not, the two
 * disagree and the probe stops proving anything — which is the failure to catch,
 * not a duplication to tidy away.
 */
function controllerFields(parsed: ReturnType<typeof UpsertPaymentMethodSchema.parse>) {
  const type = parsed.type;
  const isCard = type === 'card';
  return {
    type,
    brand: isCard ? parsed.brand : 'Card',
    last4: isCard ? (parsed.last4 ?? null) : null,
    expMonth: isCard ? (parsed.expMonth ?? null) : null,
    expYear: isCard ? (parsed.expYear ?? null) : null,
    holderName: parsed.holderName ?? null,
    billingEmail: parsed.billingEmail ?? null,
    mandateStatus: type === 'fpx_mandate' ? ('pending' as const) : null,
    mandateReference: type === 'fpx_mandate' ? (parsed.mandateReference ?? null) : null,
    bankCode: type === 'fpx_mandate' ? (parsed.bankCode ?? null) : null,
    bankName: type === 'fpx_mandate' ? (fpxBankByCode(parsed.bankCode)?.name ?? null) : null,
    autoPay: type === 'card' || type === 'fpx_mandate' ? (parsed.autoPay ?? true) : false,
  };
}

async function main() {
  const [outlet] = await db.select().from(OutletTable).limit(1);
  if (!outlet) throw new Error('no outlet in this database to probe against');
  const owner = { outletId: outlet.id } as const;
  console.log(`\nProbing against outlet ${outlet.name} (${outlet.id})\n`);

  const before = await db
    .select()
    .from(PaymentMethodTable)
    .where(eq(PaymentMethodTable.outletId, outlet.id));
  if (before.length > 0) {
    throw new Error(
      `outlet already holds ${before.length} payment method row(s); refusing to probe over real data`,
    );
  }

  // ── 1 · the edge ──────────────────────────────────────────────────────────
  console.log('1. Schema — what the browser is allowed to send');
  const noBank = UpsertPaymentMethodSchema.safeParse({ type: 'fpx_mandate' });
  check('mandate with no bank is refused', !noBank.success);
  const badBank = UpsertPaymentMethodSchema.safeParse({ type: 'fpx_mandate', bankCode: 'NOTABANK' });
  check('mandate at an off-roster bank is refused', !badBank.success);
  const liar = UpsertPaymentMethodSchema.safeParse({
    type: 'fpx_mandate',
    bankCode: 'MB2U0227',
    mandateStatus: 'active',
  });
  check('schema parses a client-claimed active mandate', liar.success);

  // ── 2 · the controller ────────────────────────────────────────────────────
  console.log('\n2. Controller — what it does with it');
  const fields = controllerFields(
    UpsertPaymentMethodSchema.parse({
      type: 'fpx_mandate',
      bankCode: 'MB2U0227',
      mandateStatus: 'active', // the lie from above
      holderName: 'Probe Venue Sdn Bhd',
      billingEmail: 'probe@example.test',
    }),
  );
  check(
    'a client-claimed ACTIVE mandate is forced to pending',
    fields.mandateStatus === 'pending',
    fields.mandateStatus,
  );
  check('bank name is resolved server-side, not trusted', fields.bankName === 'Maybank2u', fields.bankName);
  check('no card fields leak onto a mandate', fields.last4 === null && fields.expMonth === null);

  // ── 3 · the write ─────────────────────────────────────────────────────────
  console.log('\n3. Repository + database — does it land');
  const mandate = await repo.create({
    outletId: outlet.id,
    ...fields,
    isDefault: true,
    status: 'active',
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });
  check('mandate row is written', Boolean(mandate));
  if (!mandate) throw new Error('mandate insert returned null — cannot continue');
  created.push(mandate.id);
  check('bank_code stored', mandate.bankCode === 'MB2U0227', mandate.bankCode);
  check('bank_name snapshotted', mandate.bankName === 'Maybank2u', mandate.bankName);
  check('mandate_status persisted as pending', mandate.mandateStatus === 'pending');
  check('no account number column exists', !('accountNo' in mandate) && !('bankAccountNo' in mandate));

  // The whole point of the mandate distinction.
  check('a PENDING mandate is NOT chargeable', isChargeable(mandate) === false);
  check(
    'even an ACTIVE mandate is not chargeable without a gateway token',
    isChargeable({ ...mandate, mandateStatus: 'active' }) === false,
  );

  // ── 4 · two rails at once — what 0133 exists for ──────────────────────────
  console.log('\n4. A second rail beside the first');
  const cardFields = controllerFields(
    UpsertPaymentMethodSchema.parse({
      type: 'card',
      brand: 'Visa',
      last4: '4242',
      expMonth: 11,
      expYear: 2029,
    }),
  );
  const held = await repo.listFor(owner);
  const card = await repo.create({
    outletId: outlet.id,
    ...cardFields,
    isDefault: held.length === 0,
    status: 'active',
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });
  check('a card saves BESIDE the mandate', Boolean(card));
  if (card) created.push(card.id);
  const two = await repo.listFor(owner);
  check('org now holds two instruments', two.length === 2, two.length);
  check('exactly one is default', two.filter((r) => r.isDefault).length === 1);
  check('default is listed first', two[0]?.isDefault === true);

  // ── 5 · switching and removing ────────────────────────────────────────────
  console.log('\n5. Switching the default, then removing it');
  if (card) {
    const ok = await repo.setDefault(owner, card.id, ACTOR);
    check('setDefault succeeds (clear-then-set ordering holds the index)', ok);
    const after = await repo.listFor(owner);
    check('exactly one default after the switch', after.filter((r) => r.isDefault).length === 1);
    check('the card is now the default', after.find((r) => r.id === card.id)?.isDefault === true);

    await repo.remove(owner, card.id, ACTOR);
    const remaining = await repo.listFor(owner);
    check('removed row leaves the active list', remaining.length === 1, remaining.length);
    check(
      'removing the default leaves NOBODY charged until promotion',
      remaining.filter((r) => r.isDefault).length === 0,
    );
    // The controller promotes; the repository does not. Prove the controller's
    // half is what closes the gap.
    const next = [...remaining].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (next) await repo.setDefault(owner, next.id, ACTOR);
    const promoted = await repo.listFor(owner);
    check('after promotion exactly one default again', promoted.filter((r) => r.isDefault).length === 1);
  }

  // ── 6 · the constraints ───────────────────────────────────────────────────
  console.log('\n6. Database CHECKs — the guards below the code');
  let rejected = false;
  try {
    const [row] = await db
      .insert(PaymentMethodTable)
      .values({
        outletId: outlet.id,
        type: 'fpx_mandate',
        brand: 'Card',
        bankCode: null,
        mandateStatus: 'pending',
        isDefault: false,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning();
    if (row) created.push(row.id);
  } catch {
    rejected = true;
  }
  check('payment_method_mandate_bank rejects a bankless mandate', rejected);

  let cardRejected = false;
  try {
    const [row] = await db
      .insert(PaymentMethodTable)
      .values({
        outletId: outlet.id,
        type: 'card',
        brand: 'Visa',
        last4: null,
        isDefault: false,
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning();
    if (row) created.push(row.id);
  } catch {
    cardRejected = true;
  }
  check('payment_method_card_fields rejects a card with no last4', cardRejected);

  let dupRejected = false;
  try {
    const [row] = await db
      .insert(PaymentMethodTable)
      .values({
        outletId: outlet.id,
        type: 'manual_transfer',
        brand: 'Card',
        isDefault: true, // a SECOND default for this org
        status: 'active',
        createdBy: ACTOR,
        updatedBy: ACTOR,
      })
      .returning();
    if (row) created.push(row.id);
  } catch {
    dupRejected = true;
  }
  check('partial unique index rejects a second default', dupRejected);
}

main()
  .then(async () => {
    if (created.length) {
      await db.delete(PaymentMethodTable).where(inArray(PaymentMethodTable.id, created));
      console.log(`\ncleaned up ${created.length} probe row(s)`);
    }
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    console.error('\nprobe threw:', error);
    if (created.length) {
      await db.delete(PaymentMethodTable).where(inArray(PaymentMethodTable.id, created));
      console.log(`cleaned up ${created.length} probe row(s)`);
    }
    process.exit(1);
  });
