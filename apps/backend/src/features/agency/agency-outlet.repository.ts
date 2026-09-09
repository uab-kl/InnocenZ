import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
  AgencyOutletEventTable,
  AgencyOutletTable,
  type AgencyOutletActorSide,
  type AgencyOutletApproveStatus,
  type AgencyOutletEnriched,
  type AgencyOutletEventEnriched,
  type AgencyOutletType,
  type OutletAgencyLink,
} from '@/features/agency/agency-outlet.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import type { DbTransaction } from '@/types/db-transaction';
import { logger } from '@/util/logger';

/**
 * Agency ↔ outlet linking (`agency_outlet`, migration 0123).
 *
 * Mirrors `AgencyPrRepository` deliberately — same approve/reject vocabulary,
 * same sync semantics — because a venue linking to an agency is the same act as
 * a PR joining one.
 *
 * ⚠️ The two `listApproved*` reads below are the ones that REPLACE
 * `outlet.onboarded_by_agency_id` for routing and visibility. Every caller that
 * used to filter on that column must come through here instead; a reader left
 * behind is the exact failure mode this change has to avoid.
 *
 * ⚠️ NOTHING HERE DELETES A LINK (migration 0127). Unlinking sets
 * `approve_status = 'ended'`, which the `listApproved*` reads already exclude
 * for free. A delete would take the partnership's history with it — the thing
 * someone asks about months later when a payment is disputed — and would leave
 * a returning venue indistinguishable from one the agency has never heard of.
 * Every transition made THROUGH THIS CLASS is written to `agency_outlet_event`
 * in the same transaction as the change, so a status cannot exist without the
 * event that made it.
 *
 * ⚠️ That holds from 0127 onward and NOT retroactively. Links that changed hands
 * before the log existed have no events for those transitions — one live link
 * carries two real human decisions with nothing recorded — so an empty or short
 * timeline is not evidence that nothing happened. Read a gap as "before the
 * log", never as "no transition".
 */
export class AgencyOutletRepository {
  /**
   * Append one transition to the log.
   *
   * Takes the caller's transaction rather than opening its own, and every
   * mutation below passes the one that made the change. Writing the event
   * separately would let the two diverge, and both halves of that divergence
   * are bad: a status with no event is a hole in an audit log, an event with no
   * status is a lie about what happened.
   */
  private async recordEvent(
    tx: DbTransaction,
    event: {
      agencyOutletId: string;
      fromStatus: AgencyOutletApproveStatus | null;
      toStatus: AgencyOutletApproveStatus;
      actorSide: AgencyOutletActorSide;
      actor: string;
      reason?: string | null;
    },
  ): Promise<void> {
    await tx.insert(AgencyOutletEventTable).values({
      agencyOutletId: event.agencyOutletId,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorSide: event.actorSide,
      reason: event.reason?.trim() || null,
      createdBy: event.actor,
      updatedBy: event.actor,
    });
  }

  /**
   * The agency directory an OUTLET may see when choosing who to work with.
   *
   * Deliberately its own narrow projection instead of opening `GET /agency` to
   * outlets. That route is `requireRole('admin','agency')` on purpose — an
   * outlet must not enumerate full agency records, which carry commercial and
   * finance fields. Picking a partner needs three columns; this returns three.
   *
   * Not paginated on purpose: `agency.list()` clamps `pageSize` (asking for 500
   * yields 100 silently), and a picker that quietly omits agencies is worse than
   * a long one. Agencies number in the dozens.
   */
  async listDirectory(): Promise<
    {
      id: string;
      name: string;
      agencyCode: string;
      memberCodePrefix: string | null;
    }[]
  > {
    try {
      return await db
        .select({
          id: AgencyTable.id,
          name: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          memberCodePrefix: AgencyTable.memberCodePrefix,
        })
        .from(AgencyTable)
        .orderBy(AgencyTable.name);
    } catch (error) {
      logger.error('[AgencyOutletRepository.listDirectory] Error:', error);
      return [];
    }
  }

