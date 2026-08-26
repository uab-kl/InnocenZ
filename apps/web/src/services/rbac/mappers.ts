import type {
	PortalCode,
	RbacModule,
	RbacPermission,
	RbacRole,
	RolePermissionGroup,
} from "./types";

export interface BackendRole {
	id: string;
	roleName: string;
	portalId?: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	/** Absent on a backend that has not restarted yet — treat as "not seeded". */
	isSeeded?: boolean;
}

export interface BackendModule {
	id: string;
	moduleName: string;
	moduleKey?: string;
	portalId?: string | null;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface BackendPermission {
	id: string;
	moduleId: string;
	permissionType: string;
	description: string;
	status: string;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface BackendRolePermissionGroup {
	id: string;
	roleId: string;
	permissionId: string;
	permissionType: string;
	moduleId: string;
	moduleName: string;
	moduleKey?: string;
}

function portalCodeFromRoleName(roleName: string): PortalCode | null {
	const n = roleName.toLowerCase();
	if (n === "admin") return "admin";
	if (n.startsWith("agency")) return "agency";
	if (n.startsWith("outlet")) return "outlet";
	return null;
}

export function mapRole(
	role: BackendRole,
	portalCodeById?: Map<string, PortalCode>,
): RbacRole {
	const fromMap =
		role.portalId && portalCodeById
			? (portalCodeById.get(role.portalId) ?? null)
			: null;
	return {
		roleId: role.id,
		roleName: role.roleName,
		portalId: role.portalId ?? null,
		portalCode: fromMap ?? portalCodeFromRoleName(role.roleName),
		status: role.status as RbacRole["status"],
		createdAt: role.createdAt,
		updatedAt: role.updatedAt,
		createdBy: role.createdBy,
		updatedBy: role.updatedBy,
		isSeeded: role.isSeeded === true,
	};
}

export function mapModule(
	module: BackendModule,
	portalCodeById?: Map<string, PortalCode>,
): RbacModule {
	const fromMap =
		module.portalId && portalCodeById
			? (portalCodeById.get(module.portalId) ?? null)
			: null;
	return {
		moduleId: module.id,
		moduleName: module.moduleName,
		moduleKey:
			module.moduleKey ?? module.moduleName.toLowerCase().replace(/\s+/g, "_"),
		portalId: module.portalId ?? null,
		portalCode: fromMap,
		status: module.status as RbacModule["status"],
		createdAt: module.createdAt,
		updatedAt: module.updatedAt,
		createdBy: module.createdBy,
		updatedBy: module.updatedBy,
	};
}

export function mapPermission(permission: BackendPermission): RbacPermission {
	return {
		permissionId: permission.id,
		moduleId: permission.moduleId,
		permissionType:
			permission.permissionType as RbacPermission["permissionType"],
		description: permission.description,
		status: permission.status as RbacPermission["status"],
		createdAt: permission.createdAt,
		updatedAt: permission.updatedAt,
		createdBy: permission.createdBy,
		updatedBy: permission.updatedBy,
	};
}

export function mapRolePermissionGroup(
	item: BackendRolePermissionGroup,
): RolePermissionGroup {
	return {
		id: item.id,
		roleId: item.roleId,
		permissionId: item.permissionId,
		permissionType:
			item.permissionType as RolePermissionGroup["permissionType"],
		moduleId: item.moduleId,
		moduleName: item.moduleName,
		moduleKey: item.moduleKey,
	};
}
