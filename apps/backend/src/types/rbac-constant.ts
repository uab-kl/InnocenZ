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
 * Canonical roles on `main.role` (seeded by init-roles).
 * Portal access is lane roles under each portal — there is no bare `agency` /
 * `outlet` role row. Signup owners get `Owner`; invites pick Owner/Finance/Ops Head.
 * Membership is tenancy only (`agency_user` / `outlet_user`); lane roles live on
 * `user_role` → `role` (Owner / Finance / Ops Head per portal).
 */
export const portalRoleName = {
  ADMIN: 'admin',
  PR: 'pr',
  OWNER: 'Owner',
  FINANCE: 'Finance',
  OPS_HEAD: 'Ops Head',
  /**
   * @deprecated Not seeded. Kept for legacy user_role rows / requireRole expand
   * until migration remaps them onto Owner.
   */
  AGENCY: 'agency',
  /**
   * @deprecated Not seeded. See AGENCY.
   */
  OUTLET: 'outlet',
} as const;

/** Seed rows: roleName + portal code (null = unassigned / mobile). */
export const SEEDED_PORTAL_ROLES: ReadonlyArray<{
  roleName: string;
  portal: PortalCodeValue | null;
}> = [
  { roleName: portalRoleName.ADMIN, portal: 'admin' },
  { roleName: portalRoleName.OWNER, portal: 'agency' },
  { roleName: portalRoleName.FINANCE, portal: 'agency' },
  { roleName: portalRoleName.OWNER, portal: 'outlet' },
  { roleName: portalRoleName.FINANCE, portal: 'outlet' },
  { roleName: portalRoleName.OPS_HEAD, portal: 'outlet' },
  { roleName: portalRoleName.PR, portal: null },
];

/** Legacy snake_case names — delete via remove-specialized-portal-roles.ts only. */
export const LEGACY_SPECIALIZED_ROLE_NAMES = [
  'agency_owner',
  'agency_finance',
  'outlet_owner',
  'outlet_finance',
  'outlet_ops',
] as const;
