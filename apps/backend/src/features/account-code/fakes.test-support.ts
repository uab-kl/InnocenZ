/**
 * In-memory fakes for the account-code controller tests.
 *
 * Deliberately NOT named `*.test.ts`, so vitest does not run it as a suite; it
 * is imported by the three controller tests only and never by production code.
 */
import { vi } from 'vitest';
import type { Request, Response } from 'express';
import type {
  PhoneVerification,
  PhoneVerificationPurpose,
  PhoneVerificationStatus,
} from '@/features/auth/phone-verification.model.js';
import type { UserType } from '@/features/user/user.model.js';
import type { CodeRowStore, NewCodeRow } from './shared.js';

export const NOW = Date.parse('2026-09-17T10:00:00.400Z');

export function fakeUser(overrides: Partial<UserType> = {}): UserType {
  return {
    id: 'user-1',
    email: 'owner@atlas-agency.my',
    phoneNum: '+60123456789',
    profileImage: null,
    username: 'Owner',
    memberCode: 'INNUSR0001',
    passwordHash: 'hash:old-password',
    status: 'active',
    preferredLocale: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    blockedReason: null,
    sessionsValidFrom: null,
    createdAt: new Date(NOW - 86_400_000),
    updatedAt: new Date(NOW - 86_400_000),
    createdBy: 'system',
    updatedBy: 'system',
    ...overrides,
  };
}

export function fakeCodeStore() {
  const rows = new Map<string, PhoneVerification>();
  let seq = 0;

  const store = {
    rows,
    create: vi.fn(async (data: NewCodeRow) => {
      seq += 1;
      const row: PhoneVerification = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        phoneNum: data.phoneNum,
        codeHash: data.codeHash,
        channel: data.channel ?? 'whatsapp',
        purpose: (data.purpose ?? 'signup') as PhoneVerificationPurpose,
        status: (data.status ?? 'pending') as PhoneVerificationStatus,
        attempts: data.attempts ?? 0,
        expiresAt: data.expiresAt,
        verifiedAt: data.verifiedAt ?? null,
        waMessageId: data.waMessageId ?? null,
        createdAt: new Date(NOW),
        updatedAt: new Date(NOW),
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
      };
      rows.set(row.id, row);
      return row;
    }),
    getById: vi.fn(async (id: string) => rows.get(id) ?? null),
    update: vi.fn(async (id: string, data: Partial<PhoneVerification>) => {
      const row = rows.get(id);
      if (!row) return null;
      Object.assign(row, data);
      return row;
    }),
    countFailedAttempt: vi.fn(async (id: string, max: number) => {
      const row = rows.get(id);
      if (!row || row.attempts >= max) return null;
      row.attempts += 1;
      return row;
    }),
    transition: vi.fn(
      async (id: string, from: PhoneVerificationStatus, data: Partial<PhoneVerification>) => {
        const row = rows.get(id);
        if (!row || row.status !== from) return null;
        Object.assign(row, data);
        return row;
      },
    ),
    findNewestByCreator: vi.fn(
      async (
        userId: string,
        purposes: readonly PhoneVerificationPurpose[],
        statuses?: readonly PhoneVerificationStatus[],
      ) => {
        const matching = [...rows.values()]
          .filter(
            (r) =>
              r.createdBy === userId &&
              purposes.includes(r.purpose) &&
              (!statuses || statuses.includes(r.status)),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matching[0] ?? null;
      },
    ),
    expireOpenForCreator: vi.fn(
      async (
        userId: string,
        purposes: readonly PhoneVerificationPurpose[],
        statuses: readonly PhoneVerificationStatus[],
      ) => {
        for (const row of rows.values()) {
          if (row.createdBy === userId && purposes.includes(row.purpose) && statuses.includes(row.status)) {
            row.status = 'expired';
          }
        }
      },
    ),
  };
  return store satisfies CodeRowStore;
}

export function fakeReq(body: unknown, user?: UserType, bearer?: string): Request {
  return {
    body,
    user,
    header: (name: string) =>
      name.toLowerCase() === 'authorization' && bearer ? `Bearer ${bearer}` : undefined,
  } as unknown as Request;
}

export type FakeRes = Response & { statusCode: number; body: { success: boolean; message: string; data: any } };

export function fakeRes(): FakeRes {
  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
      return res;
    },
  };
  return res as unknown as FakeRes;
}

/** A `deliver` that reports every destination it was given as sent. */
export function fakeDeliver(ok = true) {
  return vi.fn(async (input: { phone?: string | null; email?: string | null }) => {
    const sentTo: Array<{ channel: 'whatsapp' | 'sms' | 'email'; to: string; status: 'sent' | 'failed' }> = [];
    const status = ok ? 'sent' : 'failed';
    if (input.phone) {
      sentTo.push({ channel: 'whatsapp', to: `phone:${input.phone}`, status });
      sentTo.push({ channel: 'sms', to: `phone:${input.phone}`, status });
    }
    if (input.email) sentTo.push({ channel: 'email', to: `email:${input.email}`, status });
    return { sentTo, ok, waMessageId: null };
  });
}

export function fakeNotices() {
  return {
    passwordChanged: vi.fn(async () => {}),
    emailChanged: vi.fn(async () => {}),
    phoneChanged: vi.fn(async () => {}),
  };
}

/** Pull the code a fake `deliver` was handed on call `n` (0-based). */
export function deliveredCode(deliver: ReturnType<typeof fakeDeliver>, n = 0): string {
  const call = deliver.mock.calls[n]?.[0] as { code?: string } | undefined;
  if (!call?.code) throw new Error(`no delivery #${n}`);
  return call.code;
}
