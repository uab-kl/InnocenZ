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
   * VIEW ONLY, under the owner. Seeded for BOTH the outlet and the agency —
   * roles are unique per (name, portal), so those are two distinct rows.
   *
   * Changes nothing about the organisation. Its one write is to its own account
   * — password, contact, MFA — which every signed-in user holds whatever their
   * role, so it needs no grant here. Everything else it reads and only reads.
   */
  DIRECTOR: 'Director',
  /**
   * EQUAL TO OWNER, on both portals. The stand-in for an owner who is
   * unavailable, so it is deliberately not a reduced owner: same grants, same
   * guards. Anywhere it is treated as less than an owner it fails at exactly
   * the moment it exists for.
   *
   * On the AGENCY side that includes paying PRs — raising and signing payment
   * vouchers — which is the whole reason the owner asked for the role.
   */
  GUARANTOR: 'Guarantor',
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
  { roleName: portalRoleName.DIRECTOR, portal: 'agency' },
  { roleName: portalRoleName.GUARANTOR, portal: 'agency' },
  { roleName: portalRoleName.OWNER, portal: 'outlet' },
  { roleName: portalRoleName.FINANCE, portal: 'outlet' },
  { roleName: portalRoleName.OPS_HEAD, portal: 'outlet' },
  { roleName: portalRoleName.DIRECTOR, portal: 'outlet' },
  { roleName: portalRoleName.GUARANTOR, portal: 'outlet' },
  { roleName: portalRoleName.PR, portal: null },
];

/**
 * Is this role one the backend RE-CREATES on every boot?
 *
 * The only correct test, and it must be keyed on BOTH name and portal: Owner,
 * Finance, Director and Guarantor each exist twice — once for agency, once for
 * outlet — which is legal because the unique index is lower(role_name) +
 * portal_id. A name-only test would call outlet Owner seeded because agency
 * Owner is, or miss one entirely.
 *
 * ⚠️ Do NOT be tempted to test `created_by === 'system'` instead. On the live
 * database agency Finance and outlet Ops Head both carry a USER uuid there and
 * are seeded regardless, so that guard permits deleting two seeded roles while
 * blocking nothing useful.
 *
 * Why it matters for deletion: `initRoles()` re-inserts any missing seeded role
 * on every backend start, with a NEW uuid. Deleting one does not remove it — it
 * swaps its identity, orphaning every row that referenced the old id, and the
 * operator sees the role reappear as though nothing happened. Refusing is the
 * only honest answer.
 */
export function isSeededRole(roleName: string, portalCode: string | null): boolean {
  const name = roleName.trim().toLowerCase();
  return SEEDED_PORTAL_ROLES.some(
    (seed) =>
      seed.roleName.trim().toLowerCase() === name &&
      (seed.portal ?? null) === (portalCode ?? null),
  );
}

/** Legacy snake_case names — delete via remove-specialized-portal-roles.ts only. */
export const LEGACY_SPECIALIZED_ROLE_NAMES = [
  'agency_owner',
  'agency_finance',
  'outlet_owner',
  'outlet_finance',
  'outlet_ops',
] as const;
