import { describe, expect, it, vi } from 'vitest';

vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { Request, Response } from 'express';
import { NotificationControllerClass } from './notification.controller';
import type { NotificationRepositoryClass } from './notification.repository';

/**
 * `POST /notification/read-all` — the write behind every bell's "Mark all read".
 *
 * The PR app's badge sat at 50 because "Mark all read" could only reach the 50
 * rows it had loaded. This pins that the new route clears the CALLER's unread
 * rows — whoever that is, and never an id the caller supplied.
 */

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function setup(markAllRead: (userId: string) => Promise<number | null>) {
  const repository = { markAllRead: vi.fn(markAllRead) };
  const controller = new NotificationControllerClass(
    repository as unknown as NotificationRepositoryClass,
  );
  return { controller, repository };
}

describe('markAllRead', () => {
  it('clears the signed-in user\'s unread rows and answers how many', async () => {
    const { controller, repository } = setup(async () => 64);
    const res = fakeRes();

    await controller.markAllRead(
      { user: { id: 'pr-user' }, params: {}, body: { userId: 'someone-else' } } as unknown as Request,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, data: { updated: 64 } });
    // The id is the session's — a body naming someone else changes nothing.
    expect(repository.markAllRead).toHaveBeenCalledWith('pr-user');
  });

  it('no session: 401 and nothing written', async () => {
    const { controller, repository } = setup(async () => 0);
    const res = fakeRes();

    await controller.markAllRead({ params: {} } as unknown as Request, res as unknown as Response);

    expect(res.statusCode).toBe(401);
    expect(repository.markAllRead).not.toHaveBeenCalled();
  });

  it('a failed write is a 500, never a silent "0 cleared"', async () => {
    const { controller } = setup(async () => null);
    const res = fakeRes();

    await controller.markAllRead(
      { user: { id: 'pr-user' }, params: {} } as unknown as Request,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ success: false });
  });
});
