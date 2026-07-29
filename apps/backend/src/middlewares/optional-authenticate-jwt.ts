import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';

/**
 * Populates req.user when the caller happens to be signed in, and lets the
 * request through when they are not.
 *
 * This exists for exactly one route: POST /auth/register, which serves both a
 * public sign-up (no token) and an admin creating another admin (token). The
 * ordinary authenticateJWT cannot be used there — it 401s the moment a token is
 * missing, which is the normal case for a sign-up form.
 *
 * It is NOT a guard. Anything downstream that cares must check req.user itself;
 * a request with no token, an expired token or a suspended user all arrive here
 * looking identical to an anonymous one, which is the safe reading.
 */
const optionalAuthenticateJWT = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return next();

  try {
    const user = await authRepository.getUserDataByToken(token);
    // Same active-status rule as authenticateJWT: a suspended account is not a
    // caller, so it stays anonymous rather than becoming a weaker kind of user.
    if (user && user.status === 'active') req.user = user;
  } catch {
    // A bad token is not an error here — it just means "not signed in".
  }

  next();
};

export default optionalAuthenticateJWT;
