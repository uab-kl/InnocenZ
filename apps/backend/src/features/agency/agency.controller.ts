import { Request, Response } from 'express';
import { AgencyRepositoryClass } from './agency.repository';
import { AgencyMemberRepositoryClass } from './agency-member.repository';
import { AgencyPrRepository } from './agency-pr.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { UserRepositoryClass } from '@/features/user/user.repository';
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository';
import { notify } from '@/features/notification/notify';
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
} from '@/schema/agency.schema';
import { AgencyFilter, AgencyUserSubRole, AgencyStatus, agencyUserSubRoleValues } from './agency.model';
import { AgencyPrApproveStatus, agencyPrApproveStatusValues } from '@/features/pr-personnel/pr.model';
import { saveOrgLogoFromBase64 } from '@/util/org-logo';
import { r2DeleteStoredRef } from '@/util/r2';
import { RoleRepositoryClass } from '@/features/rbac/role/role.repository';
import { OrgMemberInviteRepositoryClass } from '@/features/org-member-invite/org-member-invite.repository';
import {
  createOrgMemberInviteSecret,
  normalizeInviteEmail,
  sendOrgMemberInviteEmail,
} from '@/util/org-member-invite';
import { sendOrgApprovedNotificationEmail } from '@/features/mailing/mailing.repository';
import { portalRoleNameForSubRole } from '@/features/rbac/portal-role-map';

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
  ) {}

  /**
   * Which agencies each PR user account is under. Replaces the old
   * `GET /agency/memberships?subRole=pr`, which read the sub_role='pr' rows
   * migration 0033 deleted.
   */
  async listPrLinks(req: Request, res: Response) {
    try {
      const userIds = String(req.query.userIds ?? '')
        .split(',')
        .map((value) => value.trim())
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

      const links = await this.agencyPrRepository.listLinksByUserIds(userIds);
      res.status(200).json({ success: true, message: 'OK', data: links });
    } catch (error) {
      logger.error('[AgencyController.listPrLinks] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** This agency's PRs, read from agency_pr. */
  async listAgencyPrs(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const existing = await this.agencyRepository.getById(agencyId);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const prs = await this.agencyPrRepository.listByAgency(agencyId, {
        approveStatus: parseApproveStatus(req.query.approveStatus),
        search: req.query.search as string | undefined,
      });
      res.status(200).json({ success: true, message: 'OK', data: prs });
    } catch (error) {
      logger.error('[AgencyController.listAgencyPrs] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Approvals — accept / decline a PR membership (`agency_pr`), not a `pr` row.
   * Body: `{ approveStatus: 'approved' | 'rejected', rejectReason?: string }`.
   */
  async setAgencyPrApproval(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const userId = paramId(req.params.userId);
      const existing = await this.agencyRepository.getById(agencyId);
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
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
        typeof req.body?.rejectReason === 'string' ? req.body.rejectReason : undefined;

      const actor = getActor(req);
      const row = await this.agencyPrRepository.setApproveStatus(
        agencyId,
        userId,
        approveStatus,
        actor,
        rejectReason,
      );
      if (!row) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
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
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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
      const { agencies, totalCount } = await this.agencyRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: agencies,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[AgencyController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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
      const subRole = subRoleParam === 'all' ? undefined : parseSubRole(subRoleParam);
      const status = (req.query.status as string | undefined) ?? 'active';
      const memberships = await this.agencyMemberRepository.listMembershipsByUserIds(userIds, {
        subRole,
        status: status === 'all' ? undefined : status,
      });
      res.status(200).json({ success: true, message: 'OK', data: memberships });
    } catch (error) {
      logger.error('[AgencyController.listMemberships] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const agency = await this.agencyRepository.getById(paramId(req.params.id));
      if (!agency) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: agency });
    } catch (error) {
      logger.error('[AgencyController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreateAgencySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const agencyCode = await this.agencyRepository.generateUniqueCode();
      const agency = await this.agencyRepository.create({
        ...parsed.data,
        agencyCode,
        status: 'pending_review',
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Agency created', data: agency });
    } catch (error) {
      logger.error('[AgencyController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdateAgencySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const {
        logoBase64,
        logoFileName,
        logoContentType,
        clearLogo,
        ...rest
      } = parsed.data;
      let agency = await this.agencyRepository.update(id, {
        ...rest,
        updatedBy: getActor(req),
      });
      if (!agency) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

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
          return res.status(400).json({ success: false, message: msg, data: null });
        }
      }

      res.status(200).json({ success: true, message: 'Agency updated', data: agency });
    } catch (error) {
      logger.error('[AgencyController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async approve(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const agency = await this.agencyRepository.update(id, { status: 'active', updatedBy: getActor(req) });
      if (!agency) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

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
          logger.warn('[AgencyController.approve] No owner email to notify', { agencyId: id });
        }
      } catch (mailError) {
        logger.error('[AgencyController.approve] Approval email failed:', mailError);
      }

      res.status(200).json({ success: true, message: 'Agency approved', data: agency });
    } catch (error) {
      logger.error('[AgencyController.approve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async suspend(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const agency = await this.agencyRepository.update(id, { status: 'suspended', updatedBy: getActor(req) });
      if (!agency) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Agency suspended', data: agency });
    } catch (error) {
      logger.error('[AgencyController.suspend] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async listMembers(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const existing = await this.agencyRepository.getById(agencyId);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

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
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async addMember(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const parsed = AddAgencyMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const agency = await this.agencyRepository.getById(agencyId);
      if (!agency) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const inviteEmail = parsed.data.email?.trim()
        ? normalizeInviteEmail(parsed.data.email)
        : null;
      let userId = parsed.data.userId;
      if (inviteEmail) {
        const user = await this.userRepository.getUserByLoginMethod('email', inviteEmail);
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

      const roleName = portalRoleNameForSubRole('agency', parsed.data.subRole);
      const role = await this.roleRepository.getRoleByName(roleName);
      if (!role) {
        return res.status(500).json({
          success: false,
          message: `Role '${roleName}' is not seeded`,
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
          subRole: parsed.data.subRole,
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
          subRole: parsed.data.subRole,
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
        subRole: parsed.data.subRole,
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
          ...(mail.emailed ? {} : { acceptUrl: mail.acceptUrl }),
        },
      });
    } catch (error) {
      logger.error('[AgencyController.addMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateMember(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const memberId = paramId(req.params.memberId);
      const parsed = UpdateAgencyMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      // The route's scope guard proves the caller owns the agency in `:id`. It
      // says NOTHING about `:memberId`, which is the row actually being written
      // — so without this an owner could address their OWN agency and mutate a
      // member of somebody else's. A scope check on the wrong parameter is not
      // a scope check. 404 rather than 403: a foreign member id must not be
      // confirmed as existing.
      const target = await this.agencyMemberRepository.getById(memberId);
      if (!target || target.agencyId !== agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const members = await this.agencyMemberRepository.listByAgency(agencyId);
      const refusal = guardMemberChange({ members, target, next: parsed.data });
      if (refusal) {
        return res.status(409).json({ success: false, message: refusal, data: null });
      }

      const member = await this.agencyMemberRepository.update(memberId, { ...parsed.data, updatedBy: getActor(req) });
      if (!member) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Member updated', data: member });
    } catch (error) {
      logger.error('[AgencyController.updateMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async removeMember(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const memberId = paramId(req.params.memberId);

      // Same two checks as updateMember, and for the same reasons.
      const target = await this.agencyMemberRepository.getById(memberId);
      if (!target || target.agencyId !== agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
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
        return res.status(409).json({ success: false, message: refusal, data: null });
      }

      const removed = await this.agencyMemberRepository.remove(memberId);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Member removed', data: null });
    } catch (error) {
      logger.error('[AgencyController.removeMember] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
