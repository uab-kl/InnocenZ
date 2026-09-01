import express from 'express';
import { authRoutes } from '@/features/auth/index.js';
import { healthRoutes } from '@/features/health/index.js';
import { whatsappRoutes } from '@/features/whatsapp/index.js';
import userRoutes from '@/features/user/user.routes.js';
import { rbacRoutes } from '@/features/rbac/index.js';
import subscriptionRoutes from '@/features/subscription/subscription.routes.js';
import agencyOutletRoutes from '@/features/agency/agency-outlet.routes.js';
import agencyRoutes from '@/features/agency/agency.routes.js';
import prRoutes from '@/features/pr-personnel/pr.routes.js';
import shiftRoutes from '@/features/shift/shift.routes.js';
import paymentVoucherRoutes from '@/features/payment-voucher/payment-voucher.routes.js';
import payoutBatchRoutes from '@/features/payment-voucher/payout-batch.routes.js';
import paymentVoucherExportRoutes from '@/features/payment-voucher/payment-voucher-export.routes.js';
import shiftAssignmentRoutes from '@/features/shift-assignment/shift-assignment.routes.js';
import outletSwapRoutes from '@/features/outlet-swap/outlet-swap.routes.js';
import prAvailabilityRoutes from '@/features/pr-availability/pr-availability.routes.js';
import cutlostRoutes from '@/features/cutlost/cutlost.routes.js';
import shiftSaleRoutes from '@/features/shift-sale/shift-sale.routes.js';
import outletRoutes from '@/features/outlet/outlet.routes.js';
import platformConfigRoutes from '@/features/platform-config/platform-config.routes.js';
import memberSubscriptionRoutes from '@/features/member-subscription/member-subscription.routes.js';
import subscriptionInvoiceRoutes from '@/features/subscription-invoice/subscription-invoice.routes.js';
import paymentMethodRoutes from '@/features/payment-method/payment-method.routes.js';
import subscriptionPaymentRoutes, {
  subscriptionPaymentWebhookRouter,
} from '@/features/subscription-payment/subscription-payment.routes.js';
import outletTransactionRoutes from '@/features/outlet-transaction/outlet-transaction.routes.js';
import adminRequestRoutes from '@/features/admin-request/admin-request.routes.js';
import specialServiceRoutes from '@/features/special-service/special-service.routes.js';
import outletWorkspaceRoutes from '@/features/outlet-workspace/outlet-workspace.routes.js';
import shiftTemplateRoutes from '@/features/shift-template/shift-template.routes.js';
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
// Meta WhatsApp Cloud API webhooks — must stay public (no JWT). Meta GETs to
// verify the Callback URL and POSTs delivery/inbound events.
v1Router.use('/webhooks/whatsapp', whatsappRoutes);
// Ticket downloads open in the phone's system browser, which cannot send the
// Bearer header — the short-lived voucher-scoped ticket in the path is the
// credential (minted by an authenticated POST). Everything else stays behind
// authenticateJWT below.
v1Router.use('/payment-voucher/export', paymentVoucherExportRoutes);
// Payment-gateway settlement callbacks — public for the same reason Meta's are:
// the caller is a machine with no session, and its SIGNATURE over the raw body
// is the credential (verified in the controller before any field is read).
// Mounted here rather than with the rest of /subscription-payment because
// everything below authenticateJWT would 401 every genuine delivery.
v1Router.use('/subscription-payment/webhook', subscriptionPaymentWebhookRouter);
v1Router.use(authenticateJWT);
v1Router.use('/user', userRoutes);
// Admin-only in BOTH directions, mounted the same way as /platform-config.
//
// Every /rbac write was already requireAdmin in its own route file; the READS
// were open to any signed-in account, so a PR could enumerate the platform's
// whole permission model — 5 roles, 10 modules, 51 permissions (found 31 Jul
// 2026, TEST_SCRIPT §8 X34). No data leaked, but nothing outside the admin
// portal has ever needed it: the agency portal makes zero /rbac calls, mobile
// makes none, and public signup deliberately reads role UUIDs from env rather
// than looking them up here. Verified before gating, because the GET /user
// lesson was that a flat gate can blank a live screen.
//
// ⚠️ The ungated-router sweep (28 Jul) PASSED these. It asked whether a router
// sat behind auth — it does. It never asked whether every authenticated ROLE
// should see what is behind it. If you add a /rbac route meant for another
// role, this mount is what you have to change.
v1Router.use('/rbac', requireAdmin, rbacRoutes);
v1Router.use('/subscription', subscriptionRoutes);
v1Router.use('/agency', agencyRoutes);
// Its own mount, NOT more paths under /agency: every route inside derives the
// caller's org from the session, so it must not sit behind a prefix whose
// routes take an org id in the URL.
v1Router.use('/agency-outlet', agencyOutletRoutes);
v1Router.use('/pr', prRoutes);
v1Router.use('/shift', shiftRoutes);
v1Router.use('/payment-voucher', paymentVoucherRoutes);
v1Router.use('/payout-batch', payoutBatchRoutes);
v1Router.use('/shift-assignment', shiftAssignmentRoutes);
v1Router.use('/outlet-swap', outletSwapRoutes);
// A PR's own blocked days. The '/mine' half is scoped by token (every signed-in
// PR has a calendar); the roster-wide read is agency/admin-gated inside the
// route file and scoped through `agency_pr` in the repository.
v1Router.use('/pr-availability', prAvailabilityRoutes);
v1Router.use('/cutlost', cutlostRoutes);
v1Router.use('/shift-sale', shiftSaleRoutes);
v1Router.use('/outlet', outletRoutes);
v1Router.use('/platform-config', requireAdmin, platformConfigRoutes);
v1Router.use('/member-subscription', memberSubscriptionRoutes);
v1Router.use('/subscription-invoice', subscriptionInvoiceRoutes);
v1Router.use('/payment-method', paymentMethodRoutes);
// One row per ATTEMPT against an invoice. Carries the gateway webhook, which is
// unauthenticated by design and verified by signature inside the route file —
// so NO guard may be mounted here.
v1Router.use('/subscription-payment', subscriptionPaymentRoutes);
v1Router.use('/outlet-transaction', outletTransactionRoutes);
v1Router.use('/admin-request', adminRequestRoutes);
v1Router.use('/special-service', specialServiceRoutes);
v1Router.use('/outlet-workspace', outletWorkspaceRoutes);
v1Router.use('/shift-template', shiftTemplateRoutes);
v1Router.use('/rating', ratingRoutes);
// No role guard: every signed-in role has an inbox. Scoped by req.user.id in
// the controller, so there is no user id for a caller to tamper with.
v1Router.use('/notification', notificationRoutes);
// Agency receivables. Scoped per org in the controller.
v1Router.use('/collection-invoice', collectionInvoiceRoutes);

export default v1Router;
