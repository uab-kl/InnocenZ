import { z } from 'zod';
import { paymentVoucherStatusValues } from '@/features/payment-voucher/payment-voucher.model';

// Accept a non-negative number from the client and store it as a fixed(2) string,
// matching the numeric(12,2) columns.
const money = z
  .number()
  .nonnegative()
  .transform((n) => n.toFixed(2));
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd');

export const PaymentVoucherLineSchema = z.object({
  lineDate: isoDate.optional(),
  outlet: z.string().max(255, 'Outlet is too long').optional(),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description is too long'),
  quantity: z.number().int().positive().optional(),
  /*
   * Kept as a plain number so the controller can sum lines into the subtotal.
   *
   * SIGNED, unlike the `money` helper above. A deduction line is negative — that
   * sign is the entire difference between a RM 250 charge and a RM 250 bonus,
   * and `payment_voucher_line.amount` has always been able to hold it, because
   * `buildPenaltyLine` writes exactly that.
   *
   * It was `nonnegative()`, which was true of every line that existed when it
   * was written and became false the moment penalties landed. The bug it caused
   * is subtle and total: `PUT /payment-voucher/:id` replaces the whole line set,
   * so a client faithfully round-tripping a voucher that carries a −250.00
   * deduction was REJECTED at the schema — a 400 that fails the entire edit,
   * over a line the client did not author and only sent back unchanged. The
   * only way to succeed was to drop the line, which destroys it.
   *
   * The sign is guarded where it is DECIDED (`buildPenaltyLine` takes the
   * magnitude and negates it once), not here, where guarding it only stops
   * honest callers returning what the server itself wrote.
   */
  amount: z.number().finite(),
  ref: z.string().max(100, 'Ref is too long').optional(),
  /**
   * The receipt this line came from, and the proof behind it.
   *
   * Optional, and normally omitted: a voucher update replaces the whole line set,
   * so the repository carries both forward by matching `ref`. They are accepted
   * here so a caller that KNOWS the link can state it rather than rely on that
   * match — and so re-attaching a receipt needs no second endpoint.
   */
  receiptId: z.string().uuid('receiptId must be a uuid').optional(),
  proofPhotos: z.array(z.string().max(500)).max(20).optional(),
});

export const CreatePaymentVoucherSchema = z.object({
  // Optional: derived from the caller's agency for agency users; required for admin.
  agencyId: z.string().uuid('Invalid agency ID').optional(),
  prId: z.string().uuid('Invalid PR ID').optional(),
  prName: z
    .string()
    .min(1, 'PR name is required')
    .max(255, 'PR name is too long'),
  prIc: z.string().max(100, 'PR IC is too long').optional(),
  outlet: z.string().max(255, 'Outlet is too long').optional(),
  cycle: z.string().max(100, 'Cycle is too long').optional(),
  issuedDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  weekStart: isoDate.optional(),
  weekEnd: isoDate.optional(),
  // Optional: recomputed from lines by the controller when omitted.
  subtotal: money.optional(),
  deduction: money.optional(),
  net: money.optional(),
  financeHeadName: z
    .string()
    .max(255, 'Finance head name is too long')
    .optional(),
  bankRef: z.string().max(100, 'Bank ref is too long').optional(),
  lines: z
    .array(PaymentVoucherLineSchema)
    .max(200, 'Too many lines')
    .optional(),
});

export const UpdatePaymentVoucherSchema =
  CreatePaymentVoucherSchema.partial().extend({
    /**
     * Optimistic-concurrency token: the voucher's `updatedAt` as the CLIENT
     * loaded it. When present and stale, the update 409s instead of replacing
     * the line set — the wipe-and-reinsert below would otherwise destroy a line
     * (and its proof photo) the PR logged while the agency editor sat open on a
     * 60-second-stale query, with no error on either side. Optional so every
     * existing caller (status flips, the scheduler) keeps working unchanged.
     */
    expectedUpdatedAt: z.string().max(40).optional(),
    status: z.enum(paymentVoucherStatusValues).optional(),
    disputeReason: z
      .string()
      .max(1000, 'Dispute reason is too long')
      .optional(),
    disputeNote: z.string().max(1000, 'Dispute note is too long').optional(),
  });

export type PaymentVoucherLineInput = z.infer<typeof PaymentVoucherLineSchema>;
export type CreatePaymentVoucherInput = z.infer<
  typeof CreatePaymentVoucherSchema
>;
export type UpdatePaymentVoucherInput = z.infer<
  typeof UpdatePaymentVoucherSchema
>;

