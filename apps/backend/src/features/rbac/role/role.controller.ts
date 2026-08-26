import { Request, Response } from 'express';
import { RoleRepositoryClass } from './role.repository';
import { RoleType } from './role.model';
import { RoleSchema } from '@/schema/rbac.schema';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { Error } from '@/error/index';
import { isSeededRole } from '@/types/rbac-constant';

function filterRoles(roles: RoleType[], roleName?: string, status?: string): RoleType[] {
  return roles.filter((role) => {
    if (roleName && !role.roleName.toLowerCase().includes(roleName.toLowerCase())) return false;
    if (status && role.status !== status) return false;
    return true;
  });
}

const DUPLICATE_ROLE_MESSAGE =
  'A role with this name already exists in this portal. Use a different name, or pick another portal.';

export class RoleControllerClass {
  constructor(private roleRepository: RoleRepositoryClass) {}

  async getRoles(req: Request, res: Response) {
    try {
      const roles = filterRoles(
        await this.roleRepository.getAllRoles(),
        req.query.roleName as string | undefined,
        req.query.status as string | undefined,
      );
      // `isSeeded` is computed HERE and shipped, so the admin UI can hide Delete
      // without holding its own copy of SEEDED_PORTAL_ROLES — one seed list, one
      // place. The UI hiding the button is a courtesy; deleteRole refuses on the
      // server regardless, and that is the guard that actually matters.
      const portalCodes = await this.roleRepository.getPortalCodeMap();
      const data = roles.map((role) => ({
        ...role,
        isSeeded: isSeededRole(
          role.roleName,
          role.portalId ? (portalCodes.get(role.portalId) ?? null) : null,
        ),
      }));
      res.status(200).json({ success: true, message: 'OK', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getRoleById(req: Request, res: Response) {
    try {
      const role = await this.roleRepository.getRoleById(paramId(req.params.id));
      if (!role) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      const portalCode = await this.roleRepository.getPortalCodeForRole(role.portalId);
      res.status(200).json({
        success: true,
        message: 'OK',
        data: { ...role, isSeeded: isSeededRole(role.roleName, portalCode) },
      });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createRole(req: Request, res: Response) {
    try {
      const parsed = RoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      }

      const portalId = parsed.data.portalId ?? null;
      const clash = await this.roleRepository.findByNameAndPortal(
        parsed.data.roleName,
        portalId,
      );
      if (clash) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_ROLE_MESSAGE,
          data: null,
        });
      }

      const data = await this.roleRepository.createRole({
        ...parsed.data,
        portalId,
        createdBy: getActor(req),
        updatedBy: getActor(req),
      });
      res.status(201).json({ success: true, message: 'Role created', data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_ROLE_MESSAGE,
          data: null,
        });
      }
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateRole(req: Request, res: Response) {
    try {
      const parsed = RoleSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      }

      const roleId = paramId(req.params.id);
      const existing = await this.roleRepository.getRoleById(roleId);
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const nextName = parsed.data.roleName ?? existing.roleName;
      const nextPortalId =
        parsed.data.portalId !== undefined ? parsed.data.portalId : existing.portalId;

      const clash = await this.roleRepository.findByNameAndPortal(
        nextName,
        nextPortalId,
        roleId,
      );
      if (clash) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_ROLE_MESSAGE,
          data: null,
        });
      }

      const data = await this.roleRepository.updateRole(roleId, {
        ...parsed.data,
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Role updated', data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          success: false,
          message: DUPLICATE_ROLE_MESSAGE,
          data: null,
        });
      }
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Hard-delete a role — refused unless it is BOTH custom and unreferenced.
   *
   * Two refusals, both 409, both naming the way out, because a destructive
   * action that fails silently invites a second, harder click:
   *
   *  1. A SEEDED role is never deletable. `initRoles()` re-inserts it on the
   *     next backend boot with a NEW uuid, so "deleting" it would swap its
   *     identity and orphan everything holding the old one. Deactivating is not
   *     an alternative either — init-roles forces status back to 'active'.
   *  2. A role anything still references is refused, and the refusal SAYS WHAT
   *     holds it. Wiping the grants to clear the way would be a mass lockout,
   *     and `role_permission` has no history table and no soft-delete column,
   *     so the C/R/U grid would be gone for good. Migration 0105 — the only
   *     precedent for removing a role safely — REMAPS grants onto Owner rather
   *     than deleting them.
   */
  async deleteRole(req: Request, res: Response) {
    const roleId = paramId(req.params.id);
    try {
      const role = await this.roleRepository.getRoleById(roleId);
      if (!role) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const portalCode = await this.roleRepository.getPortalCodeForRole(role.portalId);
      if (isSeededRole(role.roleName, portalCode)) {
        return res.status(409).json({
          success: false,
          message: `"${role.roleName}" is built into the platform — it is recreated on every restart, so deleting it would only bring it back with a different id. Revoke it from the accounts that hold it instead.`,
          data: null,
        });
      }

      const outcome = await this.roleRepository.deleteRoleIfUnreferenced(roleId);
      if (!outcome.ok) {
        const { holders, permissions, invites, subscriptions } = outcome.blockers;
        const parts: string[] = [];
        if (holders > 0) parts.push(plural(holders, 'account holds it', 'accounts hold it'));
        if (permissions > 0) parts.push(plural(permissions, 'module permission', 'module permissions'));
        if (invites > 0) parts.push(plural(invites, 'pending invite', 'pending invites'));
        if (subscriptions > 0) {
          parts.push(plural(subscriptions, 'subscription plan grants it', 'subscription plans grant it'));
        }
        return res.status(409).json({
          success: false,
          message: `"${role.roleName}" still has ${joinBlockers(parts)}. Clear those first — nothing was changed.`,
          data: null,
        });
      }

      return res.status(200).json({
        success: true,
        message: `Role "${role.roleName}" deleted.`,
        data: null,
      });
    } catch (error) {
      // Something was granted between the count and the delete. The FK caught
      // it, which is the outcome we want — report a refusal, not a crash.
      if (isForeignKeyViolation(error)) {
        return res.status(409).json({
          success: false,
          message:
            'Something started using this role while it was being deleted, so nothing was changed. Refresh and try again.',
          data: null,
        });
      }
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async inactiveRole(req: Request, res: Response) {
    try {
      const data = await this.roleRepository.updateRole(paramId(req.params.id), {
        status: 'inactive',
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Role deactivated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}

/** Postgres foreign-key violation — something still points at the row. */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23503'
  );
}

/** "2 accounts hold it and 1 pending invite" — an English list, not a dump. */
function joinBlockers(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
