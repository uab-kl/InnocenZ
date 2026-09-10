import { Request, Response } from 'express';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import { AgencyRepositoryClass } from '@/features/agency/agency.repository.js';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';
import { OutletRepositoryClass } from '@/features/outlet/outlet.repository.js';
import { OrgMemberInviteRepositoryClass } from '@/features/org-member-invite/org-member-invite.repository.js';
import { RoleRepositoryClass } from '@/features/rbac/role/role.repository.js';
import { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository.js';
import { UserRepositoryClass } from '@/features/user/user.repository.js';
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository.js';
import type { UserType } from '@/features/user/user.model.js';
import { Error } from '@/error/index.js';
import { AcceptOrgMemberInviteSchema } from '@/schema/outlet.schema.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { hashPassword } from '@/util/password.js';
import { normalizeInviteEmail, hashOrgMemberInviteToken } from '@/util/org-member-invite.js';
import { normalizePhoneDigits } from '@/features/auth/phone-verification.repository.js';

/**
 * Public accept for outlet/agency team invites.
 * Invite rows live on `org_member_invite`; membership is written only on accept.
 * First-time invitees complete email / name / password (phone optional) here.
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
    private userProfileRepository: UserProfileRepositoryClass,
  ) {}

  async accept(req: Request, res: Response) {
    try {
      const parsed = AcceptOrgMemberInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid request',
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

      const inviteEmail = normalizeInviteEmail(invite.email);
      const chosenEmail = normalizeInviteEmail(
        parsed.data.email?.trim() || inviteEmail,
      );
      const name = parsed.data.name.trim();
      const phoneRaw = parsed.data.phoneNum?.trim();
      const phoneNum =
        phoneRaw && phoneRaw.length > 0
          ? normalizePhoneDigits(phoneRaw)
          : null;

      if (phoneNum && phoneNum.length > 0 && phoneNum.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Phone number looks too short',
          data: null,
        });
      }

      const resolved = await this.resolveInviteUser({
        inviteEmail,
        chosenEmail,
        name,
        phoneNum: phoneNum && phoneNum.length >= 8 ? phoneNum : null,
        password: parsed.data.password,
      });
      if ('error' in resolved) {
        return res.status(resolved.error.status).json({
          success: false,
          message: resolved.error.message,
          data: null,
        });
      }

      const user = resolved.user;
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
        return this.acceptOutlet(res, {
          invite,
          user,
          actor,
          outletId: invite.outletId,
        });
      }

      return this.acceptAgency(res, {
        invite,
        user,
        actor,
        agencyId: invite.agencyId!,
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

      const existing = await this.userRepository.getUserByLoginMethod(
        'email',
        invite.email,
      );
      const needsAccountSetup = !existing || !existing.passwordHash;

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
          needsAccountSetup,
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

  /**
   * Create or update the invitee account from the first-login form.
   * Lookup starts from the invited email; form may change email / set phone.
   */
  private async resolveInviteUser(input: {
    inviteEmail: string;
    chosenEmail: string;
    name: string;
    phoneNum: string | null;
    password: string;
  }): Promise<{ user: UserType } | { error: { status: number; message: string } }> {
    const passwordHash = await hashPassword(input.password);
    const username =
      input.name.slice(0, 100) ||
      input.chosenEmail.split('@')[0]?.slice(0, 100) ||
      'member';

    if (input.phoneNum) {
      const phoneOwner = await this.userRepository.getUserByLoginMethod(
        'phone',
        input.phoneNum,
      );
      // Allow if same person we'll attach to below
      let inviteUser = await this.userRepository.getUserByLoginMethod(
        'email',
        input.inviteEmail,
      );
      if (phoneOwner && (!inviteUser || phoneOwner.id !== inviteUser.id)) {
        const chosenOwner = await this.userRepository.getUserByLoginMethod(
          'email',
          input.chosenEmail,
        );
        if (!chosenOwner || phoneOwner.id !== chosenOwner.id) {
          return {
            error: {
              status: 409,
              message: 'That phone number already has an account',
            },
          };
        }
      }
    }

    let user = await this.userRepository.getUserByLoginMethod(
      'email',
      input.inviteEmail,
    );

    if (!user && input.chosenEmail !== input.inviteEmail) {
      user = await this.userRepository.getUserByLoginMethod(
        'email',
        input.chosenEmail,
      );
    }

    if (!user) {
      // New account — chosen email must be free (already checked via lookup).
      user = await this.userRepository.createUser({
        email: input.chosenEmail,
        phoneNum: input.phoneNum,
        username,
        passwordHash,
        status: 'active',
        createdBy: 'invite',
        updatedBy: 'invite',
      });
      await this.userProfileRepository.update(user.id, {
        fullName: input.name,
        updatedBy: 'invite',
      });
      return { user };
    }

    // Existing account (invited email or chosen email).
    if (input.chosenEmail !== user.email) {
      const clash = await this.userRepository.getUserByLoginMethod(
        'email',
        input.chosenEmail,
      );
      if (clash && clash.id !== user.id) {
        return {
          error: {
            status: 409,
            message: 'That email already has an account — use another or sign in',
          },
        };
      }
    }

    const updated = await this.userRepository.updateUser(
      {
        email: input.chosenEmail,
        username,
        passwordHash,
        ...(input.phoneNum ? { phoneNum: input.phoneNum } : {}),
        updatedBy: 'invite',
      },
      user.id,
    );
    if (!updated) {
      return {
        error: { status: 500, message: 'Could not update account' },
      };
    }
    await this.userProfileRepository.update(user.id, {
      fullName: input.name,
      updatedBy: 'invite',
    });
    return { user: updated };
  }

  private async acceptOutlet(
    res: Response,
    args: {
      invite: { id: string; roleId: string; subRole: string };
      user: UserType;
      actor: string;
      outletId: string;
    },
  ) {
    const { invite, user, actor, outletId } = args;
    const existing = await this.outletMemberRepository.getByOutletAndUser(
      outletId,
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
        data: { kind: 'outlet', orgId: outletId },
      });
    }
    if (existing) {
      await this.outletMemberRepository.update(existing.id, {
        status: 'active',
        // Re-invited with whatever title THIS invite names, which need not be
        // the one they held before they were removed.
        subRole: invite.subRole,
        updatedBy: actor,
      });
    } else {
      await this.outletMemberRepository.add({
        outletId,
        userId: user.id,
        status: 'active',
        subRole: invite.subRole,
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
    const outlet = await this.outletRepository.getById(outletId);
    return res.status(200).json({
      success: true,
      message: 'Invitation accepted',
      data: {
        kind: 'outlet' as const,
        orgId: outletId,
        orgName: outlet?.name ?? null,
        subRole: invite.subRole,
        email: user.email,
      },
    });
  }

  private async acceptAgency(
    res: Response,
    args: {
      invite: { id: string; roleId: string; subRole: string };
      user: UserType;
      actor: string;
      agencyId: string;
    },
  ) {
    const { invite, user, actor, agencyId } = args;
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
        status: 'active',
        // See the venue twin: the invite's title wins over the old one.
        subRole: invite.subRole,
        updatedBy: actor,
      });
    } else {
      await this.agencyMemberRepository.add({
        agencyId,
        userId: user.id,
        status: 'active',
        subRole: invite.subRole,
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
        email: user.email,
      },
    });
  }

  private async ensurePortalRole(
    userId: string,
    roleId: string,
    actor: string,
  ) {
    const roles = await this.userRoleRepository.getUserRoles(userId);
    if (roles.some((r) => r.id === roleId)) return;
    await this.userRoleRepository.assignRoleToUser({
      userId,
      roleId,
      createdBy: actor,
      updatedBy: actor,
    });
  }
}