// A PR logs earnings against its *current-week* voucher (status pending_review)
// as it works a shift — one payment_voucher_line per entry. `kind` splits the
// Payment week grid (wages/drinks/tips/others); `source` drives the pending vs
// matched badge (manual self-logs stay pending until the agency verifies).
export const prReceiptKindValues = [
  'wages',
  'drinks',
  'tips',
  'others',
] as const;
export type PrReceiptKind = (typeof prReceiptKindValues)[number];
export const prReceiptSourceValues = ['scan', 'manual', 'checkin'] as const;
export type PrReceiptSource = (typeof prReceiptSourceValues)[number];

export const CreatePrReceiptLineSchema = z.object({
  kind: z.enum(prReceiptKindValues),
  source: z.enum(prReceiptSourceValues),
  item: z.string().min(1, 'Item is required').max(255, 'Item is too long'),
  quantity: z.number().int().positive().max(999).optional(),
  // Gross sale kept only for display on the receipt row; `commission` is what
  // actually rolls into the voucher net.
  sales: z.number().nonnegative(),
  commission: z.number().nonnegative(),
  lineDate: isoDate.optional(),
  outlet: z.string().max(255, 'Outlet is too long').optional(),
  // For wages: the assignment id, so a repeated check-out never double-seals.
  //
  // ⚠️ NOT the way to tell the server which shift a line belongs to — use
  // `assignmentId` below. This field is welded to the DEDUPE check: a line
  // arriving with a ref already present on the draft is answered
  // `200 Already sealed` with the EXISTING line, so a drink sent under a wage's
  // ref would be silently discarded rather than written. One field, one fact.
  dedupeRef: z.string().max(80, 'Ref is too long').optional(),
  /**
   * WHICH SHIFT this line was earned on — the evidence deciding WHOSE voucher
   * the money lands on (see `resolveMoneyAgencyId`).
   *
   * A PR on two agencies' rosters can legitimately work both in one day since
   * the window rule, so neither the date nor their membership list can answer
   * this. The check-out seal already knows the assignment (it sends it as
   * `dedupeRef`, for a different purpose); a manual self-log knows it too and
   * simply had nowhere to put it — which made an honest tip on a two-agency day
   * impossible to log at all. Same field and same meaning as
   * `CreatePrReceiptSchema.assignmentId`.
   *
   * Optional: single-roster PRs resolve without it, and an older client that
   * omits it keeps working exactly as before.
   */
  assignmentId: z.string().uuid('Invalid assignment ID').optional(),
  // Proof photo(s) the PR snaps for a self-log (client downscales before send).
  // Stored on payment_voucher_line.proof_photos so the agency can verify.
  proofPhotos: z
    .array(z.string().min(1).max(1_500_000, 'Photo is too large'))
    .max(6, 'At most 6 photos')
    .optional(),
});

export const UpdatePrReceiptLineSchema = CreatePrReceiptLineSchema.partial();

export type CreatePrReceiptLineInput = z.infer<
  typeof CreatePrReceiptLineSchema
>;
export type UpdatePrReceiptLineInput = z.infer<
  typeof UpdatePrReceiptLineSchema
>;

// One whole SCANNED / SELF-LOGGED RECEIPT: header facts the OCR read (order
// number, date, time) plus its item lines. Persisted as one
// payment_voucher_receipt row + one payment_voucher_line per item (FK-linked).
export const prReceiptItemCategoryValues = ['drink', 'service', 'tip'] as const;
export type PrReceiptItemCategory =
  (typeof prReceiptItemCategoryValues)[number];

export const CreatePrReceiptSchema = z.object({
  source: z.enum(prReceiptSourceValues),
  // The shift assignment this receipt was logged during (FK on the receipt).
  assignmentId: z.string().uuid('Invalid assignment ID').optional(),
  // What OCR read off the paper — e.g. ORD0389.
  orderNo: z.string().max(100, 'Order no is too long').optional(),
  receiptDate: isoDate.optional(),
  receiptTime: z.string().max(10, 'Time is too long').optional(),
  // PR's note to the agency (self-logs send it; scans may omit it).
  note: z.string().max(1000, 'Note is too long').optional(),
  outlet: z.string().max(255, 'Outlet is too long').optional(),
  lineDate: isoDate.optional(),
  proofPhotos: z
    .array(z.string().min(1).max(1_500_000, 'Photo is too large'))
    .max(6, 'At most 6 photos')
    .optional(),
  /**
   * A RE-SCAN: the LINE the phone is showing, whose whole paper this receipt
   * replaces.
   *
   * The swap used to happen on the phone — delete the old line, then post this
   * receipt — and `ScanScreen.runSubmit` restores nothing, so any refusal after
   * the delete took the PR's money with it. It only ever needed to be one call:
   * the server is the only place that can exclude the paper being replaced from
   * its own per-night duplicate check, and the only place that can order the new
   * write ahead of the old removal.
   *
   * A LINE id, not a receipt id, because that is what the screen is holding and
   * what the existing line authorisation checks against; the receipt is resolved
   * from it server-side.
   */
  replacesLineId: z.string().uuid('Invalid line ID').optional(),
  items: z
    .array(
      z.object({
        kind: z.enum(prReceiptKindValues),
        category: z.enum(prReceiptItemCategoryValues).default('drink'),
        item: z
          .string()
          .min(1, 'Item is required')
          .max(255, 'Item is too long'),
        quantity: z.number().int().positive().max(999),
        sales: z.number().nonnegative(),
        commission: z.number().nonnegative(),
      }),
    )
    .min(1, 'At least one item')
    .max(50, 'Too many items'),
});

