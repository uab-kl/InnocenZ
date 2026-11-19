/**
 * IS THIS WORK ALREADY BILLED? (Support Desk risk, 16 Nov 2026)
 *
 * `collection_invoice.source_assignment_ids` is a jsonb list of the
 * `shift_assignment` rows an outlet's weekly invoice was built from. jsonb
 * cannot carry a foreign key, so deleting a cited assignment — or the shift it
 * cascades from — leaves the invoice pointing at work that no longer exists,
 * and its total can no longer be reproduced from the rows.
 *
 * Ordinary lanes could not reach this: the delete endpoints already refuse a
 * shift whose day has come and an assignment that is past or clocked in
 * (`assignment-history-guard.ts`), and only finished weeks are invoiced. The
 * gap was the ADMIN exemption ("support has to be able to clean up a bad row"):
 * a clean-up of an INVOICED row is not a clean-up, it is a hole in a bill. So
 * this refusal applies to everyone, admin included. A VOID invoice cites
 * nothing that matters and is ignored.
 *
 * Pure, so the wording and the rule are tested without a delete ever being fired.
 */
export type InvoiceCitation = {
  invoiceId: string;
  /** `YYYY-MM-DD`, the invoice's week start. */
  weekStart: string;
  outletName: string;
  status: string;
};

export function invoiceCitationRefusal(
  citations: readonly InvoiceCitation[],
  subject: 'assignment' | 'shift',
): string | null {
  const live = citations.filter((c) => c.status !== 'void');
  if (live.length === 0) return null;
  const first = live[0];
  const more = live.length > 1 ? ` and ${live.length - 1} more invoice(s)` : '';
  const who = subject === 'shift' ? 'Work on this shift is' : 'This assignment is';
  return (
    `${who} already billed on the collection invoice for ${first.outletName}, week of ` +
    `${String(first.weekStart).slice(0, 10)}${more}. Deleting it would leave that invoice citing ` +
    'work that no longer exists — void or correct the invoice first.'
  );
}
