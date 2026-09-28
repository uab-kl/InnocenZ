import { describe, expect, it, vi } from 'vitest';

vi.mock('@/env', () => ({
  env: {
    R2_BUCKET_NAME: 'innocenz',
    R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
    R2_PUBLIC_URL: 'https://pub-abc.r2.dev',
  },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isSensitiveR2Key, r2KeyFromSignedUrl, r2KeyFromStoredRef } from './r2';
import { signSensitiveRefs } from './sign-private-refs';

const IC = 'user/pr/vicky-93ea08b0/ic-docs/id-front-1.jpeg';
const RECEIPT = 'user/93ea08b0-1111-4222-8333-944455556666/receipts/drinks/scan-1-0.jpg';
const AVATAR = 'user/pr/vicky-93ea08b0/profile/avatar-1.jpg';
const fakeSign = async (key: string) => `https://innocenz.acct.r2.cloudflarestorage.com/${key}?X-Amz-Signature=abc`;

describe('isSensitiveR2Key', () => {
  it('marks identity documents, money evidence and signed vouchers', () => {
    for (const folder of ['ic-docs', 'id-docs', 'receipts', 'leave', 'disputes', 'pv']) {
      expect(isSensitiveR2Key(`user/pr/x-1/${folder}/f.jpg`)).toBe(true);
      expect(isSensitiveR2Key(`user/93ea08b0/${folder}/f.jpg`)).toBe(true);
    }
  });

  it('leaves what is meant to be seen on the public address', () => {
    for (const key of [AVATAR, 'user/pr/x-1/portfolio/slot-1.jpg', 'user/pr/x-1/comcard/c.png', 'agency/a/logo/l.png']) {
      expect(isSensitiveR2Key(key)).toBe(false);
    }
  });
});

describe('signSensitiveRefs', () => {
  it('signs sensitive keys anywhere in the body and nothing else', async () => {
    const body = {
      success: true,
      data: {
        profile: { idPhotoFront: IC, profileImage: AVATAR },
        lines: [{ proofPhotos: [RECEIPT] }],
        note: 'user/ is just text here',
      },
    };
    const signed = await signSensitiveRefs(body, fakeSign);
    expect(signed.data.profile.idPhotoFront).toBe(await fakeSign(IC));
    expect(signed.data.profile.profileImage).toBe(AVATAR);
    expect(signed.data.lines[0]!.proofPhotos[0]).toBe(await fakeSign(RECEIPT));
    expect(signed.data.note).toBe('user/ is just text here');
  });

  it('signs a legacy full public URL to a sensitive file', async () => {
    const signed = await signSensitiveRefs({ p: `https://pub-abc.r2.dev/${IC}` }, fakeSign);
    expect(signed.p).toBe(await fakeSign(IC));
  });

  it('gives one link per key, so string de-duplication on the client still works', async () => {
    const sign = vi.fn(fakeSign);
    const signed = await signSensitiveRefs({ a: [RECEIPT, RECEIPT], b: RECEIPT }, sign);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(signed.a[0]).toBe(signed.b);
  });

  it('passes Dates and non-plain objects through untouched', async () => {
    const when = new Date('2026-09-28T00:00:00Z');
    const signed = await signSensitiveRefs({ when, n: 3, empty: null }, fakeSign);
    expect(signed.when).toBe(when);
    expect(signed).toMatchObject({ n: 3, empty: null });
  });
});

describe('reading a key back out of a link we issued', () => {
  it('handles both addressing styles', () => {
    expect(r2KeyFromSignedUrl(`https://innocenz.acct.r2.cloudflarestorage.com/${RECEIPT}?X-Amz-Signature=abc`)).toBe(RECEIPT);
    expect(r2KeyFromSignedUrl(`https://acct.r2.cloudflarestorage.com/innocenz/${RECEIPT}?X-Amz-Signature=abc`)).toBe(RECEIPT);
  });

  it('ignores unsigned links and other hosts', () => {
    expect(r2KeyFromSignedUrl(`https://innocenz.acct.r2.cloudflarestorage.com/${RECEIPT}`)).toBeNull();
    expect(r2KeyFromSignedUrl(`https://evil.example/${RECEIPT}?X-Amz-Signature=abc`)).toBeNull();
    expect(r2KeyFromSignedUrl('data:image/png;base64,AAAA')).toBeNull();
  });

  it('is what the stored-ref reader understands too', () => {
    expect(r2KeyFromStoredRef(`https://innocenz.acct.r2.cloudflarestorage.com/${IC}?X-Amz-Signature=abc`)).toBe(IC);
  });
});
