// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import { missingIdPhotoSides } from './id-photos';

/**
 * "A FAILED IC UPLOAD HAS NO RETRY" (28 Sep 2026 audit). Profile now offers the
 * missing side again — and ONLY the missing side, so a PR whose card is on file
 * (all 52 on `innocenz-test`, 29 Sep, read-only) never sees the section.
 */
describe('missingIdPhotoSides', () => {
  test('both sides on file: nothing to offer', () => {
    expect(
      missingIdPhotoSides({ idType: 'NRIC', idPhotoFront: 'https://r2/f?sig', idPhotoBack: 'https://r2/b?sig' }),
    ).toEqual([]);
  });

  test('THE BUG: the upload failed at sign-up — both sides are offered again', () => {
    expect(missingIdPhotoSides({ idType: 'NRIC', idPhotoFront: null, idPhotoBack: null })).toEqual([
      'front',
      'back',
    ]);
  });

  test('only the side that is missing', () => {
    expect(missingIdPhotoSides({ idType: 'NRIC', idPhotoFront: 'k', idPhotoBack: '' })).toEqual(['back']);
  });

  test('a passport has one side — its back is never asked for', () => {
    expect(missingIdPhotoSides({ idType: 'Passport', idPhotoFront: null, idPhotoBack: null })).toEqual([
      'front',
    ]);
  });

  test('no ID type yet reads as a two-sided card, as sign-up does', () => {
    expect(missingIdPhotoSides({ idType: null, idPhotoFront: null, idPhotoBack: null })).toEqual([
      'front',
      'back',
    ]);
  });

  test('a backend that does not send the fields is UNKNOWN, not missing — no nag', () => {
    expect(missingIdPhotoSides({ idType: 'NRIC' })).toEqual([]);
    expect(missingIdPhotoSides(null)).toEqual([]);
  });
});
