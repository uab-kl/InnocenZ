import { Request, Response, NextFunction } from 'express';
import { authRepository } from '@/composition-root.js';

/**
 * Marks a request as coming from an outlet and nothing more, so the response
 * boundary can drop the identity documents from any user-shaped payload.
 *
 * OWNER DECISION (30 Jul 2026): an outlet may see WHO is working at its venue,
 * not who they are. Coordinates stay closed (that call was made when
 * `shift-assignment/attendance-fixes` was gated to admin+agency) and IC number,
 * date of birth, home address and both sides of the ID photo now go with them.
 *
 * A GATE was the wrong instrument here and was considered first. `GET /user` is
 * how the venue Today and History screens resolve PR display names, so removing
 * outlet from the role guard blanks the names on two live screens. The fix is
 * the SHAPE of the response, which is why this sets a flag rather than a 403 —
 * the note in `user.routes.ts` has said so since the password-hash fix.
 *
 * Three properties worth keeping:
 *  1. Admin and agency are untouched. Holding either role clears the flag, even
 *     alongside an outlet role, because those two already read this data
 *     legitimately.
 *  2. It never denies. A failure to resolve roles redacts — the safe direction —
 *     rather than 500ing a screen that only wanted a name.
 *  3. Reading your OWN record is exempt, applied at the route. A PR opening
 *     their own profile must still see their own IC.
 */
export async function redactIdentityDocsForOutlet(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const user = req.user;
  if (!user) return next(); // authenticateJWT decides that, not this.

  try {
    const roles = await authRepository.getRolesForUserIds([user.id]);
    const roleNames = roles.map((r) => r.roleName);
    const privileged = roleNames.includes('admin') || roleNames.includes('agency');
    req.redactIdentityDocs = !privileged && roleNames.includes('outlet');
  } catch {
    // Fail CLOSED: if we cannot prove the caller is allowed the documents, do
    // not send them.
    req.redactIdentityDocs = true;
  }

  return next();
}
