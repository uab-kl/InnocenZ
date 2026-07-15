export const permissionTypeCode = {
    READ: 'read',
    DELETE: 'delete',
    UPDATE: 'update',
    CREATE: 'create',
} as const;

export type PermissionTypeCode = (typeof permissionTypeCode)[keyof typeof permissionTypeCode];

export const permissionTypeValues = Object.values(permissionTypeCode) as [
    PermissionTypeCode,
    ...PermissionTypeCode[],
];
