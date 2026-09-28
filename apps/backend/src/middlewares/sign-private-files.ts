import type { NextFunction, Request, Response } from 'express';
import { logger } from '@/util/logger';
import { r2Configured } from '@/util/r2';
import { signSensitiveRefs } from '@/util/sign-private-refs';

/**
 * Sends every JSON response with its sensitive file references signed — see
 * `signSensitiveRefs`. A no-op when R2 is not configured (local development
 * stores nothing there, so there is nothing to sign).
 *
 * ⚠️ MOUNT IT BEFORE `platformAuditMiddleware`. Both wrap `res.json`, and the
 * one mounted LATER runs FIRST: mounted in this order, the audit records the
 * body with plain keys and the client alone receives the links. The other way
 * round, the audit log would fill with signed URLs — short-lived credentials.
 *
 * If signing fails the body goes out unsigned rather than not at all: a screen
 * missing its photos beats a request that never answers, and the failure is
 * logged loudly because an unsigned key is useless once the bucket is private.
 */
export function signPrivateFiles(_req: Request, res: Response, next: NextFunction): void {
  if (!r2Configured()) {
    next();
    return;
  }
  const send = res.json.bind(res);
  res.json = ((body: unknown) => {
    signSensitiveRefs(body).then(
      (signed) => send(signed),
      (error) => {
        logger.error('[sign-private-files] could not sign file links — sent unsigned', error);
        send(body);
      },
    );
    return res;
  }) as Response['json'];
  next();
}
