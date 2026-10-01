import { translations } from '../i18n/translations';
import {
  agencySignatureOf,
  bothSigned,
  signedDayLabel,
  signerRoleLabel,
} from './pv-signatures';

/**
 * The PR's voucher screen names BOTH signers and claims "both signed" only when
 * both are on the document (28 Sep 2026 audit: it showed her own signature
 * alone under a caption announcing "Dual-signed · transfer processing").
 */

const agencySigned = {
  financeHeadName: 'Jane Tan',
  financeHeadRole: 'Owner',
  financeHeadSignedAt: '2026-09-14T02:02:00.000Z',
  prSignedAt: null,
};

describe('agencySignatureOf', () => {
  it('reads who signed for the agency, as what and when', () => {
    expect(agencySignatureOf(agencySigned)).toEqual({
      name: 'Jane Tan',
      role: 'Owner',
      signedAt: '2026-09-14T02:02:00.000Z',
    });
  });

  it('is null until the agency signs, whatever name is on file', () => {
    expect(agencySignatureOf({ ...agencySigned, financeHeadSignedAt: null })).toBeNull();
    // A backend that has not restarted sends no signature fields at all.
    expect(agencySignatureOf({})).toBeNull();
    expect(agencySignatureOf(null)).toBeNull();
  });

  it('claims no title for a signature taken before capacities were recorded', () => {
    expect(agencySignatureOf({ ...agencySigned, financeHeadRole: null })?.role).toBeNull();
  });
});

describe('bothSigned — "both" only when both are on the document', () => {
  it('needs the agency AND the PR', () => {
    expect(bothSigned(agencySigned, true)).toBe(true);
    expect(bothSigned(agencySigned, false)).toBe(false);
    // The live PV-000002 / PV-000006 shape: the PR signed, the agency never did.
    expect(bothSigned({ ...agencySigned, financeHeadSignedAt: null }, true)).toBe(false);
  });
});

describe('signerRoleLabel', () => {
  it('translates the stored capacity', () => {
    expect(signerRoleLabel('Owner', translations.en)).toBe('Owner');
    expect(signerRoleLabel('Owner', translations.zh)).toBe(translations.zh.pv.roleOwner);
    expect(signerRoleLabel('Finance', translations['zh-Hant'])).toBe(
      translations['zh-Hant'].pv.roleFinance,
    );
  });

  it('shows a capacity it does not know as stored, never blank', () => {
    expect(signerRoleLabel('Ops Head', translations.zh)).toBe('Ops Head');
  });
});

describe('signedDayLabel', () => {
  it('prints a day, and nothing for a missing or broken instant', () => {
    expect(signedDayLabel('2026-09-14T02:02:00.000Z', 'en')).toMatch(/2026/);
    expect(signedDayLabel(null, 'en')).toBeNull();
    expect(signedDayLabel('not a date', 'en')).toBeNull();
  });
});