  /** Every agency this outlet is linked to, whatever the state — outlet Settings. */
  async listByOutlet(outletId: string): Promise<OutletAgencyLink[]> {
    try {
      return await db
        .select({
          id: AgencyOutletTable.id,
          agencyId: AgencyOutletTable.agencyId,
          agencyName: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
          memberCodePrefix: AgencyTable.memberCodePrefix,
          approveStatus: AgencyOutletTable.approveStatus,
          rejectReason: AgencyOutletTable.rejectReason,
          // Correlated subqueries, not a join, for the same reason the outlet
          // list uses one: a link has MANY events, and joining them would
          // return the link once per event.
          endedAt: sql<Date | null>`(
            SELECT ev."created_at" FROM "main"."agency_outlet_event" ev
            WHERE ev."agency_outlet_id" = ${AgencyOutletTable.id}
              AND ev."to_status" = 'ended'
            ORDER BY ev."created_at" DESC LIMIT 1
          )`,
          endedBySide: sql<AgencyOutletActorSide | null>`(
            SELECT ev."actor_side" FROM "main"."agency_outlet_event" ev
            WHERE ev."agency_outlet_id" = ${AgencyOutletTable.id}
              AND ev."to_status" = 'ended'
            ORDER BY ev."created_at" DESC LIMIT 1
          )`,
        })
        .from(AgencyOutletTable)
        .innerJoin(AgencyTable, eq(AgencyTable.id, AgencyOutletTable.agencyId))
        .where(eq(AgencyOutletTable.outletId, outletId))
        .orderBy(AgencyTable.name);
    } catch (error) {
      logger.error('[AgencyOutletRepository.listByOutlet] Error:', error);
      return [];
    }
  }

