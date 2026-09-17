import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { resolveApiSessionUser } from '@/features/auth/session-guard.js';

/**
 * Populates req.user when the caller happens to be signed in, and lets the
 * request through when they are not.
 *
 * This exists for routes that serve both a public caller (no token) and a
 * signed-in one — POST /auth/register (a public sign-up, or an admin creating
 * another admin) and the invite accept. The ordinary authenticateJWT cannot be
 * used there — it 401s the moment a token is missing, which is the normal case
 * for a sign-up form.
 *
 * It is NOT a guard. Anything downstream that cares must check req.user itself;
 * a request with no token, an expired token or a suspended user all arrive here
 * looking identical to an anonymous one, which is the safe reading.
 *
 * ⚠️ It applies EXACTLY the session rules authenticateJWT does (refresh token
 * refused, `sessions_valid_from` cutoff, suspended organisation) through the
 * shared `resolveApiSessionUser`. It used to check the signature and the
 * account status only, so a refresh token or a session cut by a password change
 * still counted as signed in here — including as an ADMIN on /auth/register.
 */
const optionalAuthenticateJWT = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return next();

  const user = await resolveApiSessionUser(token, { sessions: authRepository });
  if (user) req.user = user;

  next();
};

export default optionalAuthenticateJWT;
