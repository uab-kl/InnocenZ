import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { Error } from '@/error/index.js';
import { suspendedOrgBlock } from '@/features/auth/org-status.js';

const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: Error.UNAUTHORIZED });
  }

  try {
    const user = await authRepository.getUserDataByToken(token);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ message: Error.UNAUTHORIZED });
    }
    // Suspending an organisation has to kill the sessions already open inside
    // it, not merely refuse the next login — otherwise anyone holding a token
    // at the moment of suspension keeps working until it expires, which for a
    // finance user means they can still raise payment vouchers.
    //
    // This matches how a disabled USER is already handled here: the account is
    // re-read on every request rather than trusted from the token, so that cost
    // is already being paid and this rides along with it.
    if (await suspendedOrgBlock(user.id)) {
      return res.status(401).json({ message: Error.UNAUTHORIZED });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: Error.UNAUTHORIZED });
  }
};

export default authenticateJWT;
