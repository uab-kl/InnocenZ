import { Request, Response } from 'express';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { OrgScope, resolveOrgScope } from '@/util/org-scope';
import { BlockPrDaySchema, PrAvailabilityRangeSchema } from '@/schema/pr-availability.schema';
import { PrAvailabilityWithPrType } from './pr-availability.model';
import { PrAvailabilityRepositoryClass } from './pr-availability.repository';

export class PrAvailabilityControllerClass {
  constructor(
    private prAvailabilityRepository: PrAvailabilityRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
  ) {}

  private resolveScope(req: Request): Promise<OrgScope> {
    return resolveOrgScope(req, {
      authRepository: this.authRepository,
      agencyMemberRepository: this.agencyMemberRepository,
      outletMemberRepository: this.outletMemberRepository,
    });
  }

  /** The signed-in PR's own blocked days. Scoped to the token, never to a query param. */
  async listMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const parsed = PrAvailabilityRangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const rows = await this.prAvailabilityRepository.listForUser({
        userId,
        from: parsed.data.from,
        to: parsed.data.to,
      });
      res.status(200).json({ success: true, message: 'OK', data: rows });
    } catch (error) {
      logger.error('[PrAvailabilityController.listMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The PR marks one day unavailable.
   *
   * Refused when they are already working that day: the way out of a booked
   * shift is to cancel it or request leave, and letting a block stand in for
   * either would drop them off a roster the agency is still counting on with no
   * cancellation, no fee and no notification.
   */
  async blockMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const parsed = BlockPrDaySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const { date, reason } = parsed.data;

      const booked = await this.prAvailabilityRepository.hasLiveAssignmentOn({ userId, date });
      if (booked) {
        return res.status(409).json({
          success: false,
          message: 'You are already rostered that day — cancel the shift or request leave instead',
          data: null,
        });
      }

      const row = await this.prAvailabilityRepository.block({
        userId,
        unavailableDate: date,
        reason: reason ?? null,
        actor: getActor(req),
      });
      res.status(201).json({ success: true, message: 'Day marked unavailable', data: row });
    } catch (error) {
      logger.error('[PrAvailabilityController.blockMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** The PR reopens a day they had blocked. */
  async unblockMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const parsed = BlockPrDaySchema.safeParse({ date: req.params.date });
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const removed = await this.prAvailabilityRepository.unblock({
        userId,
        unavailableDate: parsed.data.date,
      });
      if (!removed) {
        return res.status(404).json({ success: false, message: 'That day was not marked unavailable', data: null });
      }
      res.status(200).json({ success: true, message: 'Day reopened', data: { date: parsed.data.date } });
    } catch (error) {
      logger.error('[PrAvailabilityController.unblockMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Blocked days across the calling agency's own roster, for the week grid.
   *
   * Agency (or admin) only, and scoped through `agency_pr` in the repository —
   * `pr_availability` has no `agency_id` to filter on, so the membership join IS
   * the scope. An outlet is not a reader: a PR's private calendar is their
   * agency's staffing concern, and the venue only ever sees the roster it
   * settles into.
   */
  async listForAgency(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }
      const parsed = PrAvailabilityRangeSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      // An admin may name an agency; anyone else gets their own, ignoring the
      // query entirely. Without the agency resolved there is nothing to scope
      // by, so an admin who names none gets an empty list rather than a read of
      // every PR's calendar on the platform.
      const agencyId = scope.isAdmin ? (req.query.agencyId as string | undefined) : scope.agencyId;
      if (!agencyId) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      const [rows, committedElsewhere] = await Promise.all([
        this.prAvailabilityRepository.listForAgency({
          agencyId,
          from: parsed.data.from,
          to: parsed.data.to,
          userId: req.query.prId as string | undefined,
        }),
        // THE DAY BELONGS TO THE PR. A day this PR already works for another agency is
        // unavailable to this one, and it arrives here as an ordinary block so the
        // picker greys it with the wording it already has — see the repository note on
        // why the two must stay indistinguishable.
        this.prAvailabilityRepository.listCommittedElsewhere({
          agencyId,
          from: parsed.data.from,
          to: parsed.data.to,
          userId: req.query.prId as string | undefined,
        }),
      ]);

      // A day already blocked by hand wins: it is a real row with the PR's own reason,
      // and replacing it with a derived stand-in would throw those words away.
      //
      // ⚠️ THE FIELD IS `unavailableDate`, NOT `date` — both halves of this merge
      // had it wrong, and the mistake was invisible twice over. The `as {...}`
      // casts asserted a shape the row does not have, so `tsc` had nothing to
      // object to; and the runtime failure is silent, because a derived entry
      // arrived carrying `unavailableDate: undefined`, `blockedDatesByPr` added
      // `undefined` to the set, and no calendar day ever matched it. The whole
      // committed-elsewhere feature was wired end to end and greyed nothing.
      const declared = new Set(rows.map((r) => `${r.userId}|${r.unavailableDate}`));
      // Typed as the REAL row type on purpose. Every field a `pr_availability`
      // row has must be present and of the right type here, and now the compiler
      // is the one enforcing it — the previous version of this object type-checked
      // happily while being null in five places.
      //
      // ⚠️ EVERY FIELD BELOW EXCEPT `reason` WAS `null`, AND THAT WAS THE BUG. The
      // nulls were meant to make a derived entry look like a real row and did the
      // exact opposite: `created_at`, `updated_at`, `created_by` and `updated_by`
      // are all NOT NULL with defaults in the live schema (checked against
      // information_schema, and no live row is null in any of them), and `prName`
      // is coalesced to 'PR'. A genuine block therefore CANNOT be null in any of
      // the five, so `row.createdAt === null` answered "is this a rival's booking?"
      // with perfect accuracy — a cleaner probe than the one this merge exists to
      // prevent.
      //
      // ⚠️ KEY ORDER IS PART OF THE SHAPE. `prName` goes LAST because the declared
      // half is built as `{ ...row, prName }`, which appends it after the table's
      // own columns. Placing it anywhere else here left `JSON.stringify` emitting
      // two visibly different objects, and the raw response in a network tab
      // separated the sets without a single value being read.
      const derived: PrAvailabilityWithPrType[] = committedElsewhere
        .filter((c) => !declared.has(`${c.userId}|${c.date}`))
        .map((c) => ({
          // Uuid-shaped and stable across polls; see `derivedBlockId`. The old
          // value was the literal string `derived-<user>-<date>`.
          id: c.id,
          userId: c.userId,
          // The repository returns this column as `date`; the WIRE name is
          // `unavailableDate`, because that is what a real `pr_availability` row
          // is called and a derived block has to be indistinguishable from one.
          unavailableDate: c.date,
          // The ONE field that stays null, and the only one that may: the column
          // itself is nullable and most live declared rows are null in it, so a
          // reader who finds no reason has learned nothing.
          reason: null,
          // When the day actually stopped being free, taken from the underlying
          // assignment. Stable across requests, which `new Date()` would not be:
          // derived rows advancing on every poll while declared ones stand still
          // is the old null tell wearing a clock. These name no agency, no outlet
          // and no shift — only an instant, which is exactly what a declared row's
          // timestamps disclose about it too.
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          // The PR's OWN user id, which is what every real row here holds:
          // `blockMine` is the only writer and stamps `getActor`, i.e. the
          // signed-in PR. It is also the only safe answer — the literally truthful
          // one, the rival agency's id, would not merely be a tell, it would hand
          // over the exact fact being withheld.
          createdBy: c.userId,
          updatedBy: c.userId,
          // Same expression the declared half renders (see `prDisplayNameSql`), so
          // the two halves cannot disagree about what to call the same person.
          prName: c.prName,
        }));

      // ONE list, sorted as one. `[...rows, ...derived]` shipped every declared
      // block ahead of every derived one, so POSITION answered the question the
      // null fields used to: a 14 Aug row sitting after a 20 Aug row was a rival's
      // booking, no field inspection required. Sorting both halves on the same key
      // makes a row's index say nothing about where it came from.
      const merged = [...rows, ...derived].sort(
        (a, b) =>
          a.unavailableDate.localeCompare(b.unavailableDate) ||
          a.userId.localeCompare(b.userId) ||
          a.id.localeCompare(b.id),
      );

      res.status(200).json({ success: true, message: 'OK', data: merged });
    } catch (error) {
      logger.error('[PrAvailabilityController.listForAgency] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
