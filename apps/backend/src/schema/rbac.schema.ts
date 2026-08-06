import { z } from 'zod';
import { permissionTypeValues } from '@/types/rbac-constant';

export const RoleSchema = z.object({
  roleName: z.string().trim().min(1).max(100),
  portalId: z.uuid().nullable().optional(),
  status: z.string().default('active'),
});

export const ModuleSchema = z.object({
  moduleName: z.string().min(1).max(100),
  moduleKey: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((key) => key.toLowerCase().replace(/\s+/g, '_'))
    .optional(),
  portalId: z.uuid().nullable().optional(),
  status: z.string().default('active'),
});

/** Normalize optional moduleKey from moduleName before insert/update. */
export function withModuleKey<T extends { moduleName: string; moduleKey?: string }>(
  data: T,
): T & { moduleKey: string } {
  const moduleKey =
    data.moduleKey ??
    data.moduleName.toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
  return { ...data, moduleKey };
}

export const PermissionSchema = z.object({
  moduleId: z.uuid(),
  permissionType: z.enum(permissionTypeValues),
  description: z.string().min(1).max(255),
  status: z.string().default('active'),
});

export const RolePermissionSchema = z.object({
  roleId: z.uuid(),
  permissionId: z.uuid(),
});

export const SyncRolePermissionSchema = z.object({
  permissionIds: z.array(z.uuid()),
});

export const UserRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});

export const UpdateUserRoleSchema = z.object({
  userId: z.uuid(),
  previousRoleId: z.uuid(),
  roleId: z.uuid(),
});

export type RolePermissionGroupType = {
  id: string;
  roleId: string;
  permissionId: string;
  permissionType: string;
  moduleId: string;
  moduleName: string;
  moduleKey: string;
};
