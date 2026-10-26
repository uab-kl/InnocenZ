import { describe, expect, it } from 'vitest';
import { icFixRefusal, type VoucherIcRow } from './_check-voucher-pr-ic-rules';

// PV-000009: issued with one IC, the PR's profile now reads another.
const row = (over: Partial<VoucherIcRow> = {}): VoucherIcRow => ({
  id: '7bf3962e-591e-452f-b781-edbe1cbe6ef0',
  voucher_no: 'PV-000009',
  status: 'pending_review',
  agency_id: 'c30fcd15-0000-4000-8000-000000000010',
  agency_name: 'Atlas Agency',
  week_start: '2026-09-06',
  pr_ic: '950312-14-8821',
  profile_ic: '960312-14-8820',
  finance_head_signed: false,
  pr_signed: false,
  paid: false,
  ...over,
});

describe('icFixRefusal', () => {
  it('lets an unsigned draft be corrected', () => {
    expect(icFixRefusal(row(), false)).toBeNull();
  });

  it('refuses a SIGNED or PAID status without --force-signed', () => {
    for (const status of ['signed', 'paid']) {
      expect(icFixRefusal(row({ status }), false)).toMatch(/--force-signed/);
      expect(icFixRefusal(row({ status }), true)).toBeNull();
    }
  });

  it('refuses a pending_review voucher the agency has already signed', () => {
    const reason = icFixRefusal(row({ finance_head_signed: true }), false);
    expect(reason).toMatch(/agency signature/);
    expect(reason).toMatch(/--force-signed/);
  });

  it('refuses on the PR signature or a paid stamp alone, whatever the status says', () => {
    expect(icFixRefusal(row({ pr_signed: true }), false)).toMatch(
      /PR signature/,
    );
    expect(icFixRefusal(row({ status: 'sent', paid: true }), false)).toMatch(
      /paid stamp/,
    );
  });

  it('lets --force-signed through every signature mark', () => {
    expect(
      icFixRefusal(
        row({
          status: 'paid',
          finance_head_signed: true,
          pr_signed: true,
          paid: true,
        }),
        true,
      ),
    ).toBeNull();
  });

  it('still refuses what is not a signature question, even with --force-signed', () => {
    expect(icFixRefusal(row({ profile_ic: null }), true)).toMatch(
      /no IC on their profile/,
    );
    expect(
      icFixRefusal(row({ pr_ic: '960312148820', paid: true }), true),
    ).toMatch(/already matches/);
  });
});
