import express from 'express';
import { authRoutes } from '@/features/auth/index.js';
import { healthRoutes } from '@/features/health/index.js';
import userRoutes from '@/features/user/user.routes.js';
import { rbacRoutes } from '@/features/rbac/index.js';
import subscriptionRoutes from '@/features/subscription/subscription.routes.js';
import agencyRoutes from '@/features/agency/agency.routes.js';
import prRoutes from '@/features/pr/pr.routes.js';
import shiftRoutes from '@/features/shift/shift.routes.js';
import paymentVoucherRoutes from '@/features/payment-voucher/payment-voucher.routes.js';
import shiftAssignmentRoutes from '@/features/shift-assignment/shift-assignment.routes.js';
import outletSwapRoutes from '@/features/outlet-swap/outlet-swap.routes.js';
import shiftSaleRoutes from '@/features/shift-sale/shift-sale.routes.js';
import outletRoutes from '@/features/outlet/outlet.routes.js';
import platformConfigRoutes from '@/features/platform-config/platform-config.routes.js';
import memberSubscriptionRoutes from '@/features/member-subscription/member-subscription.routes.js';
import outletTransactionRoutes from '@/features/outlet-transaction/outlet-transaction.routes.js';
import adminRequestRoutes from '@/features/admin-request/admin-request.routes.js';
import specialServiceRoutes from '@/features/special-service/special-service.routes.js';
import outletWorkspaceRoutes from '@/features/outlet-workspace/outlet-workspace.routes.js';
import ratingRoutes from '@/features/rating/rating.routes.js';
import notificationRoutes from '@/features/notification/notification.routes.js';
import collectionInvoiceRoutes from '@/features/collection-invoice/collection-invoice.routes.js';
import { platformAuditMiddleware } from '@/middlewares/platform-audit.js';
import authenticateJWT from '@/middlewares/authenticate-jwt.js';
import { requireAdmin } from '@/middlewares/require-role.js';

const v1Router = express.Router();

v1Router.use(platformAuditMiddleware);

v1Router.use('/health', healthRoutes);
v1Router.use('/auth', authRoutes);
v1Router.use(authenticateJWT);
v1Router.use('/user', userRoutes);
v1Router.use('/rbac', rbacRoutes);
v1Router.use('/subscription', subscriptionRoutes);
v1Router.use('/agency', agencyRoutes);
v1Router.use('/pr', prRoutes);
v1Router.use('/shift', shiftRoutes);
v1Router.use('/payment-voucher', paymentVoucherRoutes);
v1Router.use('/shift-assignment', shiftAssignmentRoutes);
v1Router.use('/outlet-swap', outletSwapRoutes);
v1Router.use('/shift-sale', shiftSaleRoutes);
v1Router.use('/outlet', outletRoutes);
v1Router.use('/platform-config', requireAdmin, platformConfigRoutes);
v1Router.use('/member-subscription', memberSubscriptionRoutes);
v1Router.use('/outlet-transaction', outletTransactionRoutes);
v1Router.use('/admin-request', adminRequestRoutes);
v1Router.use('/special-service', specialServiceRoutes);
v1Router.use('/outlet-workspace', outletWorkspaceRoutes);
v1Router.use('/rating', ratingRoutes);
// No role guard: every signed-in role has an inbox. Scoped by req.user.id in
// the controller, so there is no user id for a caller to tamper with.
v1Router.use('/notification', notificationRoutes);
// Agency receivables. Scoped per org in the controller.
v1Router.use('/collection-invoice', collectionInvoiceRoutes);

export default v1Router;
