import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  AuditLogRepositoryClass,
  isSensitiveAuditKey,
  omittedBlobLabel,
  redactSensitive,
  sanitiseAuditData,
  stripAuditBlobs,
} from './audit-log.repository';
import type { DbTransaction } from '@/types/db-transaction';

/**
 * A request body carrying a one-time code is written to `audit_logs` by the
 * platform audit middleware. With its request id beside it, a stored code is a
 * replayable proof until the row expires — so `code` is redacted like a password.
 */
describe('audit redaction of account codes', () => {
  it('redacts code, and the password fields of every code flow', () => {
    // ⚠️ `newRequestId` was dropped on 21 Sep 2026 with the identity step — no
    // contact-change body carries a second id any more.
    const body = {
      requestId: '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607',
      kind: 'email',
      value: 'new@x.my',
      code: '123456',
      password: 'hunter22',
      currentPassword: 'old-one',
      newPassword: 'new-one',
    };
    expect(redactSensitive(body)).toEqual({
      requestId: body.requestId,
      kind: 'email',
      value: 'new@x.my',
      code: '[REDACTED]',
      password: '[REDACTED]',
      currentPassword: '[REDACTED]',
      newPassword: '[REDACTED]',
    });
  });

  it('redacts the re-issued tokens in a response', () => {
    const response = { success: true, data: { accessToken: 'a.b.c', refreshToken: 'd.e.f', email: 'x@y.my' } };
    const redacted = redactSensitive(response);
    expect(redacted.data.accessToken).toBe('[REDACTED]');
    expect(redacted.data.refreshToken).toBe('[REDACTED]');
    expect(redacted.data.email).toBe('x@y.my');
  });

  it('lists the keys', () => {
    for (const key of ['code', 'newPassword', 'currentPassword', 'password', 'verificationId']) {
      expect(isSensitiveAuditKey(key)).toBe(true);
    }
  });

  it('blanks the emailed sign-up code and its id (30 Sep 2026) — `code` alone would not match them', () => {
    const redacted = redactSensitive({
      email: 'owner@venue.my',
      emailCodeId: '11111111-2222-4333-8444-555555555555',
      emailCode: '482913',
    });
    expect(redacted).toEqual({ email: 'owner@venue.my', emailCodeId: '[REDACTED]', emailCode: '[REDACTED]' });
  });
});

/**
 * The three spellings found in the live table on 28 Sep 2026 — a plaintext
 * `confirmPassword`, and MFA enrolments carrying `otpauthUrl` — plus the
 * variants of each that a camelCase-only list would also have missed.
 */
describe('audit redaction of credential spellings', () => {
  it('redacts the spellings that leaked', () => {
    const body = {
      confirmPassword: 'hunter22',
      otpauthUrl: 'otpauth://totp/InnocenZ:admin?secret=JBSWY3DPEHPK3PXP',
      secret: 'JBSWY3DPEHPK3PXP',
      mfaCode: '654321',
    };
    const redacted = redactSensitive(body);
    for (const key of Object.keys(body)) {
      expect(redacted[key as keyof typeof body]).toBe('[REDACTED]');
    }
  });

  it('is blind to case and separators', () => {
    for (const key of ['refresh_token', 'ACCESS_TOKEN', 'otpauth_url', 'Confirm-Password', 'mfa_secret']) {
      expect(isSensitiveAuditKey(key)).toBe(true);
    }
  });

  it('catches any key ENDING in password, token or secret', () => {
    for (const key of ['oldPassword', 'repeatPassword', 'resetToken', 'inviteToken', 'clientSecret']) {
      expect(isSensitiveAuditKey(key)).toBe(true);
    }
  });

  it('keeps fields that only mention a credential', () => {
    for (const key of ['passwordChangedAt', 'tokenCount', 'secretaryName', 'email', 'status']) {
      expect(isSensitiveAuditKey(key)).toBe(false);
    }
  });

  it('keeps a boolean or null under a credential-shaped key', () => {
    const row = { hasPassword: true, password: null, token: undefined };
    expect(redactSensitive(row)).toEqual(row);
  });

  it('redacts nested values and whole objects under a credential key', () => {
    const response = {
      data: {
        mfa: { secret: { base32: 'JBSWY3DP', otpauth_url: 'otpauth://…' } },
        user: { email: 'x@y.my', resetToken: 'abc' },
      },
    };
    const redacted = redactSensitive(response);
    expect(redacted.data.mfa.secret).toBe('[REDACTED]');
    expect(redacted.data.user.resetToken).toBe('[REDACTED]');
    expect(redacted.data.user.email).toBe('x@y.my');
  });
});

