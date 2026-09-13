import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';
import { Error } from '@/error/index.js';
import { suspendedOrgBlock } from '@/features/auth/org-status.js';
import { isTokenBeforeCutoff } from '@/features/auth/session-cutoff.js';

const authenticateJWT = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: Error.UNAUTHORIZED });
  }

  try {
    const session = await authRepository.getSessionByToken(token);
    if (!session || session.user.status !== 'active') {
      return res.status(401).json({ message: Error.UNAUTHORIZED });
    }
    /*
     * 🔴 A REFRESH TOKEN IS NOT A KEY TO THE API.
     *
     * Both generators signed the identical payload, so `verifyToken` — which
     * checks signature, algorithm and expiry and nothing else — accepted either
     * one anywhere. Proved against the running server: `GET /auth/me` answered
     * 200 for a refresh token. The web app keeps that value in `localStorage`,
     * so the 15-minute access-token life bought nothing; whoever could read it
     * held seven days of full access.
     *
     * No client has ever SENT one as `Authorization` — web reads it only to
     * check presence, mobile stores just the access token — so refusing it here
     * breaks nothing that works today.
     */
    if (session.isRefresh) {
      return res.status(401).json({ message: Error.UNAUTHORIZED });
    }
    const { user } = session;

    /*
     * 🔴 A PASSWORD CHANGE ENDS THE SESSIONS THAT PASSWORD OPENED.
     *
     * The token is a stateless JWT with no id and no revocation list, so before
     * this a reset returned 200 while every token already issued kept working
     * for its full lifetime. Somebody resetting a password because a device was
     * stolen was told it had worked while the other session stayed live.
     *
     * STRICTLY EARLIER, because `iat` has second precision: a token minted in
     * the same second as the change must survive, or a person changing their
     * own password logs themselves out with the very token they were just
     * issued.
     *
     * A missing `iat` means the token cannot be dated, and an undatable token
     * is LET THROUGH rather than refused — refusing it would sign out every
     * holder of a token minted before this shipped. `sessions_valid_from` is
     * NULL for every account until its password changes, so that window is
     * already narrow.
     */
    if (isTokenBeforeCutoff(session.issuedAt, user.sessionsValidFrom)) {
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
