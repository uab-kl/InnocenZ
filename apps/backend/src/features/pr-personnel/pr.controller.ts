import { Request, Response } from 'express';
import { ensurePersonCode } from '@/util/member-code';
import { randomUUID } from 'crypto';
import type { AgencyOutletRepository } from '@/features/agency/agency-outlet.repository.js';
import { PrRepositoryClass } from './pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import {
  AgencyPrRepository,
  type AgencyPrEnriched,
} from '@/features/agency/agency-pr.repository';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { UserRepositoryClass } from '@/features/user/user.repository';
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository';
import { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository';
import { RoleRepositoryClass } from '@/features/rbac/role/role.repository';
import { notify } from '@/features/notification/notify.js';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { redactPrRowForOutlet, redactPrRowsForOutlet } from '@/util/outlet-redaction';
import { CreatePrSchema, UpdatePrSchema } from '@/schema/pr.schema';
import { PrFilter, PrStatus, PrTier, type PrWithProfileType } from './pr.model';
import { AgencyPenaltyRuleRepositoryClass } from '@/features/agency/agency-penalty-rule.repository.js';
import { PenaltyChargeRepositoryClass } from '@/features/agency/penalty-charge.repository.js';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository.js';
import { evaluatePrPenalties, graceMinutesFor } from './pr-penalty.js';
import { EMPTY_PR_STATS, loadPrStats } from './pr-stats.js';
import { derivedAge } from './ic-dob.js';
import {
  refreshStoredComcard,
  touchesComcard,
} from '@/util/comcard-refresh.js';
import { pickAgencyId, pickedOrgId, pickedOrgKind } from '@/util/org-scope.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/** Map agency_pr (+ user/user_profile) into the personnel list shape the web already uses. */
function rosterRowFromMembership(
  row: AgencyPrEnriched,
): PrWithProfileType | null {
  // `main.pr` is gone — `id` is the account's `userId`, which is always
  // present on a membership row.
  if (!row.userId) return null;
  const status: PrStatus =
    row.prStatus === 'suspended'
      ? 'suspended'
      : row.approveStatus === 'approved'
        ? 'active'
        : row.approveStatus === 'pending'
          ? 'pending'
          : 'inactive';
  // Every field that is actually returned below has to be listed here, or a PR
  // who filled in only the omitted ones collapses to `profile: null` and the
  // agency card falls back to placeholder numbers for a body she did record.
  const profileHasValue = [
    row.profileImage,
    row.gender,
    row.race,
    row.languages,
    row.dob,
    row.nationality,
    row.portfolioPhotos,
    row.comcardImage,
    row.comcardHeightCm,
    row.comcardWeightKg,
    row.comcardBustCm,
    row.comcardWaistCm,
    row.comcardHipCm,
  ].some((v) => v !== null && v !== undefined);
  const rosterHasValue = [
    row.place,
    row.yearsExp,
    row.kpiTier,
    row.payClass,
  ].some((v) => v !== null && v !== undefined);
  return {
    id: row.userId,
    agencyId: row.agencyId,
    userId: row.userId,
    name: row.name,
    nickname: row.nickname,
    tier: row.tier,
    status,
    rejectReason: row.rejectReason,
    phone: row.phoneNum,
    email: row.email,
    icNo: row.idNo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    profile: profileHasValue
      ? {
          profileImage: row.profileImage,
          gender: row.gender,
          race: row.race,
          // Age follows the IC: the NRIC's date wins over the stored one, and
          // both fields come from the one derivation so this projection cannot
          // disagree with the repository's.
          ...derivedAge({
            idNo: row.idNo,
            dob: row.dob != null ? String(row.dob).slice(0, 10) : null,
          }),
          nationality: row.nationality,
          languages: row.languages,
          portfolioPhotos: row.portfolioPhotos,
          comcardImage: row.comcardImage,
          comcardHeightCm: row.comcardHeightCm,
          comcardWeightKg: row.comcardWeightKg,
          comcardBustCm: row.comcardBustCm,
          comcardWaistCm: row.comcardWaistCm,
          comcardHipCm: row.comcardHipCm,
        }
      : null,
    roster: rosterHasValue
      ? {
          place: row.place,
          yearsExp: row.yearsExp,
          kpiTier: row.kpiTier,
          payClass: row.payClass,
        }
      : null,
  };
}

function inviteUsername(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return `pr_${slug || 'member'}_${randomUUID().slice(0, 8)}`;
}

/**
 * A caller is scoped one of three ways: admin (everything), agency member (their
 * agency's PRs), or outlet member (only PRs rostered at their own venues, read
 * only). `outletIds` is empty for non-outlet callers.
 */
type Scope = { isAdmin: boolean; agencyId: string | null; outletIds: string[] };

/**
 * Drop the keys the caller did not send. `undefined` in a drizzle `.set()` is
 * not "leave alone" everywhere, and an all-undefined object would still count
 * as a patch and fire a pointless write.
 */
function pickDefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function parsePaging(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize };
}

/**
 * Narrow an outlet's bookable agencies to the ones the caller asked for.
 *
 * INTERSECTION, never assignment. The request is a PREFERENCE and the bookable
 * set is the PERMISSION, so an agency the venue has no approved link with is
 * dropped rather than honoured — naming one can never widen a caller's own
 * scope. That is also what sanitises the input: only ids that already matched a
 * real bookable uuid reach the query, so a junk value can neither cast-error
 * the SQL nor be smuggled through.
 *
 * Exported only so `_probe-post-job-pr-pool-scope.ts` can fire the REAL rule
 * rather than a copy of it — a probe that restates the logic it is testing can
 * certify a bug as correct.
 *
 * An explicit ask that intersects to NOTHING stays empty, and the repository
 * reads an empty list as "matches nobody". That is the honest answer to "who is
 * on the roster of an agency you cannot book from" — falling back to the full
 * set would answer a question nobody asked with data the caller filtered out.
 */
