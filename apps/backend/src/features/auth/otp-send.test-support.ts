/**
 * In-memory fakes for the `POST /auth/otp/send` tests (otp-send-channels,
 * otp-send-timing).
 *
 * Deliberately NOT named `*.test.ts`, so vitest does not run it as a suite. The
 * importing test file declares the module mocks (db, env, logger, the WhatsApp
 * and mail clients) before it imports this.
 */
import { vi } from 'vitest';
import type { Request, Response } from 'express';
import type { UserType } from '@/features/user/user.model';
import type { DeliverCodeInput, DeliverCodeResult } from '@/features/account-code/delivery';
import { OtpControllerClass, type OtpControllerOptions } from './otp.controller';

export const NOW = Date.parse('2026-09-21T10:00:00.000Z');

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
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    createdBy: 'system',
    updatedBy: 'system',
    ...overrides,
  } as UserType;
}

export type FakeRes = Response & {
  statusCode: number;
  body: { success: boolean; message: string; data: any };
  /** The clock when the answer was written; null until it is. */
  answeredAt: number | null;
};

/** A response that keeps what it was told — and, on `events`, WHEN in the request it was told. */
export function fakeRes(clock: () => number = Date.now, events: string[] = []): FakeRes {
  const res = {
    statusCode: 0,
    body: null as unknown,
    answeredAt: null as number | null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      res.answeredAt = clock();
      events.push('answer');
      return res;
    },
  };
  return res as unknown as FakeRes;
}

export type SetupOptions = {
  byLoginMethod?: (method: 'email' | 'phone') => UserType | null;
  /**
   * Overrides for the controller. By default the work after an answer is
   * COLLECTED rather than run (see `settle`), and there is no sign-up floor.
   * Pass `runAfterAnswer: undefined` for production's fire-and-forget.
   */
  controller?: OtpControllerOptions;
};

type Row = Record<string, unknown>;

export function setup(options: SetupOptions = {}) {
  const now = options.controller?.now ?? Date.now;
  const rows = new Map<string, Row>();
  /** What happened, in order: the lookups, the answer, the code row's reads and writes, the send. */
  const events: string[] = [];
  /** Work the controller handed over after answering, not yet run. */
  const afterAnswer: Array<() => Promise<void>> = [];
  let seq = 0;

  const pendingFor = (phoneNum: string, purpose: string) =>
    [...rows.values()].filter(
      (row) => row.phoneNum === phoneNum && row.purpose === purpose && row.status === 'pending',
    );

  const phoneVerificationRepository = {
    findActivePending: vi.fn(async (phoneNum: string, purpose: string): Promise<Row | null> => {
      events.push('findActivePending');
      return pendingFor(phoneNum, purpose).at(-1) ?? null;
    }),
    expirePendingForPhone: vi.fn(async (phoneNum: string, purpose: string): Promise<void> => {
      events.push('expirePendingForPhone');
      for (const row of pendingFor(phoneNum, purpose)) row.status = 'expired';
    }),
    create: vi.fn(async (data: Row): Promise<Row | null> => {
      events.push('create');
      seq += 1;
      const row = { id: `row-${seq}`, createdAt: new Date(now()), ...data };
      rows.set(row.id, row);
      return row;
    }),
    update: vi.fn(async (id: string, data: Row): Promise<Row | null> => {
      events.push('update');
      const row = rows.get(id);
      if (!row) return null;
      Object.assign(row, data);
      return row;
    }),
    /** The repository's capped increment: counted while below `max`, else null. */
    countFailedAttempt: vi.fn(async (id: string, max: number): Promise<Row | null> => {
      events.push('countFailedAttempt');
      const row = rows.get(id);
      if (!row || Number(row.attempts ?? 0) >= max) return null;
      row.attempts = Number(row.attempts ?? 0) + 1;
      return row;
    }),
  };
  const userRepository = {
    getUserByLoginMethod: vi.fn(async (method: 'email' | 'phone') => {
      events.push(`lookup:${method}`);
      return options.byLoginMethod ? options.byLoginMethod(method) : null;
    }),
  };
  /** Reports every destination it was handed as sent — see account-code/fakes.test-support. */
  const deliver = vi.fn(async (input: DeliverCodeInput): Promise<DeliverCodeResult> => {
    events.push('deliver');
    const sentTo: DeliverCodeResult['sentTo'] = [];
    if (input.phone) {
      sentTo.push({ channel: 'whatsapp', to: `phone:${input.phone}`, status: 'sent' });
      sentTo.push({ channel: 'sms', to: `phone:${input.phone}`, status: 'sent' });
    }
    if (input.email) sentTo.push({ channel: 'email', to: `email:${input.email}`, status: 'sent' });
    return { sentTo, ok: sentTo.length > 0, waMessageId: null };
  });

  const controller = new OtpControllerClass(
    phoneVerificationRepository as never,
    userRepository as never,
    {
      deliver,
      runAfterAnswer: (task) => {
        afterAnswer.push(task);
      },
      signupAnswerFloorMs: 0,
      ...options.controller,
    },
  );

  const send = async (body: unknown) => {
    const res = fakeRes(now, events);
    await controller.send({ body } as unknown as Request, res);
    return res;
  };

  const verify = async (body: unknown) => {
    const res = fakeRes(now, events);
    await controller.verify({ body } as unknown as Request, res);
    return res;
  };

  /** Runs the work handed over after the answers so far — together, as production would, but awaited. */
  const settle = async () => {
    while (afterAnswer.length > 0) {
      await Promise.all(afterAnswer.splice(0).map((task) => task()));
    }
  };

  return {
    controller,
    send,
    verify,
    settle,
    afterAnswer,
    events,
    deliver,
    rows,
    phoneVerificationRepository,
    userRepository,
  };
}

/** The destinations `deliver` was handed on call `n`. */
export function delivered(deliver: ReturnType<typeof setup>['deliver'], n = 0) {
  return deliver.mock.calls[n]?.[0] as DeliverCodeInput;
}
