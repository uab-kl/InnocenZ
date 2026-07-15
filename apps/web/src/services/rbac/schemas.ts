import { z } from 'zod'

const permissionTypes = ['read', 'create', 'update', 'delete'] as const

export const RoleSchema = z.object({
  roleName: z.string().min(1).max(100),
  status: z.enum(['active', 'inactive']).default('active'),
})

export const ModuleSchema = z.object({
  moduleName: z.string().min(1).max(100),
  status: z.enum(['active', 'inactive']).default('active'),
})

export const PermissionSchema = z.object({
  moduleId: z.string().uuid(),
  permissionType: z.enum(permissionTypes),
  description: z.string().min(1).max(255),
  status: z.enum(['active', 'inactive']).default('active'),
})

export type CreateRoleInput = z.infer<typeof RoleSchema>
export type UpdateRoleInput = CreateRoleInput
export type CreateModuleInput = z.infer<typeof ModuleSchema>
export type UpdateModuleInput = CreateModuleInput
export type CreatePermissionInput = z.infer<typeof PermissionSchema>
export type UpdatePermissionInput = CreatePermissionInput