export function narrowToRequestedAgencies(bookable: string[], raw: unknown): string[] {
  const requested = (
    typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw : []
  )
    .map((id) => String(id).trim())
    .filter(Boolean);
  if (requested.length === 0) return bookable;
  const asked = new Set(requested);
  return bookable.filter((id) => asked.has(id));
}

export class PrControllerClass {
  constructor(
    private prRepository: PrRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
    private agencyPrRepository: AgencyPrRepository,
    private agencyPenaltyRuleRepository: AgencyPenaltyRuleRepositoryClass,
    private penaltyChargeRepository: PenaltyChargeRepositoryClass,
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
    private userRepository: UserRepositoryClass,
    private userProfileRepository: UserProfileRepositoryClass,
    private userRoleRepository: UserRoleRepositoryClass,
    private roleRepository: RoleRepositoryClass,
    // Resolves which agencies an outlet caller may book from — see
    // `resolveBookableAgencyIds`.
    private agencyOutletRepository: AgencyOutletRepository,
  ) {}

  /**
   * The signed-in PR sets which agencies they want to be under, from their own
   * profile page. Links are written as `pending` — this is a join *request*,
   * so the agency still has to approve before the PR is on its roster.
   */
  async updateMyAgencies(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const pr = await this.prRepository.getByUserId(userId);
      if (!pr) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const raw = req.body?.agencyIds;
      if (!Array.isArray(raw) || raw.length > 20) {
        return res.status(400).json({
          success: false,
          message: 'agencyIds must be an array of at most 20 agency ids',
          data: null,
        });
      }
      const agencyIds = [
        ...new Set(
          raw.filter(
            (id): id is string =>
              typeof id === 'string' && id.trim().length > 0,
          ),
        ),
      ];

      // A request already on the agency's desk locks the selection: the PR
      // cannot add or drop agencies until it is approved or rejected.
      const current = await this.agencyPrRepository.listLinksByUserIds([
        userId,
      ]);
      const pendingLink = current.find(
        (link) => link.approveStatus === 'pending',
      );
      if (pendingLink) {
        return res.status(409).json({
          success: false,
          message:
            'An agency request is awaiting approval. You cannot change agencies until it is approved or rejected.',
          data: null,
        });
      }
      const departingLink = current.find(
        (link) => link.approveStatus === 'leave_pending',
      );
      if (departingLink) {
        return res.status(409).json({
          success: false,
          message: `A departure request is awaiting ${departingLink.agencyName}'s approval. You cannot change agencies until it is decided.`,
          data: null,
        });
      }

      // Dropping an APPROVED agency never happens through this replace-set
      // save. It goes through the departure request — settlement gate, then
      // the agency's approval. This endpoint is reachable by any client, so
      // without this guard the replace semantics would still be the old
      // silent-walk-out delete path.
      const droppedApproved = current.filter(
        (link) =>
          link.approveStatus === 'approved' &&
          !agencyIds.includes(link.agencyId),
      );
      if (droppedApproved.length > 0) {
        const names = droppedApproved.map((l) => l.agencyName).join(', ');
        return res.status(409).json({
          success: false,
          message: `To leave ${names} you must request a departure — everything with them (payment vouchers, disputes, shifts) has to be settled and the agency must approve. Use the leave option on that agency.`,
          data: null,
        });
      }

      // Every id must be a real agency, else the FK insert would 500 later.
      const known =
        await this.agencyPrRepository.filterExistingAgencyIds(agencyIds);
      if (known.length !== agencyIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more agencies do not exist',
          data: null,
        });
      }

      await this.agencyPrRepository.syncLinksForUser(
        userId,
        known,
        getActor(req),
      );
      const links = await this.agencyPrRepository.listLinksByUserIds([userId]);

      res
        .status(200)
        .json({ success: true, message: 'Agencies updated', data: links });
    } catch (error) {
      logger.error('[PrController.updateMyAgencies] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * The signed-in PR asks to LEAVE one approved agency.
   *
   * Refused with the reasons IN WORDS unless everything between the two is
   * settled — every payment voucher paid, every dispute closed, no upcoming
   * or unfinished shift. The phone shows the 409 message verbatim, so it must
   * read as sentences, not codes. On success the membership goes
   * `leave_pending`; the agency decides it on the approvals page, where the
   * gate is re-checked (money can re-open between request and decision).
   */
  async requestAgencyLeave(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const agencyId = paramId(req.params.agencyId);

      const links = await this.agencyPrRepository.listLinksByUserIds([userId]);
      const link = links.find((l) => l.agencyId === agencyId);
      if (!link) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (link.approveStatus === 'leave_pending') {
        return res.status(409).json({
          success: false,
          message: `Departure already requested — waiting for ${link.agencyName} to approve.`,
          data: null,
        });
      }
      if (link.approveStatus !== 'approved') {
        return res.status(409).json({
          success: false,
          message: `Your membership with ${link.agencyName} is not approved, so there is nothing to leave.`,
          data: null,
        });
      }

      const blockers = await this.agencyPrRepository.listLeaveBlockers(
        agencyId,
        userId,
      );
      if (blockers.length > 0) {
        return res.status(409).json({
          success: false,
          message: `You cannot leave ${link.agencyName} yet: ${blockers.join('; ')}.`,
          data: { blockers },
        });
      }

      await this.agencyPrRepository.setApproveStatus(
        agencyId,
        userId,
        'leave_pending',
        getActor(req),
      );
      res.status(200).json({
        success: true,
        message: `Departure requested — waiting for ${link.agencyName} to approve.`,
        data: null,
      });
    } catch (error) {
      logger.error('[PrController.requestAgencyLeave] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * The organisation an ADMIN is currently acting for, or null to fall back to
   * the unscoped admin view.
   *
   * Null is returned whenever the answer is not certain — no acting header, a
   * header naming an organisation this admin is not an active member of, or a
   * lookup that yields nothing. The caller treats null as "keep the admin
   * view", so an unresolvable header can never produce an empty roster.
   *
   * The membership is read from the database through `pickAgencyId`, the same
   * helper the agency lane below uses, rather than trusted from the header: the
   * header says WHICH organisation, the database says whether this person may
   * read it. One fact, one place — `org-scope.ts`'s own note records that this
   * resolver was hand-copied into several controllers and every copy carried
   * the same bug.
   */
  private async resolveActingOrgScope(
    req: Request,
    userId: string,
  ): Promise<Scope | null> {
    const actingKind = pickedOrgKind(req);
    if (actingKind === null) return null;

    if (actingKind === 'agency') {
      const memberships = await this.agencyMemberRepository.listByUser(userId);
      const agencyId = pickAgencyId(req, memberships);
      return agencyId ? { isAdmin: false, agencyId, outletIds: [] } : null;
    }

    const pickedId = pickedOrgId(req);
    if (!pickedId) return null;
    const outletMemberships =
      await this.outletMemberRepository.listByUser(userId);
    const holdsIt = outletMemberships.some(
      (m) => m.outletId === pickedId && m.status === 'active',
    );
    return holdsIt
      ? { isAdmin: false, agencyId: null, outletIds: [pickedId] }
      : null;
  }

  /**
   * Resolves the caller's data scope. An admin sees everything UNLESS the
   * console names an organisation they are an active member of, in which case
   * they read as that organisation (see `resolveActingOrgScope`). Every other
   * caller is confined to the org they belong to (resolved from the DB, never
   * trusted from the request body). Agency membership wins when a user holds
   * both.
   */
  private async resolveScope(req: Request): Promise<Scope> {
    const user = req.user!;
    const roles = await this.authRepository.getRolesForUserIds([user.id]);
    const isAdmin = roles.some((r) => r.roleName === 'admin');
    /*
     * ⚠️ AN ADMIN ACTING FOR AN ORGANISATION IS THAT ORGANISATION'S READER.
     *
     * This used to return the blanket admin view unconditionally, BEFORE the
     * acting-org header below was ever consulted — so the whole `x-org-id` /
     * `x-org-kind` machinery underneath was unreachable for anybody holding the
     * admin role. Somebody who is an admin AND Finance at one agency picked
     * that agency in the chooser and got the admin answer: every agency's PRs,
     * and one row PER MEMBERSHIP rather than per person, because
     * `dedupeByPerson` is deliberately off for admins (their PR screen must keep
     * a person's several memberships individually visible).
     *
     * On screen, 14 Sep 2026: Atlas Agency's roster listed one PR three times —
     * she holds three memberships — and listed a PR belonging to Delta and Why
     * We Met and not to Atlas at all. The chooser's own copy states the rule it
     * was breaking: "the portal opens for the one you pick, and shows that
     * organisation's people, shifts and money only".
     *
     * The narrowing is deliberately conservative: it applies ONLY when the
     * console names an acting organisation AND this admin genuinely holds an
     * active membership there, resolved from the database by the same
     * `pickAgencyId` every other lane uses. An admin with no acting header — the
     * admin console itself — still gets the unscoped view, so no admin screen
     * loses anything. Anything unresolved falls through to that same view rather
     * than to an empty one: a narrowing that cannot confirm its target must not
     * invent a refusal.
     */
    if (isAdmin) {
      const actingScope = await this.resolveActingOrgScope(req, user.id);
      return actingScope ?? { isAdmin: true, agencyId: null, outletIds: [] };
    }

    /*
     * ⚠️ A NAMED VENUE BEATS AN UNNAMED AGENCY — the same rule `resolveOrgScope`
     * learned on 10 Sep, and the same one the audit writer needed on 12 Sep.
     *
     * `pickAgencyId` honours `x-org-id` only when it names an active AGENCY, so
     * a venue id fell through to "the oldest active agency". For somebody who
     * both staffs an agency and runs a venue, opening the OUTLET console's Post
     * Job → Select PRs therefore listed their AGENCY roster: PRs the venue
     * cannot book were offered, PRs it can book were missing, and the "Send to"
     * narrowing was discarded because `agencyIdsIn` is only built on the outlet
     * branch — so a PR named from an uninvited agency was dropped on create.
     *
     * The console already says which it is. When it says `outlet`, take the
     * outlet branch even though an agency membership exists; without the header
     * (an older client) the previous agency-first order stands.
     */
    const actingKind = pickedOrgKind(req);
    if (actingKind !== 'outlet') {
      // Third copy of the `?? memberships[0]` fallback, and the one that decides
      // which agency's PERSONNEL a caller may see and edit — IC, phone, DOB. An
      // inactive membership resolved an agencyId here too, so a removed operator
      // kept the roster they had just lost.
      const memberships = await this.agencyMemberRepository.listByUser(user.id);
      const agencyId = pickAgencyId(req, memberships);
      if (agencyId) {
        return { isAdmin: false, agencyId, outletIds: [] };
      }
    }

    // No agency link — fall back to outlet membership so an outlet can read the
    // personnel rostered at its own venues.
    const outletMemberships = await this.outletMemberRepository.listByUser(
      user.id,
    );
    const outletIds = [
      ...new Set(
        outletMemberships
          .filter((m) => m.status === 'active')
          .map((m) => m.outletId),
      ),
    ];
    return { isAdmin: false, agencyId: null, outletIds };
  }

  /**
   * The agencies an outlet caller may book from: the union of APPROVED
   * partnerships across its venues.
   *
   * Approved only — a pending or rejected request is not a partnership, and a
   * venue must not browse the roster of an agency that has not accepted it.
   * De-duplicated because a multi-venue operator's outlets commonly share
   * agencies, and the same agency twice would widen nothing but cost a scan.
   */
  private async resolveBookableAgencyIds(outletIds: string[]): Promise<string[]> {
    if (outletIds.length === 0) return [];
    const perOutlet = await Promise.all(
      outletIds.map((outletId) =>
        this.agencyOutletRepository.listApprovedAgencyIdsForOutlet(outletId),
      ),
    );
    return [...new Set(perOutlet.flat())];
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const isOutletCaller =
        !scope.isAdmin && !scope.agencyId && scope.outletIds.length > 0;
      if (!scope.isAdmin && !scope.agencyId && !isOutletCaller) {
        return res.status(403).json({
          success: false,
          message: 'No agency associated with this account',
          data: null,
        });
      }

      const { page, pageSize } = parsePaging(req);

      // Agency roster: agency_pr ⋈ user ⋈ user_profile. No `pr` table — id === userId.
      if (scope.agencyId && !scope.isAdmin) {
        const members = await this.agencyPrRepository.listByAgency(
          scope.agencyId,
          {
            search: req.query.name as string | undefined,
          },
        );

        const prs: PrWithProfileType[] = [];
        for (const member of members) {
          const mapped = rosterRowFromMembership(member);
          if (mapped) prs.push(mapped);
        }

        const status = req.query.status as PrStatus | undefined;
        const tier = req.query.tier as PrTier | undefined;
        // A membership the agency has not accepted yet is an APPLICATION, and
        // this endpoint answers "who is on my roster". Without this every
        // consumer of the shared ["roster","prs"] cache — Manage PR, the roster
        // grid, the assign dialog, auto-assign, the home hub — listed applicants
        // as staff, and the web mapper only spells `suspended`/`inactive` as
        // not-active, so a pending PR even rendered with a green "Active" badge.
        // Approvals reads GET /agency/:id/pr, so its queue is untouched; a
        // caller here that wants applicants asks for them by name.
        const wantsPending = status === 'pending';
        const filtered = prs.filter((pr) => {
          if (!wantsPending && pr.status === 'pending') return false;
          if (status && pr.status !== status) return false;
          if (tier && pr.tier !== tier) return false;
          return true;
        });
        const totalCount = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
        // Attendance + paid, for THIS agency only. Computed over the page rows,
        // so the two aggregates stay two queries however large the roster grows.
        const stats = await loadPrStats({
          prIds: pageRows.map((pr) => pr.id),
          agencyId: scope.agencyId,
        });
        return res.status(200).json({
          success: true,
          message: 'OK',
          data: pageRows.map((pr) => ({
            ...pr,
            stats: stats.get(pr.id) ?? EMPTY_PR_STATS,
          })),
          pagination: {
            page,
            pageSize,
            totalCount,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
          },
        });
      }

      const filter: PrFilter = {
        status: req.query.status as PrStatus | undefined,
        tier: req.query.tier as PrTier | undefined,
        name: req.query.name as string | undefined,
        agencyId: scope.isAdmin
          ? (req.query.agencyId as string | undefined)
          : (scope.agencyId ?? undefined),
        // WHO THIS OUTLET MAY NAME — its approved agencies' rosters, not the
        // people who happen to have worked here before.
        //
        // `assignedToOutletIds` answered the past ("who has worked my venues"),
        // which made the Post Job picker a list of repeat bookings: two venues
        // sharing the SAME two agencies showed 6 PRs and 2 PRs purely because
        // one had used more people, and a venue could never name a PR it had
        // not already used — against a plan that sells "choose 100 from 200".
        //
        // A PR under an approved agency is bookable by that agency's outlets,
        // so the pool is the union of those rosters. A person on two of them
        // still appears ONCE: `dedupeByPerson` covers this filter too.
        //
        // Post Job narrows this again with `agencyIds`: the picker must list only
        // the rosters of the agencies the operator ticked in "Send to", because a
        // request addressed to an agency that is not invited on the shift is
        // DROPPED on create (see shift.controller) — so naming one was a pick the
        // venue was never going to get. Narrowing here also settles which
        // membership a multi-agency PR's card carries: the dedupe keeps one row
        // per person, and with the un-ticked agencies filtered out the surviving
        // `agency_id` is always one the shift actually invites.
        agencyIdsIn: isOutletCaller
          ? narrowToRequestedAgencies(
              await this.resolveBookableAgencyIds(scope.outletIds),
              req.query.agencyIds,
            )
          : undefined,
        // Same rule as the agency branch above, for the outlet caller. Admins
        // keep the unfiltered view — the admin PR screen is where an applicant
        // stuck in `pending` has to remain visible.
        excludePending: !scope.isAdmin && req.query.status === undefined,
      };

      const { prs, totalCount } = await this.prRepository.listPaginated({
        filter,
        page,
        pageSize,
      });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      // An OUTLET caller never gets these. Attendance is arguably its business
      // for its own venues, but `totalPaidRm` is agency→PR payroll and a venue
      // has no claim on it — so the whole block is withheld rather than half of
      // it leaked. Admins get it scoped to whichever agency they filtered by,
      // or across all agencies when they filtered by none.
      const stats = isOutletCaller
        ? null
        : await loadPrStats({
            prIds: prs.map((pr) => pr.id),
            agencyId: filter.agencyId ?? null,
          });
      res.status(200).json({
        success: true,
        message: 'OK',
        // An outlet books from this list; it does not identify anyone from it.
        // `stats` (agency→PR payroll) is already withheld above — this withholds
        // the identity documents that were riding on every row beside it. Only
        // an outlet caller reaches the bare `prs` arm: `stats` is non-null for
        // admin and agency.
        data: stats
          ? prs.map((pr) => ({
              ...pr,
              stats: stats.get(pr.id) ?? EMPTY_PR_STATS,
            }))
          : req.redactIdentityDocs
            ? redactPrRowsForOutlet(prs)
            : prs,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      logger.error('[PrController.list] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * The PR as seen by the CALLER'S agency, or a written response and null.
   *
   * One person holds one `agency_pr` row per agency, so "which membership" is a
   * question every by-id path has to answer deliberately. Answering it by age —
   * which `getById` does when handed no agency — resolved a Why We Met caller's
   * Alice to her *Atlas* membership, so the scope compare failed and the two PRs
   * on more than one roster were the only two of 32 that could not be edited.
   *
   * `forWrite` is what separates the two lanes for an ADMIN, who has no agency
   * scope of their own: a read may fall back to the oldest membership (it can
   * corrupt nothing), but a write must not guess — it either names the agency
   * or is refused. Non-admins are always pinned to their own scope.
   */
  private async resolvePrForCaller(
    req: Request,
    res: Response,
    id: string,
    opts: { forWrite: boolean },
  ): Promise<{ pr: PrWithProfileType; agencyId: string } | null> {
    const notFound = () => {
      res
        .status(404)
        .json({ success: false, message: Error.NOT_FOUND, data: null });
      return null;
    };

    const scope = await this.resolveScope(req);
    if (!scope.isAdmin) {
      if (!scope.agencyId) return notFound();
      const pr = await this.prRepository.getById(id, scope.agencyId);
      // Null here means "not on YOUR roster" — 404, not 403, so a caller cannot
      // probe which PR ids exist outside their agency.
      if (!pr) return notFound();
      return { pr, agencyId: scope.agencyId };
    }

    // Admin. An explicitly named agency always wins, in either lane.
    const named =
      (typeof req.body?.agencyId === 'string'
        ? req.body.agencyId
        : undefined) ??
      (typeof req.query.agencyId === 'string' ? req.query.agencyId : undefined);
    if (named) {
      const pr = await this.prRepository.getById(id, named);
      if (!pr) return notFound();
      return { pr, agencyId: named };
    }

    if (opts.forWrite) {
      const agencyIds = await this.prRepository.listMembershipAgencyIds(id);
      if (agencyIds.length === 0) return notFound();
      // More than one roster and nobody said which. Refuse rather than pick:
      // the silent pick wrote a PR's tier, place and KPI onto whichever agency
      // signed them first, and detached them from that agency on remove.
      if (agencyIds.length > 1) {
        res.status(409).json({
          success: false,
          message:
            'This PR is on more than one agency roster — pass agencyId to say which membership to change',
          data: null,
        });
        return null;
      }
      const pr = await this.prRepository.getById(id, agencyIds[0]);
      if (!pr) return notFound();
      return { pr, agencyId: agencyIds[0] };
    }

    // Admin read, no agency named: oldest-membership view, as before.
    const pr = await this.prRepository.getById(id);
    if (!pr) return notFound();
    return { pr, agencyId: pr.agencyId };
  }

  async getById(req: Request, res: Response) {
    try {
      const resolved = await this.resolvePrForCaller(
        req,
        res,
        paramId(req.params.id),
        {
          forWrite: false,
        },
      );
      if (!resolved) return;
      res.status(200).json({
        success: true,
        message: 'OK',
        data: req.redactIdentityDocs ? redactPrRowForOutlet(resolved.pr) : resolved.pr,
      });
    } catch (error) {
      logger.error('[PrController.getById] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreatePrSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }

      const scope = await this.resolveScope(req);
      let agencyId: string;
      if (scope.isAdmin) {
        if (!parsed.data.agencyId) {
          return res.status(400).json({
            success: false,
            message: 'agencyId is required',
            data: null,
          });
        }
        agencyId = parsed.data.agencyId;
      } else {
        if (!scope.agencyId) {
          return res.status(403).json({
            success: false,
            message: 'No agency associated with this account',
            data: null,
          });
        }
        agencyId = scope.agencyId;
      }

      const actor = getActor(req);
      const phone = parsed.data.phone?.trim() || null;
      const email = parsed.data.email?.trim() || null;

      // Owner invite: stub user + assign `pr` role + agency_pr (approved).
      // Person facts live on user / user_profile — there is no `pr` table.
      let userId = parsed.data.userId;
      let createdStub = false;
      if (!userId && phone) {
        const existingPhone = await this.userRepository.getUserByLoginMethod(
          'phone',
          phone,
        );
        if (existingPhone) userId = existingPhone.id;
      }
      if (!userId && email) {
        const existingEmail = await this.userRepository.getUserByLoginMethod(
          'email',
          email,
        );
        if (existingEmail) userId = existingEmail.id;
      }
      if (!userId) {
        const user = await this.userRepository.createUser({
          username: inviteUsername(parsed.data.nickname || parsed.data.name),
          phoneNum: phone,
          email,
          passwordHash: null,
          status: 'active',
          profileImage: null,
          createdBy: actor,
          updatedBy: actor,
        });
        userId = user.id;
        createdStub = true;
        const prRole = await this.roleRepository.getRoleByName('pr');
        if (prRole) {
          try {
            await this.userRoleRepository.assignRoleToUser({
              userId,
              roleId: prRole.id,
              createdBy: actor,
              updatedBy: actor,
            });
          } catch {
            // Unique (user, role) — ignore if already assigned.
          }
        }
        // The PR id follows the role, not the user row: this path creates the
        // account first and grants  a statement later.
        await ensurePersonCode(userId);
      }

      await this.userProfileRepository.update(userId, {
        fullName: parsed.data.name,
        idNo: parsed.data.icNo ?? undefined,
        updatedBy: actor,
      });
      // Never rewrite username on an existing account — that is their login handle.
      if (createdStub && (phone || email)) {
        await this.userRepository.updateUser(
          {
            ...(phone ? { phoneNum: phone } : {}),
            ...(email ? { email } : {}),
            updatedBy: actor,
          },
          userId,
        );
      }

      await this.agencyPrRepository.upsertLink(userId, agencyId, actor, {
        approveStatus: 'approved',
        tier: parsed.data.tier,
      });

      const pr = await this.prRepository.ensureOpsBridge({
        userId,
        agencyId,
        actor,
        tier: parsed.data.tier,
        name: parsed.data.name,
        nickname: parsed.data.nickname ?? null,
        phone,
        email,
        icNo: parsed.data.icNo ?? null,
      });
      const withProfile = await this.prRepository.getById(pr.id);
      res.status(201).json({
        success: true,
        message: 'PR created',
        data: withProfile ?? pr,
      });
    } catch (error) {
      logger.error('[PrController.create] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdatePrSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }

      // Resolved AS THIS CALLER'S AGENCY, so `existing.agencyId` is the
      // membership being edited rather than the oldest one this person holds.
      // That is what the two multi-roster PRs needed: the 404 fired before any
      // field was looked at, so nothing on them could be saved at all.
      const resolved = await this.resolvePrForCaller(req, res, id, {
        forWrite: true,
      });
      if (!resolved) return;
      const existing = resolved.pr;

      const scope = await this.resolveScope(req);
      const data = { ...parsed.data };
      if (!scope.isAdmin) delete data.agencyId;
      const actor = getActor(req);

      // Editor fields live in three tables. Peel non-identity / non-membership
      // keys off before `prRepository.update` — those columns are not on the
      // synthetic PrInsertType.
      // No `dob` — age follows the PR's IC and is derived on read, so neither
      // the agency nor the PR sends one. `UpdatePrSchema` has already dropped
      // any that arrives.
      const { race, languages, comcardHeightCm, comcardWeightKg, ...rest } =
        data;
      const { place, yearsExp, kpiTier, payClass, ...prColumns } = rest;
      const profilePatch = pickDefined({
        race,
        languages,
        comcardHeightCm,
        comcardWeightKg,
      });
      const rosterPatch = pickDefined({ place, yearsExp, kpiTier, payClass });

      // Person facts → user / user_profile; membership tier/approval → agency_pr.
      if (existing.userId) {
        if (data.name !== undefined || data.icNo !== undefined) {
          await this.userProfileRepository.update(existing.userId, {
            ...(data.name !== undefined ? { fullName: data.name } : {}),
            ...(data.icNo !== undefined ? { idNo: data.icNo } : {}),
            updatedBy: actor,
          });
        }
        if (
          data.phone !== undefined ||
          data.email !== undefined ||
          data.nickname !== undefined
        ) {
          await this.userRepository.updateUser(
            {
              ...(data.phone !== undefined
                ? { phoneNum: data.phone || null }
                : {}),
              ...(data.email !== undefined
                ? { email: data.email || null }
                : {}),
              ...(data.nickname !== undefined
                ? { username: data.nickname || existing.name }
                : {}),
              updatedBy: actor,
            },
            existing.userId,
          );
        }
        if (
          data.tier !== undefined ||
          data.status !== undefined ||
          data.rejectReason !== undefined
        ) {
          const approveStatus =
            data.status === 'active'
              ? ('approved' as const)
              : data.status === 'inactive'
                ? ('rejected' as const)
                : data.status === 'pending'
                  ? ('pending' as const)
                  : undefined;
          await this.agencyPrRepository.updateMembership(
            // The membership the CALLER named, never the oldest one this person
            // holds — this is the write that used to land on another agency's row.
            resolved.agencyId,
            existing.userId,
            {
              ...(data.tier ? { tier: data.tier } : {}),
              ...(approveStatus ? { approveStatus } : {}),
              ...(data.status === 'inactive'
                ? { rejectReason: data.rejectReason ?? null }
                : data.status === 'active'
                  ? { rejectReason: null }
                  : {}),
            },
            actor,
          );
        }
      }

      const pr = await this.prRepository.update(id, {
        ...prColumns,
        ...(data.status === 'active' ? { rejectReason: null } : {}),
        updatedBy: actor,
      });
      if (!pr)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });

      if (Object.keys(profilePatch).length > 0) {
        if (!pr.userId) {
          return res.status(409).json({
            success: false,
            message:
              'This PR has no linked user account, so profile details cannot be saved',
            data: null,
          });
        }
        const existingProfile = await this.userProfileRepository.getByUserId(
          pr.userId,
        );
        if (!existingProfile)
          await this.userProfileRepository.createEmpty(pr.userId, actor);
        await this.userProfileRepository.update(pr.userId, {
          ...profilePatch,
          updatedBy: actor,
        });
      }

      // Height, weight and the display name are PRINTED on the comcard, so a
      // write that moves any of them leaves the saved PNG claiming the old
      // numbers. The agency edits the same `user_profile` columns the PR's own
      // app does, and only the app re-rendered — so an agency changing height
      // 155 → 160 produced a profile and a card that disagreed.
      //
      // Read back AFTER the writes above so the card is rendered from what was
      // actually stored, not from the patch we hoped landed.
      if (
        pr.userId &&
        (touchesComcard(profilePatch) ||
          data.name !== undefined ||
          data.nickname !== undefined)
      ) {
        const saved = await this.userProfileRepository.getByUserId(pr.userId);
        const account = await this.userRepository.getUserById(pr.userId);
        if (saved) {
          await refreshStoredComcard({
            userId: pr.userId,
            fullName: saved.fullName,
            username: account?.username ?? null,
            idNo: saved.idNo,
            dob: saved.dob,
            heightCm: saved.comcardHeightCm,
            weightKg: saved.comcardWeightKg,
            portfolioPhotos: saved.portfolioPhotos,
            save: (storedKey) =>
              this.userProfileRepository
                .update(pr.userId!, {
                  comcardImage: storedKey,
                  updatedBy: actor,
                })
                .then(() => undefined),
          });
        }
      }

      // Roster grading on agency_pr (0089) — keyed by userId (pr table is gone).
      // Grading (place / years / KPI / pay class) is per-membership by design —
      // a PR on two rosters can be graded differently by each — so it MUST be
      // written against the caller's agency, not `pr.agencyId` (which comes back
      // from an unscoped re-read and would be the oldest membership again).
      if (Object.keys(rosterPatch).length > 0) {
        await this.agencyPrRepository.upsertRosterProfile(
          resolved.agencyId,
          pr.userId,
          rosterPatch,
          actor,
        );
      }

      const JOIN_DECISION: Record<string, boolean> = {
        active: true,
        inactive: false,
      };
      const accepted = data.status ? JOIN_DECISION[data.status] : undefined;

      if (
        accepted !== undefined &&
        data.status !== existing.status &&
        pr.userId
      ) {
        await notify({
          userId: pr.userId,
          kind: 'agency_join_resolved',
          title: accepted
            ? 'You were accepted by the agency'
            : 'Your agency application was declined',
          body: accepted
            ? 'You can now be scheduled for shifts.'
            : (pr.rejectReason ?? undefined),
          payload: {
            prId: pr.id,
            agencyId: resolved.agencyId,
            userId: pr.userId,
            status: data.status,
          },
          actor,
        });
      }

      // Read back through the SAME agency, so the response describes the
      // membership just written rather than another agency's view of them.
      const withProfile = await this.prRepository.getById(
        pr.id,
        resolved.agencyId,
      );
      res.status(200).json({
        success: true,
        message: 'PR updated',
        data: withProfile ?? pr,
      });
    } catch (error) {
      logger.error('[PrController.update] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);

      // Same resolution as update, and for a sharper reason: everything below
      // is scoped to ONE agency, so an oldest-membership answer here detaches
      // the PR from the wrong one — for an admin, one that was never asked
      // about. `resolved.agencyId` is the agency the caller is acting in.
      const resolved = await this.resolvePrForCaller(req, res, id, {
        forWrite: true,
      });
      if (!resolved) return;
      const existing = resolved.pr;

      // Detach membership — 'left', never a hard delete. The agency may always
      // let go of its own PR (no settlement gate on this side), but deleting
      // the row erased the very history the approvals page's Approved chip
      // now reads, and made a later re-join an insert instead of the
      // flip-back-to-pending the unique key is there for.
      if (existing.userId) {
        await this.agencyPrRepository.setApproveStatus(
          resolved.agencyId,
          existing.userId,
          'left',
          getActor(req),
        );
      }

      /**
       * ⚠️ `prRepository.update(id, { status: 'inactive' })` USED TO RUN HERE,
       * AND IT UNDID THE LINE ABOVE. It is deleted, not trimmed.
       *
       * That call had exactly one effect, and it was the wrong one. Of its
       * three write branches, only the `agency_pr` one could fire — the other
       * two need name/icNo/phone/email, none of which were passed — and that
       * branch maps `status: 'inactive'` onto `approveStatus: 'rejected'`. So
       * two statements after writing `'left'`, the row said `'rejected'`.
       * It never touched `user.status`: the `status` here is the LINK's, not
       * the account's, so nothing was deactivating a PR's login.
       *
       * ⚠️ Three separate harms, and the third outlives the request:
       *  1. **It lied to the operator.** `'rejected'` renders as *"declined by
       *     your agency"* on the assignment gate; the PR was not declined,
       *     they were let go. `'left'` has its own message telling the
       *     operator to re-add them under Manage PR.
       *  2. **It could hit the wrong agency.** `update` re-resolved the agency
       *     through `getByUserId(id)` with no agency argument, which takes the
       *     OLDEST membership. For a PR on several rosters — 7 accounts here,
       *     one on four agencies — cancelling at agency B downgraded a
       *     still-approved row at agency A. `setApproveStatus` above is
       *     correctly scoped to `resolved.agencyId`; this was the only part of
       *     the handler that was not.
       *  3. **It armed a later hard delete.** `syncLinksForUser` DELETES
       *     `'rejected'` rows and RETAINS `'left'` ones, so the rewrite turned
       *     a protected record into a deletable one: the PR's next save on
       *     their own agency picker would erase the membership history that
       *     `'left'` exists to preserve.
       *
       * The money was never at risk either way — `payment_voucher` carries its
       * own `agency_id` and no read joins `agency_pr` — which is the owner's
       * rule: cancelling ends the WORK, not the DEBT (10 Sep 2026).
       */
      res
        .status(200)
        .json({ success: true, message: 'PR removed', data: null });
    } catch (error) {
      logger.error('[PrController.remove] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * The signed-in PR's OWN agency's penalty rules, read-only.
   *
   * A PR is charged by these — the cancellation bands decide what the Cancel
   * button costs — so they have to be readable by the person paying. The
   * agency-side route cannot serve this: `GET /agency/:id/penalty-rules` is
   * scoped to that agency's owner/finance, and widening it to the `pr` role
   * would let any PR read ANY agency's fine schedule by id. This takes no id at
   * all; the agency is derived from the caller's own membership, so there is
   * nothing to tamper with.
   */
  async getMyPenaltyRules(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const pr = await this.prRepository.getByUserId(userId);
      if (!pr) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const rules = await this.agencyPenaltyRuleRepository.listByAgencyId(
        pr.agencyId,
      );
      // Empty is a real answer — an agency that has written no rules charges
      // nothing — so this is 200 with [], never 404.
      res.status(200).json({ success: true, message: 'OK', data: rules });
    } catch (error) {
      logger.error('[PrController.getMyPenaltyRules] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * "Was I penalised this week?" — the signed-in PR's own sealed charges.
   *
   * SEALED only. The live proposal endpoint below tells an AGENCY what a week
   * would cost if they accepted it; showing the same thing to the worker would
   * announce money they may never actually lose. A PR sees a figure once their
   * agency has accepted it, and each row says whether it has been billed yet.
   *
   * Takes no id — the PR is the caller. Both halves are scoped to their own
   * `pr.id`, so there is nothing to tamper with.
   */
  async getMyPenalties(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const weekStart =
        typeof req.query.weekStart === 'string' ? req.query.weekStart : '';
      const weekEnd =
        typeof req.query.weekEnd === 'string' ? req.query.weekEnd : '';
      const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!isDate(weekStart) || !isDate(weekEnd)) {
        return res.status(400).json({
          success: false,
          message: 'weekStart and weekEnd (yyyy-MM-dd) are required',
          data: null,
        });
      }

      const pr = await this.prRepository.getByUserId(userId);
      if (!pr) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const [penalties, cancellations] = await Promise.all([
        this.penaltyChargeRepository.listForPrWeek(pr.id, weekStart, weekEnd),
        this.shiftAssignmentRepository.listCancelFeesForPrWeek(
          pr.id,
          weekStart,
          weekEnd,
        ),
      ]);
      const sum = (n: number, v: string | null) => n + Number(v ?? 0);
      const penaltiesRm = penalties.reduce((n, p) => sum(n, p.fineRm), 0);
      const cancellationsRm = cancellations.reduce(
        (n, c) => sum(n, c.feeRm),
        0,
      );

      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          penalties,
          cancellations,
          penaltiesRm: penaltiesRm.toFixed(2),
          cancellationsRm: cancellationsRm.toFixed(2),
          totalRm: (penaltiesRm + cancellationsRm).toFixed(2),
          count: penalties.length + cancellations.length,
        },
      });
    } catch (error) {
      logger.error('[PrController.getMyPenalties] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * What this PR's attendance WOULD cost them under an outlet's penalty rules.
   *
   * A proposal, not a deduction. Nothing here writes to a voucher: the agency
   * decides, and applies it via PUT /payment-voucher/:id if they agree. Same
   * shape as overtime — computed, shown, not money until a human says so. That
   * restraint is deliberate: a penalty takes pay away, and most agencies have
   * no rules configured, so an automatic deduction would quietly underpay
   * people wherever the rules are half-written.
   *
   * There is no `outletId`. It used to be REQUIRED, because rules hung off an
   * outlet workspace and a PR works at several venues — so the caller had to
   * guess whose rules bind, and evaluating each outlet separately would have
   * fined a PR once per venue for one week's conduct. 0113 moved the rules to
   * the agency, which is the party that both employs the PR and pays the
   * voucher, so the week is now counted once, whole, across every outlet.
   */
  async getPenalties(req: Request, res: Response) {
    try {
      const prId = paramId(req.params.id);
      const weekStart =
        typeof req.query.weekStart === 'string' ? req.query.weekStart : '';
      const weekEnd =
        typeof req.query.weekEnd === 'string' ? req.query.weekEnd : '';
      const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!isDate(weekStart) || !isDate(weekEnd)) {
        return res.status(400).json({
          success: false,
          message: 'weekStart and weekEnd (yyyy-MM-dd) are required',
          data: null,
        });
      }

      // Read, but a consequential one: these rules price a fine. Resolved to the
      // caller's agency so a PR on several rosters is judged by the rules of the
      // agency actually asking — the oldest-membership answer charged Alice by
      // Atlas's bands no matter who was looking.
      const resolved = await this.resolvePrForCaller(req, res, prId, {
        forWrite: false,
      });
      if (!resolved) return;
      const pr = resolved.pr;

      const rules = await this.agencyPenaltyRuleRepository.listByAgencyId(
        resolved.agencyId,
      );
      if (rules.length === 0) {
        // Not an error: most agencies have written no rules, and "no rules" is a
        // real answer meaning nothing can be charged.
        return res.status(200).json({
          success: true,
          message: 'OK',
          data: {
            breaches: [],
            totalFineCents: 0,
            totalFineRm: '0.00',
            window: null,
          },
        });
      }

      // Grace belongs to the late rule; with no late rule there is no lateness
      // concept, and 0 would wrongly make every minute count.
      const grace = graceMinutesFor(rules);
      const window = await this.shiftAssignmentRepository.attendanceWindow({
        prId,
        // Same agency whose rules are being applied ten lines above — judging a
        // PR by one agency's bands against another agency's conduct is exactly
        // the mismatch `resolvePrForCaller` exists to prevent.
        agencyId: resolved.agencyId,
        weekStart,
        weekEnd,
        graceMinutes: grace ?? 0,
      });

      const proposal = evaluatePrPenalties(window, rules);
      return res.status(200).json({
        success: true,
        message: 'OK',
        data: { ...proposal, window },
      });
    } catch (error) {
      logger.error('[PrController.getPenalties] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}
