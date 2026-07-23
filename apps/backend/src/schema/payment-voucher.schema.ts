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
});

export const UpdatePrReceiptLineSchema = CreatePrReceiptLineSchema.partial();

export type CreatePrReceiptLineInput = z.infer<typeof CreatePrReceiptLineSchema>;
export type UpdatePrReceiptLineInput = z.infer<typeof UpdatePrReceiptLineSchema>;

// A PR raises a dispute on its OWN issued voucher (the week under review). The
// reason is one of the quick presets; the note carries the flagged amount(s).
// Persisted on the reused payment_voucher dispute columns (status='disputed').
export const PrDisputeSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(200, 'Reason is too long'),
  note: z.string().max(1000, 'Note is too long').optional(),
});

export type PrDisputeInput = z.infer<typeof PrDisputeSchema>;
