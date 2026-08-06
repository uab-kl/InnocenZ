import { z } from 'zod';
import { permissionTypeValues } from '@/types/rbac-constant';

export const RoleSchema = z.object({
  // Seeded roles and guards match lowercase names (`admin`, `agency`, …).
  roleName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((name) => name.toLowerCase()),
  status: z.string().default('active'),
});

export const ModuleSchema = z.object({
  moduleName: z.string().min(1).max(100),
  status: z.string().default('active'),
});

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
};
