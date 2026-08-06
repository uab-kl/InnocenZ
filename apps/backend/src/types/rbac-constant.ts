export const permissionTypeCode = {
  READ: 'read',
  UPDATE: 'update',
  CREATE: 'create',
} as const;

export type PermissionTypeCode = (typeof permissionTypeCode)[keyof typeof permissionTypeCode];

export const permissionTypeValues = Object.values(permissionTypeCode) as [
  PermissionTypeCode,
  ...PermissionTypeCode[],
];

/** Stable portal codes matching `main.portal.code`. */
export const portalCode = {
  ADMIN: 'admin',
  AGENCY: 'agency',
  OUTLET: 'outlet',
} as const;

export type PortalCodeValue = (typeof portalCode)[keyof typeof portalCode];

/**
 * Canonical web/mobile role names on `main.role`.
 * Org lanes (owner / finance / ops) live on agency_user / outlet_user.sub_role —
 * do NOT mint separate outlet_owner / agency_finance roles.
 */
export const portalRoleName = {
  ADMIN: 'admin',
  AGENCY: 'agency',
  OUTLET: 'outlet',
  PR: 'pr',
} as const;

/** Legacy specialized names — delete via remove-specialized-portal-roles.ts only. */
export const LEGACY_SPECIALIZED_ROLE_NAMES = [
  'agency_owner',
  'agency_finance',
  'outlet_owner',
  'outlet_finance',
  'outlet_ops',
] as const;
