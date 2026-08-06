import { Request, Response } from 'express';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import { AgencyRepositoryClass } from '@/features/agency/agency.repository.js';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';
import { OutletRepositoryClass } from '@/features/outlet/outlet.repository.js';
import { OrgMemberInviteRepositoryClass } from '@/features/org-member-invite/org-member-invite.repository.js';
import { RoleRepositoryClass } from '@/features/rbac/role/role.repository.js';
import { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository.js';
import { UserRepositoryClass } from '@/features/user/user.repository.js';
import { Error } from '@/error/index.js';
import { AcceptOrgMemberInviteSchema } from '@/schema/outlet.schema.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import {
  hashOrgMemberInviteToken,
} from '@/util/org-member-invite.js';

/**
 * Public accept for outlet/agency team invites.
 * Invite rows live on `org_member_invite`; membership is written only on accept.
 */
export class OrgMemberInviteControllerClass {
  constructor(
    private inviteRepository: OrgMemberInviteRepositoryClass,
    private outletMemberRepository: OutletMemberRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private outletRepository: OutletRepositoryClass,
    private agencyRepository: AgencyRepositoryClass,
    private userRepository: UserRepositoryClass,
    private roleRepository: RoleRepositoryClass,
    private userRoleRepository: UserRoleRepositoryClass,
  ) {}

  async accept(req: Request, res: Response) {
    try {
      const parsed = AcceptOrgMemberInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid token',
          data: null,
        });
      }

      const tokenHash = hashOrgMemberInviteToken(parsed.data.token);
      const invite = await this.inviteRepository.getByToken(tokenHash);
      if (!invite) {
        return res.status(404).json({
          success: false,
          message: 'Invitation not found or already used',
          data: null,
        });
      }

      const expiresAt = new Date(invite.expiresAt).getTime();
      if (expiresAt < Date.now()) {
        if (invite.status === 'pending') {
          await this.inviteRepository.update(invite.id, {
            status: 'expired',
            updatedBy: 'system',
          });
        }
        return res.status(410).json({
          success: false,
          message: 'This invitation has expired — ask the owner to invite again',
          data: null,
        });
      }

      if (invite.status === 'accepted') {
        return res.status(200).json({
          success: true,
          message: 'Already accepted',
          data: {
            kind: invite.outletId ? 'outlet' : 'agency',
            orgId: invite.outletId ?? invite.agencyId,
          },
        });
      }

      if (invite.status !== 'pending') {
        return res.status(409).json({
          success: false,
          message: 'This invitation is no longer valid',
          data: null,
        });
      }

      const user = await this.userRepository.getUserByLoginMethod(
        'email',
        invite.email,
      );
      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'No account with that email — sign up with this email first, then accept again',
          data: null,
        });
      }

      const actor = getActor(req) || user.id;
      const role = await this.roleRepository.getRoleById(invite.roleId);
      if (!role) {
        return res.status(500).json({
          success: false,
          message: 'Invite role is missing',
          data: null,
        });
      }

      if (invite.outletId) {
        const existing = await this.outletMemberRepository.getByOutletAndUser(
          invite.outletId,
          user.id,
        );
        if (existing?.status === 'active') {
          await this.inviteRepository.update(invite.id, {
            status: 'accepted',
            acceptedUserId: user.id,
            updatedBy: actor,
          });
          return res.status(200).json({
            success: true,
            message: 'Already a member',
            data: { kind: 'outlet', orgId: invite.outletId },
          });
        }
        if (existing) {
          await this.outletMemberRepository.update(existing.id, {
            subRole: invite.subRole as 'owner' | 'finance' | 'operations_head',
            status: 'active',
            updatedBy: actor,
          });
        } else {
          await this.outletMemberRepository.add({
            outletId: invite.outletId,
            userId: user.id,
            subRole: invite.subRole as 'owner' | 'finance' | 'operations_head',
            status: 'active',
            createdBy: actor,
            updatedBy: actor,
          });
        }
        await this.ensurePortalRole(user.id, invite.roleId, actor);
        await this.inviteRepository.update(invite.id, {
          status: 'accepted',
          acceptedUserId: user.id,
          updatedBy: actor,
        });
        const outlet = await this.outletRepository.getById(invite.outletId);
        return res.status(200).json({
          success: true,
          message: 'Invitation accepted',
          data: {
            kind: 'outlet' as const,
            orgId: invite.outletId,
            orgName: outlet?.name ?? null,
            subRole: invite.subRole,
          },
        });
      }

      const agencyId = invite.agencyId!;
      const existing = await this.agencyMemberRepository.getByAgencyAndUser(
        agencyId,
        user.id,
      );
      if (existing?.status === 'active') {
        await this.inviteRepository.update(invite.id, {
          status: 'accepted',
          acceptedUserId: user.id,
          updatedBy: actor,
        });
        return res.status(200).json({
          success: true,
          message: 'Already a member',
          data: { kind: 'agency', orgId: agencyId },
        });
      }
      if (existing) {
        await this.agencyMemberRepository.update(existing.id, {
          subRole: invite.subRole as 'owner' | 'finance',
          status: 'active',
          updatedBy: actor,
        });
      } else {
        await this.agencyMemberRepository.add({
          agencyId,
          userId: user.id,
          subRole: invite.subRole as 'owner' | 'finance',
          status: 'active',
          createdBy: actor,
          updatedBy: actor,
        });
      }
      await this.ensurePortalRole(user.id, invite.roleId, actor);
      await this.inviteRepository.update(invite.id, {
        status: 'accepted',
        acceptedUserId: user.id,
        updatedBy: actor,
      });
      const agency = await this.agencyRepository.getById(agencyId);
      return res.status(200).json({
        success: true,
        message: 'Invitation accepted',
        data: {
          kind: 'agency' as const,
          orgId: agencyId,
          orgName: agency?.name ?? null,
          subRole: invite.subRole,
        },
      });
    } catch (error) {
      logger.error('[OrgMemberInviteController.accept] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async preview(req: Request, res: Response) {
    try {
      const token =
        typeof req.query.token === 'string' ? req.query.token.trim() : '';
      if (token.length < 16) {
        return res.status(400).json({
          success: false,
          message: 'Invalid token',
          data: null,
        });
      }
      const invite = await this.inviteRepository.getByToken(
        hashOrgMemberInviteToken(token),
      );
      if (!invite) {
        return res.status(404).json({
          success: false,
          message: 'Invitation not found or already used',
          data: null,
        });
      }

      const expired = new Date(invite.expiresAt).getTime() < Date.now();
      const pending = invite.status === 'pending';
      const kind = invite.outletId ? 'outlet' : 'agency';
      const orgName = invite.outletId
        ? (await this.outletRepository.getById(invite.outletId))?.name
        : (await this.agencyRepository.getById(invite.agencyId!))?.name;

      return res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          kind,
          orgName: orgName ?? (kind === 'outlet' ? 'Outlet' : 'Agency'),
          subRole: invite.subRole,
          email: invite.email,
          expired,
          pending,
        },
      });
    } catch (error) {
      logger.error('[OrgMemberInviteController.preview] Error:', error);
      res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  private async ensurePortalRole(
    userId: string,
    roleId: string,
    actor: string,
  ) {
    const role = await this.roleRepository.getRoleById(roleId);
    if (!role) return;
    const roles = await this.userRoleRepository.getUserRoles(userId);
    if (roles.some((r) => r.roleName === role.roleName)) return;
    await this.userRoleRepository.assignRoleToUser({
      userId,
      roleId,
      createdBy: actor,
      updatedBy: actor,
    });
  }
}
