import { z } from "zod";

const permissionTypes = ["read", "create", "update"] as const;

export const RoleSchema = z.object({
	roleName: z.string().trim().min(1).max(100),
	// Form values use `string` ("" when unset). Output is uuid | null for the API.
	portalId: z
		.string()
		.transform((v) => (v.length > 0 ? v : null))
		.pipe(z.string().uuid().nullable()),
	status: z.enum(["active", "inactive"]),
});

export const ModuleSchema = z.object({
	moduleName: z.string().min(1).max(100),
	moduleKey: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.transform((key) => key.toLowerCase().replace(/\s+/g, "_")),
	portalId: z
		.string()
		.transform((v) => (v.length > 0 ? v : null))
		.pipe(z.string().uuid().nullable()),
	status: z.enum(["active", "inactive"]),
});

export const PermissionSchema = z.object({
	moduleId: z.string().uuid(),
	permissionType: z.enum(permissionTypes),
	description: z.string().min(1).max(255),
	status: z.enum(["active", "inactive"]).default("active"),
});

export type CreateRoleInput = z.infer<typeof RoleSchema>;
export type UpdateRoleInput = CreateRoleInput;
export type CreateModuleInput = z.infer<typeof ModuleSchema>;
export type UpdateModuleInput = CreateModuleInput;
export type CreatePermissionInput = z.infer<typeof PermissionSchema>;
export type UpdatePermissionInput = CreatePermissionInput;
