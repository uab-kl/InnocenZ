import { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import { AuthControllerClass } from '@/features/auth/auth.controller.js';
import { OtpControllerClass } from '@/features/auth/otp.controller.js';
import { PhoneVerificationRepositoryClass } from '@/features/auth/phone-verification.repository.js';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { HealthControllerClass } from '@/features/health/health.controller.js';
import { RoleRepositoryClass } from '@/features/rbac/role/role.repository.js';
import { AdminMfaRepositoryClass } from '@/features/admin-mfa/admin-mfa.repository.js';
import { RoleControllerClass } from '@/features/rbac/role/role.controller.js';
import { ModuleRepositoryClass } from '@/features/rbac/module/module.repository.js';
import { ModuleControllerClass } from '@/features/rbac/module/module.controller.js';
import { PermissionRepositoryClass } from '@/features/rbac/permission/permission.repository.js';
import { PermissionControllerClass } from '@/features/rbac/permission/permission.controller.js';
import { RolePermissionRepositoryClass } from '@/features/rbac/role-permission/role-permission.repository.js';
import { RolePermissionControllerClass } from '@/features/rbac/role-permission/role-permission.controller.js';
import { UserRepositoryClass } from '@/features/user/user.repository.js';
import { UserControllerClass } from '@/features/user/user.controller.js';
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository.js';
import { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository.js';
import { UserRoleControllerClass } from '@/features/rbac/user-role/user-role.controller.js';
import { AuditLogRepositoryClass } from '@/features/audit-log/audit-log.repository.js';
import { NotificationRepositoryClass } from '@/features/notification/notification.repository.js';
import { NotificationControllerClass } from '@/features/notification/notification.controller.js';
import { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
import { SubscriptionControllerClass } from '@/features/subscription/subscription.controller.js';
import { OutletRepositoryClass } from '@/features/outlet/outlet.repository.js';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository.js';
import { OutletControllerClass } from '@/features/outlet/outlet.controller.js';
import { AgencyRepositoryClass } from '@/features/agency/agency.repository.js';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository.js';
import { AgencyPrRepository } from '@/features/agency/agency-pr.repository.js';
import { AgencyControllerClass } from '@/features/agency/agency.controller.js';
import { PlatformConfigRepositoryClass } from '@/features/platform-config/platform-config.repository.js';
import { PlatformConfigControllerClass } from '@/features/platform-config/platform-config.controller.js';
import { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import { MemberSubscriptionControllerClass } from '@/features/member-subscription/member-subscription.controller.js';
import { PaymentMethodRepositoryClass } from '@/features/payment-method/payment-method.repository.js';
import { PaymentMethodControllerClass } from '@/features/payment-method/payment-method.controller.js';
import { OutletTransactionRepositoryClass } from '@/features/outlet-transaction/outlet-transaction.repository.js';
import { OutletTransactionControllerClass } from '@/features/outlet-transaction/outlet-transaction.controller.js';
import { AdminRequestRepositoryClass } from '@/features/admin-request/admin-request.repository.js';
import { AdminRequestControllerClass } from '@/features/admin-request/admin-request.controller.js';
import { SpecialServiceRepositoryClass } from '@/features/special-service/special-service.repository.js';
import { SpecialServiceControllerClass } from '@/features/special-service/special-service.controller.js';
import { OutletWorkspaceRepositoryClass } from '@/features/outlet-workspace/outlet-workspace.repository.js';
import { OutletWorkspaceControllerClass } from '@/features/outlet-workspace/outlet-workspace.controller.js';
import { RatingRepositoryClass } from '@/features/rating/rating.repository.js';
import { RatingControllerClass } from '@/features/rating/rating.controller.js';
import { PrRepositoryClass } from '@/features/pr/pr.repository.js';
import { PrControllerClass } from '@/features/pr/pr.controller.js';
import { ShiftRepositoryClass } from '@/features/shift/shift.repository.js';
import { ShiftControllerClass } from '@/features/shift/shift.controller.js';
import { ShiftSaleRepositoryClass } from '@/features/shift-sale/shift-sale.repository.js';
import { ShiftSaleControllerClass } from '@/features/shift-sale/shift-sale.controller.js';
import { PaymentVoucherRepositoryClass } from '@/features/payment-voucher/payment-voucher.repository.js';
import { PaymentVoucherDisputeRepositoryClass } from '@/features/payment-voucher/payment-voucher-dispute.repository.js';
import { PaymentVoucherControllerClass } from '@/features/payment-voucher/payment-voucher.controller.js';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository.js';
import { ShiftAssignmentControllerClass } from '@/features/shift-assignment/shift-assignment.controller.js';
import { OutletSwapRepositoryClass } from '@/features/outlet-swap/outlet-swap.repository.js';
import { OutletSwapControllerClass } from '@/features/outlet-swap/outlet-swap.controller.js';
import { CutlostRepositoryClass } from '@/features/cutlost/cutlost.repository.js';
import { CutlostControllerClass } from '@/features/cutlost/cutlost.controller.js';
import { PaymentVoucherGeneratorClass } from '@/features/payment-voucher/payment-voucher-generator.js';
import { CollectionInvoiceRepositoryClass } from '@/features/collection-invoice/collection-invoice.repository.js';
import { CollectionInvoiceControllerClass } from '@/features/collection-invoice/collection-invoice.controller.js';

export const jwtController = new JwtControllerClass();
export const userRoleRepository = new UserRoleRepositoryClass();
export const userProfileRepository = new UserProfileRepositoryClass();
export const userRepository = new UserRepositoryClass(userRoleRepository, userProfileRepository);
export const authRepository = new AuthRepositoryClass(jwtController, userRepository, userRoleRepository);
// Declared above authController: registration resolves its own role by name now,
// rather than trusting a roleId off the request body.
export const roleRepository = new RoleRepositoryClass();
// TOTP enrolments. Declared above authController, which challenges at login.
export const adminMfaRepository = new AdminMfaRepositoryClass();
export const phoneVerificationRepository = new PhoneVerificationRepositoryClass();
export const otpController = new OtpControllerClass(phoneVerificationRepository, userRepository);
// Declared before authController — PR register writes agency_pr by user_id.
export const agencyPrRepository = new AgencyPrRepository();
export const authController = new AuthControllerClass(
  authRepository,
  jwtController,
  userRepository,
  userProfileRepository,
  roleRepository,
  adminMfaRepository,
  phoneVerificationRepository,
  agencyPrRepository,
);
export const healthController = new HealthControllerClass();

export const roleController = new RoleControllerClass(roleRepository);

export const moduleRepository = new ModuleRepositoryClass();
export const moduleController = new ModuleControllerClass(moduleRepository);

export const permissionRepository = new PermissionRepositoryClass();
export const permissionController = new PermissionControllerClass(permissionRepository);

export const rolePermissionRepository = new RolePermissionRepositoryClass();
export const rolePermissionController = new RolePermissionControllerClass(rolePermissionRepository);

export const userController = new UserControllerClass(userRepository, userProfileRepository);
export const userRoleController = new UserRoleControllerClass(userRoleRepository);
export const auditLogRepository = new AuditLogRepositoryClass();

// In-app notifications. Producers should call notify() rather than reaching for
// this directly — it is the seam a real transport gets added behind later.
export const notificationRepository = new NotificationRepositoryClass();
// The read side. Producers write through notify(); recipients read through here.
export const notificationController = new NotificationControllerClass(notificationRepository);

export const subscriptionRepository = new SubscriptionRepositoryClass();
export const subscriptionController = new SubscriptionControllerClass(subscriptionRepository);

export const agencyRepository = new AgencyRepositoryClass();
export const agencyMemberRepository = new AgencyMemberRepositoryClass();

export const outletRepository = new OutletRepositoryClass();
export const outletMemberRepository = new OutletMemberRepositoryClass();
export const outletController = new OutletControllerClass(outletRepository, outletMemberRepository);


export const platformConfigRepository = new PlatformConfigRepositoryClass();
export const platformConfigController = new PlatformConfigControllerClass(platformConfigRepository);

export const memberSubscriptionRepository = new MemberSubscriptionRepositoryClass();
/**
 * Repositories for resolveOrgScope (util/org-scope.ts), the scope resolver five
 * other controllers already use. Declared after the member repositories.
 */
export const orgScopeDeps = {
  authRepository,
  agencyMemberRepository,
  outletMemberRepository,
};

export const memberSubscriptionController = new MemberSubscriptionControllerClass(memberSubscriptionRepository, orgScopeDeps);

// The card a venue/agency pays with. Same scope resolver: the owner comes from
// the session, never from the request body.
export const paymentMethodRepository = new PaymentMethodRepositoryClass();
export const paymentMethodController = new PaymentMethodControllerClass(
  paymentMethodRepository,
  orgScopeDeps,
);

export const outletTransactionRepository = new OutletTransactionRepositoryClass();
export const outletTransactionController = new OutletTransactionControllerClass(outletTransactionRepository);

export const adminRequestRepository = new AdminRequestRepositoryClass();
// Approving a plan change writes the member_subscription ledger, so the
// controller also holds the ledger + plan-catalog repositories.
export const adminRequestController = new AdminRequestControllerClass(
  adminRequestRepository,
  memberSubscriptionRepository,
  subscriptionRepository,
  // A venue reads its OWN pending switch through the same scope resolver the
  // other member-facing controllers use — never from a client-supplied id.
  orgScopeDeps,
);

export const prRepository = new PrRepositoryClass();
export const agencyController = new AgencyControllerClass(
  agencyRepository,
  agencyMemberRepository,
  agencyPrRepository,
  prRepository,
  userRepository,
  userProfileRepository,
);

export const specialServiceRepository = new SpecialServiceRepositoryClass();
export const specialServiceController = new SpecialServiceControllerClass(
  specialServiceRepository,
  prRepository,
  authRepository,
  orgScopeDeps,
);

export const outletWorkspaceRepository = new OutletWorkspaceRepositoryClass();
export const outletWorkspaceController = new OutletWorkspaceControllerClass(outletWorkspaceRepository);

export const ratingRepository = new RatingRepositoryClass();
export const ratingController = new RatingControllerClass(ratingRepository, prRepository, agencyMemberRepository, authRepository, outletMemberRepository);
// Declared above prController, which needs it for the penalty proposal endpoint.
// Takes no constructor args, so the move up is free.
export const shiftAssignmentRepository = new ShiftAssignmentRepositoryClass();

export const prController = new PrControllerClass(
  prRepository,
  agencyMemberRepository,
  authRepository,
  outletMemberRepository,
  agencyPrRepository,
  outletWorkspaceRepository,
  shiftAssignmentRepository,
  userRepository,
  userProfileRepository,
  userRoleRepository,
  roleRepository,
);

export const shiftRepository = new ShiftRepositoryClass();
export const shiftController = new ShiftControllerClass(shiftRepository, agencyMemberRepository, authRepository, outletMemberRepository, outletRepository, shiftAssignmentRepository);

export const paymentVoucherRepository = new PaymentVoucherRepositoryClass();
export const paymentVoucherDisputeRepository = new PaymentVoucherDisputeRepositoryClass();
export const paymentVoucherController = new PaymentVoucherControllerClass(paymentVoucherRepository, agencyMemberRepository, authRepository, prRepository, paymentVoucherDisputeRepository, shiftAssignmentRepository);

// Takes paymentVoucherRepository (declared above) because approving overtime
// writes a voucher line — the one place attendance becomes money outside the
// payment-voucher feature. It goes through the repository so that write is
// subject to the same component classification and line-date assertion as
// every other line.
export const shiftAssignmentController = new ShiftAssignmentControllerClass(shiftAssignmentRepository, shiftRepository, prRepository, agencyMemberRepository, authRepository, outletMemberRepository, paymentVoucherRepository);

export const outletSwapRepository = new OutletSwapRepositoryClass();
export const outletSwapController = new OutletSwapControllerClass(outletSwapRepository, shiftAssignmentRepository, shiftRepository, prRepository, agencyMemberRepository, authRepository, outletMemberRepository);
export const cutlostRepository = new CutlostRepositoryClass();
export const cutlostController = new CutlostControllerClass(cutlostRepository, shiftRepository, shiftAssignmentRepository, prRepository, agencyMemberRepository, authRepository, outletMemberRepository);

export const shiftSaleRepository = new ShiftSaleRepositoryClass();
export const shiftSaleController = new ShiftSaleControllerClass(
  shiftSaleRepository,
  shiftRepository,
  shiftAssignmentRepository,
  prRepository,
  agencyMemberRepository,
  authRepository,
  outletMemberRepository,
);

export const paymentVoucherGenerator = new PaymentVoucherGeneratorClass(shiftAssignmentRepository, paymentVoucherRepository, prRepository);

// Collections: an agency's receivables from its outlets. A statement of
// account only — this app does not move money between the two.
export const collectionInvoiceRepository = new CollectionInvoiceRepositoryClass();
export const collectionInvoiceController = new CollectionInvoiceControllerClass(collectionInvoiceRepository, orgScopeDeps);
