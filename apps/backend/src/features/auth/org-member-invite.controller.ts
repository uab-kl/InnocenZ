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
import { portalRoleName } from '@/types/rbac-constant.js';
import {
  AcceptOrgMemberInviteSchema,
  RegisterOrgMemberSchema,
} from '@/schema/outlet.schema.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { hashPassword } from '@/util/password.js';
import { saveProfileImageFile } from '@/util/profile-image.js';
import { normalizeInviteEmail, hashOrgMemberInviteToken } from '@/util/org-member-invite.js';

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

      /*
       * BY LINK OR BY ID — the same invitation either way. The emailed link
       * carries a raw token (only its hash is stored, so it is looked up by
       * hash); the profile-settings panel has no raw token and names the row.
       * Neither identifier authorises anything on its own: the session checks
       * below decide, and they are identical for both paths.
       */
      const invite = parsed.data.token
        ? await this.inviteRepository.getByToken(
            hashOrgMemberInviteToken(parsed.data.token),
          )
        : await this.inviteRepository.getById(parsed.data.inviteId!);
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

      /**
       * ONLY A SIGNED-IN, ALREADY-EXISTING ACCOUNT MAY ACCEPT (owner,
       * 10 Sep 2026: *"the signed up and can log in account only can be
       * invited to a team member"*).
       *
       * This replaces a flow that took a name, an email, a phone number and a
       * PASSWORD, and created or updated an account from them. Two things were
       * wrong with that, and the second was a live account takeover:
       *
       *  1. It let an organisation conjure a member out of an email address.
       *     A team member is now somebody who signed up themselves and can
       *     already log in; the invite grants them a ROLE, it does not mint
       *     them an identity.
       *
       *  2. ⚠️ **It could overwrite an existing account's password.** When the
       *     invited address already had an account, the old `resolveInviteUser`
       *     found that account and wrote the submitted `passwordHash` onto it.
       *     Combined with `addMember` returning the raw `acceptUrl` to the
       *     INVITER, any organisation owner could invite an existing address —
       *     an admin's — read the accept link out of their own API response,
       *     open it, and set a new password on that account. Nothing here
       *     writes a credential any more.
       *
       * The identity comes from the SESSION, never from the request body, so
       * there is nothing for a caller to assert about who they are.
       */
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message:
            'Sign in to accept this invitation — invitations can only be sent to accounts that already exist.',
          data: null,
        });
      }
      const user = await this.userRepository.getUserById(req.user.id);
      if (!user) {
        return res
          .status(401)
          .json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      /*
       * The signed-in account must BE the invited one. Without this, anybody
       * holding the link could accept it into their own account — the token
       * would become a bearer credential for somebody else's invitation.
       */
      if (normalizeInviteEmail(user.email ?? '') !== inviteEmail) {
        return res.status(403).json({
          success: false,
          message:
            'This invitation was sent to a different account — sign in as that account to accept it.',
          data: null,
        });
      }

      /*
       * ⚠️ AN ADMIN IS NOT AN ORGANISATION'S TEAM MEMBER (owner, 10 Sep 2026).
       * The platform admin console belongs to no organisation, and an admin
       * holding a membership would be judged by that organisation's job title
       * on every guard that reads the membership row. Refused at BOTH ends —
       * here, and at invite creation, because a refusal only at accept time
       * leaves the owner believing the invitation is on its way.
       */
      const heldRoles = await this.userRoleRepository.getUserRoles(user.id);
      if (heldRoles.some((r) => r.roleName === portalRoleName.ADMIN)) {
        return res.status(409).json({
          success: false,
          message:
            'This account is an InnocenZ admin and cannot join an organisation team.',
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

  /**
   * EVERY INVITATION WAITING FOR THE SIGNED-IN PERSON — the profile-settings
   * panel.
   *
   * The `/mine` pattern: the email is derived from the session and never taken
   * from the request, so this cannot be pointed at somebody else's mailbox.
   *
   * The organisation is NAMED here rather than returning a bare id, because a
   * row saying only "you have been invited" is not something anyone can act
   * on. `expired` rows are already filtered out by the repository — an
   * invitation that can only 410 should not be offered a button.
   */
  /**
   * PUBLIC team-member sign-up — register a PERSON, optionally asking to join
   * one organisation.
   *
   * The other half of how somebody joins a team. `accept` handles the
   * organisation reaching out (invite by email); this handles the person
   * reaching in, and the organisation approves. Both end at the same place: a
   * membership row the owner turns active, naming the title.
   *
   * ⚠️ NO ROLE IS GRANTED HERE, and that is the entire safety of the endpoint
   * being public. The account is created with no `user_role` at all and, when
   * an organisation is named, a membership with `status: 'pending'` — which
   * `resolveOrgScope`, `holdsAgencyLane` and every `requireRole` guard already
   * read as no access. The role arrives only when an owner approves, through
   * `updateMember`, which is an act by a signed-in member of that
   * organisation. So a stranger can create a request; only the organisation
   * can turn it into access.
   *
   * ⚠️ `subRole` is what they ASK for. The owner names the real title on
   * approval; the schema already refuses owner/guarantor so nobody can ask to
   * arrive at the top.
   */
  async registerMember(req: Request, res: Response) {
    try {
      /*
       * The form is multipart (it carries a photo), so every field arrives as a
       * string and a nested object arrives as JSON text. Parsed before
       * validation rather than after, so the schema still sees the real shape
       * and its refinements — owner/guarantor, password match — still apply.
       */
      const raw = { ...(req.body as Record<string, unknown>) };
      if (typeof raw.join === 'string') {
        try {
          raw.join = raw.join.trim() ? JSON.parse(raw.join) : undefined;
        } catch {
          return res.status(400).json({
            success: false,
            message: 'Could not read the organisation you chose.',
            data: null,
          });
        }
      }
      const parsed = RegisterOrgMemberSchema.safeParse(raw);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid request',
          data: null,
        });
      }
      const input = parsed.data;
      const email = normalizeInviteEmail(input.email);

      // The email must be free. Reusing one would either hijack an existing
      // account or create a second login for the same person.
      const emailTaken = await this.userRepository.getUserByLoginMethod(
        'email',
        email,
      );
      if (emailTaken) {
        return res.status(409).json({
          success: false,
          message: 'That email already has an account — sign in instead.',
          data: null,
        });
      }

      /*
       * The organisation is verified BEFORE the account is created, so a bad
       * id cannot leave a half-registered person behind with nothing to join.
       * It must also be ACTIVE: a request to join a switched-off organisation
       * has nobody who can approve it.
       */
      let org: { id: string; name: string } | null = null;
      if (input.join) {
        const found =
          input.join.kind === 'agency'
            ? await this.agencyRepository.getById(input.join.orgId)
            : await this.outletRepository.getById(input.join.orgId);
        if (!found || found.status !== 'active') {
          return res.status(404).json({
            success: false,
            message: 'That organisation is not available to join.',
            data: null,
          });
        }
        org = { id: found.id, name: found.name };
      }

      const passwordHash = await hashPassword(input.password);
      const user = await this.userRepository.createUser({
        email,
        phoneNum: input.phoneNum ?? null,
        username: input.name.slice(0, 100),
        passwordHash,
        status: 'active',
        createdBy: 'member-signup',
        updatedBy: 'member-signup',
      });
      await this.userProfileRepository.update(user.id, {
        fullName: input.name,
        updatedBy: 'member-signup',
      });

      /*
       * AFTER the profile row exists — `saveProfileImageFile` builds its R2 key
       * from `user_profile.full_name`, so saving the photo first would file it
       * under a name that is not there yet. Same ordering as `/register`.
       */
      if (req.file) {
        const profileImage = await saveProfileImageFile(
          { id: user.id, fullName: input.name },
          req.file,
        );
        await this.userRepository.updateUser(
          { profileImage, updatedBy: 'member-signup' },
          user.id,
        );
      }

      if (input.join && org) {
        const membership = {
          userId: user.id,
          // Asked for, not granted — see the note above.
          subRole: input.join.subRole,
          status: 'pending',
          createdBy: user.id,
          updatedBy: user.id,
        };
        if (input.join.kind === 'agency') {
          await this.agencyMemberRepository.add({
            ...membership,
            agencyId: org.id,
          });
        } else {
          await this.outletMemberRepository.add({
            ...membership,
            outletId: org.id,
          });
        }
      }

      return res.status(201).json({
        success: true,
        message: org
          ? `Account created — ${org.name} will review your request to join.`
          : 'Account created — an organisation can now invite you to their team.',
        data: {
          userId: user.id,
          email,
          requestedOrgName: org?.name ?? null,
          requestedOrgKind: input.join?.kind ?? null,
        },
      });
    } catch (error) {
      logger.error('[OrgMemberInviteController.registerMember] Error:', error);
      return res.status(500).json({
        success: false,
        message: Error.INTERNAL_SERVER_ERROR,
        data: null,
      });
    }
  }

  async listMine(req: Request, res: Response) {
    try {
      if (!req.user?.id) {
        return res
          .status(401)
          .json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }
      const me = await this.userRepository.getUserById(req.user.id);
      if (!me?.email) {
        // No email on the account means nothing could have been addressed to
        // it — an empty list, not an error.
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }

      const invites = await this.inviteRepository.listPendingByEmail(
        normalizeInviteEmail(me.email),
      );

      const data = await Promise.all(
        invites.map(async (i) => {
          const org = i.agencyId
            ? await this.agencyRepository.getById(i.agencyId)
            : i.outletId
              ? await this.outletRepository.getById(i.outletId)
              : null;
          return {
            id: i.id,
            kind: i.agencyId ? ('agency' as const) : ('outlet' as const),
            orgId: i.agencyId ?? i.outletId,
            orgName: org?.name ?? null,
            subRole: i.subRole,
            expiresAt: i.expiresAt,
            createdAt: i.createdAt,
          };
        }),
      );

      return res.status(200).json({ success: true, message: 'OK', data });
    } catch (error) {
      logger.error('[OrgMemberInviteController.listMine] Error:', error);
      return res.status(500).json({
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
   * `resolveInviteUser` WAS HERE AND IS DELETED (10 Sep 2026).
   *
   * It took a name, an email, a phone number and a password off the request
   * body and either CREATED an account or UPDATED an existing one. Both
   * halves are now wrong by rule: an invitation grants a role to somebody who
   * already signed up, so there is no account to create — and the update half
   * wrote `passwordHash` onto whatever account already held the invited
   * address, which, with `addMember` handing the raw accept link back to the
   * inviter, was an account-takeover path an organisation owner could run
   * against an admin.
   *
   * `accept` now reads the person off the SESSION and writes no credential at
   * all. Nothing should reconstruct this: if an invitee has no account, the
   * answer is that they sign up first, not that the invite makes one.
   */


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
