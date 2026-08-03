import { z } from 'zod';
import { paymentVoucherStatusValues } from '@/features/payment-voucher/payment-voucher.model';

// Accept a non-negative number from the client and store it as a fixed(2) string,
// matching the numeric(12,2) columns.
const money = z.number().nonnegative().transform((n) => n.toFixed(2));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd');

export const PaymentVoucherLineSchema = z.object({
  lineDate: isoDate.optional(),
  outlet: z.string().max(255, 'Outlet is too long').optional(),
  description: z.string().min(1, 'Description is required').max(500, 'Description is too long'),
  quantity: z.number().int().positive().optional(),
  // Kept as a plain number so the controller can sum lines into the subtotal.
  amount: z.number().nonnegative(),
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
  prName: z.string().min(1, 'PR name is required').max(255, 'PR name is too long'),
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
  financeHeadName: z.string().max(255, 'Finance head name is too long').optional(),
  bankRef: z.string().max(100, 'Bank ref is too long').optional(),
  lines: z.array(PaymentVoucherLineSchema).max(200, 'Too many lines').optional(),
});

export const UpdatePaymentVoucherSchema = CreatePaymentVoucherSchema.partial().extend({
  status: z.enum(paymentVoucherStatusValues).optional(),
  disputeReason: z.string().max(1000, 'Dispute reason is too long').optional(),
  disputeNote: z.string().max(1000, 'Dispute note is too long').optional(),
});

export type PaymentVoucherLineInput = z.infer<typeof PaymentVoucherLineSchema>;
export type CreatePaymentVoucherInput = z.infer<typeof CreatePaymentVoucherSchema>;
export type UpdatePaymentVoucherInput = z.infer<typeof UpdatePaymentVoucherSchema>;

// A PR logs earnings against its *current-week* voucher (status pending_review)
// as it works a shift — one payment_voucher_line per entry. `kind` splits the
// Payment week grid (wages/drinks/tips/others); `source` drives the pending vs
// matched badge (manual self-logs stay pending until the agency verifies).
export const prReceiptKindValues = ['wages', 'drinks', 'tips', 'others'] as const;
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
  dedupeRef: z.string().max(80, 'Ref is too long').optional(),
  // Proof photo(s) the PR snaps for a self-log (client downscales before send).
  // Stored on payment_voucher_line.proof_photos so the agency can verify.
  proofPhotos: z
    .array(z.string().min(1).max(1_500_000, 'Photo is too large'))
    .max(6, 'At most 6 photos')
    .optional(),
});

export const UpdatePrReceiptLineSchema = CreatePrReceiptLineSchema.partial();

export type CreatePrReceiptLineInput = z.infer<typeof CreatePrReceiptLineSchema>;
export type UpdatePrReceiptLineInput = z.infer<typeof UpdatePrReceiptLineSchema>;

// One whole SCANNED / SELF-LOGGED RECEIPT: header facts the OCR read (order
// number, date, time) plus its item lines. Persisted as one
// payment_voucher_receipt row + one payment_voucher_line per item (FK-linked).
export const prReceiptItemCategoryValues = ['drink', 'service', 'tip'] as const;
export type PrReceiptItemCategory = (typeof prReceiptItemCategoryValues)[number];

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
  items: z
    .array(
      z.object({
        kind: z.enum(prReceiptKindValues),
        category: z.enum(prReceiptItemCategoryValues).default('drink'),
        item: z.string().min(1, 'Item is required').max(255, 'Item is too long'),
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
  disputeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'disputeDate must be yyyy-MM-dd'),
  component: z.enum(['wages', 'drinks', 'tips', 'others']),
  reason: z.string().min(1, 'Reason is required').max(200, 'Reason is too long'),
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
  /** Receipts pointed at, by their packed ref — never a voucher line id. */
  receiptRefs: z.array(z.string().min(1)).optional(),
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
  disputeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'disputeDate must be yyyy-MM-dd'),
  component: z.enum(['wages', 'drinks', 'tips', 'others']),
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

export type AgencyEditReceiptLineInput = z.infer<typeof AgencyEditReceiptLineSchema>;

export const PrSignVoucherSchema = z.object({
  signature: z
    .object({
      w: z.number().min(20).max(4000),
      h: z.number().min(20).max(2000),
      strokes: z
        .array(z.array(z.tuple([z.number(), z.number()])).min(2).max(2000))
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
      .array(z.array(z.tuple([z.number(), z.number()])).min(2).max(2000))
      .min(1)
      .max(100),
  }),
});

export type FinanceSignVoucherInput = z.infer<typeof FinanceSignVoucherSchema>;
