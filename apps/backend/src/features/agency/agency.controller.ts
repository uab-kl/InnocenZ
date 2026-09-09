import { Request, Response } from 'express';
import { AgencyRepositoryClass } from './agency.repository';
import { AgencyMemberRepositoryClass } from './agency-member.repository';
import { AgencyPrRepository } from './agency-pr.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { UserRepositoryClass } from '@/features/user/user.repository';
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository';
import { notify, notifyMany } from '@/features/notification/notify';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { guardMemberChange } from '@/util/member-change-guard';
import {
  CreateAgencySchema,
  UpdateAgencySchema,
  AddAgencyMemberSchema,
  UpdateAgencyMemberSchema,
  BroadcastToPrsSchema,
} from '@/schema/agency.schema';
import {
  AgencyFilter,
  AgencyUserSubRole,
  AgencyStatus,
  agencyUserSubRoleValues,
} from './agency.model';
import {
  AgencyPrApproveStatus,
  agencyPrApproveStatusValues,
} from '@/features/pr-personnel/pr.model';
import { saveOrgLogoFromBase64 } from '@/util/org-logo';
import { r2DeleteStoredRef } from '@/util/r2';
import { RoleRepositoryClass } from '@/features/rbac/role/role.repository';
import { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository';
import { OrgMemberInviteRepositoryClass } from '@/features/org-member-invite/org-member-invite.repository';
import {
  createOrgMemberInviteSecret,
  normalizeInviteEmail,
  sendOrgMemberInviteEmail,
} from '@/util/org-member-invite';
import { sendOrgApprovedNotificationEmail } from '@/features/mailing/mailing.repository';
import {
  inferMembershipSubRole,
  portalRoleNameForSubRole,
} from '@/features/rbac/portal-role-map';
import { portalRepository } from '@/features/rbac/portal/portal.repository';
import { portalRoleName } from '@/types/rbac-constant.js';
import type { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import { db } from '@/db/index.js';
import type { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import {
  enrolOrgOnPlan,
  resolveEnrollablePlan,
} from '@/features/subscription/enroll-plan.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import { startBillingOnApproval } from '@/features/subscription/start-billing.js';
import { readCropSource } from '@/util/crop-source';

function parseSubRole(value: unknown): AgencyUserSubRole | undefined {
  if (typeof value !== 'string') return undefined;
  return (agencyUserSubRoleValues as readonly string[]).includes(value)
    ? (value as AgencyUserSubRole)
    : undefined;
}

function parseApproveStatus(value: unknown): AgencyPrApproveStatus | undefined {
  if (typeof value !== 'string') return undefined;
  return (agencyPrApproveStatusValues as readonly string[]).includes(value)
    ? (value as AgencyPrApproveStatus)
    : undefined;
}

export class AgencyControllerClass {
  constructor(
    private agencyRepository: AgencyRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private agencyPrRepository: AgencyPrRepository,
    private prRepository: PrRepositoryClass,
    private userRepository: UserRepositoryClass,
    private userProfileRepository: UserProfileRepositoryClass,
    private roleRepository: RoleRepositoryClass,
    private inviteRepository: OrgMemberInviteRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private userRoleRepository: UserRoleRepositoryClass,
    // An admin-created agency must land on a plan, same rule as sign-up.
    private subscriptionRepository: SubscriptionRepositoryClass,
    private memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
    // Approval starts the billing meter, and opens the first period there and
    // then rather than leaving it to the 03:00 job.
    private subscriptionInvoiceRepository: SubscriptionInvoiceRepositoryClass,
  ) {}

  /**
   * Which agencies each PR user account is under. Replaces the old
   * `GET /agency/memberships?subRole=pr`, which read the sub_role='pr' rows
   * migration 0033 deleted.
   */
  async listPrLinks(req: Request, res: Response) {
    try {
      let userIds = String(req.query.userIds ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      const callerId = req.user?.id;
      if (!callerId) {
        return res
          .status(401)
          .json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      // Admin + agency operators may look up any PR; a PR may only read self.
      const roles = await this.authRepository.getRolesForUserIds([callerId]);
      const isAdmin = roles.some((r) => r.roleName === portalRoleName.ADMIN);
      const isAgency = roles.some((r) => r.portalCode === 'agency');
      if (!isAdmin && !isAgency) {
        userIds = [callerId];
      }

      if (userIds.length === 0) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      if (userIds.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'At most 200 userIds can be requested at once',
          data: null,
        });
      }

      /**
       * ⚠️ AN AGENCY SEES ITS OWN LINK AND NO OTHER.
       *
       * Being allowed to LOOK UP a PR is not the same as being allowed to read
       * every roster that PR is on, and this conflated the two: any agency token
       * could post up to 200 user ids and get back, for each, the name and code of
       * every agency they work for, plus that agency's private `tier` for them.
       *
       * That is a rival's identity attached to a shared PR, and it walks straight
       * through the cross-agency anonymity everything else maintains — the roster
       * grid says only WHEN a shared PR is unavailable, deliberately, and this
       * handed over the short list of WHO to pair it with. The portal will not even
       * render a foreign tier where it happens to hold one.
       *
       * Admin stays unfiltered: the user-management screens are its only caller and
       * an admin is already trusted across every agency.
       */

      /**
       * ⚠️ AND SO DOES ANYONE READING ONLY THEMSELVES.
       *
       * The note above used to end "A PR reading self is clamped above and keeps
       * the whole list, which is hers to see." The clamp was real — a PR's
       * `userIds` is narrowed to `[callerId]` thirty lines up — but the list was
       * not: a PR then fell into the agency-scoping branch below, which resolves
       * the caller's own AGENCY_USER membership. A PR has no `agency_user` row at
       * all (that is the staff table, and migration 0033 deleted its
       * `sub_role='pr'` rows), so `callerAgencyId` came back null and the handler
       * returned `[]` to the one person entitled to every row of it. On their
       * phone, `fetchMyAgencyLinks` fed a profile screen that listed no agencies.
       *
       * Answered BEFORE the rival-privacy rule rather than inside it. The
       * standing lesson from this very handler is that hardening one refusal
       * means walking every EARLIER one; the converse is what bit here — a
       * self-read has to be settled before a rule about OTHER people's data gets
       * the chance to answer it, because to that rule every row looks foreign.
       *
       * Safe for every role, not just PRs: the rows returned are keyed to the
       * caller's own user id, so an agency operator asking only about themselves
       * learns nothing they did not already own.
       */
      const isSelfReadOnly = userIds.length === 1 && userIds[0] === callerId;

      if (!isAdmin && !isSelfReadOnly) {
        // ACTIVE memberships only, and never `own[0]`. An arbitrary row here is
        // the same defect as the `?? memberships[0]` fallback removed from
        // `resolveOrgScope`: it let a REMOVED operator keep answering as the
        // agency that removed them.
        const own = await this.agencyMemberRepository.listMembershipsByUserIds(
          [callerId],
          {
            status: 'active',
          },
        );
        const callerAgencyId = own[0]?.agencyId ?? null;
        if (!callerAgencyId) {
          // An agency-portal account with no agency behind it can answer nothing.
          // Empty, never unfiltered — failing open here is the whole bug.
          return res
            .status(200)
            .json({ success: true, message: 'OK', data: [] });
        }
        const scoped = await this.agencyPrRepository.listLinksByUserIds(
          userIds,
          {
            agencyId: callerAgencyId,
          },
        );
        return res
          .status(200)
          .json({ success: true, message: 'OK', data: scoped });
      }

      const links = await this.agencyPrRepository.listLinksByUserIds(userIds);
      res.status(200).json({ success: true, message: 'OK', data: links });
    } catch (error) {
      logger.error('[AgencyController.listPrLinks] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /** This agency's PRs, read from agency_pr. */
  async listAgencyPrs(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const existing = await this.agencyRepository.getById(agencyId);
      if (!existing)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });

      const prs = await this.agencyPrRepository.listByAgency(agencyId, {
        approveStatus: parseApproveStatus(req.query.approveStatus),
        search: req.query.search as string | undefined,
      });
      res.status(200).json({ success: true, message: 'OK', data: prs });
    } catch (error) {
      logger.error('[AgencyController.listAgencyPrs] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Approvals — accept / decline a PR membership (`agency_pr`), not a `pr` row.
   * Body: `{ approveStatus: 'approved' | 'rejected', rejectReason?: string }`.
   */
  /**
   * POST /agency/:id/broadcast — send one notice to several of this agency's PRs.
   *
   * Recipients are named in the body, which is the whole reason this lives here
   * and not on the notification router: that router promises in its own header
   * that no route on it accepts a user id, and scopes everything by
   * `req.user.id`. Taking recipients there would quietly retract that promise.
   * Here the ids are checked against `:id`, which the scope guard has already
   * proved the caller owns.
   *
   * All-or-nothing on membership. Addressing a PR who is not on the roster is a
   * mistake worth reporting, not worth partially honouring: a caller who sees
   * "sent" while two of five recipients were dropped has been told something
   * false about who has been contacted.
   */
  async broadcastToPrs(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      if (!agencyId) {
        return res.status(400).json({
          success: false,
          message: 'Agency id is required',
          data: null,
        });
      }

      const agency = await this.agencyRepository.getById(agencyId);
      if (!agency) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const parsed = BroadcastToPrsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }
      const { prIds, title, body } = parsed.data;

      const recipients = await this.agencyPrRepository.listApprovedUserIdsIn(
        agencyId,
        prIds,
      );
      const requested = new Set(prIds).size;
      if (recipients.length !== requested) {
        // Counts only — naming which ids failed would confirm to a prober which
        // user ids are real, and the caller picked these off a list we gave them.
        return res.status(403).json({
          success: false,
          message: `${requested - recipients.length} of ${requested} selected PRs are not approved members of this agency`,
          data: null,
        });
      }

      const actor = getActor(req);
      const written = await notifyMany(recipients, {
        kind: 'agency_broadcast',
        title,
        body,
        // Attribution only — a broadcast has no object to open. See the kind's
        // note in notification.model.ts.
        payload: { agencyId },
        actor,
      });

      // notify() swallows its own errors by design, so a short write is the only
      // signal that anything went wrong. Reporting it beats a blanket "sent" —
      // this endpoint exists because the UI already lied about delivery once.
      if (written !== recipients.length) {
        logger.error(
          `[AgencyController.broadcastToPrs] agency ${agencyId}: wrote ${written} of ${recipients.length} notifications`,
        );
        return res.status(500).json({
          success: false,
          message: `Only ${written} of ${recipients.length} PRs were notified — please retry`,
          data: { sent: written, requested: recipients.length },
        });
      }

      return res.status(201).json({
        success: true,
        message: 'OK',
        data: { sent: written, requested: recipients.length },
      });
    } catch (error) {
      logger.error('[AgencyController.broadcastToPrs] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async setAgencyPrApproval(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const userId = paramId(req.params.userId);
      const existing = await this.agencyRepository.getById(agencyId);
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const approveStatus = parseApproveStatus(req.body?.approveStatus);
      if (approveStatus !== 'approved' && approveStatus !== 'rejected') {
        return res.status(400).json({
          success: false,
          message: 'approveStatus must be approved or rejected',
          data: null,
        });
      }

      const rejectReason =
        typeof req.body?.rejectReason === 'string'
          ? req.body.rejectReason
          : undefined;

      const actor = getActor(req);

      // The row's CURRENT status decides what this decision MEANS. The payload
      // contract is unchanged (approved | rejected) — but on a `leave_pending`
      // row "approved" approves the DEPARTURE and "rejected" refuses it. The
      // web sends the same shape either way; this branch is the single source
      // of the join-vs-leave distinction.
      const currentLinks = await this.agencyPrRepository.listByUser(userId);
      const currentLink = currentLinks.find((l) => l.agencyId === agencyId);
      if (!currentLink) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      if (currentLink.approveStatus === 'leave_pending') {
        if (approveStatus === 'approved') {
          // Approving the departure RE-RUNS the settlement gate: money can
          // re-open between the PR's request and this decision (a new shift
          // assigned, a voucher issued), and 'left' must never be granted
          // over an open ledger.
          const blockers = await this.agencyPrRepository.listLeaveBlockers(
            agencyId,
            userId,
            // NAMED here, counts only for the PR: this reader has to go and
            // settle these exact papers, so the numbers are the instruction.
            { named: true },
          );
          if (blockers.length > 0) {
            return res.status(409).json({
              success: false,
              message: `The departure cannot be approved yet: ${blockers.join('; ')}.`,
              data: { blockers },
            });
          }
          const leftRow = await this.agencyPrRepository.setApproveStatus(
            agencyId,
            userId,
            'left',
            actor,
          );
          if (!leftRow) {
            return res
              .status(404)
              .json({ success: false, message: Error.NOT_FOUND, data: null });
          }
          // Reuses the join-resolution kind — notification_kind is a PG enum
          // and a departure-specific value would cost another migration; the
          // title carries the meaning.
          await notify({
            userId,
            kind: 'agency_join_resolved',
            title: 'Your departure from the agency was approved',
            body: 'You are no longer under this agency.',
            payload: { agencyId, userId, approveStatus: 'left' },
            actor,
          });
          return res.status(200).json({
            success: true,
            message: 'Departure approved',
            data: leftRow,
          });
        }

        // Refusing a departure: the membership CONTINUES, and the PR is owed
        // the why — the reason is mandatory and lands on the row prefixed so
        // the history chip can tell a refused departure from a refused join.
        const reason = rejectReason?.trim();
        if (!reason) {
          return res.status(400).json({
            success: false,
            message:
              'A reason is required to reject a departure — it is sent to the PR.',
            data: null,
          });
        }
        const keptRow = await this.agencyPrRepository.setApproveStatus(
          agencyId,
          userId,
          'approved',
          actor,
          `[Leave rejected] ${reason}`,
        );
        if (!keptRow) {
          return res
            .status(404)
            .json({ success: false, message: Error.NOT_FOUND, data: null });
        }
        await notify({
          userId,
          kind: 'agency_join_resolved',
          title: 'Your departure request was declined',
          body: reason,
          payload: { agencyId, userId, approveStatus: 'approved' },
          actor,
        });
        return res.status(200).json({
          success: true,
          message: 'Departure rejected',
          data: keptRow,
        });
      }

      // Join semantics, unchanged: a reason only ever lands on a REJECT.
      // (setApproveStatus now honours an explicit reason for any status — that
      // is for the departure branch above; here the old rule holds.)
      const row = await this.agencyPrRepository.setApproveStatus(
        agencyId,
        userId,
        approveStatus,
        actor,
        approveStatus === 'rejected' ? rejectReason : undefined,
      );
      if (!row) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Ops still require pr.id until Phase C — bridge from user / user_profile.
      if (approveStatus === 'approved') {
        const [user, profile] = await Promise.all([
          this.userRepository.getUserById(userId),
          this.userProfileRepository.getByUserId(userId),
        ]);
        await this.prRepository.ensureOpsBridge({
          userId,
          agencyId,
          actor,
          tier: row.tier,
          name: profile?.fullName?.trim() || user?.username || 'PR',
          nickname: user?.username ?? null,
          phone: user?.phoneNum ?? null,
          email: user?.email ?? null,
          icNo: profile?.idNo ?? null,
        });
      }

      await notify({
        userId,
        kind: 'agency_join_resolved',
        title:
          approveStatus === 'approved'
            ? 'You were accepted by the agency'
            : 'Your agency application was declined',
        body:
          approveStatus === 'approved'
            ? 'You can now be scheduled for shifts.'
            : (row.rejectReason ?? undefined),
        payload: { agencyId, userId, approveStatus },
        actor,
      });

      res.status(200).json({ success: true, message: 'OK', data: row });
    } catch (error) {
      logger.error('[AgencyController.setAgencyPrApproval] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const filter: AgencyFilter = {
        name: req.query.name as string | undefined,
        agencyCode: req.query.agencyCode as string | undefined,
        status: req.query.status as AgencyStatus | undefined,
      };
      const { agencies, totalCount } =
        await this.agencyRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: agencies,
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
      logger.error('[AgencyController.list] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /** Batch lookup: agencies linked to the given users (used by admin PR list). */
  async listMemberships(req: Request, res: Response) {
    try {
      const raw = (req.query.userIds as string | undefined) ?? '';
      const userIds = raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (userIds.length === 0) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      if (userIds.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'At most 200 userIds can be requested at once',
          data: null,
        });
      }

      // Every sub-role by default. This endpoint used to default to 'pr' for the
      // admin PR list, but agency_user holds only portal operators now — the
      // PR-to-agency links moved to agency_pr (GET /agency/pr-links).
      const subRoleParam = req.query.subRole as string | undefined;
      const subRole =
        subRoleParam === 'all' ? undefined : parseSubRole(subRoleParam);
      const status = (req.query.status as string | undefined) ?? 'active';
      const memberships =
        await this.agencyMemberRepository.listMembershipsByUserIds(userIds, {
          subRole,
          status: status === 'all' ? undefined : status,
        });

      /**
       * ⚠️ AN AGENCY SEES ITS OWN STAFF AND NO OTHER — the operator-side twin of
       * the rule `listPrLinks` above already enforces.
       *
       * This took an arbitrary list of up to 200 user ids and answered, for each,
       * every agency they belong to, with that agency's name and code. Gated by
       * `requireRole('admin','agency')` and nothing else, so any agency operator
       * could map out which people staff which rival — the same cross-agency
       * anonymity `listPrLinks` was hardened to protect, on the endpoint that
       * carries the OPERATORS rather than the PRs. It never got the matching
       * treatment because the fix there was named after PRs.
       *
       * Admin stays unfiltered — the user-management screens are its only caller
       * and an admin is already trusted across every agency. A caller reading
       * ONLY THEMSELVES keeps the whole list, which is the one live use of this
       * endpoint: `resolve-session-identity` asks it which agency the signed-in
       * operator belongs to, and clamping that would leave them with no session.
       */
      const callerId = req.user?.id ?? null;
      const roles = callerId
        ? await this.authRepository.getRolesForUserIds([callerId])
        : [];
      const isAdmin = roles.some((r) => r.roleName === portalRoleName.ADMIN);
      const isSelfReadOnly = userIds.length === 1 && userIds[0] === callerId;

      if (!isAdmin && !isSelfReadOnly) {
        const own = await this.agencyMemberRepository.listMembershipsByUserIds(
          callerId ? [callerId] : [],
          { status: 'active' },
        );
        const callerAgencyId = own[0]?.agencyId ?? null;
        // No agency behind the account answers nothing. Empty, never unfiltered.
        const scoped = callerAgencyId
          ? memberships.filter((m) => m.agencyId === callerAgencyId)
          : [];
        return res
          .status(200)
          .json({ success: true, message: 'OK', data: scoped });
      }

      res.status(200).json({ success: true, message: 'OK', data: memberships });
    } catch (error) {
      logger.error('[AgencyController.listMemberships] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const agency = await this.agencyRepository.getById(
        paramId(req.params.id),
      );
      if (!agency)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: agency });
    } catch (error) {
      logger.error('[AgencyController.getById] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateAgencySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }
      const actor = getActor(req);
      const agencyCode = await this.agencyRepository.generateUniqueCode();
      // Out of the spread — `packageId` belongs to `member_subscription`, not
      // to the agency row.
      const { packageId, ...agencyData } = parsed.data;

      // The same rule sign-up uses. An agency with no plan is invisible to the
      // Sunday tier job, which reads FROM `member_subscription`, so it could
      // never be re-priced and would work unbilled indefinitely.
      const chosen = await resolveEnrollablePlan({
        subscriptionRepository: this.subscriptionRepository,
        accountType: 'agency',
        packageId,
      });
      if (!chosen.ok) {
        return res
          .status(400)
          .json({ success: false, message: chosen.message, data: null });
      }

      // Agency and plan commit together or not at all.
      const agency = await db.transaction(async (tx) => {
        const created = await this.agencyRepository.create(
          {
            ...agencyData,
            agencyCode,
            status: 'pending_review',
            createdBy: actor,
            updatedBy: actor,
          },
          tx,
        );
        await enrolOrgOnPlan({
          memberSubscriptionRepository: this.memberSubscriptionRepository,
          plan: chosen.plan,
          subscriberType: 'agency',
          subscriberId: created.id,
          subscriberName: created.name,
          actor,
          tx,
        });
        return created;
      });
      res
        .status(201)
        .json({ success: true, message: 'Agency created', data: agency });
    } catch (error) {
      logger.error('[AgencyController.create] Error:', error);
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
      const parsed = UpdateAgencySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }
      // `logoSourceDataUrl`/`logoCropState` are pulled out with the other logo
      // fields: they belong to the R2 sidecar, not to the agency row.
      const {
        logoBase64,
        logoFileName,
        logoContentType,
        logoSourceDataUrl,
        logoCropState,
        clearLogo,
        ...rest
      } =
        parsed.data;
      let agency = await this.agencyRepository.update(id, {
        ...rest,
        updatedBy: getActor(req),
      });
      if (!agency)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });

      const previousLogo = agency.logoImage;
      if (clearLogo) {
        await r2DeleteStoredRef(previousLogo);
        const cleared = await this.agencyRepository.update(id, {
          logoImage: null,
          updatedBy: getActor(req),
        });
        if (cleared) agency = cleared;
      } else if (logoBase64 && logoFileName) {
        try {
          const logoKey = await saveOrgLogoFromBase64({
            kind: 'agency',
            orgId: agency.id,
            orgName: agency.name,
            fileName: logoFileName,
            contentType: logoContentType,
            base64: logoBase64,
            sourceDataUrl: logoSourceDataUrl,
            cropState: logoCropState,
          });
          const withLogo = await this.agencyRepository.update(id, {
            logoImage: logoKey,
            updatedBy: getActor(req),
          });
          if (withLogo) agency = withLogo;
          if (previousLogo && previousLogo !== logoKey) {
            await r2DeleteStoredRef(previousLogo);
          }
        } catch (logoError) {
          // `Error` import is API message constants — use globalThis.Error here.
          const msg =
            logoError instanceof globalThis.Error
              ? logoError.message
              : 'Logo upload failed';
          return res
            .status(400)
            .json({ success: false, message: msg, data: null });
        }
      }

      res
        .status(200)
        .json({ success: true, message: 'Agency updated', data: agency });
    } catch (error) {
      logger.error('[AgencyController.update] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * The ORIGINAL behind this agency's logo — the outlet handler's twin. Served
   * by the server because the public r2.dev host sends no CORS header, so the
   * browser can neither `fetch` the original nor draw it into a canvas it is
   * still allowed to export. `data: null` means "no sidecar", which is the
   * ordinary answer for any logo uploaded before this shipped.
   */
  async getLogoSource(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const agency = await this.agencyRepository.getById(id);
      if (!agency) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const source = await readCropSource(agency.logoImage);
      res.status(200).json({ success: true, message: 'OK', data: source });
    } catch (error) {
      logger.error('[AgencyController.getLogoSource] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async approve(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const agency = await this.agencyRepository.update(id, {
        status: 'active',
        updatedBy: getActor(req),
      });
      if (!agency)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });

      /**
       * THE MONEY STARTS HERE (owner's call, 9 Sep 2026) — the outlet handler's
       * twin, and deliberately the same shared call rather than a second copy of
       * the rule. An agency bills WEEKLY, so its first period is the payroll
       * week (Sun–Sat) containing this approval, not a month.
       *
       * Awaited but never fatal, and re-approving a suspended agency stamps
       * nothing; see `startBillingOnApproval`.
       */
      await startBillingOnApproval({
        memberSubscriptionRepository: this.memberSubscriptionRepository,
        subscriptionInvoiceRepository: this.subscriptionInvoiceRepository,
        subscriberType: 'agency',
        subscriberId: id,
        actor: getActor(req),
      });

      // Notify the agency owner — approval already persisted; email failure must not roll it back.
      try {
        const owners = await this.agencyMemberRepository.listByAgency(id, {
          subRole: 'owner',
        });
        const owner = owners.find((m) => m.email);
        if (owner?.email) {
          await sendOrgApprovedNotificationEmail({
            recipientEmail: owner.email,
            name: owner.username,
            orgName: agency.name,
            orgKind: 'agency',
          });
        } else {
          logger.warn('[AgencyController.approve] No owner email to notify', {
            agencyId: id,
          });
        }
      } catch (mailError) {
        logger.error(
          '[AgencyController.approve] Approval email failed:',
          mailError,
        );
      }

      res
        .status(200)
        .json({ success: true, message: 'Agency approved', data: agency });
    } catch (error) {
      logger.error('[AgencyController.approve] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async suspend(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const agency = await this.agencyRepository.update(id, {
        status: 'suspended',
        updatedBy: getActor(req),
      });
      if (!agency)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      res
        .status(200)
        .json({ success: true, message: 'Agency suspended', data: agency });
    } catch (error) {
      logger.error('[AgencyController.suspend] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * The admin's OFF switch (owner, 2 Sep 2026: "admin can set the user approval
   * status to inactive to make the user cannot login"). `inactive` is the one
   * organisation status the auth layer refuses — every login is denied and the
   * JWT middleware re-reads the organisation on each request, so sessions
   * already open die with it. `suspended` deliberately does NOT do this (a
   * suspended org keeps a profile-only session); this is the harder state.
   * The way back is `approve`, which sets `active`.
   */
  async deactivate(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const agency = await this.agencyRepository.update(id, {
        status: 'inactive',
        updatedBy: getActor(req),
      });
      if (!agency)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      logger.warn(`[AgencyController.deactivate] ${getActor(req)} set agency ${id} inactive`);
      res.status(200).json({
        success: true,
        message: 'Agency set inactive — its accounts can no longer sign in',
        data: agency,
      });
    } catch (error) {
      logger.error('[AgencyController.deactivate] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Active RBAC roles for this agency portal — invite dropdown (not /rbac admin).
   *
   * Owner is withheld on purpose: an invitation goes to an address that has no
   * account yet, so granting the top lane there hands the agency to whoever
   * opens that email. Ownership is still transferable — the owner promotes a
   * member who has already accepted and signed in, via
   * `PUT /:id/members/:memberId`. `addMember` enforces the same rule, because a
   * dropdown that omits a value does not stop a POST that names it.
   */
  async listInviteRoles(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const existing = await this.agencyRepository.getById(agencyId);
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const portal = await portalRepository.getPortalByCode('agency');
      if (!portal) {
        return res.status(500).json({
          success: false,
          message: 'Agency portal is not seeded',
          data: null,
        });
      }
      const roles = (await this.roleRepository.getAllRoles())
        .filter(
          (r) =>
            r.portalId === portal.id &&
            r.status === 'active' &&
            inferMembershipSubRole('agency', r.roleName) !== 'owner',
        )
        .map((r) => ({
          id: r.id,
          roleName: r.roleName,
          portalId: r.portalId,
          portalCode: 'agency' as const,
          status: r.status,
        }));
      res.status(200).json({ success: true, message: 'OK', data: roles });
    } catch (error) {
      logger.error('[AgencyController.listInviteRoles] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async listMembers(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const existing = await this.agencyRepository.getById(agencyId);
      if (!existing)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });

      const subRole = parseSubRole(req.query.subRole);
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      const members = await this.agencyMemberRepository.listByAgency(agencyId, {
        subRole,
        status: status === 'all' ? undefined : status,
        search,
      });
      res.status(200).json({ success: true, message: 'OK', data: members });
    } catch (error) {
      logger.error('[AgencyController.listMembers] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async addMember(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const parsed = AddAgencyMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }

      const agency = await this.agencyRepository.getById(agencyId);
      if (!agency) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const inviteEmail = parsed.data.email?.trim()
        ? normalizeInviteEmail(parsed.data.email)
        : null;
      let userId = parsed.data.userId;
      if (inviteEmail) {
        const user = await this.userRepository.getUserByLoginMethod(
          'email',
          inviteEmail,
        );
        if (user) userId = user.id;
      } else if (userId) {
        const user = await this.userRepository.getUserById(userId);
        if (!user?.email) {
          return res.status(400).json({
            success: false,
            message: 'That account has no email — cannot send an invitation',
            data: null,
          });
        }
      }

      const email =
        inviteEmail ??
        (userId
          ? normalizeInviteEmail(
              (await this.userRepository.getUserById(userId))?.email ?? '',
            )
          : '');
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'email or userId is required',
          data: null,
        });
      }

      if (userId) {
        const existing = await this.agencyMemberRepository.getByAgencyAndUser(
          agencyId,
          userId,
        );
        if (existing && existing.status === 'active') {
          return res.status(409).json({
            success: false,
            message: 'User is already a member of this agency',
            data: null,
          });
        }
      }

      let role = null as Awaited<
        ReturnType<RoleRepositoryClass['getRoleById']>
      >;
      let subRole = parsed.data.subRole;

      if (parsed.data.roleId) {
        role = await this.roleRepository.getRoleById(parsed.data.roleId);
        if (!role || role.status !== 'active') {
          return res.status(400).json({
            success: false,
            message: 'Invalid or inactive role',
            data: null,
          });
        }
        const portal = await portalRepository.getPortalByCode('agency');
        if (!portal || role.portalId !== portal.id) {
          return res.status(400).json({
            success: false,
            message: 'Role does not belong to the agency portal',
            data: null,
          });
        }
        // `inferMembershipSubRole('agency', …)` is now typed to the two lanes an
        // agency issues, so the ops-head fold that stood here was unreachable.
        subRole = subRole ?? inferMembershipSubRole('agency', role.roleName);
      } else {
        const roleName = portalRoleNameForSubRole('agency', subRole!);
        role = await this.roleRepository.findByNameAndPortalCode(
          roleName,
          'agency',
        );
        if (!role) {
          return res.status(500).json({
            success: false,
            message: `Role '${roleName}' is not seeded`,
            data: null,
          });
        }
      }

      if (!subRole) {
        return res.status(400).json({
          success: false,
          message: 'subRole or roleId is required',
          data: null,
        });
      }

      // No invitation may grant the top lane — see listInviteRoles. Checked on
      // BOTH the lane and the role, since either one alone reaches it: subRole is
      // what `agencyOwnerOfParam` reads, roleId is what accept grants.
      //
      // GUARANTOR counts as the top lane. It holds the owner's matrix outright,
      // including `payment_voucher` CREATE, so an emailed invitation straight
      // into it would hand whoever opens that link the ability to pay PRs. The
      // existing escape hatch covers it: invite them lower, then move them up
      // from the Team picker, which is an act by a signed-in owner rather than
      // by anyone holding a link.
      const invitedLane = inferMembershipSubRole('agency', role.roleName);
      const TOP_LANES = ['owner', 'guarantor'] as const;
      if (
        TOP_LANES.includes(subRole as (typeof TOP_LANES)[number]) ||
        TOP_LANES.includes(invitedLane as (typeof TOP_LANES)[number])
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Owner and Guarantor cannot be invited — invite them as Finance or Director, then change their role once they have joined',
          data: null,
        });
      }

      const actor = getActor(req);
      const secret = createOrgMemberInviteSecret();
      const pending = await this.inviteRepository.findPendingByOrgEmail({
        email,
        agencyId,
      });
      let invite;
      if (pending) {
        invite = await this.inviteRepository.update(pending.id, {
          token: secret.tokenHash,
          expiresAt: secret.expiresAt,
          roleId: role.id,
          subRole,
          updatedBy: actor,
        });
      } else {
        invite = await this.inviteRepository.create({
          email,
          token: secret.tokenHash,
          expiresAt: secret.expiresAt,
          outletId: null,
          agencyId,
          roleId: role.id,
          subRole,
          status: 'pending',
          acceptedUserId: null,
          createdBy: actor,
          updatedBy: actor,
        });
      }

      const mail = await sendOrgMemberInviteEmail({
        to: email,
        orgKind: 'agency',
        orgName: agency.name,
        subRole,
        rawToken: secret.rawToken,
      });

      res.status(201).json({
        success: true,
        message: mail.emailed
          ? 'Invitation sent — they must accept the email to join'
          : 'Invitation created (email not configured) — share the accept link',
        data: {
          invite,
          emailed: mail.emailed,
          acceptUrl: mail.acceptUrl,
        },
      });
    } catch (error) {
      logger.error('[AgencyController.addMember] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async updateMember(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const memberId = paramId(req.params.memberId);
      const parsed = UpdateAgencyMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message,
          data: null,
        });
      }

      // The route's scope guard proves the caller owns the agency in `:id`. It
      // says NOTHING about `:memberId`, which is the row actually being written
      // — so without this an owner could address their OWN agency and mutate a
      // member of somebody else's. A scope check on the wrong parameter is not
      // a scope check. 404 rather than 403: a foreign member id must not be
      // confirmed as existing.
      const target =
        await this.agencyMemberRepository.getByIdEnriched(memberId);
      if (!target || target.agencyId !== agencyId) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // You manage others' lanes — not your own. Appoint another owner first if
      // you need to step down; never self-demote through this endpoint.
      if (
        req.user?.id &&
        target.userId === req.user.id &&
        parsed.data.subRole != null &&
        parsed.data.subRole !== target.subRole
      ) {
        return res.status(409).json({
          success: false,
          message: 'You cannot change your own role',
          data: null,
        });
      }

      const members = await this.agencyMemberRepository.listByAgency(agencyId);
      const refusal = guardMemberChange({ members, target, next: parsed.data });
      if (refusal) {
        return res
          .status(409)
          .json({ success: false, message: refusal, data: null });
      }

      const actor = getActor(req);

      /**
       * REACTIVATION NEEDS A ROLE NAMED, because removal took the old one away.
       *
       * ⚠️ A member with an active `agency_user` row and NO agency role reads
       * back as an OWNER. The sub-role is derived from RBAC, and every step of
       * that derivation falls back to owner when it finds nothing:
       * `roleName: r.roleName ?? 'Owner'`, then `match?.roleName ??
       * portalRoleName.OWNER` in `laneFromRoleHints`, then
       * `lanes.get(userId) ?? 'owner'` in the enricher. `guardMemberChange`
       * then counts that phantom as "another active owner" — which is what
       * permits removing the LAST real one, and an agency with no account
       * holding an agency role cannot reach the invite route to let anyone back
       * in. That state was unreachable until `removeMember` began revoking the
       * role, so this refusal is part of that change, not separate from it.
       *
       * There is nothing to restore automatically: the sub-role lives on
       * `user_role`, never on `agency_user` (see the note on AgencyUserTable),
       * so once the role is gone the member's former lane is gone with it. The
       * owner has to say which lane they are restoring.
       */
      const reactivating =
        parsed.data.status === 'active' && target.status !== 'active';
      if (reactivating && parsed.data.subRole == null) {
        const portal = await portalRepository.getPortalByCode('agency');
        const held = await this.userRoleRepository.getUserRoles(target.userId);
        const hasAgencyRole = held.some(
          (r) => portal && r.portalId === portal.id,
        );
        if (!hasAgencyRole) {
          return res.status(409).json({
            success: false,
            message:
              'This member lost their role when they were removed — choose a role to restore them with.',
            data: null,
          });
        }
      }

      if (
        parsed.data.subRole != null &&
        parsed.data.subRole !== target.subRole
      ) {
        const roleName = portalRoleNameForSubRole(
          'agency',
          parsed.data.subRole,
        );
        const nextRole = await this.roleRepository.findByNameAndPortalCode(
          roleName,
          'agency',
        );
        if (!nextRole) {
          return res.status(500).json({
            success: false,
            message: `Role '${roleName}' is not seeded`,
            data: null,
          });
        }
        const portal = await portalRepository.getPortalByCode('agency');
        const held = await this.userRoleRepository.getUserRoles(target.userId);
        for (const r of held) {
          if (portal && r.portalId === portal.id) {
            await this.userRoleRepository.removeRoleFromUser(
              target.userId,
              r.id,
            );
          }
        }
        await this.userRoleRepository.assignRoleToUser({
          userId: target.userId,
          roleId: nextRole.id,
          createdBy: actor,
          updatedBy: actor,
        });
      }

      const memberRow =
        parsed.data.status != null
          ? await this.agencyMemberRepository.update(memberId, {
              status: parsed.data.status,
              updatedBy: actor,
            })
          : await this.agencyMemberRepository.getById(memberId);
      if (!memberRow) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      /**
       * DEACTIVATING HERE IS REMOVING, so it must revoke the same way.
       *
       * `status` on this endpoint is free text and an owner's to set — the route
       * file says so — and setting it to anything but 'active' takes the member
       * out of the agency exactly as `removeMember` does. Revoking only on the
       * DELETE would have left the identical hole one route down: the
       * `user_role` row surviving, so a deactivated operator still clears
       * `requireRole('agency')` and stays a signed-in agency account.
       */
      if (parsed.data.status != null && parsed.data.status !== 'active') {
        await this.revokeAgencyPortalRoleIfLastMembership(target.userId);
      }

      const member =
        await this.agencyMemberRepository.getByIdEnriched(memberId);
      res
        .status(200)
        .json({ success: true, message: 'Member updated', data: member });
    } catch (error) {
      logger.error('[AgencyController.updateMember] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  /**
   * Revoke the agency portal role once the user's LAST active membership goes.
   *
   * `remove()` and a `status` write on `updateMember` both only flip
   * `agency_user.status`; the `user_role` row survives, and
   * `requireRole('agency')` reads that row. Leaving it behind meant an operator
   * who had just been removed still cleared the coarse role gate — and, before
   * the matching fix in `resolveOrgScope`, still resolved this agency's FULL
   * scope through the very membership that was revoked.
   *
   * Conditional on it being the LAST one, because `user_role` is a global
   * (user, role) pair with no agency on it: someone who staffs two agencies
   * holds ONE agency role covering both, so revoking it unconditionally would
   * evict them from the agency that did not remove them. While any active
   * membership remains the role is still earned, and `resolveOrgScope` confines
   * them to the agencies they are still in.
   *
   * Shared by both callers on purpose. Two copies of a revocation rule is how
   * one of them gets missed — which is precisely what happened when this lived
   * inline in `removeMember` and `updateMember` could deactivate without it.
   */
  private async revokeAgencyPortalRoleIfLastMembership(
    userId: string,
  ): Promise<void> {
    const stillActive = (
      await this.agencyMemberRepository.listByUser(userId)
    ).some((m) => m.status === 'active');
    if (stillActive) return;
    const portal = await portalRepository.getPortalByCode('agency');
    if (!portal) return;
    const held = await this.userRoleRepository.getUserRoles(userId);
    for (const r of held) {
      if (r.portalId === portal.id) {
        await this.userRoleRepository.removeRoleFromUser(userId, r.id);
      }
    }
  }

  async removeMember(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const memberId = paramId(req.params.memberId);

      // Same two checks as updateMember, and for the same reasons.
      const target =
        await this.agencyMemberRepository.getByIdEnriched(memberId);
      if (!target || target.agencyId !== agencyId) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Same rule as outlet: never let an operator delete their own membership.
      if (req.user?.id && target.userId === req.user.id) {
        return res.status(409).json({
          success: false,
          message: 'You cannot remove yourself from the team',
          data: null,
        });
      }

      const members = await this.agencyMemberRepository.listByAgency(agencyId);
      const refusal = guardMemberChange({ members, target });
      if (refusal) {
        return res
          .status(409)
          .json({ success: false, message: refusal, data: null });
      }

      const removed = await this.agencyMemberRepository.remove(memberId);
      if (!removed)
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });

      await this.revokeAgencyPortalRoleIfLastMembership(target.userId);

      res
        .status(200)
        .json({ success: true, message: 'Member removed', data: null });
    } catch (error) {
      logger.error('[AgencyController.removeMember] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }
}