/**
 * EMBEDDED FILES (12 Nov 2026). 250 live rows held about 112 MB of base64
 * receipt, proof and MC photos copied out of request and response bodies —
 * most of the database. A refused upload still stored its whole request body.
 */
describe('audit stripping of embedded files', () => {
  const photo = `data:image/jpeg;base64,${'A'.repeat(4000)}`;

  it('replaces a data: URL with its size, never its content', () => {
    expect(stripAuditBlobs(photo)).toBe(`[omitted: ${photo.length} bytes]`);
    expect(omittedBlobLabel('data:,hi')).toBe('[omitted: 8 bytes]');
  });

  it('counts bytes, not characters', () => {
    // Two-byte characters: the label is the stored size, which is what the
    // table's growth is measured in.
    expect(omittedBlobLabel('data:text/plain,éé')).toBe('[omitted: 20 bytes]');
  });

  it('reaches every depth and every array the phone sends photos in', () => {
    const response = {
      data: {
        id: 'v-1',
        lines: [{ amount: '50.00', proofPhotos: [photo, 'r2/key/receipt.jpg'] }],
        receipts: [{ receipt: { image: photo } }],
        leaveProofPhotos: [photo],
      },
    };
    const stripped = stripAuditBlobs(response);
    const label = omittedBlobLabel(photo);
    expect(stripped.data.lines[0].proofPhotos).toEqual([label, 'r2/key/receipt.jpg']);
    expect(stripped.data.receipts[0].receipt.image).toBe(label);
    expect(stripped.data.leaveProofPhotos).toEqual([label]);
    expect(stripped.data.lines[0].amount).toBe('50.00');
    expect(stripped.data.id).toBe('v-1');
  });

  it('is case-blind on the scheme, which URLs are', () => {
    expect(stripAuditBlobs('DATA:image/png;base64,iVBOR')).toBe('[omitted: 27 bytes]');
  });

  it('KEEPS long strings that are not data URLs — signature stroke JSON included', () => {
    // 6 live rows carry a signature over 8,000 chars. A size cap would erase
    // them; only the scheme decides.
    const strokes = JSON.stringify(
      Array.from({ length: 100 }, () => Array.from({ length: 20 }, (_, i) => ({ x: i, y: i }))),
    );
    expect(strokes.length).toBeGreaterThan(8192);
    const row = { prSignature: strokes, financeHeadSignature: strokes, note: 'x'.repeat(20000) };
    expect(stripAuditBlobs(row)).toEqual(row);
  });

  it('keeps a note that merely starts with the word', () => {
    expect(stripAuditBlobs('data: see the attached sheet')).toBe('data: see the attached sheet');
    expect(stripAuditBlobs('database migrated')).toBe('database migrated');
    expect(stripAuditBlobs('Mydata:image')).toBe('Mydata:image');
  });

  it('leaves dates, numbers, booleans and nulls exactly as they were', () => {
    const at = new Date('2026-09-08T10:00:00Z');
    const row = { createdAt: at, amount: 12.5, paid: false, note: null, missing: undefined };
    const stripped = stripAuditBlobs(row);
    expect(stripped.createdAt).toBe(at);
    expect(stripped).toEqual(row);
  });

  it('is idempotent, so the clean-up script can re-run', () => {
    const once = stripAuditBlobs({ proofPhotos: [photo] });
    expect(stripAuditBlobs(once)).toEqual(once);
  });

  it('runs with the credential rule, not instead of it', () => {
    expect(sanitiseAuditData({ password: 'hunter22', photo, email: 'x@y.my' })).toEqual({
      password: '[REDACTED]',
      photo: omittedBlobLabel(photo),
      email: 'x@y.my',
    });
  });

  // Review, 12 Nov 2026: the sign-up form posts the logo as bare base64 (no
  // `data:` header), and every refused sign-up stored the whole file.
  it('drops raw base64 under a key ending in base64, at any nesting and case', () => {
    const logo = `/9j/${'A'.repeat(4000)}`;
    expect(stripAuditBlobs({ requestBody: { logoBase64: logo } })).toEqual({
      requestBody: { logoBase64: omittedBlobLabel(logo) },
    });
    expect(stripAuditBlobs({ cover_base64: logo })).toEqual({ cover_base64: omittedBlobLabel(logo) });
    expect(stripAuditBlobs({ photosBase64: [logo, logo] })).toEqual({
      photosBase64: [omittedBlobLabel(logo), omittedBlobLabel(logo)],
    });
  });

  it('keeps a short base64-keyed value, and never judges an unkeyed long string', () => {
    expect(stripAuditBlobs({ logoBase64: 'short' })).toEqual({ logoBase64: 'short' });
    const strokes = JSON.stringify(Array.from({ length: 600 }, (_, i) => ({ x: i, y: i })));
    expect(strokes.length).toBeGreaterThan(8000);
    expect(stripAuditBlobs({ prSignature: strokes })).toEqual({ prSignature: strokes });
    expect(stripAuditBlobs(`/9j/${'A'.repeat(4000)}`)).toBe(`/9j/${'A'.repeat(4000)}`);
  });

  it('the raw-base64 rule is idempotent too', () => {
    const once = stripAuditBlobs({ logoBase64: `/9j/${'A'.repeat(4000)}` });
    expect(stripAuditBlobs(once)).toEqual(once);
  });
});

