import { Request, Response } from 'express';
import {
  ensureAccountCodeFromMembership,
  isPendingOrgCode,
  issueOrgMemberCode,
} from '@/util/member-code.js';
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
  RequestOrgJoinSchema,
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
       * ⚠️ ADMINS MAY JOIN A TEAM — reversed by the owner, 11 Sep 2026: "make
       * admin can be the org team member, because only admin can add admin
       * this could be fine".
       *
       * A refusal stood here AND at invite creation, deliberately paired so
       * that an owner was never left believing an invitation was on its way.
       * Both are lifted together for the same reason: leaving one would
       * recreate exactly the half-answer the pairing existed to prevent.
       * `refuseUninvitableAccount` carries the full account of why it is safe
       * now — the credential-writing path an admin invitation could once be
       * turned into no longer exists.
       */
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


  /**
   * ASK TO JOIN ANOTHER ORGANISATION — the third way onto a team.
   *
   * Owner, 11 Sep 2026: "exist account user can join another org now works for
   * web like outlet, agency". Sign-up creates a PERSON and a request together
   * and is refused for an address that already exists ("sign in instead"); an
   * invite is the organisation reaching out. Somebody who already works
   * somewhere and wants a second job had no way to ASK — they could only wait
   * to be invited, which is the opposite of asking.
   *
   * ⚠️ WHO is asking comes from `req.user`, never from the body. The schema
   * carries no email, no name and no credential, so this endpoint cannot be
   * pointed at another account or write one.
   *
   * ⚠️ IT GRANTS NOTHING, which is what makes it safe for any signed-in
   * person. The row is written at `status: 'pending'`, and every scope
   * resolver and role guard reads a non-active membership as no access at all
   * — the same reasoning that lets `registerMember` be a public endpoint. Only
   * `updateMember`, an act by somebody inside that organisation, turns it into
   * access.
   */
  async requestJoin(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user?.id) {
        return res.status(401).json({
          success: false,
          message: 'Sign in first, then ask to join a team.',
          data: null,
        });
      }
      const parsed = RequestOrgJoinSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: parsed.error.issues[0]?.message ?? 'Invalid request',
          data: null,
        });
      }
      const { kind, orgId, subRole } = parsed.data;

      /*
       * The organisation is checked BEFORE anything is written, and must be
       * ACTIVE — a request to join a switched-off organisation has nobody who
       * can answer it. Same test, same wording, as the sign-up path.
       */
      const org =
        kind === 'agency'
          ? await this.agencyRepository.getById(orgId)
          : await this.outletRepository.getById(orgId);
      if (!org || org.status !== 'active') {
        return res.status(404).json({
          success: false,
          message: 'That organisation is not available to join.',
          data: null,
        });
      }

      /*
       * ⚠️ FOUR STATES A ROW MAY ALREADY BE IN, AND THE DATABASE GUARDS NONE
       * OF THEM. The only uniqueness on these tables is PARTIAL — `ON (org_id,
       * user_id) WHERE status = 'active'` (0160) — so a second row is legal
       * beside any of the four, duplicate `pending` rows included. Every rule
       * below therefore has to be enforced here.
       *
       * ⚠️ `listByUser` rather than `getByAgencyAndUser`: that lookup has no
       * status filter, no ORDER BY and `limit(1)`, so it returns an ARBITRARY
       * row the moment a person has two at one organisation — which is exactly
       * what this endpoint can create.
       */
      const mine =
        kind === 'agency'
          ? (await this.agencyMemberRepository.listByUser(user.id)).filter(
              (m) => m.agencyId === orgId,
            )
          : (await this.outletMemberRepository.listByUser(user.id)).filter(
              (m) => m.outletId === orgId,
            );

      if (mine.some((m) => m.status === 'active')) {
        return res.status(409).json({
          success: false,
          message: `You are already on ${org.name}'s team.`,
          data: null,
        });
      }
      if (mine.some((m) => m.status === 'pending')) {
        return res.status(409).json({
          success: false,
          message: `You have already asked to join ${org.name} — it is waiting for them to answer.`,
          data: null,
        });
      }

      /*
       * ⚠️ A FORMER MEMBER'S ROW IS REUSED; A DECLINED ONE IS NOT. The
       * difference is the member id, and it matters both ways.
       *
       * REUSE an `inactive` row: it holds a REAL organisation id, which may
       * already sit on a payment voucher or in an email. Inserting fresh would
       * mint them a SECOND real id at the same organisation on approval — the
       * unique index does not stop it, because the two codes differ — and "an
       * id that can change is not an id".
       *
       * INSERT FRESH after a `rejected` row: it only ever held an `INNPND`
       * placeholder, so nothing is lost by leaving it alone — and leaving it
       * alone is the point. Its `updated_by` is the only record that anybody
       * declined this person; flipping that row back to `pending` would
       * overwrite the decliner's name with the requester's, and the Declined
       * list would simply lose them. A decline is an answer, not a ban, so
       * asking again is allowed — but the first answer must survive it.
       */
      const former = mine.find((m) => m.status === 'inactive');
      const actor = getActor(req);
      if (former) {
        const updated =
          kind === 'agency'
            ? await this.agencyMemberRepository.update(former.id, {
                status: 'pending',
                subRole,
                updatedBy: actor,
              })
            : await this.outletMemberRepository.update(former.id, {
                status: 'pending',
                subRole,
                updatedBy: actor,
              });
        if (!updated) {
          return res.status(500).json({
            success: false,
            message: Error.INTERNAL_SERVER_ERROR,
            data: null,
          });
        }
      } else if (kind === 'agency') {
        await this.agencyMemberRepository.add({
          agencyId: orgId,
          userId: user.id,
          subRole,
          status: 'pending',
          createdBy: user.id,
          updatedBy: user.id,
        });
      } else {
        await this.outletMemberRepository.add({
          outletId: orgId,
          userId: user.id,
          subRole,
          status: 'pending',
          createdBy: user.id,
          updatedBy: user.id,
        });
      }

      return res.status(201).json({
        success: true,
        message: `Request sent — ${org.name} will review it.`,
        data: { kind, orgId, orgName: org.name, subRole },
      });
    } catch (error) {
      logger.error('[OrgMemberInviteController.requestJoin] Error:', error);
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
      /*
       * ⚠️ MINT THE ID, because this row may never have had one (0161).
       *
       * Reuse flips an EXISTING row to active, and that row can be a request
       * that was pending or declined — carrying the `INNPND` placeholder the
       * column DEFAULT issues precisely to mean "no id was ever granted".
       * Without this, accepting an invitation made somebody a full member
       * permanently stamped `INNPND0007`, and `user.member_code` was never
       * mirrored either. The `else` branch is already safe on its own:
       * `add()` mints for a status:'active' insert.
       *
       * Gated on the placeholder, so a FORMER member returning keeps the real
       * id they were always known by — an id that can change is not an id.
       */
      if (isPendingOrgCode(existing.memberCode)) {
        await issueOrgMemberCode('outlet', outletId, async (code) => {
          await this.outletMemberRepository.update(existing.id, {
            memberCode: code,
            updatedBy: actor,
          });
          return code;
        });
      }
      await ensureAccountCodeFromMembership(user.id);
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
      // See the venue twin for why: a reused row may still carry the `INNPND`
      // placeholder, and going active without minting leaves a full member
      // stamped with the code that means "no id was ever granted".
      if (isPendingOrgCode(existing.memberCode)) {
        await issueOrgMemberCode('agency', agencyId, async (code) => {
          await this.agencyMemberRepository.update(existing.id, {
            memberCode: code,
            updatedBy: actor,
          });
          return code;
        });
      }
      await ensureAccountCodeFromMembership(user.id);
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
