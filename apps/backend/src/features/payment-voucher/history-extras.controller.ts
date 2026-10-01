import type { Request, Response } from 'express';
import { Error } from '@/error/index';
import { logger } from '@/util/logger';
import { pickAgencyId } from '@/util/org-scope.js';
import type { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import type { HistoryExtrasRepositoryClass } from './history-extras.repository';
import { computeHistoryExtras, HistoryExtrasQuerySchema } from './history-extras';

/**
 * `GET /payment-voucher/history-extras?fromDate=&toDate=` — the commission per
 * assignment and the penalty per voucher the agency History's take-home needs,
 * for one ledger window, in one read (history-extras.ts says what and why).
 *
 * GUARD: exactly the agency's voucher LIST read — the router-wide
 * `requireRole('admin', 'agency')` and nothing narrower, so every lane that can
 * list the vouchers these figures come from (and open each one) can read them.
 *
 * SCOPE: the ACTING agency, resolved from the caller's own active membership by
 * `pickAgencyId` — the function the list's `resolveScope` uses for every
 * non-admin caller, so for an agency member the two answer for the same
 * agency. Never from the request: there is no `agencyId` parameter, and one
 * sent is ignored. That holds for an admin too, and is where the two part: the
 * list reads platform-wide for an admin (or `?agencyId=`), while this aggregate
 * answers only for an agency the admin is an active member of, and refuses an
 * admin with none.
 */
export class HistoryExtrasControllerClass {
  constructor(
    private readonly historyExtrasRepository: Pick<HistoryExtrasRepositoryClass, 'readRows'>,
    private readonly agencyMemberRepository: Pick<AgencyMemberRepositoryClass, 'listByUser'>,
  ) {}

  async get(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const memberships = userId
        ? await this.agencyMemberRepository.listByUser(userId)
        : [];
      const agencyId = pickAgencyId(req, memberships);
      if (!agencyId) {
        return res.status(403).json({
          success: false,
          message: 'No agency associated with this account',
          data: null,
        });
      }

      const parsed = HistoryExtrasQuerySchema.safeParse({
        fromDate: req.query.fromDate,
        toDate: req.query.toDate,
      });
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid date window',
          data: null,
        });
      }

      const window = parsed.data;
      const rows = await this.historyExtrasRepository.readRows(agencyId, window);
      return res.status(200).json({
        success: true,
        message: 'OK',
        data: { ...window, ...computeHistoryExtras(rows, window) },
      });
    } catch (error) {
      logger.error('[HistoryExtrasController.get] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}