/**
 * The insert is the one choke point every lane reaches — REST, GraphQL, the
 * withAudit decorator, the failure branches and the scheduler. Driven through
 * a fake transaction so the row it would write can be read back.
 */
describe('createAuditLog strips embedded files from every column it writes', () => {
  function capture() {
    const written: Record<string, unknown>[] = [];
    const tx = {
      insert: () => ({
        values: (row: Record<string, unknown>) => {
          written.push(row);
          return { returning: async () => [row] };
        },
      }),
    } as unknown as DbTransaction;
    return { tx, written };
  }

  const photo = `data:image/png;base64,${'B'.repeat(2048)}`;
  const label = omittedBlobLabel(photo);

  it('old_data and new_data on a successful write', async () => {
    const { tx, written } = capture();
    await new AuditLogRepositoryClass().createAuditLog(
      {
        action: 'UPDATE',
        entity: 'shift-assignment',
        oldData: { leaveProofPhotos: [photo] },
        newData: { leaveProofPhotos: [photo], status: 'leave_requested' },
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      },
      tx,
    );
    expect(written[0]?.oldData).toEqual({ leaveProofPhotos: [label] });
    expect(written[0]?.newData).toEqual({ leaveProofPhotos: [label], status: 'leave_requested' });
  });

  it('the requestBody a FAILED write stores — the lane that kept growing', async () => {
    const { tx, written } = capture();
    await new AuditLogRepositoryClass().createAuditLog(
      {
        action: 'CREATE_FAILED',
        entity: 'payment-voucher',
        newData: {
          requestBody: { lines: [{ proofPhotos: [photo, photo] }], password: 'x' },
          responseBody: { success: false, message: 'Too many photos' },
          statusCode: 400,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
      },
      tx,
    );
    expect(written[0]?.newData).toEqual({
      requestBody: { lines: [{ proofPhotos: [label, label] }], password: '[REDACTED]' },
      responseBody: { success: false, message: 'Too many photos' },
      statusCode: 400,
    });
  });
});
