import type {
  RbacModule,
  RbacPermission,
  RbacRole,
  RolePermissionGroup,
} from './types'

export interface BackendRole {
  id: string
  roleName: string
  status: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface BackendModule {
  id: string
  moduleName: string
  status: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface BackendPermission {
  id: string
  moduleId: string
  permissionType: string
  description: string
  status: string
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
}

export interface BackendRolePermissionGroup {
  id: string
  roleId: string
  permissionId: string
  permissionType: string
  moduleId: string
  moduleName: string
}

export function mapRole(role: BackendRole): RbacRole {
  return {
    roleId: role.id,
    roleName: role.roleName,
    status: role.status as RbacRole['status'],
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    createdBy: role.createdBy,
    updatedBy: role.updatedBy,
  }
}

export function mapModule(module: BackendModule): RbacModule {
  return {
    moduleId: module.id,
    moduleName: module.moduleName,
    status: module.status as RbacModule['status'],
    createdAt: module.createdAt,
    updatedAt: module.updatedAt,
    createdBy: module.createdBy,
    updatedBy: module.updatedBy,
  }
}

export function mapPermission(permission: BackendPermission): RbacPermission {
  return {
    permissionId: permission.id,
    moduleId: permission.moduleId,
    permissionType:
      permission.permissionType as RbacPermission['permissionType'],
    description: permission.description,
    status: permission.status as RbacPermission['status'],
    createdAt: permission.createdAt,
    updatedAt: permission.updatedAt,
    createdBy: permission.createdBy,
    updatedBy: permission.updatedBy,
  }
}

export function mapRolePermissionGroup(
  item: BackendRolePermissionGroup,
): RolePermissionGroup {
  return {
    id: item.id,
    roleId: item.roleId,
    permissionId: item.permissionId,
    permissionType: item.permissionType as RolePermissionGroup['permissionType'],
    moduleId: item.moduleId,
    moduleName: item.moduleName,
  }
}