export type CreatePrReceiptInput = z.infer<typeof CreatePrReceiptSchema>;

// A PR raises a dispute on its OWN issued voucher (the week under review). The
// reason is one of the quick presets; the note carries the flagged amount(s).
// Persisted on the reused payment_voucher dispute columns (status='disputed').
/**
 * Raising one dispute — against a single shift DAY and a single COMPONENT.
 *
 * A PR may dispute as much as they like across a month, but each day allows one
 * dispute per component; the pairing is enforced by a UNIQUE constraint in the
 * database rather than here.
 *
 * `disputedAmount` is deliberately absent. It is the baseline of a money claim
 * and is computed server-side from the voucher's own lines — accepting it from
 * the client would let the claimant set what they are claiming against.
 */
export const PrRaiseDisputeSchema = z.object({
  /** The disputed shift day, yyyy-MM-dd, matching payment_voucher_line.line_date. */
  disputeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'disputeDate must be yyyy-MM-dd'),
  component: z.enum(['wages', 'drinks', 'tips', 'others']),
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(200, 'Reason is too long'),
  note: z.string().max(1000, 'Note is too long').optional(),
  /**
   * OPTIONAL, matching the PR app's dispute sheet ("Proof images are optional —
   * attach a receipt photo if you have one").
   *
   * The design originally made proof mandatory and the table carried a CHECK to
   * match. That was wrong in the one case that matters most: a PR disputing a
   * MISSING record has no receipt to photograph — the absence is the complaint —
   * so requiring evidence made the most legitimate claim the only unfileable
   * one. The CHECK was dropped in 0064; strength of evidence is now something
   * the agency weighs when resolving, not a precondition for being heard.
   */
  proofPhotos: z.array(z.string().min(1)).optional(),
  /** What the PR says the figure should be. Optional — some claims are "this is missing". */
  claimedAmount: z.number().nonnegative().optional(),
  /**
   * WHICH SHIFT — the RECEIPT's uuid, stored as a foreign key.
   *
   * Supersedes `receiptRefs`, which carried the receipt NUMBER as text: a copied
   * value that could not be joined or constrained. The shift is read through the
   * receipt (`shift_assignment_id`), so it is never duplicated onto the claim.
   *
   * Omit to dispute the whole day+bucket.
   */
  receiptId: z.string().uuid('receiptId must be a receipt id').optional(),
  /** @deprecated pre-0088 clients only — receipt NUMBERS as text. */
  receiptRefs: z.array(z.string().min(1)).optional(),
  /**
   * WHICH ITEMS on that receipt are wrong — "Lemon Drop", not just "drinks".
   *
   * Only the id is accepted. The description, quantity and amount stored in
   * `disputed_items` are read from the DATABASE, never from this payload: a
   * claimant who could type their own `"amount": "999.00"` into the record would
   * be writing the very figure their claim is measured against.
   *
   * Omit to dispute the whole receipt.
   */
  items: z
    .array(
      z.object({ lineId: z.string().uuid('lineId must be a voucher line id') }),
    )
    .optional(),
});

export type PrRaiseDisputeInput = z.infer<typeof PrRaiseDisputeSchema>;

/**
 * Withdrawing targets ONE dispute, since a voucher can now hold several.
 *
 * Addressed by day + component rather than by id, because that is what the PR
 * app has in hand: the user taps a red cell in the week grid, and the cell knows
 * its date and its income row. Requiring an id would force the app to fetch and
 * track dispute ids purely to undo something it can already point at.
 */
