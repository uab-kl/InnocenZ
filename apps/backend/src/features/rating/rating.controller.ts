import { Request, Response } from 'express';
import { latestAssignmentFor, RatingRepositoryClass } from './rating.repository.js';
import { RatingFilter } from './rating.model.js';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository.js';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';
import { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import { CreateRatingSchema } from '@/schema/rating.schema.js';
import { Error } from '@/error/index.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { OrgScope, resolveOrgScope, isOutletCaller } from '@/util/org-scope.js';
import { notifyMany } from '@/features/notification/notify.js';

/**
 * Below this average, the agency is told. Mirrors RATING_WARN_THRESHOLD in
 * apps/web/src/agency-portal/lib/agency-pr-flags.ts, where the same number
 * already drives the warning badge — the badge and the notification must not
 * disagree about what "low" means.
 */
const RATING_WARN_THRESHOLD = 3.5;

export class RatingControllerClass {
  constructor(
    private repository: RatingRepositoryClass,
    private prRepository: PrRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
  ) {}

  /**
   * A PR's average rating dropping below the warning line tells their agency.
   *
   * Notify only — no suspension, no block on new assignments. A single harsh
   * rating can drag an average down, and removing someone's income on an
   * arithmetic trigger is a decision a person should make. The agency gets the
   * signal and keeps the judgement.
   *
   * Fires only on the CROSSING. Without that check every subsequent low rating
   * would raise another notification and the bell would become noise the agency
   * learns to ignore — which is the same as not having warned them.
   *
   * Never throws: this runs after the response has gone out, so a failure here
   * must not surface anywhere. The rating itself is already saved.
   */
  private async notifyAgencyIfRatingLow(
    prId: string,
    prName: string,
    shiftAssignmentId: string | null,
    actor: string,
  ): Promise<void> {
    try {
      // Warn exactly the agency that staffed the rated shift — the same one the
      // read scope will let read this rating, so nobody is told about a score
      // they cannot then open. This used to average every rating the PR had
      // anywhere and page `pr.agencyId`, the OLDEST membership, so a PR on two
      // rosters had agency A woken over a shift agency B staffed and handed a
      // figure computed from B's venues.
      //
      // No assignment means nobody may read the rating, so nobody is told.
      const agencyId = await this.repository.agencyForRatedShift(shiftAssignmentId);
      if (!agencyId) return;
      await this.notifyOneAgencyIfRatingLow(agencyId, prId, prName, actor);
    } catch (error) {
      logger.error('[RatingController.notifyAgencyIfRatingLow] Error:', error);
    }
  }

  /** The crossing test for ONE agency, over exactly the rows it may read. */
  private async notifyOneAgencyIfRatingLow(
    agencyId: string,
    prId: string,
    prName: string,
    actor: string,
  ): Promise<void> {
    const ratings = await this.repository.list({ prId, agencySuppliedTo: agencyId });
    if (ratings.length === 0) return;

    const average = ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;
    if (average >= RATING_WARN_THRESHOLD) return;

    // The average BEFORE this rating landed. If it was already below the line
    // the agency has been told; only the crossing is news.
    if (ratings.length > 1) {
      const [newest, ...previous] = [...ratings].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      void newest;
      const previousAverage =
        previous.reduce((sum, r) => sum + r.stars, 0) / previous.length;
      if (previousAverage < RATING_WARN_THRESHOLD) return;
    }

    const members = await this.agencyMemberRepository.listByAgency(agencyId);
    const recipients = members.filter((m) => m.status === 'active');
    if (recipients.length === 0) return;

    await notifyMany(
      recipients.map((m) => m.userId),
      {
        kind: 'pr_rating_low',
        title: `${prName}'s rating has dropped`,
        body: `Average now ${average.toFixed(1)} across ${ratings.length} ratings, below the ${RATING_WARN_THRESHOLD} warning line.`,
        payload: { prId, average, ratingCount: ratings.length },
        actor,
      },
    );
  }

  private resolveScope(req: Request): Promise<OrgScope> {
    return resolveOrgScope(req, {
      authRepository: this.authRepository,
      agencyMemberRepository: this.agencyMemberRepository,
      outletMemberRepository: this.outletMemberRepository,
    });
  }

  /**
   * Pin the caller to the ratings its own org owns. `null` means the account
   * belongs to no org at all, which is a 403 rather than an unscoped read.
   *
   * The role gate in front decides WHO may call this; this decides WHICH rows
   * come back. Without it the shared role would hand every outlet's ratings to
   * every outlet, since `list` takes its filter straight from the query string.
   */
  private async scopedFilter(req: Request, scope: OrgScope): Promise<RatingFilter | null> {
    const outletId = req.query.outletId as string | undefined;
    const prId = req.query.prId as string | undefined;

    if (scope.isAdmin) return { outletId, prId };

    // A venue operator reads the ratings written at its own venues.
    if (isOutletCaller(scope)) return { outletIds: scope.outletIds, outletId, prId };

    // An agency holds no outlet membership, so its link to a rating runs through
    // the work it SOLD: `shift_assignment.agency_id` at the rating's venue, for
    // the rating's PR.
    //
    // Scoping on "my PRs" alone used to be the whole rule, and it leaked. A PR
    // can hold an `agency_pr` row at several agencies at once, so agency A was
    // handed every rating that person earned working through agency B — a score
    // A never earned, and evidence that its PR is on a competitor's roster,
    // which an agency is not supposed to see. `prIds` stays as the second half
    // of the AND: both must hold.
    if (scope.agencyId) {
      const prIds = await this.prRepository.listIdsByAgency(scope.agencyId);
      return { prIds, agencySuppliedTo: scope.agencyId, outletId, prId };
    }

    return null;
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const filter = await this.scopedFilter(req, scope);
      if (!filter) {
        return res.status(403).json({
          success: false,
          message: 'No organization associated with this account',
          data: null,
        });
      }
      const records = await this.repository.list(filter);
      res.status(200).json({ success: true, message: 'OK', data: records });
    } catch (error) {
      logger.error('[RatingController.list] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async upsert(req: Request, res: Response) {
    try {
      const parsed = CreateRatingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      // The route gate says an outlet may rate; this says WHICH outlet. outletId
      // arrives in the request body, so without this an operator at one venue
      // could file a rating under another venue's id — and since the unique key
      // is (outlet, PR), that would overwrite the other venue's real rating.
      const scope = await this.resolveScope(req);
      const ownsOutlet = scope.isAdmin || scope.outletIds.includes(parsed.data.outletId);
      if (!ownsOutlet) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // WHICH shift this verdict is about — the only thing that can name the
      // agency allowed to read it. An explicit id is verified against this
      // (outlet, PR) first: without that check a venue could file a rating
      // against another agency's shift and hand them a score they never earned.
      // Absent, it falls back to the PR's latest night at this venue, which is
      // the shift the post-seal prompt was raised for.
      let shiftAssignmentId = parsed.data.shiftAssignmentId ?? null;
      if (shiftAssignmentId) {
        const owns = await this.repository.assignmentBelongsTo(
          shiftAssignmentId,
          parsed.data.prId,
          parsed.data.outletId,
        );
        if (!owns) {
          return res.status(400).json({
            success: false,
            message: 'That shift does not belong to this PR at this outlet.',
            data: null,
          });
        }
      } else if (parsed.data.shiftId) {
        // The post-seal prompt knows the shift it just sealed, so this is the
        // EXACT night rather than a guess. Pinned to the caller's outlet inside
        // the lookup, so naming another venue's shift resolves to nothing.
        shiftAssignmentId = await this.repository.assignmentForShiftAndPr(
          parsed.data.shiftId,
          parsed.data.prId,
          parsed.data.outletId,
        );
      }

      // Nothing usable was supplied (or the hint did not resolve): fall back to
      // the PR's latest night at this venue. Keeps a verdict attributable —
      // and therefore readable by the agency that earned it — instead of
      // silently landing as NULL, which no agency can ever see.
      if (!shiftAssignmentId) {
        shiftAssignmentId = await latestAssignmentFor(
          parsed.data.prId,
          parsed.data.outletId,
        );
      }

      const actor = getActor(req);
      const record = await this.repository.upsert(
        {
          outletId: parsed.data.outletId,
          prId: parsed.data.prId,
          prName: parsed.data.prName,
          stars: parsed.data.stars,
          note: parsed.data.note,
          tags: parsed.data.tags,
          shiftAssignmentId,
        },
        actor,
      );
      if (!record) {
        return res
          .status(500)
          .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      // Respond first — the rating is saved, and telling the agency must never
      // be able to fail the outlet's write.
      res.status(201).json({ success: true, message: 'Rating saved', data: record });
      void this.notifyAgencyIfRatingLow(
        parsed.data.prId,
        parsed.data.prName,
        record.shiftAssignmentId,
        actor,
      );
    } catch (error) {
      logger.error('[RatingController.upsert] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
