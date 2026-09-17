import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { Error } from '@/error/index.js';
import { resolveApiSessionUser } from '@/features/auth/session-guard.js';

/**
 * The hard guard. Every rule a session must pass — active account, not a
 * refresh token, not issued before the account's `sessions_valid_from` (whole
 * seconds), not inside a suspended organisation — lives in ONE place,
 * `resolveApiSessionUser`, shared with `optionalAuthenticateJWT` and the
 * GraphQL context. See that function for why each rule exists.
 */
const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: Error.UNAUTHORIZED });
  }

  const user = await resolveApiSessionUser(token, { sessions: authRepository });
  if (!user) {
    return res.status(401).json({ message: Error.UNAUTHORIZED });
  }
  req.user = user;
  next();
};

export default authenticateJWT;
