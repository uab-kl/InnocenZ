import { Router } from 'express';
import roleRoutes from '@/features/rbac/role/role.routes.js';
import moduleRoutes from '@/features/rbac/module/module.routes.js';
import permissionRoutes from '@/features/rbac/permission/permission.routes.js';
import rolePermissionRoutes from '@/features/rbac/role-permission/role-permission.routes.js';
import userRoleRoutes from '@/features/rbac/user-role/user-role.routes.js';

const rbacRoutes = Router();

rbacRoutes.use('/role', roleRoutes);
rbacRoutes.use('/module', moduleRoutes);
rbacRoutes.use('/permission', permissionRoutes);
rbacRoutes.use('/role-permission', rolePermissionRoutes);
rbacRoutes.use('/user-role', userRoleRoutes);

export { rbacRoutes };
