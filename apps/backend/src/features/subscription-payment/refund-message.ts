/**
 * THE SENTENCES "MARK REFUNDED" ANSWERS WITH — one place, pure, no imports.
 *
 * The admin reads these as the confirmation or the refusal (the owner's rule:
 * every action confirms in the server's own words), and the web translates
 * them at the render by matching these exact words
 * (apps/web/src/components/admin/refund-copy.ts). A sentence reworded here must
 * be reworded there — its test pins this list.
 */

/** The longest refund reference accepted. Bank and gateway references are far shorter. */
export const REFUND_REFERENCE_MAX = 60;

export const REFUND_MESSAGES = {
  referenceMissing: 'Enter the refund reference — the bank or gateway reference of the money sent back',
  referenceTooLong: `The refund reference is too long — ${REFUND_REFERENCE_MAX} characters at most`,
  alreadyRefunded: 'This payment is already marked refunded',
  notOwedBack:
    'Only a payment owed back can be marked refunded — this one did not land on a voided or already-paid bill',
  noRoom: "That refund reference is too long to keep beside this payment's own reference — use a shorter one",
} as const;

/** "INV-000049: RM 125.00 marked refunded — reference MBB-20260930-0001" */
export function refundedMessage(invoiceNo: string, amount: string, reference: string): string {
  return `${invoiceNo}: ${amount} marked refunded — reference ${reference}`;
}
