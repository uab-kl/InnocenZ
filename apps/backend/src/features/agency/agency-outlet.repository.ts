import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import {
  AgencyOutletTable,
  type AgencyOutletApproveStatus,
  type AgencyOutletEnriched,
  type AgencyOutletType,
  type OutletAgencyLink,
} from '@/features/agency/agency-outlet.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';
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
 */
export class AgencyOutletRepository {
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
  async listDirectory(): Promise<{ id: string; name: string; agencyCode: string }[]> {
    try {
      return await db
        .select({
          id: AgencyTable.id,
          name: AgencyTable.name,
          agencyCode: AgencyTable.agencyCode,
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
          approveStatus: AgencyOutletTable.approveStatus,
          rejectReason: AgencyOutletTable.rejectReason,
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
   * Approved only — a pending request is not permission, and a rejected one is
   * a refusal. Post Job validates the outlet's selection against exactly this
   * set, server-side; the client's list is a convenience, never the authority.
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
          // `migration_0123` is the marker the backfill wrote — see the final
          // INSERT in 0123. Derived from it, never stored as a second column.
          fromOnboarding: sql<boolean>`(${AgencyOutletTable.createdBy} = 'migration_0123')`,
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
   * Dropping a link only deletes the `agency_outlet` row. Shifts already posted
   * to that agency hold their own FK and are NOT cascade-deleted — unlinking
   * means "stop sending new work", not "erase the history".
   */
  async syncLinksForOutlet(outletId: string, agencyIds: string[], actor: string): Promise<void> {
    const wanted = [...new Set(agencyIds)];
    try {
      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(AgencyOutletTable)
          .where(eq(AgencyOutletTable.outletId, outletId));

        const stale = existing
          .filter((row) => !wanted.includes(row.agencyId))
          .map((row) => row.id);
        if (stale.length > 0) {
          await tx.delete(AgencyOutletTable).where(inArray(AgencyOutletTable.id, stale));
        }

        const known = new Set(existing.map((row) => row.agencyId));
        const added = wanted.filter((agencyId) => !known.has(agencyId));
        if (added.length > 0) {
          await tx.insert(AgencyOutletTable).values(
            added.map((agencyId) => ({
              agencyId,
              outletId,
              approveStatus: 'pending' as const,
              createdBy: actor,
              updatedBy: actor,
            })),
          );
        }
      });
    } catch (error) {
      logger.error('[AgencyOutletRepository.syncLinksForOutlet] Error:', error);
      throw error;
    }
  }

  /** Request one link if missing; never downgrades an existing decision. */
  async ensureLink(
    outletId: string,
    agencyId: string,
    actor: string,
    approveStatus: AgencyOutletApproveStatus = 'pending',
  ): Promise<void> {
    try {
      await db
        .insert(AgencyOutletTable)
        .values({
          agencyId,
          outletId,
          approveStatus,
          createdBy: actor,
          updatedBy: actor,
        })
        .onConflictDoNothing();
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
      const [row] = await db
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
        .where(
          and(eq(AgencyOutletTable.agencyId, agencyId), eq(AgencyOutletTable.outletId, outletId)),
        )
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[AgencyOutletRepository.setApproveStatus] Error:', error);
      return null;
    }
  }

  async removeLink(agencyId: string, outletId: string): Promise<boolean> {
    try {
      const rows = await db
        .delete(AgencyOutletTable)
        .where(
          and(eq(AgencyOutletTable.agencyId, agencyId), eq(AgencyOutletTable.outletId, outletId)),
        )
        .returning({ id: AgencyOutletTable.id });
      return rows.length > 0;
    } catch (error) {
      logger.error('[AgencyOutletRepository.removeLink] Error:', error);
      return false;
    }
  }
}
