import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
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
import { CreatePrSchema, UpdatePrSchema } from '@/schema/pr.schema';
import { PrFilter, PrStatus, PrTier, type PrWithProfileType } from './pr.model';
import { AgencyPenaltyRuleRepositoryClass } from '@/features/agency/agency-penalty-rule.repository.js';
import { PenaltyChargeRepositoryClass } from '@/features/agency/penalty-charge.repository.js';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository.js';
import { evaluatePrPenalties, graceMinutesFor } from './pr-penalty.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

/** Map agency_pr (+ user/user_profile) into the personnel list shape the web already uses. */
function rosterRowFromMembership(row: AgencyPrEnriched): PrWithProfileType | null {
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
  const rosterHasValue = [row.place, row.yearsExp, row.kpiTier, row.payClass].some(
    (v) => v !== null && v !== undefined,
  );
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
          dob: row.dob != null ? String(row.dob).slice(0, 10) : null,
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
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
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
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const pr = await this.prRepository.getByUserId(userId);
      if (!pr) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
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
        ...new Set(raw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)),
      ];

      // A request already on the agency's desk locks the selection: the PR
      // cannot add or drop agencies until it is approved or rejected.
      const current = await this.agencyPrRepository.listByUser(userId);
      const pendingLink = current.find((link) => link.approveStatus === 'pending');
      if (pendingLink) {
        return res.status(409).json({
          success: false,
          message: 'An agency request is awaiting approval. You cannot change agencies until it is approved or rejected.',
          data: null,
        });
      }

      // Every id must be a real agency, else the FK insert would 500 later.
      const known = await this.agencyPrRepository.filterExistingAgencyIds(agencyIds);
      if (known.length !== agencyIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more agencies do not exist',
          data: null,
        });
      }

      await this.agencyPrRepository.syncLinksForUser(userId, known, getActor(req));
      const links = await this.agencyPrRepository.listLinksByUserIds([userId]);

      res.status(200).json({ success: true, message: 'Agencies updated', data: links });
    } catch (error) {
      logger.error('[PrController.updateMyAgencies] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Resolves the caller's data scope. Admins see everything; every other caller
   * is confined to the org they belong to (resolved from the DB, never trusted
   * from the request body). Agency membership wins when a user holds both.
   */
  private async resolveScope(req: Request): Promise<Scope> {
    const user = req.user!;
    const roles = await this.authRepository.getRolesForUserIds([user.id]);
    const isAdmin = roles.some((r) => r.roleName === 'admin');
    if (isAdmin) return { isAdmin: true, agencyId: null, outletIds: [] };

    const memberships = await this.agencyMemberRepository.listByUser(user.id);
    const active = memberships.find((m) => m.status === 'active') ?? memberships[0];
    if (active?.agencyId) {
      return { isAdmin: false, agencyId: active.agencyId, outletIds: [] };
    }

    // No agency link — fall back to outlet membership so an outlet can read the
    // personnel rostered at its own venues.
    const outletMemberships = await this.outletMemberRepository.listByUser(user.id);
    const outletIds = [
      ...new Set(
        outletMemberships.filter((m) => m.status === 'active').map((m) => m.outletId),
      ),
    ];
    return { isAdmin: false, agencyId: null, outletIds };
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const isOutletCaller = !scope.isAdmin && !scope.agencyId && scope.outletIds.length > 0;
      if (!scope.isAdmin && !scope.agencyId && !isOutletCaller) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const { page, pageSize } = parsePaging(req);

      // Agency roster: agency_pr ⋈ user ⋈ user_profile. No `pr` table — id === userId.
      if (scope.agencyId && !scope.isAdmin) {
        const members = await this.agencyPrRepository.listByAgency(scope.agencyId, {
          search: req.query.name as string | undefined,
        });

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
        return res.status(200).json({
          success: true,
          message: 'OK',
          data: pageRows,
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
        assignedToOutletIds: isOutletCaller ? scope.outletIds : undefined,
        // Same rule as the agency branch above, for the outlet caller. Admins
        // keep the unfiltered view — the admin PR screen is where an applicant
        // stuck in `pending` has to remain visible.
        excludePending: !scope.isAdmin && req.query.status === undefined,
      };

      const { prs, totalCount } = await this.prRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: prs,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[PrController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const pr = await this.prRepository.getById(paramId(req.params.id));
      if (!pr) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      // Hide existence of records outside the caller's agency (404, not 403).
      if (!scope.isAdmin && pr.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      res.status(200).json({ success: true, message: 'OK', data: pr });
    } catch (error) {
      logger.error('[PrController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreatePrSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      let agencyId: string;
      if (scope.isAdmin) {
        if (!parsed.data.agencyId) {
          return res.status(400).json({ success: false, message: 'agencyId is required', data: null });
        }
        agencyId = parsed.data.agencyId;
      } else {
        if (!scope.agencyId) {
          return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
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
        const existingPhone = await this.userRepository.getUserByLoginMethod('phone', phone);
        if (existingPhone) userId = existingPhone.id;
      }
      if (!userId && email) {
        const existingEmail = await this.userRepository.getUserByLoginMethod('email', email);
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
      res.status(201).json({ success: true, message: 'PR created', data: withProfile ?? pr });
    } catch (error) {
      logger.error('[PrController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdatePrSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const existing = await this.prRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const data = { ...parsed.data };
      if (!scope.isAdmin) delete data.agencyId;
      const actor = getActor(req);

      // Editor fields live in three tables. Peel non-identity / non-membership
      // keys off before `prRepository.update` — those columns are not on the
      // synthetic PrInsertType.
      const { race, languages, dob, comcardHeightCm, comcardWeightKg, ...rest } = data;
      const { place, yearsExp, kpiTier, payClass, ...prColumns } = rest;
      const profilePatch = pickDefined({ race, languages, dob, comcardHeightCm, comcardWeightKg });
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
        if (data.phone !== undefined || data.email !== undefined || data.nickname !== undefined) {
          await this.userRepository.updateUser(
            {
              ...(data.phone !== undefined ? { phoneNum: data.phone || null } : {}),
              ...(data.email !== undefined ? { email: data.email || null } : {}),
              ...(data.nickname !== undefined ? { username: data.nickname || existing.name } : {}),
              updatedBy: actor,
            },
            existing.userId,
          );
        }
        if (data.tier !== undefined || data.status !== undefined || data.rejectReason !== undefined) {
          const approveStatus =
            data.status === 'active'
              ? ('approved' as const)
              : data.status === 'inactive'
                ? ('rejected' as const)
                : data.status === 'pending'
                  ? ('pending' as const)
                  : undefined;
          await this.agencyPrRepository.updateMembership(
            existing.agencyId,
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
      if (!pr) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      if (Object.keys(profilePatch).length > 0) {
        if (!pr.userId) {
          return res.status(409).json({
            success: false,
            message: 'This PR has no linked user account, so profile details cannot be saved',
            data: null,
          });
        }
        const existingProfile = await this.userProfileRepository.getByUserId(pr.userId);
        if (!existingProfile) await this.userProfileRepository.createEmpty(pr.userId, actor);
        await this.userProfileRepository.update(pr.userId, { ...profilePatch, updatedBy: actor });
      }

      // Roster grading on agency_pr (0089) — keyed by userId (pr table is gone).
      if (Object.keys(rosterPatch).length > 0 && pr.agencyId) {
        await this.agencyPrRepository.upsertRosterProfile(
          pr.agencyId,
          pr.userId,
          rosterPatch,
          actor,
        );
      }

      const JOIN_DECISION: Record<string, boolean> = { active: true, inactive: false };
      const accepted = data.status ? JOIN_DECISION[data.status] : undefined;

      if (accepted !== undefined && data.status !== existing.status && pr.userId) {
        await notify({
          userId: pr.userId,
          kind: 'agency_join_resolved',
          title: accepted ? 'You were accepted by the agency' : 'Your agency application was declined',
          body: accepted
            ? 'You can now be scheduled for shifts.'
            : (pr.rejectReason ?? undefined),
          payload: { prId: pr.id, agencyId: pr.agencyId, userId: pr.userId, status: data.status },
          actor,
        });
      }

      const withProfile = await this.prRepository.getById(pr.id);
      res.status(200).json({ success: true, message: 'PR updated', data: withProfile ?? pr });
    } catch (error) {
      logger.error('[PrController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);

      const existing = await this.prRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Detach membership — keep ops history on pr / assignment rows.
      if (existing.userId) {
        await this.agencyPrRepository.removeLink(existing.agencyId, existing.userId);
      }
      await this.prRepository.update(id, {
        status: 'inactive',
        updatedBy: getActor(req),
      });
      res.status(200).json({ success: true, message: 'PR removed', data: null });
    } catch (error) {
      logger.error('[PrController.remove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const pr = await this.prRepository.getByUserId(userId);
      if (!pr) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const rules = await this.agencyPenaltyRuleRepository.listByAgencyId(pr.agencyId);
      // Empty is a real answer — an agency that has written no rules charges
      // nothing — so this is 200 with [], never 404.
      res.status(200).json({ success: true, message: 'OK', data: rules });
    } catch (error) {
      logger.error('[PrController.getMyPenaltyRules] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const weekStart = typeof req.query.weekStart === 'string' ? req.query.weekStart : '';
      const weekEnd = typeof req.query.weekEnd === 'string' ? req.query.weekEnd : '';
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
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const [penalties, cancellations] = await Promise.all([
        this.penaltyChargeRepository.listForPrWeek(pr.id, weekStart, weekEnd),
        this.shiftAssignmentRepository.listCancelFeesForPrWeek(pr.id, weekStart, weekEnd),
      ]);
      const sum = (n: number, v: string | null) => n + Number(v ?? 0);
      const penaltiesRm = penalties.reduce((n, p) => sum(n, p.fineRm), 0);
      const cancellationsRm = cancellations.reduce((n, c) => sum(n, c.feeRm), 0);

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
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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
      const weekStart = typeof req.query.weekStart === 'string' ? req.query.weekStart : '';
      const weekEnd = typeof req.query.weekEnd === 'string' ? req.query.weekEnd : '';
      const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!isDate(weekStart) || !isDate(weekEnd)) {
        return res.status(400).json({
          success: false,
          message: 'weekStart and weekEnd (yyyy-MM-dd) are required',
          data: null,
        });
      }

      const pr = await this.prRepository.getById(prId);
      if (!pr) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const rules = await this.agencyPenaltyRuleRepository.listByAgencyId(pr.agencyId);
      if (rules.length === 0) {
        // Not an error: most agencies have written no rules, and "no rules" is a
        // real answer meaning nothing can be charged.
        return res.status(200).json({
          success: true,
          message: 'OK',
          data: { breaches: [], totalFineCents: 0, totalFineRm: '0.00', window: null },
        });
      }

      // Grace belongs to the late rule; with no late rule there is no lateness
      // concept, and 0 would wrongly make every minute count.
      const grace = graceMinutesFor(rules);
      const window = await this.shiftAssignmentRepository.attendanceWindow({
        prId,
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
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