  /**
   * The agencies this outlet may actually post a shift to.
   *
   * Approved only — a pending request is not permission, a rejected one is a
   * refusal, and an `ended` one is a partnership that is over. Post Job
   * validates the outlet's selection against exactly this set, server-side; the
   * client's list is a convenience, never the authority.
   *
   * `ended` needed no new clause here, and that is the argument for modelling
   * it as a status rather than a flag: testing equality against `approved`
   * excludes every non-permission automatically, including ones added later.
   */
  async listApprovedAgencyIdsForOutlet(outletId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ agencyId: AgencyOutletTable.agencyId })
        .from(AgencyOutletTable)
        .where(
          and(
            eq(AgencyOutletTable.outletId, outletId),
            eq(AgencyOutletTable.approveStatus, 'approved'),
          ),
        );
      return rows.map((row) => row.agencyId);
    } catch (error) {
      logger.error('[AgencyOutletRepository.listApprovedAgencyIdsForOutlet] Error:', error);
      return [];
    }
  }

  /**
   * The venues this agency may see. THIS IS THE PORTAL'S VISIBILITY RULE — it
   * replaces `GET /outlet?onboardedByAgencyId=`. Returning too many ids here
   * shows an agency a venue that never invited it.
   */
  async listApprovedOutletIdsForAgency(agencyId: string): Promise<string[]> {
    try {
      const rows = await db
        .select({ outletId: AgencyOutletTable.outletId })
        .from(AgencyOutletTable)
        .where(
          and(
            eq(AgencyOutletTable.agencyId, agencyId),
            eq(AgencyOutletTable.approveStatus, 'approved'),
          ),
        );
      return rows.map((row) => row.outletId);
    } catch (error) {
      logger.error('[AgencyOutletRepository.listApprovedOutletIdsForAgency] Error:', error);
      return [];
    }
  }

  /** This agency's linked venues, narrowed by state / search — Outlet-Linking tab. */
  async listByAgency(
    agencyId: string,
    options: { approveStatus?: AgencyOutletApproveStatus; search?: string } = {},
  ): Promise<AgencyOutletEnriched[]> {
    try {
      const conditions = [eq(AgencyOutletTable.agencyId, agencyId)];
      if (options.approveStatus) {
        conditions.push(eq(AgencyOutletTable.approveStatus, options.approveStatus));
      }
      if (options.search?.trim()) {
        const term = `%${options.search.trim()}%`;
        conditions.push(or(ilike(OutletTable.name, term), ilike(OutletTable.city, term))!);
      }

      return await db
        .select({
          id: AgencyOutletTable.id,
          agencyId: AgencyOutletTable.agencyId,
          outletId: AgencyOutletTable.outletId,
          outletName: OutletTable.name,
          approveStatus: AgencyOutletTable.approveStatus,
          rejectReason: AgencyOutletTable.rejectReason,
          city: OutletTable.city,
          state: OutletTable.state,
          addressLine1: OutletTable.addressLine1,
          addressLine2: OutletTable.addressLine2,
          postcode: OutletTable.postcode,
          country: OutletTable.country,
          logoImage: OutletTable.logoImage,
          // The VENUE's status, not the link's — see the model comment. Aliased
          // because `approveStatus` above is already "status" on this row and
          // two fields called the same thing is how the wrong one gets read.
          outletStatus: OutletTable.status,
          ssmNo: OutletTable.ssmNo,
          businessLicense: OutletTable.businessLicense,
          // "Carried over by the backfill and never actually asked for."
          //
          // ⚠️ `created_by` ALONE does not answer this, and believing it did was
          // a real bug: it records where the ROW came from and never changes, so
          // once 0127 made a link re-requestable, a backfilled partnership that
          // was ended and then genuinely asked for again came back as `pending`
          // still flagged as "not a real request" — and the queue filtered the
          // request out of both the list and the tab count. The venue saw
          // "Awaiting approval"; the agency saw nothing at all.
          //
          // The origin is still half the answer, so the second half asks the
          // event log whether the OUTLET has ever driven this link to `pending`.
          // One outlet-initiated request is enough to make it real forever,
          // which is the first thing `agency_outlet_event` paid for.
          fromOnboarding: sql<boolean>`(
            ${AgencyOutletTable.createdBy} = 'migration_0123'
            AND NOT EXISTS (
              SELECT 1 FROM "main"."agency_outlet_event" ev
              WHERE ev."agency_outlet_id" = ${AgencyOutletTable.id}
                AND ev."to_status" = 'pending'
                AND ev."actor_side" = 'outlet'
            )
          )`,
          // THE RETURNING-PARTNER CONTEXT. A venue whose link was ended and
          // then asked for again comes back here as plain `pending` — identical,
          // on the row itself, to one the agency has never heard of. The
          // information that settles that decision (we worked together for
          // eight months; they left, or we did) is already in the event log,
          // and the only reason it was a hard decision is that nobody read it.
          // ⚠️ EXCLUDES THE BACKFILL. Migration 0127 wrote one event per existing
          // link stamped at that link's `updated_at`, and for links carried over
          // by 0123 that instant is 0123's own INSERT — not the day anyone
          // agreed to anything. Counting it made "Partner since" state a
          // migration's clock as a business fact on 3 of 6 live links.
          //
          // A link whose only approval is the backfill now yields NULL, and the
          // UI renders nothing: not knowing when a partnership began is the
          // truth, and a blank invites the question that a wrong date suppresses.
          firstApprovedAt: sql<Date | null>`(
            SELECT ev."created_at" FROM "main"."agency_outlet_event" ev
            WHERE ev."agency_outlet_id" = ${AgencyOutletTable.id}
              AND ev."to_status" = 'approved'
              AND ev."created_by" <> 'migration_0127'
            ORDER BY ev."created_at" ASC LIMIT 1
          )`,
          endedAt: sql<Date | null>`(
            SELECT ev."created_at" FROM "main"."agency_outlet_event" ev
            WHERE ev."agency_outlet_id" = ${AgencyOutletTable.id}
              AND ev."to_status" = 'ended'
            ORDER BY ev."created_at" DESC LIMIT 1
          )`,
          endedBySide: sql<AgencyOutletActorSide | null>`(
            SELECT ev."actor_side" FROM "main"."agency_outlet_event" ev
            WHERE ev."agency_outlet_id" = ${AgencyOutletTable.id}
              AND ev."to_status" = 'ended'
            ORDER BY ev."created_at" DESC LIMIT 1
          )`,
          createdAt: AgencyOutletTable.createdAt,
          updatedAt: AgencyOutletTable.updatedAt,
        })
        .from(AgencyOutletTable)
        .innerJoin(OutletTable, eq(OutletTable.id, AgencyOutletTable.outletId))
        .where(and(...conditions))
        .orderBy(OutletTable.name);
    } catch (error) {
      logger.error('[AgencyOutletRepository.listByAgency] Error:', error);
      return [];
    }
  }

  /**
   * Point this outlet's agency links at exactly `agencyIds`.
   * New links are `pending` — the agency must approve.
   *
   * An EXISTING link is left completely untouched, which is the whole point of
   * "approved once": re-saving the Settings screen must not reset an approved
   * partner back to pending and make the venue queue up again.
   *
   * Dropping a link ENDS it — it does not delete the row (0127). Shifts already
   * posted to that agency were never touched either way, because they hold
   * their own FK; what the delete used to destroy was the record that the two
   * ever worked together.
   *
   * Re-adding an `ended` agency puts the link back to `pending`, NOT straight
   * to `approved`. The case that forces this is the one where the AGENCY ended
   * it: restoring on the venue's say-so would let them walk back in and undo the
   * agency's own decision, silently. Making the rule depend on who ended it
   * would be invisible on screen and would fail quietly, so it is one rule in
   * both directions — coming back always needs a yes.
   */
  async syncLinksForOutlet(outletId: string, agencyIds: string[], actor: string): Promise<void> {
    const wanted = [...new Set(agencyIds)];
    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(AgencyOutletTable)
          .where(eq(AgencyOutletTable.outletId, outletId));

        // Already-ended links are skipped rather than re-ended: without this,
        // every save of the Settings screen would append another identical
        // `ended` event and the timeline would fill with transitions that never
        // happened.
        const dropped = existing.filter(
          (row) => !wanted.includes(row.agencyId) && row.approveStatus !== 'ended',
        );
        for (const row of dropped) {
          await tx
            .update(AgencyOutletTable)
            .set({ approveStatus: 'ended', updatedAt: new Date(), updatedBy: actor })
            .where(eq(AgencyOutletTable.id, row.id));
          // `fromStatus` is what makes one `ended` row readable as two different
          // events: `approved → ended` is a partnership that ran and is over,
          // `pending → ended` is a request the venue withdrew before anyone
          // answered it. The current-state column does not need to tell those
          // apart, because the log already does.
          await this.recordEvent(tx, {
            agencyOutletId: row.id,
            fromStatus: row.approveStatus,
            toStatus: 'ended',
            actorSide: 'outlet',
            actor,
          });
        }

        // An ended link asked for again — revived, not re-inserted. The unique
        // index on (agency_id, outlet_id) would refuse the insert anyway, and
        // reviving is what keeps the history attached to the partnership.
        const revived = existing.filter(
          (row) => wanted.includes(row.agencyId) && row.approveStatus === 'ended',
        );
        for (const row of revived) {
          await tx
            .update(AgencyOutletTable)
            .set({
              approveStatus: 'pending',
              rejectReason: null,
              updatedAt: new Date(),
              updatedBy: actor,
            })
            .where(eq(AgencyOutletTable.id, row.id));
          await this.recordEvent(tx, {
            agencyOutletId: row.id,
            fromStatus: 'ended',
            toStatus: 'pending',
            actorSide: 'outlet',
            actor,
          });
        }

        // `pending`, `approved` and `rejected` links that are still wanted are
        // left completely alone — that is what "approved once" means, and it is
        // also why a rejected link stays rejected: re-saving this screen must
        // not be a way to re-ask an agency that already said no.
        const known = new Set(existing.map((row) => row.agencyId));
        const added = wanted.filter((agencyId) => !known.has(agencyId));
        if (added.length > 0) {
          const rows = await tx
            .insert(AgencyOutletTable)
            .values(
              added.map((agencyId) => ({
                agencyId,
                outletId,
                approveStatus: 'pending' as const,
                createdBy: actor,
                updatedBy: actor,
              })),
            )
            .returning({ id: AgencyOutletTable.id });
          for (const row of rows) {
            await this.recordEvent(tx, {
              agencyOutletId: row.id,
              // No status to come from — the link did not exist. That NULL is
              // what makes "requested" identifiable on the timeline.
              fromStatus: null,
              toStatus: 'pending',
              actorSide: 'outlet',
              actor,
            });
          }
        }
      });
    } catch (error) {
      logger.error('[AgencyOutletRepository.syncLinksForOutlet] Error:', error);
      throw error;
    }
  }

  /**
   * Request one link if missing; never downgrades an existing decision.
   *
   * `onConflictDoNothing` means an existing link — in ANY state, `ended`
   * included — is left exactly as it was. Reviving an ended partnership is the
   * venue's own act and belongs to `syncLinksForOutlet`; a helper whose whole
   * contract is "if missing" must not quietly restart a relationship somebody
   * deliberately closed.
   */
  async ensureLink(
    outletId: string,
    agencyId: string,
    actor: string,
    approveStatus: AgencyOutletApproveStatus = 'pending',
  ): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        // `returning()` is what tells us whether the insert actually happened —
        // on conflict it comes back empty. Logging unconditionally would write
        // a "requested" event every time this ran against a link that already
        // existed.
        const [row] = await tx
          .insert(AgencyOutletTable)
          .values({
            agencyId,
            outletId,
            approveStatus,
            createdBy: actor,
            updatedBy: actor,
          })
          .onConflictDoNothing()
          .returning({ id: AgencyOutletTable.id });
        if (!row) return;
        await this.recordEvent(tx, {
          agencyOutletId: row.id,
          fromStatus: null,
          toStatus: approveStatus,
          actorSide: 'system',
          actor,
        });
      });
    } catch (error) {
      logger.error('[AgencyOutletRepository.ensureLink] Error:', error);
      throw error;
    }
  }

  /** Outlet-Linking tab — accept / decline a venue's request. */
  async setApproveStatus(
    agencyId: string,
    outletId: string,
    approveStatus: AgencyOutletApproveStatus,
    actor: string,
    rejectReason?: string | null,
  ): Promise<AgencyOutletType | null> {
    try {
      return await db.transaction(async (tx) => {
        // Read the old status BEFORE writing — the event records a transition,
        // and a transition needs both ends. `returning()` alone would only give
        // us where it landed.
        const [before] = await tx
          .select({ id: AgencyOutletTable.id, approveStatus: AgencyOutletTable.approveStatus })
          .from(AgencyOutletTable)
          .where(
            and(eq(AgencyOutletTable.agencyId, agencyId), eq(AgencyOutletTable.outletId, outletId)),
          );
        if (!before) return null;

        // ⚠️ AN ENDED PARTNERSHIP CANNOT BE RE-OPENED FROM THIS SIDE.
        //
        // This endpoint SETTLES a request, and an ended link is not a request —
        // it is a closed arrangement. Without this guard an agency could PATCH
        // an `ended` link straight back to `approved`, restoring a partnership
        // the VENUE closed, with no consent from the venue and nothing on the
        // venue's screen to announce it.
        //
        // It mirrors the rule the outlet side already follows: coming back
        // always needs the other party's yes. The venue re-requests from its own
        // Settings, which puts the link to `pending` and hands the decision back
        // to this endpoint — that is the only route in.
        if (before.approveStatus === 'ended') return null;

        const [row] = await tx
          .update(AgencyOutletTable)
          .set({
            approveStatus,
            // Clearing on approve matters: a venue that was rejected, fixed
            // whatever was wrong and then got approved must not keep showing the
            // old refusal on its Settings screen.
            rejectReason: approveStatus === 'rejected' ? rejectReason?.trim() || null : null,
            updatedAt: new Date(),
            updatedBy: actor,
          })
          .where(eq(AgencyOutletTable.id, before.id))
          .returning();

        // Only a real TRANSITION is logged. A repeated PATCH — a client retry, a
        // double submit, a script re-run — would otherwise append
        // `approved → approved`, a transition that never happened, into a log
        // whose whole value is that it did. `endLink` has this guard; this did
        // not. The UPDATE above still runs, so re-sending a rejection with new
        // wording refreshes the reason without inventing a decision.
        if (before.approveStatus !== approveStatus) {
          await this.recordEvent(tx, {
            agencyOutletId: before.id,
            fromStatus: before.approveStatus,
            toStatus: approveStatus,
            actorSide: 'agency',
            actor,
            reason: approveStatus === 'rejected' ? rejectReason : null,
          });
        }
        return row ?? null;
      });
    } catch (error) {
      logger.error('[AgencyOutletRepository.setApproveStatus] Error:', error);
      return null;
    }
  }

  /**
   * End a partnership. Replaces the old `removeLink`, which DELETED the row.
   *
   * Ending is not rejecting: `rejected` means the agency never agreed, `ended`
   * means it did and the arrangement is over. Both stop new work; only one of
   * them is a history worth showing when the venue comes back.
   *
   * Returns false when there is no link, and ALSO when it is already ended —
   * ending twice is not a second event, and letting it write one would put a
   * transition in the log that never happened.
   */
  async endLink(
    agencyId: string,
    outletId: string,
    actor: string,
    actorSide: AgencyOutletActorSide,
    reason?: string | null,
  ): Promise<boolean> {
    try {
      return await db.transaction(async (tx) => {
        const [before] = await tx
          .select({ id: AgencyOutletTable.id, approveStatus: AgencyOutletTable.approveStatus })
          .from(AgencyOutletTable)
          .where(
            and(eq(AgencyOutletTable.agencyId, agencyId), eq(AgencyOutletTable.outletId, outletId)),
          );
        if (!before || before.approveStatus === 'ended') return false;

        await tx
          .update(AgencyOutletTable)
          .set({ approveStatus: 'ended', updatedAt: new Date(), updatedBy: actor })
          .where(eq(AgencyOutletTable.id, before.id));
        await this.recordEvent(tx, {
          agencyOutletId: before.id,
          fromStatus: before.approveStatus,
          toStatus: 'ended',
          actorSide,
          actor,
          reason,
        });
        return true;
      });
    } catch (error) {
      logger.error('[AgencyOutletRepository.endLink] Error:', error);
      return false;
    }
  }

  /**
   * One link's whole timeline, newest first.
   *
   * Scoped by (agency, outlet) rather than by the link id on purpose: every
   * caller already knows the two orgs — one of which comes from the session —
   * and taking a bare link id would be a fourth place to remember to check who
   * is allowed to read it.
   */
  async listEvents(agencyId: string, outletId: string): Promise<AgencyOutletEventEnriched[]> {
    try {
      return await db
        .select({
          id: AgencyOutletEventTable.id,
          fromStatus: AgencyOutletEventTable.fromStatus,
          toStatus: AgencyOutletEventTable.toStatus,
          actorSide: AgencyOutletEventTable.actorSide,
          reason: AgencyOutletEventTable.reason,
          createdAt: AgencyOutletEventTable.createdAt,
          createdBy: AgencyOutletEventTable.createdBy,
        })
        .from(AgencyOutletEventTable)
        .innerJoin(
          AgencyOutletTable,
          eq(AgencyOutletTable.id, AgencyOutletEventTable.agencyOutletId),
        )
        .where(
          and(eq(AgencyOutletTable.agencyId, agencyId), eq(AgencyOutletTable.outletId, outletId)),
        )
        .orderBy(desc(AgencyOutletEventTable.createdAt));
    } catch (error) {
      logger.error('[AgencyOutletRepository.listEvents] Error:', error);
      return [];
    }
  }
}