export const PrWithdrawDisputeSchema = z.object({
  disputeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'disputeDate must be yyyy-MM-dd'),
  component: z.enum(['wages', 'drinks', 'tips', 'others']),
  /**
   * WHICH claim, when the day+bucket holds more than one.
   *
   * A PR can hold one open claim PER SHIFT since 0086, so day+component alone
   * stopped identifying a single row — and the withdraw would take whichever
   * came back first, cancelling an argument they had not asked to drop.
   *
   * Omit to target the whole-day claim (the pre-picker shape).
   */
  receiptId: z.string().uuid('receiptId must be a receipt id').optional(),
});

export type PrWithdrawDisputeInput = z.infer<typeof PrWithdrawDisputeSchema>;

/**
 * The agency's decision on one dispute.
 *
 * 'withdrawn' is absent on purpose — that outcome belongs to the PR, and letting
 * an agency mark a live claim as withdrawn would let it close a complaint as
 * though the PR had dropped it.
 *
 * A rejection must say why. An accepted claim is self-explanatory to the PR
 * (they get the money); a rejected one is the PR being told no, and "no" with no
 * reason is what makes a dispute process feel arbitrary.
 */
export const ResolveDisputeSchema = z
  .object({
    outcome: z.enum(['accepted', 'rejected']),
    resolutionNote: z.string().max(1000, 'Note is too long').optional(),
  })
  .refine((d) => d.outcome !== 'rejected' || !!d.resolutionNote?.trim(), {
    message: 'A reason is required when rejecting a dispute',
    path: ['resolutionNote'],
  });

export type ResolveDisputeInput = z.infer<typeof ResolveDisputeSchema>;

/**
 * PR sign payload — optionally carries the finger-drawn signature as compact
 * normalized strokes ({w,h,strokes:[[[x,y],...]]}). Optional so an older app
 * build can still sign; size caps keep a money row from swallowing megabytes.
 */
/**
 * The agency's decision on one day. `status: null` un-reviews it.
 *
 * Deliberately carries NO amount: the day's total is recomputed server-side
 * from the lines, because it is the baseline of a money attestation and a
 * client-supplied one could approve a figure the voucher never held.
 */
export const ReviewVoucherDaySchema = z.object({
  status: z.enum(['approved', 'held']).nullable(),
  note: z.string().max(1000).optional(),
});

/**
 * The agency's decision on ONE receipt.
 *
 * 'verified' is absent on purpose. Verification is the lifecycle closing — the
 * week rolling over, or a dispute being resolved — and letting a reviewer jump
 * straight to it would shut the dispute window before the PR had ever seen the
 * figure. The only two states a person sets here are the two a person can
 * defend: I have checked this, or I have taken that back.
 */
export const ReviewReceiptSchema = z.object({
  status: z.enum(['pending', 'approved']),
});

export type ReviewReceiptInput = z.infer<typeof ReviewReceiptSchema>;

/**
 * The week-level one-click: approve every still-pending receipt on the
 * agency's vouchers for one payroll week. `weekStart` optional — the
 * controller defaults it to the CURRENT payroll week, which is the only week
 * the button is offered for.
 */
export const ApproveAllReceiptsSchema = z.object({
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStart must be YYYY-MM-DD')
    .optional(),
});

export type ApproveAllReceiptsInput = z.infer<typeof ApproveAllReceiptsSchema>;

/**
 * The agency correcting ONE line of a receipt under review.
 *
 * `amount` is the commission — what the PR is actually paid — because that is
 * the number the voucher net is built from. The GROSS printed sale is packed in
 * `payment_voucher_line.ref` and is deliberately NOT editable here: it is the
 * paper's own figure, the photo is the record of it, and re-encoding `ref` would
 * move the key that carries receipt links across a voucher rewrite and that a
 * dispute's `receiptRefs` points at.
 */
export const AgencyEditReceiptLineSchema = z
  .object({
    quantity: z.number().int().positive().max(999).optional(),
    amount: z.number().nonnegative().optional(),
  })
  .refine((d) => d.quantity !== undefined || d.amount !== undefined, {
    message: 'Send a quantity, an amount, or both',
  });

export type AgencyEditReceiptLineInput = z.infer<
  typeof AgencyEditReceiptLineSchema
>;

/**
 * The agency ADDING a line the paper carries and the log missed.
 *
 * ONLY drinks and tips, and it is the same rule that limits `DISPUTABLE_KINDS`
 * to those two: wages and overtime are not CLAIMED, they are DERIVED from the
 * check-in/check-out stamps and the shift's rate. Typing one here would invent
 * money the clock never recorded, and the way to fix a wrong wage stays fixing
 * the attendance record it was computed from.
 *
 * `amount` is the commission — the number the voucher net is built from —
 * matching `AgencyEditReceiptLineSchema` above. The paper's GROSS sale is not
 * accepted for the same reason it is not editable there: it is the paper's own
 * figure and the photo is the record of it.
 */
