export type RbacStatus = "active" | "inactive";

export type PermissionType = "read" | "create" | "update";

export type PortalCode = "admin" | "agency" | "outlet";

export interface RbacPortal {
	id: string;
	code: PortalCode;
	name: string;
	status: RbacStatus;
}

export interface RbacPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface RbacRole {
	roleId: string;
	roleName: string;
	portalId: string | null;
	portalCode: PortalCode | null;
	status: RbacStatus;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
	/**
	 * Seeded roles are recreated by the backend on every boot, so they cannot be
	 * deleted — the server refuses, and the UI hides the button. Computed
	 * server-side from SEEDED_PORTAL_ROLES; the web deliberately does NOT keep
	 * its own copy of that list. Defaults false against an older backend, which
	 * only means the button shows and the server then refuses it.
	 */
	isSeeded: boolean;
}

export interface RbacModule {
	moduleId: string;
	moduleName: string;
	moduleKey: string;
	portalId: string | null;
	portalCode: PortalCode | null;
	status: RbacStatus;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface RbacPermission {
	permissionId: string;
	moduleId: string;
	permissionType: PermissionType;
	description: string;
	status: RbacStatus;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface RolePermissionGroup {
	id: string;
	roleId: string;
	permissionId: string;
	permissionType: PermissionType;
	moduleId: string;
	moduleName: string;
	moduleKey?: string;
}

export interface RolesApiResponse {
	success: boolean;
	message: string;
	pagination: RbacPagination;
	data: RbacRole[];
}

export interface RoleApiResponse {
	success: boolean;
	message: string;
	data: RbacRole;
}

export interface RolesQueryParams {
	roleId?: string;
	roleName?: string;
	status?: RbacStatus;
	page?: number;
	pageSize?: number;
}

export interface ModulesApiResponse {
	success: boolean;
	message: string;
	pagination: RbacPagination;
	data: RbacModule[];
}

export interface ModuleApiResponse {
	success: boolean;
	message: string;
	data: RbacModule;
}

export interface ModulesQueryParams {
	moduleName?: string;
	status?: RbacStatus;
	page?: number;
	pageSize?: number;
}

export interface PermissionsApiResponse {
	success: boolean;
	message: string;
	pagination: RbacPagination;
	data: RbacPermission[];
}

export interface PermissionApiResponse {
	success: boolean;
	message: string;
	data: RbacPermission;
}

export interface PermissionsQueryParams {
	moduleId?: string;
	status?: RbacStatus;
	page?: number;
	pageSize?: number;
}

export interface RolePermissionsApiResponse {
	success: boolean;
	message: string;
	data: RolePermissionGroup[];
}