export const AgencyAddReceiptLineSchema = z.object({
  kind: z.enum(['drinks', 'tips']),
  /**
   * Must NAME AN ITEM THE OUTLET SELLS — checked against that outlet's own
   * `outlet_drink_menu` in the controller, and stored in the catalogue's
   * spelling (owner's rule, 4 Aug 2026). It stays a plain string here because
   * the allowed set is a per-outlet runtime fact resolved from the receipt's
   * shift, which zod cannot enumerate; the refusal lives where the outlet is
   * known. Matching is trimmed and case-insensitive.
   */
  description: z
    .string()
    .min(1, 'Description is required')
    .max(500, 'Description is too long'),
  quantity: z.number().int().positive().max(999),
  amount: z.number().nonnegative(),
  /** Defaults to the day this receipt's money already sits on — see the controller. */
  lineDate: isoDate.optional(),
});

export type AgencyAddReceiptLineInput = z.infer<
  typeof AgencyAddReceiptLineSchema
>;

/**
 * The agency correcting the RECEIPT ITSELF — the order number typed off the
 * paper, or the day it belongs to.
 *
 * `orderNo` is NULLABLE as well as optional, and the two mean different things:
 * absent leaves the stored number alone, null clears it. A number OCR read off a
 * blurred photo has to be removable, not just replaceable.
 *
 * `receiptDate` is not a cosmetic field here. Changing it MOVES the receipt's
 * lines onto that day (see the controller), because a receipt sitting on one
 * date while its money sits on another is two days that no single day review
 * describes.
 */
export const AgencyEditReceiptSchema = z
  .object({
    orderNo: z.string().max(100, 'Order no is too long').nullable().optional(),
    receiptDate: isoDate.optional(),
    /**
     * The time PRINTED on the paper. Editable for the same reason `orderNo` is:
     * OCR reads it off a photographed receipt and gets it wrong (owner, 4 Aug
     * 2026). Nullable like `orderNo` — a misread time has to be removable, not
     * only replaceable.
     *
     * Unlike `receiptDate` this moves NO money: the day a line belongs to is
     * `line_date`, never the printed clock time, so correcting it re-opens the
     * receipt without making any day's approval stale.
     *
     * Loose `string` rather than a strict HH:MM regex, matching
     * `CreatePrReceiptSchema.receiptTime` which writes the column in the first
     * place — the paper prints what it prints, and a validator stricter than the
     * source of the data refuses to record reality.
     */
    receiptTime: z.string().max(10, 'Time is too long').nullable().optional(),
  })
  .refine(
    (d) =>
      d.orderNo !== undefined ||
      d.receiptDate !== undefined ||
      d.receiptTime !== undefined,
    { message: 'Send an order number, a receipt date, a time, or any of them' },
  );

export type AgencyEditReceiptInput = z.infer<typeof AgencyEditReceiptSchema>;

export const PrSignVoucherSchema = z.object({
  signature: z
    .object({
      w: z.number().min(20).max(4000),
      h: z.number().min(20).max(2000),
      strokes: z
        .array(
          z
            .array(z.tuple([z.number(), z.number()]))
            .min(2)
            .max(2000),
        )
        .min(1)
        .max(100),
    })
    .optional(),
});

export type PrSignVoucherInput = z.infer<typeof PrSignVoucherSchema>;

/**
 * The AGENCY's half of the dual signature, taken before the voucher is sent.
 *
 * Same ink shape as the PR's, but `signature` is REQUIRED here where the PR's is
 * optional. The PR signs a figure that was put in front of them; the agency is
 * the party ATTESTING to that figure, and an attestation with no mark behind it
 * is exactly the state this voucher was already in — a name column nobody ever
 * filled and a workflow step nothing enforced.
 *
 * `financeHeadName` is optional because the server falls back to the signed-in
 * account: the person clicking is the person signing, and letting a caller type
 * any name is how a signature stops meaning anything.
 */
export const FinanceSignVoucherSchema = z.object({
  financeHeadName: z.string().min(2).max(255).optional(),
  signature: z.object({
    w: z.number().min(20).max(4000),
    h: z.number().min(20).max(2000),
    strokes: z
      .array(
        z
          .array(z.tuple([z.number(), z.number()]))
          .min(2)
          .max(2000),
      )
      .min(1)
      .max(100),
  }),
});

export type FinanceSignVoucherInput = z.infer<typeof FinanceSignVoucherSchema>;
