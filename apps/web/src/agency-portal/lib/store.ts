import { loadLocale } from "@/lib/portal-i18n/locale-prefs";
import { translations } from "@/lib/portal-i18n/translations";
import {
	type AdminNotification,
	buildPosIntegrationAdminNotification,
	type PosIntegrationQuoteRequest,
} from "@agency-portal/lib/admin-notifications";
import {
	buildPvFromShiftHistoryRow,
	historyRowHasPv,
} from "@agency-portal/lib/agency-actions";
import {
	AGENCY_FINANCE_HEADS_BY_ID,
	AGENCY_OWNERS_BY_ID,
	type AgencyCollectionInvoice,
	type AgencyFinanceHead,
	type AgencyManagedPR,
	type AgencyOwnerSettings,
	type AgencyReconciliationDay,
	type AgencyRosterSlot,
	agencyIdForOwnerEmail,
	agencyIdOf,
	buildDefaultTierRates,
	cloneTierRates,
	DEFAULT_AGENCY_OWNER,
	DEFAULT_FINANCE_HEAD,
	estimateShiftLaborCost,
	languagesFromPr,
	mergeAgencyRoster,
	migrateCommissionRuleToTierIBase,
	migrateLegacyOutletCommissionRules,
	migrateTierMultipliersToTierIBase,
	normalizeTierRates,
	OUTLET_BASE_TIER,
	OUTLET_COMMISSION_RULES,
	OUTLET_PR_TIERS,
	type OutletCommissionRule,
	type OutletPrTier,
	type OutletSwapRequest,
	type OutletTierRateSettings,
	pendingPRToManagedPR,
	RETIRED_PENDING_PR_IDS,
	SCALING_TIER_MULTIPLIERS,
	SEED_AGENCY_PRS_ALL,
	SEED_PENDING_PRS,
	SEED_RECONCILIATION,
	snapTierWage,
	sortAgencyPrsByName,
	syncAgencyOwnerSubscriptionPlan,
	syncAgencyPrFromPrPortal,
} from "@agency-portal/lib/agency-demo";
import {
	buildPlanningWeekOutletShiftMap,
	resolveOutletShiftDateIso,
} from "@agency-portal/lib/agency-outlet-shifts";
import {
	getAgencyManagedPvs,
	mergeAgencyCollections,
	syncAgencyPayrollReceiptScans,
	syncAgencyPayrollShiftHistory,
} from "@agency-portal/lib/agency-payroll";
import {
	CONSECUTIVE_LOW_SUSPEND_COUNT,
	RATING_SUSPEND_SHIFT_THRESHOLD,
} from "@agency-portal/lib/agency-pr-flags";
import type { AgencySubRole } from "@agency-portal/lib/agency-rbac";
import {
	getPreviousWeekSundayIso,
	migrateDemoDateIso,
} from "@agency-portal/lib/demo-clock";
import {
	buildBlankPortalReset,
	buildDemoStoreReset,
	buildPrDemoReset,
	mergeAutoConfirmAgencyAssignments,
	mergeDemoCalendarPastShifts,
	mergeDemoHennessyRosterFloor,
	mergeDemoRosterAssignmentSlots,
	mergeDemoShiftDates,
	mergeDemoShiftStaffing,
} from "@agency-portal/lib/demo-seed";
import {
	buildDemoESignatureDataUrl,
	financeHeadStampFromProfile,
	LEGACY_FINANCE_HEAD_SIGNER,
} from "@agency-portal/lib/finance-head-stamp";
import {
	mergeHistoryDemoLedger,
	syncStoreHistoryLedger,
} from "@agency-portal/lib/history-demo-sync";
import {
	DEMO_SOS_LOCATION,
	type OpsNotification,
	type SosIncident,
} from "@agency-portal/lib/ops-notifications";
import {
	syncCommissionRulesFromWorkspace,
	syncWorkspaceFromCommissionRules,
} from "@agency-portal/lib/outlet-agency-sync";
import type { PendingCutlostRequest } from "@agency-portal/lib/outlet-cutlost-requests";
import { cutlostRequestTitle } from "@agency-portal/lib/outlet-cutlost-requests";
import {
	averageDrinkPrice,
	DEFAULT_OUTLET_DRINK_MENU,
	DEFAULT_OUTLET_FINANCE_HEAD,
	DEFAULT_OUTLET_OPS_HEAD,
	DEFAULT_OUTLET_OWNER,
	DEFAULT_OUTLET_SETTINGS,
	effectiveShiftDrinkMenu,
	getOutletSubscriptionPlan,
	mergeReleasedEarlyAt,
	mergeReleasedEarlyPrIds,
	migrateShiftTierRates,
	normalizeOutletWorkspace,
	OUTLET_SUBSCRIPTION_BILLING,
	type OutletDrinkPrice,
	type OutletFinanceHead,
	type OutletOpsHead,
	type OutletOwnerSettings,
	type OutletSettings,
	type OutletSubscriptionInvoice,
	type OutletSubscriptionPlanId,
	type OutletWorkspaceSettings,
	outletNowClockLabel,
	outletPlanningReleaseClock,
	outletShiftActivePrIds,
	outletShiftCutLossForShift,
	outletShiftCutLossSavings,
	outletShiftPlannedLaborPerSlot,
	outletSubscriptionInvoiceForPlan,
	outletUnfilledDemandSlots,
	releasedEarlyAtForPrIds,
	resolveShiftTierRates,
	type ShiftApplicant,
	type ShiftDestination,
	type ShiftEventKind,
	shiftHoursFromLabel,
	syncOutletSubscriptionBilling,
	typicalDrinkPrice,
	VELVET_23_OUTLET_LOGO,
} from "@agency-portal/lib/outlet-demo";
import {
	computeDrinkSales,
	type OutletPnlSynced,
	recomputeAllOutletPnl,
	withShiftFinancialDefaults,
} from "@agency-portal/lib/outlet-financial-sync";
import type { OutletSubRole } from "@agency-portal/lib/outlet-rbac";
import {
	addPrToOutletShift,
	addPrToPostedOutletShift,
	buildShiftHistoryRow,
	ensureRosterSlot,
	marketplacePrsFromAgency,
	mergeOutletRequestRosterSlots,
	outletMatches,
	outletRequestRosterSlotFromApplicant,
	parseShiftWindow,
	patchPrRosterAttendanceFlags,
	removePrFromOutletShifts,
	rosterCheckIn,
	rosterCheckOut,
	rosterEnRoute,
	shiftDateIso,
	syncAgencyRosterToOutletShifts,
	syncEarlyReleasesToRoster,
	syncPrAttendanceToRoster,
} from "@agency-portal/lib/portal-sync";
import type { PostJobPayTierRow } from "@agency-portal/lib/post-job-pay-tiers";
import {
	buildAvailabilityOpsNotifications,
	canTogglePrDayAvailability,
	isPrMarkedDayOff,
	prDayIsUnavailable,
} from "@agency-portal/lib/pr-availability-sync";
import {
	buildManualReceiptItems,
	COMCARD,
	calcReceiptCommissions,
	DEFAULT_TIED_AGENCY_ID,
	DEMO_PV_ISSUED_WEEKS_AGO,
	demoPayrollWeekBoundsForWeeksAgo,
	filterPvsForPrProfile,
	filterReceiptScansForPrProfile,
	findDuplicateReceiptScan,
	fmtDateLabelFromIso,
	formatPvSignTimestamp,
	getPrAgencyById,
	getPrProfile,
	getPrRosterId,
	getShiftToday,
	isDemoTimelinePayrollPv,
	isLegacyReceiptScanIdentity,
	LIVE_SEED_PR_PVS,
	LIVE_SEED_RECEIPT_SCANS,
	makeShiftPvId,
	makeShiftSessionId,
	manualSelfLogTotal,
	mergePersistedReceiptScanWithSeed,
	migratePrPortfolioAssetPath,
	PORTFOLIO_SLOT_COUNT,
	type PrActiveShiftSession,
	type PrComcard,
	type PrPaymentVoucher,
	type PrPvRow,
	type PrReceiptScan,
	type PrSubRole,
	type ReceiptEntryMethod,
	receiptScanCategory,
	receiptScanFingerprint,
	reconcilePvTotals,
	remapSeedPaymentVouchers,
	resolveManualSelfLogItems,
	SEED_PR_PVS,
	TIED_DEMO_ROSTER_PR_ID,
} from "@agency-portal/lib/pr-demo";
import {
	DEMO_AGENCY_TIED_AT,
	mergePrSwapRequests,
	PR_AGENCY_CODES,
	PR_AGENCY_TIED_OFFERS,
	type PrNotification,
	type PrSwapRequest,
	type PrUpcomingShift,
	remapSeedUpcomingShifts,
	SEED_PR_NOTIFICATIONS,
	SEED_PR_SWAP_REQUESTS,
	SEED_UPCOMING_SHIFTS,
	swapTargetOptionsForPr,
} from "@agency-portal/lib/pr-features";
import {
	type AgencyPenaltyRules,
	applyPayClassChange,
	normalizePenaltyRules,
	penaltyDeductRmForPr,
	prPayClass,
	prPayClassOnDate,
} from "@agency-portal/lib/pr-penalties";
import {
	CANCEL_RULES,
	evaluateShiftCancellation,
} from "@agency-portal/lib/pr-schedule-cancellation";
import {
	applyPrShiftSession,
	clearPrShiftSession,
	defaultPrShiftSessionForRole,
	extractPrShiftSession,
	findAgencyRosterTonight,
	type PrShiftSessionState,
	patchPrSessionForRole,
	resolvePrShiftOfferForPr,
	shiftIndexForOutlet,
} from "@agency-portal/lib/pr-session";
import {
	aggregateShiftSales,
	calcDutyWagesFromOutlet,
	receiptItemsForShift,
} from "@agency-portal/lib/pr-shift-status";
import {
	applyDisputeTargetsToRows,
	buildSentWeeklyPv,
	buildWeeklyPaymentSummary,
	clearDisputeTargetsFromRows,
	getPreviousWeekBounds,
	isWeekPvIssued,
	pvRowsHaveDisputes,
	removeDisputeLinesForTargets,
	type WeeklyDisputeTarget,
} from "@agency-portal/lib/pr-weekly-payment";
import {
	applyPushEvent,
	DEFAULT_NOTIFICATION_PREFS,
	type NotificationPrefs,
	notificationStamp,
	type PushEvent,
} from "@agency-portal/lib/push-notifications";
import { receiptDateIso } from "@agency-portal/lib/receipt-scan-utils";
import {
	buildReconciliationFromLedger,
	isWeeklyReconciliationSunday,
} from "@agency-portal/lib/reconciliation-weekly";
import {
	DEFAULT_ROSTER_DATE_ISO,
	getFreePrsWithDistances,
} from "@agency-portal/lib/roster-availability";
import {
	mergeShiftHistory,
	migrateShiftHistoryFinancials,
	migrateShiftHistoryPrNames,
	prepareShiftHistoryForDisplay,
	type ShiftHistoryRow,
	shiftHistorySlotKey,
} from "@agency-portal/lib/shift-history";
import { sealShiftHistoryAmounts } from "@agency-portal/lib/shift-history-amounts";
import {
	acceptSpecialServiceByOutlet,
	acceptSpecialServiceByPr,
	approveSpecialServiceByAdmin,
	approveSpecialServiceByAgency,
	buildSpecialServiceOrder,
	declineSpecialServiceByAdmin,
	declineSpecialServiceByAgency,
	declineSpecialServiceByOutlet,
	declineSpecialServiceByPr,
	type SubmitSpecialServiceInput,
} from "@agency-portal/lib/special-service-actions";
import {
	mergeSpecialServiceOrders,
	SEED_SPECIAL_SERVICES,
	type SpecialServiceRecord,
	specialServiceTypeLabel,
} from "@agency-portal/lib/special-service-demo";
import { writePersistedPrSubRole } from "@agency-portal/lib/use-pr-sub-role";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
	readTabScoped,
	removeTabScoped,
	writeTabScoped,
} from "@/lib/auth/tab-scoped-storage";

export type Role = "vendor" | "host" | "agency";

export interface PR {
	id: string;
	name: string;
	rating: number;
	languages: string[];
	status: "available" | "booked" | "pending";
	avatar: string;
	comcardImageUrl?: string | null;
}

export interface ShiftRequest {
	/**
	 * Seats taken per tier bucket, counted by the server across EVERY agency the
	 * shift was posted to. The outlet cannot derive this: a tier is a fact about a
	 * PR's membership of an agency, which is not the outlet's to read. Absent on
	 * demo shifts, where the local roster is the only truth there is.
	 */
	suppliedByTierBucket?: Record<string, number>;
	/**
	 * Seats taken in TOTAL, counted by the server across every agency the shift
	 * was posted to (`GET /shift` → `staffedCount`).
	 *
	 * `prs` below is only what the CALLER can see, and `GET /shift-assignment` is
	 * scoped to the caller's own agency — so on a shift shared between agencies
	 * (0124) `prs.length` is that agency's contribution, not the shift's staffing.
	 * Wherever the question is "how full is this shift", read this. Absent on demo
	 * shifts, where the local roster is the only truth there is.
	 */
	suppliedTotal?: number;
	/**
	 * The venue's named-PR requests (0131) — who was ASKED for, which is not
	 * who is booked (`prs` below). userId is the person; agencyId the
	 * membership the pick came from. Backend sessions only.
	 */
	requestedPrs?: { userId: string; agencyId: string }[];
	id: string;
	outletName: string;
	date: string;
	/** Canonical yyyy-MM-dd for roster / agency planning */
	dateIso?: string;
	shift: string;
	quantity: number;
	filled: number;
	languages: string;
	event: string;
	eventKind?: ShiftEventKind;
	/** Event template the shift was posted from (0128). */
	templateId?: string;
	/** That template's cover picture (R2 key), for every shift view. */
	templateCoverImage?: string;
	specialEventType?: string;
	/** Custom label when specialEventType is "other" */
	customSpecialEventName?: string;
	/** Per-event drink prices — only for special events; normal events use workspace menu */
	eventDrinkMenu?: OutletDrinkPrice[];
	preferredRating: number;
	estimatedCost: number;
	liveSales: number;
	/** Outlet floor pricing — syncs to agency PNL reconciliation */
	perDrinkRm?: number;
	perTableRm?: number;
	drinkUnits?: number;
	/** Per-drink-type unit counts keyed by drink menu id */
	drinkUnitCounts?: Record<string, number>;
	/** Drink $ logged before per-item counts (legacy unit total frozen on first tap) */
	legacyDrinkSalesRm?: number;
	tableUnits?: number;
	/** Baseline live sales when PNL was seeded — delta rolls into gross revenue */
	anchorLiveSales?: number;
	status: "draft" | "open" | "confirmed" | "sealed";
	prs: string[];
	/** PRs the outlet named at post job (subscription cap) — excludes agency-assigned fill */
	requestedPrIds?: string[];
	payPerHour: number;
	/** Per-shift wage & commission by PR training tier */
	tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
	/** Outlet-configured pay rows (Tier 1–5 + Commission only) */
	payTierRows?: PostJobPayTierRow[];
	dressCode?: string;
	destination?: ShiftDestination;
	preferredStarTiers?: number[];
	/** PRs sent home early — lowers sales target headcount; default sent home unless agency reassigns */
	releasedEarlyPrIds?: string[];
	/** Release clock (HH:mm) per PR id — drives hourly wage for early releases */
	releasedEarlyAt?: Record<string, string>;
	/** Unfilled demand slots removed from tonight's sales target */
	demandCut?: number;
	/** % of tier sales target still in effect (default 100) */
	salesTargetPct?: number;
}

export interface PV {
	id: string;
	prName: string;
	outlet: string;
	date: string;
	wages: number;
	drinkCommission: number;
	tipCommission: number;
	status: "draft" | "sent" | "signed" | "disputed";
	version: number;
}

export interface Booking {
	id: string;
	outletName: string;
	date: string;
	shift: string;
	pay: number;
	status: "offered" | "accepted" | "checked-in" | "completed";
	event: string;
	languages: string;
	checkedInAt?: string;
	checkedOutAt?: string;
}

export interface PrRegistrationInput {
	/** Floor / roster nickname shown to outlets */
	floorNickname: string;
	/** Legal name as on IC / passport */
	icName: string;
	email: string;
	mobile: string;
	ic: string;
	nationality: string;
	idPhotoFront: string | null;
	idPhotoBack: string | null;
	profilePhoto: string | null;
	portfolio: (string | null)[];
	underAgency: boolean;
	agencyId: string;
}

export interface PendingPR {
	id: string;
	/** Floor nickname (roster / GPS / outlet) */
	name: string;
	/** Legal name when known (self-signup); falls back to `name` for legacy invites */
	icName?: string;
	languages: string;
	ic?: string;
	mobile?: string;
	email?: string;
	age?: number;
	height?: number;
	weight?: number;
	race?: string;
	hasIcPhotos?: boolean;
	hasSelfie?: boolean;
	icPhotoFront?: string;
	icPhotoBack?: string;
	selfiePhoto?: string;
	comcardImageUrl?: string;
	/** @deprecated Use portfolioPhotos — kept for persisted demos */
	hasComcard3d?: boolean;
	portfolioCount?: number;
	portfolioPhotos?: (string | null)[];
	submittedAt?: string;
	/** Agency roster id assigned when approved */
	targetPrId?: string;
	source?: "self-signup" | "owner-invite";
	status: "pending" | "approved" | "rejected";
	/**
	 * Which DIRECTION the request runs. "join" = the PR wants under this
	 * agency; "leave" = an approved PR wants OUT and the agency approves the
	 * departure. Optional so demo-store rows (all joins) compile untouched.
	 */
	requestKind?: "join" | "leave";
	rejectReason?: string;
	/** Operating agency this sign-up belongs to — scopes the Approvals queue per tenant. Absent = Atlas. */
	agencyId?: string;
}

/** A PR's request to link to an operating agency — that agency approves/rejects it. */
export interface PendingAgencyLink {
	id: string;
	prId: string;
	prName: string;
	agencyId: string;
	agencyName: string;
	status: "pending" | "approved" | "rejected";
	requestedAt: string;
}

interface Toast {
	id: number;
	message: string;
	tone?: "success" | "info" | "warn";
}

interface StoreState {
	role: Role | null;
	prSubRole: PrSubRole | null;
	outletSubRole: OutletSubRole | null;
	agencySubRole: AgencySubRole | null;
	/** Which operating agency the signed-in owner belongs to (atlas | delta). */
	activeAgencyId: string;
	user: { name: string; email: string } | null;
	setRole: (r: Role | null) => void;
	setPrSubRole: (r: PrSubRole | null) => void;
	setOutletSubRole: (r: OutletSubRole | null) => void;
	setAgencySubRole: (r: AgencySubRole | null) => void;
	signIn: (name: string, email: string) => void;
	signOut: () => void;
	/** Restore full demo snapshot — manual reset from welcome screen only */
	resetDemo: () => void;

	/** PR Talent shift lifecycle (prototype flow) */
	prSessionByRole: Partial<Record<PrSubRole, PrShiftSessionState>>;
	shiftAccepted: boolean;
	pendingApproval: boolean;
	acceptedShiftIndex: number | null;
	checkedIn: boolean;
	checkedOut: boolean;
	drinks: number;
	tables: number;
	prActiveShift: PrActiveShiftSession | null;
	acceptPrShift: (shiftIndex?: number) => void;
	approvePrShift: () => void;
	declinePrOffer: (offerId: string) => void;
	cancelPrShift: () => void;
	/** Restore PR shift-flow snapshot only (used internally; not on role switch) */
	resetPrDemo: () => void;
	/** Prototype: accept shift (if needed) and check in without GPS/selfie */
	demoPrShiftIn: () => void;
	/** Prototype: accept shift (if needed) and mark en-route only */
	demoPrEnRoute: () => void;
	/** Prototype: check out without selfie / GPS hold */
	demoPrCheckOut: () => void;
	/** PR started heading to venue — outlet roster shows EN-ROUTE until check-in */
	prMarkEnRoute: () => void;
	prCheckIn: (opts?: {
		selfieDataUrl?: string;
		gpsFallback?: boolean;
		simulateLate?: boolean;
	}) => void;
	simulatePrLate: (enabled: boolean) => void;
	simulatePrNoShow: () => void;
	prCheckOut: () => void;

	prNotifications: PrNotification[];
	opsNotifications: OpsNotification[];
	adminNotifications: AdminNotification[];
	posIntegrationQuoteRequests: PosIntegrationQuoteRequest[];
	sosIncidents: SosIncident[];
	notificationPrefs: NotificationPrefs;
	pushNotify: (event: PushEvent) => void;
	markOpsNotificationRead: (id: string) => void;
	markAdminNotificationRead: (id: string) => void;
	requestPosIntegrationQuote: () => void;
	cancelPosIntegrationQuoteRequest: () => void;
	markPosIntegrationQuoteContacted: (requestId: string) => void;
	prDeclinedOfferIds: string[];
	prMarketplaceApplication: {
		listingId: string;
		status: "pending" | "accepted" | "declined";
		applicantId?: string;
		shiftId?: string;
	} | null;
	prUpcomingShifts: PrUpcomingShift[];
	prSwapRequests: PrSwapRequest[];
	prAgencyTiedAt: string;
	prCheckInMeta: {
		late?: boolean;
		noShowRisk?: boolean;
		selfieDataUrl?: string | null;
		gpsFallback?: boolean;
		closedShift?: PrActiveShiftSession | null;
	};
	prLeaveRequest: {
		type: "leave" | "transfer";
		note: string;
		newAgencyCode?: string;
		at: string;
	} | null;
	markPrNotificationRead: (id: string) => void;
	requestPrSwap: (targetId: string, reason: string) => void;
	linkPayrollByAgencyCode: (code: string) => void;
	submitSosIncident: (note: string, photoDataUrl?: string) => void;
	requestLeaveAgency: (note: string) => void;
	requestTransferAgency: (code: string, note: string) => void;

	prComcard: PrComcard;
	prPortfolio: (string | null)[];
	prLanguages: string[];
	prDisplayName: string | null;
	prEmail: string | null;
	prIcName: string | null;
	prMobile: string | null;
	prAvatarPhoto: string | null;
	prPayrollAgencyId: string | null;
	/** Agencies this PR is linked to (one PR can be under many agencies). */
	prAgencies: string[];
	setPrAgencies: (ids: string[]) => void;
	/** PR self-selects which agencies they work with; each add/remove notifies that agency to dispatch or suspend. */
	requestPrAgencyChange: (agencyIds: string[]) => void;
	setPrPayrollAgency: (agencyId: string) => void;
	savePrProfile: (data: {
		displayName: string;
		icName: string;
		mobile: string;
		email: string;
		avatarPhoto: string | null;
		comcard: PrComcard;
		portfolio: (string | null)[];
		languages: string[];
	}) => void;
	savePrContact: (patch: { email?: string; mobile?: string }) => void;

	prPaymentVouchers: PrPaymentVoucher[];
	ensurePreviousWeekPv: () => void;
	signPrPv: (id: string, signatureDataUrl: string) => void;
	disputePrPv: (
		id: string,
		reason: string,
		photoDataUrls?: string[],
		targets?: WeeklyDisputeTarget[],
	) => void;
	updatePrPvDisputeReason: (
		id: string,
		reason: string,
		photoDataUrls?: string[],
		targets?: WeeklyDisputeTarget[],
	) => void;
	escalatePrPvDispute: (id: string) => void;
	withdrawPrPvDispute: (id: string, targets: WeeklyDisputeTarget[]) => void;

	prReceiptScans: PrReceiptScan[];
	addReceiptScan: (draft: {
		receiptRef: string;
		outlet: string;
		prCode: string;
		prName: string;
		prId: string;
		items: PrReceiptScan["items"];
		totalLogged: number;
		manualSelfLog?: {
			reason: string;
			category: "drinks" | "tips" | "tables";
			amount: number;
			drinkId?: string;
			drinkQty?: number;
			drinkQtys?: Record<string, number>;
		};
		/** Replace a wrong scan on the current shift (keeps slot on shift) */
		replaceScanId?: string;
		entryMethod?: ReceiptEntryMethod;
	}) => string;
	updateReceiptSelfLog: (
		scanId: string,
		patch: {
			amount?: number;
			drinkId?: string;
			drinkQty?: number;
			drinkQtys?: Record<string, number>;
			reason?: string;
			category?: "drinks" | "tips" | "tables";
		},
	) => void;
	deleteReceiptSelfLog: (scanId: string) => void;
	verifyAgencyReceiptSelfLog: (
		scanId: string,
		decision: "approved" | "rejected",
	) => void;
	editAgencyPv: (
		id: string,
		patch: { rows?: PrPvRow[]; deduct?: number; disputeNote?: string },
	) => void;
	resendAgencyPv: (id: string) => void;
	sendAgencyPvToPr: (id: string) => void;
	resolveAgencyPvDispute: (id: string) => void;
	raiseAgencyPvFromHistory: (shiftHistoryId: string) => void;
	overrideSignedAgencyPv: (id: string, reason: string) => void;

	agencyOwner: AgencyOwnerSettings;
	agencyFinanceHead: AgencyFinanceHead;
	saveAgencyOwner: (patch: Partial<AgencyOwnerSettings>) => void;
	saveAgencyFinanceHead: (patch: Partial<AgencyFinanceHead>) => void;
	saveAgencyProfileSettings: (data: {
		owner: AgencyOwnerSettings;
		financeHead: AgencyFinanceHead;
		scalingTierMultipliers: Record<string, number>;
		outletCommissionRules: OutletCommissionRule[];
	}) => void;
	sendAgencyOtp: () => void;
	verifyAgencyOtp: (code: string) => boolean;

	agencyCollections: AgencyCollectionInvoice[];
	markCollectionSettled: (id: string) => void;
	sendCollectionReminder: (id: string) => void;
	agencyReconciliation: AgencyReconciliationDay;
	confirmAgencyReconciliation: () => void;
	confirmOutletReconciliation: () => void;
	confirmPrReconciliation: (prId: string) => void;
	syncReconciliationFromLedger: () => void;
	adjustAgencyReconciliation: (patch: {
		drinks?: number;
		tips?: number;
		reason: string;
	}) => void;

	agencyRoster: AgencyRosterSlot[];
	editRosterSlot: (id: string, patch: Partial<AgencyRosterSlot>) => void;
	cancelRosterShift: (rosterSlotId: string) => void;
	requestOutletSwap: (
		id: string,
		targetOutlet: string,
		agencyNote?: string,
	) => void;
	cancelOutletSwap: (id: string) => void;
	approveOutletSwapByPr: (rosterSlotId: string) => void;
	declineOutletSwapByPr: (rosterSlotId: string) => void;
	approveAgencyAssignmentByPr: (rosterSlotId: string) => void;
	confirmOutletRosterSlot: (rosterSlotId: string) => void;
	declineAgencyAssignmentByPr: (rosterSlotId: string) => void;
	togglePrDayAvailability: (dateIso: string) => void;
	setPrDayUnavailable: (dateIso: string, note?: string) => void;
	clearPrDayUnavailable: (dateIso: string) => void;
	cancelPrRosterShift: (rosterSlotId: string) => void;
	assignPrToOutlet: (input: {
		prId: string;
		outlet: string;
		dateIso: string;
		dateLabel: string;
		shiftStart: string;
		shiftEnd: string;
		shift?: string;
		outletShiftId?: string;
		event?: string;
		payEstimate?: number;
	}) => void;
	approvePrSwapRequest: (swapId: string, replacementPrId: string) => void;
	declinePrSwapRequest: (swapId: string) => void;
	acceptSwapReplacement: (swapId: string) => void;
	rejectSwapReplacement: (swapId: string, reason: string) => void;
	demoAutoAssignPr: (dateIso: string) => void;
	flagRosterAttendance: (slotId: string, flag: "late" | "no-show") => void;

	agencyPRs: AgencyManagedPR[];
	suspendAgencyPr: (prId: string) => void;
	detachAgencyPr: (prId: string) => void;
	requestAgencyPrDetach: (prId: string) => void;
	setAgencyPrKpiTier: (prId: string, tier: string) => void;
	setAgencyPrTrainingTier: (prId: string, tier: string) => void;
	updateAgencyPrProfile: (
		prId: string,
		patch: Partial<
			Pick<
				AgencyManagedPR,
				| "name"
				| "mobile"
				| "email"
				| "age"
				| "height"
				| "weight"
				| "race"
				| "languages"
				| "place"
				| "yearsExp"
				| "kpiTier"
				| "trainingLevel"
				| "payClass"
			>
		>,
	) => void;

	specialServiceOrders: SpecialServiceRecord[];
	submitSpecialServiceOrder: (input: SubmitSpecialServiceInput) => string;
	approveSpecialServiceByAgency: (orderId: string) => void;
	declineSpecialServiceByAgency: (orderId: string, reason?: string) => void;
	approveSpecialServiceByAdmin: (orderId: string) => void;
	declineSpecialServiceByAdmin: (orderId: string, reason?: string) => void;
	acceptSpecialServiceByPr: (orderId: string) => void;
	declineSpecialServiceByPr: (orderId: string, reason?: string) => void;
	acceptSpecialServiceByOutlet: (orderId: string) => void;
	declineSpecialServiceByOutlet: (orderId: string, reason?: string) => void;

	outletCommissionRules: OutletCommissionRule[];
	scalingTierMultipliers: Record<string, number>;
	saveOutletCommissionRule: (
		outlet: string,
		patch: Partial<OutletCommissionRule>,
	) => void;
	saveScalingMultipliers: (multipliers: Record<string, number>) => void;
	inviteFinanceHead: (email: string) => void;
	/** Shared transaction log — agency & outlet history screens */
	shiftHistory: ShiftHistoryRow[];

	prs: PR[];
	shifts: ShiftRequest[];
	/** Agency outlet PNL — recomputed when outlet edits floor money */
	outletPnl: OutletPnlSynced[];
	outletPnlSyncAt: number;
	outletMoneyEditCount: number;
	updateOutletShiftMoney: (
		shiftId: string,
		patch: { perDrinkRm?: number; perTableRm?: number },
	) => void;
	adjustOutletShiftUnits: (shiftId: string, delta: number) => void;
	adjustOutletDrinkSale: (
		shiftId: string,
		drinkId: string,
		delta: number,
	) => void;
	bookings: Booking[];
	pvs: PV[];
	walletBalance: number;
	ratings: {
		id: string;
		pr: string;
		stars: number;
		note: string;
		date: string;
		tags?: string[];
	}[];
	outletWorkspace: OutletWorkspaceSettings;
	/**
	 * Attendance & discipline policy — the AGENCY's, not any outlet's (0113).
	 * Top-level rather than nested under `outletWorkspace` because it is not an
	 * outlet fact: the fine it produces is a deduction on the agency→PR voucher.
	 */
	agencyPenaltyRules: AgencyPenaltyRules;
	outletSettings: OutletSettings;
	outletOwner: OutletOwnerSettings;
	outletSubscriptionBilling: OutletSubscriptionInvoice[];
	outletFinanceHead: OutletFinanceHead;
	outletOpsHead: OutletOpsHead;
	shiftApplicants: ShiftApplicant[];
	postSealRatePrompt: { shiftId: string; prIds: string[] } | null;
	paymentCardLast4: string;
	pendingPRs: PendingPR[];
	pendingCutlostRequests: PendingCutlostRequest[];

	approvePendingPR: (id: string) => void;
	rejectPendingPR: (id: string, reason?: string) => void;
	/** PR→agency link requests awaiting the target agency's approval. */
	pendingAgencyLinks: PendingAgencyLink[];
	approveAgencyLink: (id: string) => void;
	rejectAgencyLink: (id: string) => void;
	invitePendingPR: (input: {
		name: string;
		ic: string;
		mobile: string;
		email: string;
	}) => void;
	submitPrRegistration: (input: PrRegistrationInput) => void;
	requestOutletCutlostReduction: (
		shiftId: string,
		payload:
			| { kind: "release_prs"; prIds: string[]; model?: "guaranteed" }
			| { kind: "cut_slots"; slots: number; model?: "guaranteed" }
			| {
					kind: "best_effort";
					prIds: string[];
					slotsCut: number;
					rationale: string[];
			  },
	) => void;
	approveCutlostRequest: (id: string) => void;
	rejectCutlostRequest: (id: string, reason?: string) => void;

	createShift: (
		s: Omit<ShiftRequest, "id" | "status" | "filled" | "prs">,
	) => string;
	createShifts: (
		items: Array<
			Omit<ShiftRequest, "id" | "status" | "filled" | "prs"> & {
				prs?: string[];
			}
		>,
	) => void;
	deleteShift: (shiftId: string) => void;
	togglePrOnShift: (shiftId: string, prId: string) => void;
	confirmShift: (shiftId: string) => void;
	sealShift: (shiftId: string) => void;
	saveOutletWorkspace: (patch: Partial<OutletWorkspaceSettings>) => void;
	saveAgencyPenaltyRules: (next: AgencyPenaltyRules) => void;
	saveOutletSettings: (patch: Partial<OutletSettings>) => void;
	saveOutletOwner: (patch: Partial<OutletOwnerSettings>) => void;
	recordOutletSubscriptionPlanChange: (
		planId: OutletSubscriptionPlanId,
	) => void;
	saveOutletProfileSettings: (data: {
		owner: OutletOwnerSettings;
		financeHead: OutletFinanceHead;
		opsHead: OutletOpsHead;
		location: string;
	}) => void;
	sendOutletOtp: () => void;
	verifyOutletOtp: (code: string) => boolean;
	setReconciliationVarianceReason: (reason: string) => void;
	respondToApplicant: (applicantId: string, accept: boolean) => void;
	approveOutletPrRequest: (rosterSlotId: string) => void;
	declineOutletPrRequest: (rosterSlotId: string) => void;
	requestOutletPrsForShift: (shiftId: string, prIds: string[]) => void;
	releaseOutletPrsEarly: (shiftId: string, prIds: string[]) => void;
	cutOutletUnfilledDemand: (shiftId: string, slots: number) => void;
	easeOutletSalesTarget: (shiftId: string, reducePct: number) => void;
	syncOutletRequestRoster: () => void;
	payOutletInvoice: (collectionId: string) => void;
	updateOutletPaymentCard: (last4: string) => void;
	clearPostSealRatePrompt: () => void;
	/** Repair agency roster when PR checked in before roster slot existed */
	syncLivePrCheckInToRoster: () => void;
	/** Explicitly undo same-day check-out (demo check-in flow only — not auto on navigation). */
	ensurePrShiftResumed: (opts?: { silent?: boolean }) => boolean;

	acceptBooking: (id: string) => void;
	checkIn: (id: string) => void;
	checkOut: (id: string) => void;

	signPv: (id: string) => void;
	disputePv: (id: string, reason: string) => void;
	withdraw: (amount: number) => void;
	ratePr: (prId: string, stars: number, note: string, tags?: string[]) => void;

	toasts: Toast[];
	toast: (m: string, tone?: Toast["tone"]) => void;
	dismissToast: (id: number) => void;
}

/**
 * The store's starting data — BLANK, not the demo fixtures.
 *
 * Every slice below reads its initial value from here, so this one line decides
 * whether the app boots on invented data or on nothing. It used to be
 * `buildDemoStoreReset()`, which meant the prototype's fixtures were the default
 * everywhere and each real login had to overwrite them on mount. That ordering
 * is backwards: demo data was ambient and truth was the exception.
 *
 * `buildBlankPortalReset()` is the SAME slice list, emptied — arrays and numbers
 * cleared, `DEFAULT_*` object shapes kept so components reading nested fields do
 * not crash, and `outletPnl` / `agencyReconciliation` RECOMPUTED from empty
 * inputs rather than set to `[]` (passing `undefined` there would fall back to
 * the seeded outlet list and quietly restore demo rows).
 *
 * ⚠️ `prComcard` deliberately survives this. It is the one slice with no sound
 * blank value — the obvious constant, `DEFAULT_COMCARD`, is a comcard's STYLING
 * rather than a comcard — so blanking it would write the wrong shape purely
 * because the name reads correctly. It is PR-portal only, so no agency or outlet
 * screen sees it. `buildBlankPortalReset` warns about it by name in DEV; that
 * warning is the live list of anything else that ever slips through.
 *
 * The fixtures are still reachable on purpose, through `resetDemo()` — an
 * explicit action, no longer the ambient default.
 */
const initialSnapshot = buildBlankPortalReset();

function mergeAgencyPRs(
	persisted: AgencyManagedPR[] | undefined,
	current: AgencyManagedPR[],
): AgencyManagedPR[] {
	const seedIds = new Set(SEED_AGENCY_PRS_ALL.map((s) => s.id));
	const base = (persisted?.length ? persisted : current).filter((p) =>
		seedIds.has(p.id),
	);
	const byId = new Map(base.map((p) => [p.id, p]));
	for (const seed of SEED_AGENCY_PRS_ALL) {
		if (!byId.has(seed.id)) byId.set(seed.id, seed);
	}
	return sortAgencyPrsByName(
		SEED_AGENCY_PRS_ALL.map((seed) => {
			const p = byId.get(seed.id) ?? seed;
			return { ...p, trainingLevel: seed.trainingLevel };
		}),
	);
}

function normalizeAgencyPrs(list: AgencyManagedPR[]): AgencyManagedPR[] {
	return list.map((pr) => ({
		...pr,
		name: pr.name ?? "PR",
		languages: languagesFromPr(pr),
		rating: typeof pr.rating === "number" ? pr.rating : 0,
		age: typeof pr.age === "number" ? pr.age : 22,
		height: typeof pr.height === "number" ? pr.height : 165,
		yearsExp: typeof pr.yearsExp === "number" ? pr.yearsExp : 0,
		totalPaid: typeof pr.totalPaid === "number" ? pr.totalPaid : 0,
		attendancePct: typeof pr.attendancePct === "number" ? pr.attendancePct : 0,
		kpiScore: typeof pr.kpiScore === "number" ? pr.kpiScore : 0,
	}));
}

function prIdForPayeeName(
	prName: string,
	prIc: string | undefined,
	agencyPRs: AgencyManagedPR[],
): string {
	const match = agencyPRs.find(
		(p) => p.name === prName || (prIc && p.ic === prIc),
	);
	if (match) return match.id;
	return TIED_DEMO_ROSTER_PR_ID;
}

function receiptQtyDelta(items: PrReceiptScan["items"]) {
	return {
		drinks: items
			.filter((i) => i.category === "drinks")
			.reduce((s, i) => s + i.qty, 0),
		tables: items
			.filter((i) => i.category === "tables")
			.reduce((s, i) => s + i.qty, 0),
	};
}

function receiptTipRmTotal(items: PrReceiptScan["items"]) {
	return items
		.filter((i) => i.category === "tips")
		.reduce((s, i) => s + i.amount, 0);
}

function patchRosterFloorFromReceiptDelta(
	roster: AgencyRosterSlot[],
	prId: string,
	outlet: string,
	dateIso: string,
	oldQty: { drinks: number; tables: number },
	newQty: { drinks: number; tables: number },
	oldTipRm: number,
	newTipRm: number,
): AgencyRosterSlot[] {
	const drinkDelta = newQty.drinks - oldQty.drinks;
	const tipDelta = Math.round((newTipRm - oldTipRm) * 100) / 100;
	if (drinkDelta === 0 && tipDelta === 0) return roster;
	return roster.map((slot) => {
		if (
			slot.prId !== prId ||
			!outletMatches(slot.outlet, outlet) ||
			slot.dateIso !== dateIso
		) {
			return slot;
		}
		return {
			...slot,
			...(drinkDelta !== 0
				? { floorDrinks: Math.max(0, (slot.floorDrinks ?? 0) + drinkDelta) }
				: {}),
			...(tipDelta !== 0
				? { floorTips: Math.max(0, (slot.floorTips ?? 0) + tipDelta) }
				: {}),
		};
	});
}

function activePrShiftOffer(
	st: Pick<
		StoreState,
		"prSubRole" | "acceptedShiftIndex" | "agencyRoster" | "shifts"
	>,
) {
	return resolvePrShiftOfferForPr(
		st.agencyRoster,
		getPrRosterId(st.prSubRole),
		st.acceptedShiftIndex,
		st.shifts,
	);
}

function demoAttendanceContext(
	st: Pick<
		StoreState,
		"prSubRole" | "acceptedShiftIndex" | "agencyRoster" | "shifts"
	>,
) {
	const offer = activePrShiftOffer(st);
	return {
		prId: getPrRosterId(st.prSubRole),
		outlet: offer.outlet,
		dateIso: DEFAULT_ROSTER_DATE_ISO,
		offer,
	};
}

function shiftDatesEqual(
	a: [number, number, number],
	b: [number, number, number],
) {
	return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function withPrSessionRoleCache(
	st: StoreState,
	patch: Partial<StoreState>,
): Partial<StoreState> {
	const role = st.prSubRole;
	if (!role) return patch;
	const merged = { ...st, ...patch };
	return {
		...patch,
		prSessionByRole: {
			...st.prSessionByRole,
			[role]: extractPrShiftSession(merged),
		},
	};
}

/** Restore an in-progress shift only when the PR explicitly resumes (demoPrShiftIn). */
function resumePrShiftPatch(
	st: Pick<
		StoreState,
		| "checkedIn"
		| "checkedOut"
		| "prActiveShift"
		| "prCheckInMeta"
		| "prReceiptScans"
		| "agencyRoster"
		| "prSubRole"
		| "agencyPRs"
		| "shiftHistory"
	>,
): Partial<StoreState> {
	const closed = st.prCheckInMeta?.closedShift;
	if (!st.checkedOut || !closed || st.prActiveShift) return {};
	if (!shiftDatesEqual(closed.date, getShiftToday())) return {};

	const { timeOut: _timeOut, overtimeMinutes: _ot, ...shiftBase } = closed;
	const prActiveShift: PrActiveShiftSession = {
		...shiftBase,
		receiptIds: [...(shiftBase.receiptIds ?? [])],
	};
	const scanIds = new Set(prActiveShift.receiptIds);
	const prId = getPrRosterId(st.prSubRole);
	const prName =
		st.agencyPRs.find((p) => p.id === prId)?.name ??
		getPrProfile(st.prSubRole ?? "pr_tied").name;
	const checkInTime =
		prActiveShift.timeIn.match(/\d{1,2}:\d{2}/)?.[0] ??
		new Date().toLocaleTimeString("en-MY", {
			hour: "2-digit",
			minute: "2-digit",
		});
	const [y, m, d] = closed.date;
	const dateIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

	return {
		checkedIn: true,
		checkedOut: false,
		prActiveShift,
		prCheckInMeta: { ...st.prCheckInMeta, closedShift: null },
		prReceiptScans: (st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS).map((r) =>
			scanIds.has(r.id) && r.status === "pending"
				? { ...r, status: "attached" as const }
				: r,
		),
		agencyRoster: rosterCheckIn(
			st.agencyRoster,
			prId,
			prActiveShift.outlet,
			checkInTime,
			{
				prName,
				dateIso: DEFAULT_ROSTER_DATE_ISO,
				shift: prActiveShift.shiftTime,
			},
		),
		shiftHistory: st.shiftHistory.filter(
			(row) =>
				!(
					row.prId === prId &&
					row.dateIso === dateIso &&
					outletMatches(row.outlet, prActiveShift.outlet)
				),
		),
	};
}

function resolveTiedPrAttendance(
	st: Pick<
		StoreState,
		| "prSubRole"
		| "checkedIn"
		| "checkedOut"
		| "prActiveShift"
		| "prSessionByRole"
		| "agencyPRs"
	>,
) {
	const tiedCache = st.prSessionByRole?.pr_tied;
	const liveOnTiedRole = st.prSubRole === "pr_tied";
	const checkedIn = liveOnTiedRole
		? st.checkedIn
		: (tiedCache?.checkedIn ?? st.checkedIn);
	const checkedOut = liveOnTiedRole
		? st.checkedOut
		: (tiedCache?.checkedOut ?? st.checkedOut);
	const session =
		(liveOnTiedRole ? st.prActiveShift : tiedCache?.prActiveShift) ??
		st.prActiveShift;
	if (!checkedIn || checkedOut || !session) return null;
	const prId = TIED_DEMO_ROSTER_PR_ID;
	const prName =
		st.agencyPRs.find((p) => p.id === prId)?.name ??
		getPrProfile("pr_tied").name;
	return { prId, prName, session };
}

function rosterWithTiedPrAttendance(
	roster: AgencyRosterSlot[],
	st: Pick<
		StoreState,
		| "prSubRole"
		| "checkedIn"
		| "checkedOut"
		| "prActiveShift"
		| "prSessionByRole"
		| "prCheckInMeta"
		| "agencyPRs"
		| "acceptedShiftIndex"
		| "agencyRoster"
		| "shifts"
	>,
): AgencyRosterSlot[] {
	const prId = TIED_DEMO_ROSTER_PR_ID;
	const tiedCache = st.prSessionByRole?.pr_tied;
	const liveOnTied = st.prSubRole === "pr_tied";
	const checkedIn = liveOnTied
		? st.checkedIn
		: (tiedCache?.checkedIn ?? st.checkedIn);
	const checkedOut = liveOnTied
		? st.checkedOut
		: (tiedCache?.checkedOut ?? st.checkedOut);
	const closedShift = liveOnTied
		? st.prCheckInMeta?.closedShift
		: tiedCache?.prCheckInMeta?.closedShift;

	if (checkedOut) {
		const outlet =
			closedShift?.outlet ??
			st.prActiveShift?.outlet ??
			activePrShiftOffer(st).outlet;
		const checkOutTime =
			closedShift?.timeOut?.match(/\d{1,2}:\d{2}/)?.[0] ??
			new Date().toLocaleTimeString("en-MY", {
				hour: "2-digit",
				minute: "2-digit",
			});
		return rosterCheckOut(roster, prId, outlet, checkOutTime);
	}

	const attendance = resolveTiedPrAttendance(st);
	if (attendance) {
		return syncPrAttendanceToRoster(roster, {
			prId: attendance.prId,
			prName: attendance.prName,
			checkedIn: true,
			session: attendance.session,
		});
	}

	if (!checkedIn) {
		const outlet = activePrShiftOffer(st).outlet;
		return roster.map((s) => {
			if (
				s.prId === prId &&
				s.dateIso === DEFAULT_ROSTER_DATE_ISO &&
				outletMatches(s.outlet, outlet) &&
				s.status === "on-duty" &&
				s.checkedInAt
			) {
				return {
					...s,
					status: "scheduled" as const,
					checkedInAt: undefined,
				};
			}
			return s;
		});
	}

	return roster;
}

function applyOutletFinancialSync(
	shifts: ShiftRequest[],
	editCount: number,
	syncAt: number,
	roster: AgencyRosterSlot[] = [],
	reconciliation?: AgencyReconciliationDay,
	drinkMenu = DEFAULT_OUTLET_DRINK_MENU,
	commissionRules = OUTLET_COMMISSION_RULES,
): Pick<
	StoreState,
	| "shifts"
	| "outletPnl"
	| "outletPnlSyncAt"
	| "outletMoneyEditCount"
	| "agencyReconciliation"
> {
	const normalized = shifts.map((sh) =>
		withShiftFinancialDefaults(sh, drinkMenu),
	);
	const outletPnl = recomputeAllOutletPnl(
		normalized,
		undefined,
		roster,
		drinkMenu,
		commissionRules,
	);
	const nextRecon =
		reconciliation ??
		buildReconciliationFromLedger(
			{
				agencyReconciliation: {
					...SEED_RECONCILIATION,
					dateIso: DEFAULT_ROSTER_DATE_ISO,
					dateLabel: fmtDateLabelFromIso(DEFAULT_ROSTER_DATE_ISO),
				},
				shiftHistory: [],
				prPaymentVouchers: [],
			},
			{},
		);
	return {
		shifts: normalized,
		outletPnl,
		outletPnlSyncAt: syncAt,
		outletMoneyEditCount: editCount,
		agencyReconciliation: nextRecon,
	};
}

function ensureOutletRuleTierMultipliers(
	rules: OutletCommissionRule[],
	legacyGlobal?: Record<string, number>,
): OutletCommissionRule[] {
	return rules.map((r) => {
		const partial = { ...r.tierMultipliers };
		if (legacyGlobal) {
			for (const tier of OUTLET_PR_TIERS) {
				if (partial[tier] == null && legacyGlobal[tier] != null) {
					partial[tier] = legacyGlobal[tier];
				}
			}
		}
		const migrated = migrateCommissionRuleToTierIBase({
			...r,
			tierMultipliers: migrateTierMultipliersToTierIBase(partial),
		});
		if (!migrated.tierRates) {
			const tierBase = {
				wagePerHour: snapTierWage(migrated.wagePerHour),
				drinkPct: migrated.drinkPct,
				tipPct: migrated.tipPct,
				tablePct: migrated.tablePct,
				otAfterHours: migrated.otAfterHours,
			};
			return {
				...migrated,
				wagePerHour: tierBase.wagePerHour,
				tierRates: buildDefaultTierRates(tierBase),
			};
		}
		const baseTier = migrated.tierRates[OUTLET_BASE_TIER] ?? {
			wagePerHour: migrated.wagePerHour,
			drinkPct: migrated.drinkPct,
			tipPct: migrated.tipPct,
			tablePct: migrated.tablePct,
			otAfterHours: migrated.otAfterHours,
		};
		const tierRates = normalizeTierRates(baseTier, migrated.tierRates);
		return {
			...migrated,
			wagePerHour: snapTierWage(tierRates[OUTLET_BASE_TIER].wagePerHour),
			tierRates,
		};
	});
}

function syncLedgerState(
	st: StoreState,
	patch: Partial<
		Pick<
			StoreState,
			"shifts" | "agencyRoster" | "shiftHistory" | "prPaymentVouchers"
		>
	>,
): Partial<StoreState> {
	const shifts = patch.shifts ?? st.shifts;
	const roster = patch.agencyRoster ?? st.agencyRoster;
	const drinkMenu = st.outletWorkspace.drinkMenu ?? DEFAULT_OUTLET_DRINK_MENU;
	const commissionRules = st.outletCommissionRules;
	const outletPnl = recomputeAllOutletPnl(
		shifts,
		undefined,
		roster,
		drinkMenu,
		commissionRules,
	);
	const reconciliation = buildReconciliationFromLedger(st, patch);
	return {
		...patch,
		outletPnl,
		outletPnlSyncAt: Date.now(),
		agencyReconciliation: reconciliation,
	};
}

function isStockDemoPortfolioPath(path: string | null | undefined): boolean {
	if (!path) return false;
	return /\/pr-portfolio\/(vicky|luna)-/i.test(path);
}

function stripStockPortfolioFromPending(p: PendingPR): PendingPR {
	if (!p.portfolioPhotos?.some(isStockDemoPortfolioPath)) return p;
	const portfolioPhotos = p.portfolioPhotos.map((photo) =>
		photo && isStockDemoPortfolioPath(photo) ? null : photo,
	);
	const filled = portfolioPhotos.filter(Boolean).length;
	return {
		...p,
		portfolioPhotos,
		portfolioCount: filled > 0 ? filled : undefined,
	};
}

function mergePendingSeedFields(p: PendingPR, seed: PendingPR): PendingPR {
	return stripStockPortfolioFromPending({
		...p,
		// Keep demo floor nicknames + legal IC names in sync (persisted rows may predate the split).
		name: seed.name,
		icName: seed.icName,
		icPhotoFront: seed.icPhotoFront ?? p.icPhotoFront,
		icPhotoBack: seed.icPhotoBack ?? p.icPhotoBack,
		selfiePhoto: p.selfiePhoto ?? seed.selfiePhoto,
		portfolioPhotos: p.portfolioPhotos?.some(Boolean)
			? p.portfolioPhotos
			: seed.portfolioPhotos,
		portfolioCount: p.portfolioPhotos?.some(Boolean)
			? p.portfolioPhotos.filter(Boolean).length
			: seed.portfolioCount,
	});
}

function mergePendingPRs(
	persisted: PendingPR[] | undefined,
	current: PendingPR[],
): PendingPR[] {
	const seedIds = new Set(SEED_PENDING_PRS.map((s) => s.id));
	const source = persisted?.length ? persisted : current;
	const base = source.filter(
		(p) => seedIds.has(p.id) && !RETIRED_PENDING_PR_IDS.has(p.id),
	);
	const userSignups = source.filter(
		(p) => !seedIds.has(p.id) && p.status === "pending",
	);
	const byId = new Map(base.map((p) => [p.id, p]));
	for (const seed of SEED_PENDING_PRS) {
		if (!byId.has(seed.id)) byId.set(seed.id, seed);
	}
	const seeds = SEED_PENDING_PRS.map((seed) =>
		mergePendingSeedFields(byId.get(seed.id) ?? seed, seed),
	);
	const dedupedExtras = userSignups.filter(
		(p, i, arr) => arr.findIndex((x) => x.id === p.id) === i,
	);
	return [
		...seeds,
		...dedupedExtras
			.filter((p) => !seedIds.has(p.id))
			.map(stripStockPortfolioFromPending),
	];
}

let toastId = 0;

export const useStore = create<StoreState>()(
	persist(
		(set, get) => ({
			role: null,
			prSubRole: null,
			outletSubRole: null,
			agencySubRole: null,
			activeAgencyId: "atlas",
			user: null,
			setRole: (r) => set({ role: r }),
			setPrSubRole: (r) => {
				const st = get();
				const prev = st.prSubRole;
				const cache: Partial<Record<PrSubRole, PrShiftSessionState>> = {
					...st.prSessionByRole,
				};

				if (prev && prev !== r) {
					cache[prev] = extractPrShiftSession(st);
				}

				const next: Partial<StoreState> = {
					prSubRole: r,
					prSessionByRole: cache,
				};
				if (r) {
					const session =
						cache[r] ??
						defaultPrShiftSessionForRole(r, {
							agencyRoster: st.agencyRoster,
							prSwapRequests: st.prSwapRequests,
						});
					Object.assign(next, applyPrShiftSession(session));
				}
				writePersistedPrSubRole(r);
				set(next);
			},
			setOutletSubRole: (r) => set({ outletSubRole: r }),
			setAgencySubRole: (r) => set({ agencySubRole: r }),
			signIn: (name, email) =>
				set((st) => {
					const agencyId = agencyIdForOwnerEmail(email);
					if (!agencyId) return { user: { name, email } };
					return {
						user: { name, email },
						activeAgencyId: agencyId,
						agencyOwner: {
							...(AGENCY_OWNERS_BY_ID[agencyId] ?? st.agencyOwner),
						},
						agencyFinanceHead: {
							...(AGENCY_FINANCE_HEADS_BY_ID[agencyId] ?? st.agencyFinanceHead),
						},
					};
				}),
			signOut: () => {
				const st = get();
				const prev = st.prSubRole;
				const prSessionByRole = { ...st.prSessionByRole };
				if (prev) {
					prSessionByRole[prev] = extractPrShiftSession(st);
				}
				set({
					user: null,
					role: null,
					prSubRole: null,
					outletSubRole: null,
					agencySubRole: null,
					prSessionByRole,
				});
			},
			resetDemo: () => {
				const demo = buildDemoStoreReset();
				set({
					...demo,
					prSwapRequests: [],
					prSessionByRole: demo.prSessionByRole ?? {},
					role: null,
					prSubRole: null,
					outletSubRole: null,
					agencySubRole: null,
					user: null,
					toasts: [],
				});
			},
			resetPrDemo: () => {
				set(buildPrDemoReset(get().agencyRoster));
			},
			demoPrShiftIn: () => {
				const st = get();
				if (st.checkedIn && !st.checkedOut) {
					get().toast("Already checked in", "info");
					return;
				}
				if (st.checkedOut) {
					if (get().ensurePrShiftResumed({ silent: true })) return;
					get().toast(
						"Shift complete — use Reset all demo data on the welcome screen to start fresh",
						"warn",
					);
					return;
				}
				if (!st.shiftAccepted) {
					set({
						shiftAccepted: true,
						pendingApproval: false,
						acceptedShiftIndex: st.acceptedShiftIndex ?? 0,
						prMarketplaceApplication:
							st.prMarketplaceApplication?.status === "pending"
								? { ...st.prMarketplaceApplication, status: "accepted" }
								: st.prMarketplaceApplication,
					});
				}
				const late = get().prCheckInMeta.late ?? false;
				get().prCheckIn({
					simulateLate: late,
					gpsFallback: get().prCheckInMeta.gpsFallback,
				});
			},
			demoPrEnRoute: () => {
				const st = get();
				if (st.checkedIn && !st.checkedOut) {
					get().toast("Already on duty", "info");
					return;
				}
				if (!st.shiftAccepted) {
					set({
						shiftAccepted: true,
						pendingApproval: false,
						acceptedShiftIndex: st.acceptedShiftIndex ?? 0,
						prMarketplaceApplication:
							st.prMarketplaceApplication?.status === "pending"
								? { ...st.prMarketplaceApplication, status: "accepted" }
								: st.prMarketplaceApplication,
					});
				}
				get().prMarkEnRoute();
			},
			demoPrCheckOut: () => {
				const st = get();
				if (!st.checkedIn || st.checkedOut) {
					get().toast("Check in first to demo check-out", "warn");
					return;
				}
				get().prCheckOut();
			},
			prMarkEnRoute: () => {
				const st = get();
				if (!st.shiftAccepted) {
					get().toast("Accept a shift first", "warn");
					return;
				}
				if (st.checkedIn) {
					get().toast("Already checked in", "info");
					return;
				}
				const ctx = demoAttendanceContext(st);
				const offer = ctx.offer;
				const prId = getPrRosterId(st.prSubRole);
				const pr = st.agencyPRs.find((p) => p.id === prId);
				const prName = pr?.name ?? getPrProfile(st.prSubRole).name;
				const next = rosterEnRoute(st.agencyRoster, prId, offer.outlet, {
					prName,
					dateIso: ctx.dateIso,
					shift: offer.time,
				});
				const before = st.agencyRoster.find(
					(s) =>
						s.prId === prId &&
						s.dateIso === ctx.dateIso &&
						outletMatches(s.outlet, offer.outlet),
				);
				const after = next.find(
					(s) =>
						s.prId === prId &&
						s.dateIso === ctx.dateIso &&
						outletMatches(s.outlet, offer.outlet),
				);
				if (after?.status === before?.status) {
					get().toast("Already en route", "info");
					return;
				}
				set({ agencyRoster: next });
				get().toast("En route — outlet sees you on Live GPS", "success");
			},

			shiftAccepted: initialSnapshot.shiftAccepted,
			pendingApproval: initialSnapshot.pendingApproval,
			acceptedShiftIndex: initialSnapshot.acceptedShiftIndex,
			checkedIn: initialSnapshot.checkedIn,
			checkedOut: initialSnapshot.checkedOut,
			drinks: initialSnapshot.drinks,
			tables: initialSnapshot.tables,
			prActiveShift: initialSnapshot.prActiveShift,
			prSessionByRole: initialSnapshot.prSessionByRole ?? {},

			prNotifications: [...SEED_PR_NOTIFICATIONS],
			opsNotifications: [],
			adminNotifications: [],
			posIntegrationQuoteRequests: [],
			sosIncidents: [],
			notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
			pushNotify: (event) => {
				set((st) => {
					const pushed = applyPushEvent(
						{
							prNotifications: st.prNotifications,
							opsNotifications: st.opsNotifications,
							notificationPrefs: st.notificationPrefs,
						},
						event,
						translations[loadLocale()],
					);
					return pushed;
				});
			},
			markOpsNotificationRead: (id) =>
				set((st) => ({
					opsNotifications: st.opsNotifications.map((n) =>
						n.id === id ? { ...n, read: true } : n,
					),
				})),
			markAdminNotificationRead: (id) =>
				set((st) => ({
					adminNotifications: st.adminNotifications.map((n) =>
						n.id === id ? { ...n, read: true } : n,
					),
				})),
			requestPosIntegrationQuote: () => {
				const st = get();
				const outlet = st.outletOwner.orgName || st.outletWorkspace.outletName;
				const alreadyPending = st.posIntegrationQuoteRequests.some(
					(r) => r.status === "pending" && outletMatches(r.outlet, outlet),
				);
				if (alreadyPending) {
					get().toast(
						"Quote request already sent — InnocenZ admin will contact you soon",
						"info",
					);
					return;
				}
				const at = notificationStamp();
				const req: PosIntegrationQuoteRequest = {
					id: `pos-req-${Date.now().toString(36)}`,
					outlet,
					ownerName: st.outletOwner.ownerName,
					email: st.outletOwner.email,
					mobile: st.outletOwner.mobile,
					currentPlanId: st.outletOwner.subscriptionPlanId ?? "pro",
					at,
					status: "pending",
				};
				const note = buildPosIntegrationAdminNotification(req);
				set({
					posIntegrationQuoteRequests: [req, ...st.posIntegrationQuoteRequests],
					adminNotifications: [note, ...st.adminNotifications],
				});
				const contact = st.outletOwner.email || st.outletOwner.mobile;
				get().toast(
					`POS quote request sent to InnocenZ admin${contact ? ` — we'll reach you at ${contact}` : ""}`,
					"success",
				);
			},
			cancelPosIntegrationQuoteRequest: () => {
				const st = get();
				const outlet = st.outletOwner.orgName || st.outletWorkspace.outletName;
				const pending = st.posIntegrationQuoteRequests.find(
					(r) => r.status === "pending" && outletMatches(r.outlet, outlet),
				);
				if (!pending) {
					get().toast("No pending POS quote request to cancel", "warn");
					return;
				}
				set({
					posIntegrationQuoteRequests: st.posIntegrationQuoteRequests.filter(
						(r) => r.id !== pending.id,
					),
					adminNotifications: st.adminNotifications.filter(
						(n) => n.id !== `admin-pos-${pending.id}`,
					),
				});
				get().toast("POS quote request cancelled", "success");
			},
			markPosIntegrationQuoteContacted: (requestId) => {
				set((st) => ({
					posIntegrationQuoteRequests: st.posIntegrationQuoteRequests.map(
						(r) =>
							r.id === requestId ? { ...r, status: "contacted" as const } : r,
					),
				}));
				get().toast("Marked as contacted", "success");
			},
			prDeclinedOfferIds: [],
			prMarketplaceApplication: null,
			prUpcomingShifts: [...SEED_UPCOMING_SHIFTS],
			prSwapRequests: [...SEED_PR_SWAP_REQUESTS],
			prAgencyTiedAt: DEMO_AGENCY_TIED_AT,
			prCheckInMeta: {},
			prLeaveRequest: null,

			acceptPrShift: (shiftIndex) => {
				const idx = shiftIndex ?? 0;
				const tied = get().prSubRole === "pr_tied";
				if (tied) {
					set({ pendingApproval: true, acceptedShiftIndex: idx });
					get().toast("Sent to Atlas Agency for approval", "warn");
				} else {
					set({
						shiftAccepted: true,
						acceptedShiftIndex: idx,
						pendingApproval: false,
					});
					get().toast("Shift accepted — slot locked", "success");
				}
			},
			declinePrOffer: (offerId) => {
				set((st) => ({
					prDeclinedOfferIds: st.prDeclinedOfferIds.includes(offerId)
						? st.prDeclinedOfferIds
						: [...st.prDeclinedOfferIds, offerId],
				}));
				get().toast("Offer declined", "info");
			},
			approvePrShift: () => {
				set({ pendingApproval: false, shiftAccepted: true });
				const st = get();
				const ctx = demoAttendanceContext(st);
				const profile = getPrProfile(st.prSubRole);
				get().pushNotify({
					type: "shift_assigned",
					prId: ctx.prId,
					prName: profile.name,
					outlet: ctx.outlet,
				});
				get().toast("Agency approved — slot locked", "success");
			},
			cancelPrShift: () => {
				const st = get();
				const prId = getPrRosterId(st.prSubRole);
				const slot = findAgencyRosterTonight(st.agencyRoster, prId);
				let deductionRm = 0;
				if (slot) {
					const evalResult = evaluateShiftCancellation(
						new Date(),
						slot.dateIso,
						slot.shiftStart,
						slot.estPayout ?? CANCEL_RULES.defaultDailyWagesRm,
					);
					deductionRm = evalResult.deductionRm;
					const stamp = new Date().toLocaleString("en-MY", {
						day: "numeric",
						month: "short",
						hour: "2-digit",
						minute: "2-digit",
					});
					set((cur) => ({
						agencyRoster: cur.agencyRoster.map((s) =>
							s.id === slot.id
								? {
										...s,
										status: "unavailable" as const,
										payDeductionRm: deductionRm,
										cancelledAt: stamp,
										prUnavailableNote: "Tonight shift cancelled by PR",
									}
								: s,
						),
					}));
				}
				set({
					shiftAccepted: false,
					pendingApproval: false,
					acceptedShiftIndex: null,
					checkedIn: false,
					checkedOut: false,
					drinks: 0,
					tables: 0,
					prActiveShift: null,
					prCheckInMeta: {},
				});
				get().toast(
					deductionRm > 0
						? `Shift cancelled — −RM ${deductionRm} logged on next PV`
						: "Shift cancelled — no pay deduction",
					deductionRm > 0 ? "warn" : "info",
				);
			},
			requestPrSwap: (targetId, reason) => {
				const st = get();
				const prId = getPrRosterId(st.prSubRole);
				const sourceSlot = findAgencyRosterTonight(st.agencyRoster, prId);
				if (!sourceSlot) {
					get().toast("No confirmed shift to swap from", "warn");
					return;
				}
				if (!["scheduled", "en-route", "on-duty"].includes(sourceSlot.status)) {
					get().toast("Only confirmed shifts can be swapped", "warn");
					return;
				}
				const target = swapTargetOptionsForPr(
					st.agencyRoster,
					prId,
					sourceSlot,
					PR_AGENCY_TIED_OFFERS,
					st.prDeclinedOfferIds,
				).find((t) => t.id === targetId);
				if (!target) {
					get().toast("Pick a different shift to swap into", "warn");
					return;
				}
				const alreadyPending = st.prSwapRequests.some(
					(s) =>
						s.rosterSlotId === sourceSlot.id &&
						(s.status === "pending_agency" ||
							s.status === "pending_replacement"),
				);
				if (alreadyPending) {
					get().toast("Swap already pending for this shift", "info");
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const profile = getPrProfile(st.prSubRole);
				set((cur) => ({
					prSwapRequests: [
						{
							id: "swap-" + Date.now().toString(36),
							rosterSlotId: sourceSlot.id,
							requestingPrId: prId,
							requestingPrName: profile.name,
							outlet: sourceSlot.outlet,
							date: sourceSlot.date,
							dateIso: sourceSlot.dateIso,
							shift: sourceSlot.shift,
							targetOutlet: target.outlet,
							targetDate: target.date,
							targetDateIso: target.dateIso,
							targetShift: target.shift,
							targetRosterSlotId: target.rosterSlotId,
							targetOfferId: target.offerId,
							reason: reason.trim(),
							status: "pending_agency" as const,
							requestedAt: stamp,
						},
						...cur.prSwapRequests,
					],
				}));
				get().pushNotify({
					type: "swap_update",
					prId,
					prName: profile.name,
					outlet: `${sourceSlot.outlet} → ${target.outlet}`,
					status: "pending",
					notifyPr: false,
				});
				get().toast(
					`Swap request sent — ${sourceSlot.outlet} → ${target.outlet}`,
					"info",
				);
			},
			prCheckIn: (opts) => {
				const st0 = get();
				const offer = activePrShiftOffer(st0);
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				const date = getShiftToday();
				const dutyWages = calcDutyWagesFromOutlet(offer.outlet, offer.time);
				const session: PrActiveShiftSession = {
					id: makeShiftSessionId(date, offer.outlet),
					pvId: makeShiftPvId(date, offer.outlet),
					outlet: offer.outlet,
					date,
					shiftTime: offer.time,
					baseWages: dutyWages.wages,
					wagePerHour: dutyWages.wagePerHour,
					shiftHours: dutyWages.shiftHours,
					timeIn: stamp,
					receiptIds: [],
				};
				const prId = getPrRosterId(get().prSubRole);
				const checkInTime = new Date().toLocaleTimeString("en-MY", {
					hour: "2-digit",
					minute: "2-digit",
				});
				const late = opts?.simulateLate ?? get().prCheckInMeta.late ?? false;
				const gpsFallback =
					opts?.gpsFallback ?? get().prCheckInMeta.gpsFallback ?? false;
				const ctx = demoAttendanceContext(get());
				set((st) => {
					const pr = st.agencyPRs.find((p) => p.id === prId);
					const prName = pr?.name ?? getPrProfile(st.prSubRole).name;
					let roster = rosterCheckIn(
						st.agencyRoster,
						prId,
						offer.outlet,
						checkInTime,
						{
							prName,
							dateIso: ctx.dateIso,
							shift: offer.time,
						},
					);
					roster = patchPrRosterAttendanceFlags(
						roster,
						ctx.prId,
						ctx.outlet,
						ctx.dateIso,
						{
							lateFlag: late,
							noShowFlag: false,
						},
					);
					return withPrSessionRoleCache(st, {
						checkedIn: true,
						checkedOut: false,
						prActiveShift: session,
						agencyRoster: roster,
						prCheckInMeta: {
							late,
							noShowRisk: false,
							selfieDataUrl:
								opts?.selfieDataUrl ?? st.prCheckInMeta.selfieDataUrl ?? null,
							gpsFallback,
							closedShift: null,
						},
					});
				});
				get().syncLivePrCheckInToRoster();
				const lateNote = late ? " · Late flag (+15 min)" : "";
				const gpsNote = gpsFallback ? " · Manual maps fallback" : "";
				const profile = getPrProfile(get().prSubRole);
				get().pushNotify({
					type: "check_in",
					prId,
					prName: profile.name,
					outlet: offer.outlet,
					late,
				});
				get().toast(
					`Checked in ✓ Time-In locked · PV ${session.pvId}${lateNote}${gpsNote}`,
					"success",
				);
			},
			simulatePrLate: (enabled) => {
				if (!get().shiftAccepted || get().checkedIn) {
					get().toast("Accept a shift first", "warn");
					return;
				}
				const ctx = demoAttendanceContext(get());
				set((st) => ({
					agencyRoster: patchPrRosterAttendanceFlags(
						st.agencyRoster,
						ctx.prId,
						ctx.outlet,
						ctx.dateIso,
						enabled
							? { lateFlag: true, noShowFlag: false }
							: { lateFlag: false },
					),
					prCheckInMeta: {
						...st.prCheckInMeta,
						late: enabled,
						noShowRisk: enabled ? false : st.prCheckInMeta.noShowRisk,
					},
				}));
				get().toast(
					enabled
						? "Late flag active (+15 min) — synced to agency roster"
						: "Late simulation cleared",
					enabled ? "warn" : "info",
				);
			},
			simulatePrNoShow: () => {
				if (!get().shiftAccepted || get().checkedIn) {
					get().toast("Accept a shift first", "warn");
					return;
				}
				const ctx = demoAttendanceContext(get());
				set((st) => ({
					agencyRoster: patchPrRosterAttendanceFlags(
						st.agencyRoster,
						ctx.prId,
						ctx.outlet,
						ctx.dateIso,
						{ noShowFlag: true, lateFlag: false },
					),
					prCheckInMeta: {
						...st.prCheckInMeta,
						noShowRisk: true,
						late: false,
					},
				}));
				get().toast(
					"No-show flag logged (+30 min) — synced to agency roster",
					"warn",
				);
			},
			prCheckOut: () => {
				const shift = get().prActiveShift;
				const prId = getPrRosterId(get().prSubRole);
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				if (!shift) {
					const offer = activePrShiftOffer(get());
					const checkOutTime = new Date().toLocaleTimeString("en-MY", {
						hour: "2-digit",
						minute: "2-digit",
					});
					set((st) =>
						withPrSessionRoleCache(st, {
							checkedIn: false,
							checkedOut: true,
							agencyRoster: rosterCheckOut(
								st.agencyRoster,
								prId,
								offer.outlet,
								checkOutTime,
							),
						}),
					);
					get().syncLivePrCheckInToRoster();
					get().toast("Checked out ✓ duration recorded", "success");
					return;
				}
				const overtimeMinutes = 11;
				const dutyWages = calcDutyWagesFromOutlet(
					shift.outlet,
					shift.shiftTime,
					overtimeMinutes,
				);
				const closed: PrActiveShiftSession = {
					...shift,
					timeOut: stamp,
					overtimeMinutes,
					baseWages: dutyWages.wages,
					wagePerHour: dutyWages.wagePerHour,
					shiftHours: dutyWages.shiftHours,
				};
				const scans = receiptItemsForShift(
					shift,
					get().prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS,
				).filter(
					(r) =>
						r.shiftSessionId === shift.id || shift.receiptIds.includes(r.id),
				);
				const profile = getPrProfile(get().prSubRole);
				const sales = aggregateShiftSales(scans);
				const drinkSalesRm = scans.reduce(
					(sum, scan) =>
						sum +
						scan.items
							.filter((item) => item.category === "drinks")
							.reduce((line, item) => line + item.amount, 0),
					0,
				);
				const hoursWorked = closed.shiftHours || 6;
				const scanIds = new Set(scans.map((s) => s.id));
				const [y, m, d] = shift.date;
				const dateIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
				const managedPr = get().agencyPRs.find((p) => p.id === prId);
				const sealed = sealShiftHistoryAmounts({
					outlet: shift.outlet,
					drinkUnits: sales.drinkUnits,
					tipSalesRm: sales.tipRm,
					tableUnits: sales.tableUnits,
					hoursWorked,
					drinkSalesRm: drinkSalesRm > 0 ? drinkSalesRm : undefined,
					rules: get().outletCommissionRules,
					prTier: managedPr?.trainingLevel,
					payClass: managedPr
						? prPayClassOnDate(managedPr, dateIso)
						: undefined,
				});
				const historyRow = buildShiftHistoryRow({
					prId,
					prName: managedPr?.name ?? profile.name,
					outlet: shift.outlet,
					dateIso,
					dateDisplay: stamp.split("·")[0]?.trim() ?? stamp,
					totalPayout: sealed.totalPayout,
					totalDrinks: sealed.totalDrinks,
					drinkSalesRm: sealed.drinkSalesRm,
					totalTips: sealed.totalTips,
					totalTables: sealed.totalTables,
					wagesRm: sealed.wagesRm,
					otRm: sealed.otRm,
					drinkCommissionRm: sealed.drinkCommissionRm,
					tipCommissionRm: sealed.tipCommissionRm,
					durationHours: hoursWorked,
				});
				const checkOutTime = new Date().toLocaleTimeString("en-MY", {
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) =>
					withPrSessionRoleCache(st, {
						...syncLedgerState(st, {
							agencyRoster: rosterCheckOut(
								st.agencyRoster,
								prId,
								shift.outlet,
								checkOutTime,
							),
							shiftHistory: mergeShiftHistory(
								st.shiftHistory.filter(
									(r) =>
										shiftHistorySlotKey(r) !== shiftHistorySlotKey(historyRow),
								),
								[historyRow],
							),
						}),
						checkedOut: true,
						checkedIn: false,
						prActiveShift: null,
						prCheckInMeta: {
							...st.prCheckInMeta,
							closedShift: closed,
						},
						prReceiptScans: (st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS).map(
							(r) =>
								scanIds.has(r.id)
									? {
											...r,
											shiftSessionId: shift.id,
											status: "pending" as const,
										}
									: r,
						),
					}),
				);
				get().syncLivePrCheckInToRoster();
				get().toast(
					`Checked out · ${scans.length} receipt(s) logged — reopen Check-In to continue this shift`,
					"success",
				);
			},

			markPrNotificationRead: (id) =>
				set((st) => ({
					prNotifications: st.prNotifications.map((n) =>
						n.id === id ? { ...n, read: true } : n,
					),
				})),
			linkPayrollByAgencyCode: (code) => {
				const agencyId = PR_AGENCY_CODES[code.trim().toUpperCase()];
				if (!agencyId) {
					get().toast("Invalid agency code", "warn");
					return;
				}
				get().setPrPayrollAgency(agencyId);
			},
			submitSosIncident: (note, photoDataUrl) => {
				const st = get();
				const profile = getPrProfile(st.prSubRole);
				const prId = getPrRosterId(st.prSubRole);
				const prType = "agency_tied";
				const offer = activePrShiftOffer(st);
				const outlet = st.prActiveShift?.outlet ?? offer.outlet ?? "Velvet 23";
				const agencyName =
					getPrAgencyById(DEFAULT_TIED_AGENCY_ID)?.name ?? "Atlas Agency";
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const sosId = "sos-" + Date.now().toString(36);
				const incident: SosIncident = {
					id: sosId,
					at: stamp,
					note: note.trim(),
					photoDataUrl,
					locationLabel: DEMO_SOS_LOCATION.label,
					lat: DEMO_SOS_LOCATION.lat,
					lng: DEMO_SOS_LOCATION.lng,
					prId,
					prName: profile.name,
					prIc: profile.ic,
					prType,
					outlet,
					agencyName,
				};
				set((st) => ({ sosIncidents: [incident, ...st.sosIncidents] }));
				get().pushNotify({ type: "sos", incident });
				get().toast(
					"SOS alert sent · Agency, outlet, admin & emergency contacts notified",
					"warn",
				);
			},
			requestLeaveAgency: (note) => {
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
				});
				set({ prLeaveRequest: { type: "leave", note, at: stamp } });
				get().toast(
					"Support ticket raised — agency will review early leave request",
					"info",
				);
			},
			requestTransferAgency: (code, note) => {
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
				});
				set({
					prLeaveRequest: {
						type: "transfer",
						note,
						newAgencyCode: code,
						at: stamp,
					},
				});
				get().toast("Transfer request sent to InnocenZ support", "info");
			},

			prComcard: { ...COMCARD },
			prPortfolio: initialSnapshot.prPortfolio,
			prLanguages: ["English", "Mandarin", "Cantonese"],
			prDisplayName: null,
			prEmail: null,
			prIcName: null,
			prMobile: null,
			prAvatarPhoto: initialSnapshot.prAvatarPhoto,
			prPayrollAgencyId: null,
			prAgencies: initialSnapshot.prAgencies ?? ["atlas"],
			setPrAgencies: (ids) =>
				set({ prAgencies: ids.length ? [...ids] : ["atlas"] }),
			setPrPayrollAgency: (agencyId) => {
				const agency = getPrAgencyById(agencyId);
				if (!agency) return;
				set({ prPayrollAgencyId: agencyId });
				get().toast(`Payroll linked to ${agency.name}`, "success");
			},
			savePrProfile: (data) => {
				const prId = getPrRosterId(get().prSubRole);
				const displayName = data.displayName.trim();
				const icName = data.icName.trim();
				const mobile = data.mobile.trim();
				const email = data.email.trim();
				set((st) => {
					const portal = {
						prDisplayName: displayName,
						prIcName: icName,
						prMobile: mobile,
						prEmail: email,
						prAvatarPhoto: data.avatarPhoto,
						prComcard: data.comcard,
						prPortfolio: data.portfolio,
						prLanguages: data.languages,
					};
					const nextAgencyPRs = st.agencyPRs.map((p) =>
						syncAgencyPrFromPrPortal(p, prId, portal),
					);
					const nextRoster = st.agencyRoster.map((slot) =>
						slot.prId === prId
							? { ...slot, prName: displayName || slot.prName }
							: slot,
					);
					return {
						prDisplayName: displayName,
						prIcName: icName,
						prMobile: mobile,
						prEmail: email,
						prAvatarPhoto: data.avatarPhoto,
						prComcard: data.comcard,
						prPortfolio: data.portfolio,
						prLanguages: data.languages,
						agencyPRs: nextAgencyPRs,
						agencyRoster: nextRoster,
						prs: marketplacePrsFromAgency(nextAgencyPRs),
					};
				});
				get().toast(
					"Profile saved — synced across agency roster & outlet",
					"success",
				);
			},
			savePrContact: (patch) => {
				const st = get();
				const prId = getPrRosterId(st.prSubRole);
				const email = patch.email?.trim() ?? st.prEmail;
				const mobile = patch.mobile?.trim() ?? st.prMobile;
				set((cur) => {
					const portal = {
						prDisplayName: cur.prDisplayName,
						prIcName: cur.prIcName,
						prMobile: mobile,
						prEmail: email,
						prAvatarPhoto: cur.prAvatarPhoto,
						prComcard: cur.prComcard,
						prPortfolio: cur.prPortfolio,
						prLanguages: cur.prLanguages,
					};
					const nextAgencyPRs = cur.agencyPRs.map((p) =>
						syncAgencyPrFromPrPortal(p, prId, portal),
					);
					return {
						prEmail: email,
						prMobile: mobile,
						agencyPRs: nextAgencyPRs,
						prs: marketplacePrsFromAgency(nextAgencyPRs),
					};
				});
				get().toast(
					patch.email ? "Email updated" : "Mobile number updated",
					"success",
				);
			},

			prPaymentVouchers: initialSnapshot.prPaymentVouchers,
			ensurePreviousWeekPv: () => {
				const st = get();
				const role = st.prSubRole;
				if (!role) return;
				const profile = getPrProfile(role);
				const prId = getPrRosterId(role);
				const demoWeek =
					role === "pr_tied" ? demoPayrollWeekBoundsForWeeksAgo(0) : null;
				const prev = demoWeek
					? {
							...getPreviousWeekBounds(),
							startIso: demoWeek.weekStartIso,
							endIso: demoWeek.weekEndIso,
							label: demoWeek.cycle,
						}
					: getPreviousWeekBounds();
				if (!isWeekPvIssued(prev.endIso)) return;

				const pvs = st.prPaymentVouchers ?? SEED_PR_PVS;
				const mine = filterPvsForPrProfile(pvs, profile, role);
				const existing =
					mine.find((p) => DEMO_PV_ISSUED_WEEKS_AGO[p.id] === 0) ??
					mine.find((p) => p.weekStartIso === prev.startIso);
				if (existing && isDemoTimelinePayrollPv(existing)) return;
				if (
					existing &&
					(existing.status === "SIGNED" || existing.status === "PAID")
				)
					return;

				const scans = filterReceiptScansForPrProfile(
					st.prReceiptScans ?? [],
					profile,
					role,
					mine,
				);
				const summary = buildWeeklyPaymentSummary({
					weekStartIso: prev.startIso,
					pv: existing,
					shiftHistory: st.shiftHistory,
					scans,
					prId,
				});
				if (summary.totals.net <= 0 && !existing) return;

				const penaltyPr = st.agencyPRs.find((p) => p.id === prId);
				const penaltyDeductRm = penaltyPr
					? penaltyDeductRmForPr(
							penaltyPr,
							normalizePenaltyRules(st.agencyPenaltyRules),
						)
					: 0;
				const sentPv = buildSentWeeklyPv({
					profile,
					prSuffix: prId.charAt(0).toUpperCase(),
					summary,
					existing,
					fallbackOutlet: existing?.outlet ?? "Velvet 23",
					penaltyDeductRm: penaltyDeductRm > 0 ? penaltyDeductRm : undefined,
				});
				const nextPv =
					existing?.status === "DISPUTED"
						? {
								...sentPv,
								status: "DISPUTED" as const,
								prDisputeReason: existing.prDisputeReason,
								disputedAt: existing.disputedAt,
								prDisputePhotoDataUrl: existing.prDisputePhotoDataUrl,
								prDisputePhotoDataUrls: existing.prDisputePhotoDataUrls,
							}
						: sentPv;

				if (
					existing &&
					existing.status === nextPv.status &&
					existing.net === nextPv.net &&
					existing.rows.length === nextPv.rows.length
				) {
					return;
				}

				set((state) => {
					const all = state.prPaymentVouchers ?? SEED_PR_PVS;
					const without = existing
						? all.filter((p) => p.id !== existing.id)
						: all;
					return { prPaymentVouchers: [reconcilePvTotals(nextPv), ...without] };
				});
			},
			signPrPv: (id, signatureDataUrl) => {
				if (!signatureDataUrl?.startsWith("data:image/")) {
					get().toast("Draw your signature before confirming", "warn");
					return;
				}
				const pv = (get().prPaymentVouchers ?? SEED_PR_PVS).find(
					(p) => p.id === id,
				);
				if (!pv) return;
				const stamp = formatPvSignTimestamp();
				set((st) => {
					const nextPvs = (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id
							? {
									...p,
									status: "SIGNED" as const,
									prSignedAt: stamp,
									prSignatureDataUrl: signatureDataUrl,
								}
							: p,
					);
					const ledger = syncStoreHistoryLedger(
						st.shiftHistory,
						st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS,
						nextPvs,
					);
					return {
						prPaymentVouchers: ledger.pvs,
						prReceiptScans: syncAgencyPayrollReceiptScans(
							ledger.scans,
							ledger.pvs,
							st.agencyPRs,
						),
					};
				});
				get().pushNotify({
					type: "pv_signed",
					pvId: id,
					prName: pv.prName,
					net: pv.net,
				});
				get().toast(
					`Signed ✓ · ${pv.net.toLocaleString("en-MY", { style: "currency", currency: "MYR" })} — awaiting bank transfer`,
					"success",
				);
			},
			disputePrPv: (id, reason, photoDataUrls, targets) => {
				const trimmed = reason.trim();
				if (!trimmed) {
					get().toast("Describe the issue so your agency can verify", "warn");
					return;
				}
				const photos = photoDataUrls?.filter(Boolean) ?? [];
				const pv = (get().prPaymentVouchers ?? SEED_PR_PVS).find(
					(p) => p.id === id,
				);
				if (!pv) return;
				const year = pv.weekStartIso
					? parseInt(pv.weekStartIso.slice(0, 4), 10)
					: new Date().getFullYear();
				const rows = targets?.length
					? applyDisputeTargetsToRows(pv.rows, targets, year)
					: pv.rows;
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => {
					const nextPvs = (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id
							? {
									...p,
									status: "DISPUTED" as const,
									prDisputeReason: trimmed,
									disputedAt: stamp,
									prDisputePhotoDataUrls: photos.length ? photos : undefined,
									prDisputePhotoDataUrl: photos[0],
									rows,
								}
							: p,
					);
					const ledger = syncStoreHistoryLedger(
						st.shiftHistory,
						st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS,
						nextPvs,
					);
					return {
						prPaymentVouchers: ledger.pvs,
						prReceiptScans: syncAgencyPayrollReceiptScans(
							ledger.scans,
							ledger.pvs,
							st.agencyPRs,
						),
					};
				});
				get().pushNotify({
					type: "dispute_raised",
					pvId: id,
					prName: pv.prName,
					outlet: pv.outlet,
				});
				get().toast(
					"Dispute submitted — your agency will review and adjust the PV",
					"warn",
				);
			},
			updatePrPvDisputeReason: (id, reason, photoDataUrls, targets) => {
				const trimmed = reason.trim();
				if (!trimmed) {
					get().toast("Dispute reason cannot be empty", "warn");
					return;
				}
				const photos = photoDataUrls?.filter(Boolean) ?? [];
				const pv = (get().prPaymentVouchers ?? SEED_PR_PVS).find(
					(p) => p.id === id,
				);
				if (!pv) return;
				const year = pv.weekStartIso
					? parseInt(pv.weekStartIso.slice(0, 4), 10)
					: new Date().getFullYear();
				const rows = targets?.length
					? applyDisputeTargetsToRows(pv.rows, targets, year)
					: pv.rows;
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => ({
					prPaymentVouchers: (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id
							? {
									...p,
									prDisputeReason: trimmed,
									disputeUpdatedAt: stamp,
									prDisputePhotoDataUrls: photos.length ? photos : undefined,
									prDisputePhotoDataUrl: photos[0],
									rows,
								}
							: p,
					),
				}));
				get().toast("Dispute reason updated — agency notified", "success");
			},
			escalatePrPvDispute: (id) => {
				const pv = (get().prPaymentVouchers ?? SEED_PR_PVS).find(
					(p) => p.id === id,
				);
				if (!pv) return;
				if (pv.status !== "DISPUTED") {
					get().toast("Only open disputes can be escalated", "warn");
					return;
				}
				if (pv.disputeEscalatedAt) {
					get().toast(
						"Dispute already escalated — InnocenZ support notified",
						"info",
					);
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => ({
					prPaymentVouchers: (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id ? { ...p, disputeEscalatedAt: stamp } : p,
					),
				}));
				get().pushNotify({
					type: "dispute_raised",
					pvId: id,
					prName: pv.prName,
					outlet: pv.outlet,
				});
				get().toast("Dispute escalated — InnocenZ support notified", "warn");
			},
			withdrawPrPvDispute: (id, targets) => {
				if (!targets?.length) {
					get().toast("Nothing to withdraw", "warn");
					return;
				}
				const pv = (get().prPaymentVouchers ?? SEED_PR_PVS).find(
					(p) => p.id === id,
				);
				if (!pv) return;
				if (pv.status !== "DISPUTED" && !pvRowsHaveDisputes(pv.rows)) {
					get().toast("No open dispute on this amount", "warn");
					return;
				}
				const year = pv.weekStartIso
					? parseInt(pv.weekStartIso.slice(0, 4), 10)
					: new Date().getFullYear();
				const rows = clearDisputeTargetsFromRows(pv.rows, targets, year);
				const stillDisputed = pvRowsHaveDisputes(rows);
				const nextReason = removeDisputeLinesForTargets(
					pv.prDisputeReason,
					targets,
				);

				set((st) => {
					const nextPvs = (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id
							? {
									...p,
									rows,
									prDisputeReason: stillDisputed ? nextReason : undefined,
									status: stillDisputed
										? ("DISPUTED" as const)
										: ("SENT" as const),
									...(stillDisputed
										? {
												disputeUpdatedAt: new Date().toLocaleString("en-MY", {
													day: "numeric",
													month: "short",
													year: "numeric",
													hour: "2-digit",
													minute: "2-digit",
												}),
											}
										: {
												disputedAt: undefined,
												disputeUpdatedAt: undefined,
												prDisputePhotoDataUrls: undefined,
												prDisputePhotoDataUrl: undefined,
												disputeEscalatedAt: undefined,
											}),
								}
							: p,
					);
					const ledger = syncStoreHistoryLedger(
						st.shiftHistory,
						st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS,
						nextPvs,
					);
					return {
						prPaymentVouchers: ledger.pvs,
						prReceiptScans: syncAgencyPayrollReceiptScans(
							ledger.scans,
							ledger.pvs,
							st.agencyPRs,
						),
					};
				});
				get().toast(
					stillDisputed
						? "Dispute withdrawn for that amount — other disputed lines still open"
						: "Dispute withdrawn — review and sign when ready",
					"success",
				);
			},

			prReceiptScans: initialSnapshot.prReceiptScans,
			addReceiptScan: (draft) => {
				const shift = get().prActiveShift;
				if (!get().checkedIn || get().checkedOut) {
					get().toast(
						"Check in first — receipts only attach to your current shift PV",
						"warn",
					);
					return "";
				}
				if (!shift) {
					get().toast("No active shift session — check in again", "warn");
					return "";
				}
				const manual = draft.manualSelfLog;
				const outletNorm =
					draft.outlet.replace(/\s+KL$/i, "").trim() || draft.outlet;
				const items = manual
					? resolveManualSelfLogItems(
							{
								category:
									manual.category === "tables" ? "drinks" : manual.category,
								amount: manual.amount,
								drinkId: manual.drinkId,
								drinkQty: manual.drinkQty,
								drinkQtys: manual.drinkQtys,
							},
							outletNorm,
						)
					: draft.items;
				const totalLogged = manual
					? manualSelfLogTotal(items)
					: draft.totalLogged;
				const fingerprint = receiptScanFingerprint({
					outlet: draft.outlet,
					totalLogged,
					items,
					receiptRef: draft.receiptRef,
				});
				const existing = findDuplicateReceiptScan(
					get().prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS,
					fingerprint,
					draft.replaceScanId,
				);
				if (existing) {
					get().toast(
						`Duplicate receipt — already logged as ${existing.id}${existing.receiptRef ? ` (${existing.receiptRef})` : ""}`,
						"warn",
					);
					return "";
				}
				const scans = get().prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS;
				const replaced = draft.replaceScanId
					? scans.find((s) => s.id === draft.replaceScanId)
					: undefined;
				if (draft.replaceScanId) {
					if (!replaced) {
						get().toast(
							"Original receipt not found — scan as new instead",
							"warn",
						);
						return "";
					}
					if (replaced.shiftSessionId !== shift.id) {
						get().toast(
							"Can only replace receipts on your current shift",
							"warn",
						);
						return "";
					}
				}
				const id = replaced?.id ?? `rc-${Date.now().toString(36)}`;
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				const comm = calcReceiptCommissions(items);
				const outlet =
					draft.outlet.replace(/\s+KL$/i, "").trim() || draft.outlet;
				const scan: PrReceiptScan = {
					id,
					receiptRef: draft.receiptRef.trim(),
					scannedAt: stamp,
					entryMethod: draft.entryMethod ?? (manual ? "manual" : "scan"),
					date: [...shift.date] as [number, number, number],
					outlet,
					prCode: draft.prCode,
					prName: draft.prName,
					prId: draft.prId,
					items,
					totalLogged,
					...comm,
					shiftSessionId: shift.id,
					pvId: shift.pvId,
					status: "attached",
					logSource: manual ? "manual" : "ocr",
					manualReason:
						manual?.reason ??
						(manual ? "OCR unreadable — water / blur on receipt" : undefined),
					agencyVerification: manual ? "pending" : undefined,
				};
				set((st) => {
					const allScans = st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS;
					const withoutReplaced = replaced
						? allScans.filter((s) => s.id !== replaced.id)
						: allScans;
					const oldQty = replaced
						? receiptQtyDelta(replaced.items)
						: { drinks: 0, tables: 0 };
					const newQty = receiptQtyDelta(items);
					const oldTipRm = replaced ? receiptTipRmTotal(replaced.items) : 0;
					const newTipRm = receiptTipRmTotal(items);
					const receiptIds = replaced
						? shift.receiptIds.map((rid) => (rid === replaced.id ? id : rid))
						: [...shift.receiptIds, id];
					const [y, m, d] = shift.date;
					const dateIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
					return {
						prReceiptScans: [scan, ...withoutReplaced],
						prActiveShift: shift ? { ...shift, receiptIds } : null,
						drinks: st.drinks - oldQty.drinks + newQty.drinks,
						tables: st.tables - oldQty.tables + newQty.tables,
						agencyRoster: patchRosterFloorFromReceiptDelta(
							st.agencyRoster,
							draft.prId,
							outlet,
							dateIso,
							oldQty,
							newQty,
							oldTipRm,
							newTipRm,
						),
					};
				});
				if (manual) {
					get().pushNotify({
						type: "receipt_self_log",
						scanId: id,
						receiptRef: scan.receiptRef,
						prId: draft.prId,
						prName: draft.prName,
						outlet,
						amount: totalLogged,
						category: manual.category,
					});
					get().toast(
						replaced
							? `Self-log updated · RM ${totalLogged.toFixed(2)} — agency will re-verify`
							: `Self-log submitted · RM ${totalLogged.toFixed(2)} — agency will verify before it counts`,
						"success",
					);
				} else {
					get().toast(
						replaced
							? `Receipt re-scanned · replaced ${replaced.receiptRef}`
							: `Receipt logged → ${shift.pvId} · receipt #${shift.receiptIds.length + 1} on this shift`,
						"success",
					);
				}
				return id;
			},

			updateReceiptSelfLog: (scanId, patch) => {
				const shift = get().prActiveShift;
				if (!get().checkedIn || get().checkedOut) {
					get().toast("Check in on your shift to edit self-logs", "warn");
					return;
				}
				if (!shift) {
					get().toast("No active shift session", "warn");
					return;
				}
				const scans = get().prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS;
				const scan = scans.find((s) => s.id === scanId);
				if (
					!scan ||
					scan.logSource !== "manual" ||
					scan.agencyVerification !== "pending"
				) {
					get().toast(
						"Only pending self-logs on this shift can be edited",
						"warn",
					);
					return;
				}
				if (scan.shiftSessionId !== shift.id) {
					get().toast("This self-log belongs to another shift", "warn");
					return;
				}
				const category =
					patch.category != null
						? patch.category === "tables"
							? "drinks"
							: patch.category
						: receiptScanCategory(scan);
				const outlet = scan.outlet.replace(/\s+KL$/i, "").trim() || scan.outlet;
				const items =
					category === "drinks" &&
					(patch.drinkQtys || (patch.drinkId && patch.drinkQty))
						? resolveManualSelfLogItems(
								{
									category: "drinks",
									amount: patch.amount ?? 0,
									drinkId: patch.drinkId,
									drinkQty: patch.drinkQty,
									drinkQtys: patch.drinkQtys,
								},
								outlet,
							)
						: buildManualReceiptItems(category, patch.amount ?? 0);
				const amount = manualSelfLogTotal(items);
				if (amount <= 0) {
					get().toast(
						category === "drinks"
							? "Set quantity for at least one drink"
							: "Enter a valid amount",
						"warn",
					);
					return;
				}
				const comm = calcReceiptCommissions(items);
				const oldQty = receiptQtyDelta(scan.items);
				const newQty = receiptQtyDelta(items);
				const oldTipRm = receiptTipRmTotal(scan.items);
				const newTipRm = receiptTipRmTotal(items);
				const dateIso = receiptDateIso(scan);
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => ({
					prReceiptScans: (st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS).map(
						(s) =>
							s.id === scanId
								? {
										...s,
										items,
										totalLogged: amount,
										...comm,
										manualReason:
											patch.reason?.trim() ||
											s.manualReason ||
											"OCR unreadable — water / blur on receipt",
										scannedAt: `${stamp} (edited)`,
										agencyVerification: "pending" as const,
										agencyVerifiedAt: undefined,
									}
								: s,
					),
					drinks: st.drinks - oldQty.drinks + newQty.drinks,
					tables: st.tables - oldQty.tables + newQty.tables,
					agencyRoster: scan.prId
						? patchRosterFloorFromReceiptDelta(
								st.agencyRoster,
								scan.prId,
								outlet,
								dateIso,
								oldQty,
								newQty,
								oldTipRm,
								newTipRm,
							)
						: st.agencyRoster,
				}));
				if (scan.prId) {
					get().pushNotify({
						type: "receipt_self_log",
						scanId,
						receiptRef: scan.receiptRef,
						prId: scan.prId,
						prName: scan.prName,
						outlet: scan.outlet,
						amount,
						category,
					});
				}
				get().toast(
					`Self-log updated · RM ${amount.toFixed(2)} — agency notified`,
					"success",
				);
			},

			deleteReceiptSelfLog: (scanId) => {
				const shift = get().prActiveShift;
				if (!get().checkedIn || get().checkedOut) {
					get().toast("Check in on your shift to delete self-logs", "warn");
					return;
				}
				if (!shift) {
					get().toast("No active shift session", "warn");
					return;
				}
				const scans = get().prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS;
				const scan = scans.find((s) => s.id === scanId);
				if (
					!scan ||
					scan.logSource !== "manual" ||
					scan.agencyVerification !== "pending"
				) {
					get().toast(
						"Only pending self-logs on this shift can be deleted",
						"warn",
					);
					return;
				}
				if (scan.shiftSessionId !== shift.id) {
					get().toast("This self-log belongs to another shift", "warn");
					return;
				}
				const oldQty = receiptQtyDelta(scan.items);
				const oldTipRm = receiptTipRmTotal(scan.items);
				const outlet = scan.outlet.replace(/\s+KL$/i, "").trim() || scan.outlet;
				const dateIso = receiptDateIso(scan);
				set((st) => ({
					prReceiptScans: (st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS).filter(
						(s) => s.id !== scanId,
					),
					prActiveShift: st.prActiveShift
						? {
								...st.prActiveShift,
								receiptIds: st.prActiveShift.receiptIds.filter(
									(id) => id !== scanId,
								),
							}
						: null,
					drinks: Math.max(0, st.drinks - oldQty.drinks),
					tables: Math.max(0, st.tables - oldQty.tables),
					agencyRoster: scan.prId
						? patchRosterFloorFromReceiptDelta(
								st.agencyRoster,
								scan.prId,
								outlet,
								dateIso,
								oldQty,
								{ drinks: 0, tables: 0 },
								oldTipRm,
								0,
							)
						: st.agencyRoster,
				}));
				get().toast(`Self-log deleted · ${scan.receiptRef}`, "success");
			},

			verifyAgencyReceiptSelfLog: (scanId, decision) => {
				const scans = get().prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS;
				const scan = scans.find((s) => s.id === scanId);
				if (
					!scan ||
					scan.logSource !== "manual" ||
					scan.agencyVerification !== "pending"
				) {
					get().toast("This self-log is not awaiting verification", "warn");
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => ({
					prReceiptScans: (st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS).map(
						(s) =>
							s.id === scanId
								? {
										...s,
										agencyVerification: decision,
										agencyVerifiedAt: stamp,
									}
								: s,
					),
				}));
				if (scan.prId) {
					get().pushNotify({
						type: "receipt_self_log_verified",
						scanId,
						prId: scan.prId,
						prName: scan.prName,
						approved: decision === "approved",
						amount: scan.totalLogged,
					});
				}
				get().toast(
					decision === "approved"
						? `Self-log approved · ${scan.prName} · RM ${scan.totalLogged.toFixed(2)}`
						: `Self-log rejected · ${scan.prName} notified`,
					decision === "approved" ? "success" : "warn",
				);
			},

			editAgencyPv: (id, patch) => {
				set((st) => ({
					prPaymentVouchers: (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) => {
						if (p.id !== id) return p;
						const rows = patch.rows ?? p.rows;
						const deduct = patch.deduct ?? p.deduct;
						return reconcilePvTotals({ ...p, ...patch, rows, deduct });
					}),
				}));
				get().toast("PV updated — line items recalculated", "success");
			},
			resendAgencyPv: (id) => {
				const pvs = get().prPaymentVouchers ?? SEED_PR_PVS;
				const pv = pvs.find((p) => p.id === id);
				if (!pv) return;
				const dup = pvs.some(
					(p) =>
						p.id !== id &&
						p.status === "PAID" &&
						p.prName === pv.prName &&
						pv.rows.some((r) =>
							p.paidRefs?.includes(`${r.date}-${r.outlet}-${r.ref}`),
						),
				);
				if (dup) {
					get().toast(
						"Blocked — duplicate payment detected for same shift ref",
						"warn",
					);
					return;
				}
				set((st) => ({
					prPaymentVouchers: (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id
							? {
									...p,
									status: "PENDING_REVIEW" as const,
									disputeNote: undefined,
									prDisputeReason: undefined,
									disputedAt: undefined,
								}
							: p,
					),
				}));
				get().toast(`PV ${id} re-sent to ${pv.prName} for e-signature`, "info");
			},
			sendAgencyPvToPr: (id) => {
				const pv = (get().prPaymentVouchers ?? SEED_PR_PVS).find(
					(p) => p.id === id,
				);
				if (!pv) return;
				if (pv.status !== "PENDING_REVIEW") {
					get().toast(
						"Only draft / pending-review PVs can be sent to PR",
						"warn",
					);
					return;
				}
				const pvs = get().prPaymentVouchers ?? SEED_PR_PVS;
				const dup = pvs.some(
					(p) =>
						p.id !== id &&
						p.status === "PAID" &&
						p.prName === pv.prName &&
						pv.rows.some((r) =>
							p.paidRefs?.includes(`${r.date}-${r.outlet}-${r.ref}`),
						),
				);
				if (dup) {
					get().toast("Blocked — duplicate payment (Golden Audit Σ≠0)", "warn");
					return;
				}
				set((st) => {
					const nextPvs = (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id ? { ...p, status: "SENT" as const } : p,
					);
					const ledger = syncStoreHistoryLedger(
						st.shiftHistory,
						st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS,
						nextPvs,
					);
					return {
						prPaymentVouchers: ledger.pvs,
						prReceiptScans: syncAgencyPayrollReceiptScans(
							ledger.scans,
							ledger.pvs,
							st.agencyPRs,
						),
					};
				});
				const prId = prIdForPayeeName(pv.prName, pv.prIc, get().agencyPRs);
				get().pushNotify({
					type: "pv_sent",
					pvId: id,
					prId,
					prName: pv.prName,
					net: pv.net,
				});
				get().toast(
					`PV sent to ${pv.prName} · awaiting PR e-signature`,
					"success",
				);
			},
			resolveAgencyPvDispute: (id) => {
				set((st) => {
					const nextPvs = (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id
							? {
									...p,
									status: "PENDING_REVIEW" as const,
									disputeNote: undefined,
									prDisputeReason: undefined,
									disputedAt: undefined,
								}
							: p,
					);
					const ledger = syncStoreHistoryLedger(
						st.shiftHistory,
						st.prReceiptScans ?? LIVE_SEED_RECEIPT_SCANS,
						nextPvs,
					);
					return {
						prPaymentVouchers: ledger.pvs,
						prReceiptScans: syncAgencyPayrollReceiptScans(
							ledger.scans,
							ledger.pvs,
							st.agencyPRs,
						),
					};
				});
				get().toast("Dispute resolved — PV re-sent to PR", "success");
			},
			raiseAgencyPvFromHistory: (shiftHistoryId) => {
				const row = get().shiftHistory.find((h) => h.id === shiftHistoryId);
				if (!row) {
					get().toast("Shift not found", "warn");
					return;
				}
				const pr = get().agencyPRs.find((p) => p.id === row.prId);
				if (!pr || pr.suspended || pr.detached) {
					get().toast("PR unavailable for PV", "warn");
					return;
				}
				const pvs = get().prPaymentVouchers ?? SEED_PR_PVS;
				if (historyRowHasPv(row, pvs)) {
					get().toast("PV already raised for this shift", "warn");
					return;
				}
				const fh = financeHeadStampFromProfile(get().agencyFinanceHead);
				const pv = buildPvFromShiftHistoryRow(row, pr, fh);
				set((st) => {
					const nextPvs = [pv, ...(st.prPaymentVouchers ?? SEED_PR_PVS)];
					return {
						prPaymentVouchers: nextPvs,
						agencyOwner: syncAgencyOwnerSubscriptionPlan(
							st.agencyOwner,
							getAgencyManagedPvs(nextPvs, st.agencyPRs),
							getPreviousWeekSundayIso(),
						),
					};
				});
				get().pushNotify({
					type: "pv_sent",
					pvId: pv.id,
					prId: pr.id,
					prName: pr.name,
					net: pv.net,
				});
				get().toast(
					`PV ${pv.id} raised · Finance Head pre-signed · sent to ${pr.name}`,
					"success",
				);
			},
			overrideSignedAgencyPv: (id, reason) => {
				const trimmed = reason.trim();
				if (!trimmed) {
					get().toast("Override reason required — audit logged", "warn");
					return;
				}
				const pv = (get().prPaymentVouchers ?? SEED_PR_PVS).find(
					(p) => p.id === id,
				);
				if (!pv || (pv.status !== "SIGNED" && pv.status !== "PAID")) {
					get().toast("Only signed or paid PVs can be overridden", "warn");
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				const by =
					get().agencySubRole === "agency_finance"
						? "Finance Head"
						: "Agency Owner";
				set((st) => ({
					prPaymentVouchers: (st.prPaymentVouchers ?? SEED_PR_PVS).map((p) =>
						p.id === id
							? {
									...p,
									status: "PENDING_REVIEW" as const,
									prSignedAt: undefined,
									prSignatureDataUrl: undefined,
									paidAt: undefined,
									bankRef: undefined,
									overrideAudit: {
										at: stamp,
										reason: trimmed,
										by,
										previousStatus: p.status,
									},
								}
							: p,
					),
				}));
				get().toast(
					`PV overridden — audit logged · re-opened for PR review`,
					"warn",
				);
			},

			agencyOwner: { ...DEFAULT_AGENCY_OWNER },
			saveAgencyOwner: (patch) => {
				set((st) => ({ agencyOwner: { ...st.agencyOwner, ...patch } }));
				get().toast("Agency settings saved", "success");
			},
			sendAgencyOtp: () => {
				const ch = get().agencyOwner.otpChannel;
				get().toast(
					`OTP sent to your ${ch === "email" ? "email" : "mobile"}`,
					"info",
				);
			},
			verifyAgencyOtp: (code) => {
				if (code === "123456" || code.length === 6) {
					set((st) => ({
						agencyOwner: { ...st.agencyOwner, accountActivated: true },
					}));
					get().toast("Account activated ✓", "success");
					return true;
				}
				get().toast("Invalid OTP — try 123456 for demo", "warn");
				return false;
			},

			agencyFinanceHead: { ...DEFAULT_FINANCE_HEAD },
			saveAgencyFinanceHead: (patch) => {
				set((st) => ({
					agencyFinanceHead: { ...st.agencyFinanceHead, ...patch },
				}));
				get().toast(
					"Finance Head profile saved — e-signature ready for PV dual-sign",
					"success",
				);
			},
			saveAgencyProfileSettings: (data) => {
				set((st) => ({
					agencyOwner: data.owner,
					agencyFinanceHead: data.financeHead,
					scalingTierMultipliers: data.scalingTierMultipliers,
					outletCommissionRules: data.outletCommissionRules,
					outletWorkspace: syncWorkspaceFromCommissionRules(
						st.outletWorkspace,
						data.outletCommissionRules,
					),
				}));
				get().toast(
					"Agency settings saved · outlet workspace synced",
					"success",
				);
			},

			agencyCollections: initialSnapshot.agencyCollections,
			markCollectionSettled: (id) => {
				set((st) => ({
					agencyCollections: st.agencyCollections.map((c) =>
						c.id === id
							? { ...c, status: "SETTLED" as const, aging: "current" as const }
							: c,
					),
				}));
				get().toast("Invoice marked received · status SETTLED", "success");
			},
			sendCollectionReminder: (id) => {
				const col = get().agencyCollections.find((c) => c.id === id);
				if (!col) {
					get().toast("Invoice not found", "warn");
					return;
				}
				set((st) => ({
					agencyCollections: st.agencyCollections.map((c) =>
						c.id === id ? { ...c, reminderSent: true } : c,
					),
				}));
				get().pushNotify({
					type: "collection_reminder",
					collectionId: col.id,
					outlet: col.outlet,
					amount: col.amount,
					dueDate: col.dueDate,
				});
				get().toast(
					`Reminder sent to ${col.counterparty ?? col.outlet} · check outlet bell`,
					"success",
				);
			},

			agencyReconciliation: initialSnapshot.agencyReconciliation,
			confirmAgencyReconciliation: () => {
				set((st) => ({
					agencyReconciliation: {
						...st.agencyReconciliation,
						agencyConfirmed: true,
					},
				}));
				get().toast(
					"Weekly reconciliation confirmed · agency side locked",
					"success",
				);
			},
			confirmOutletReconciliation: () => {
				set((st) => ({
					agencyReconciliation: {
						...st.agencyReconciliation,
						outletConfirmed: true,
					},
				}));
				get().toast(
					"Outlet weekly reconciliation confirmed · synced to agency",
					"success",
				);
			},
			confirmPrReconciliation: (prId) => {
				set((st) => {
					const ids = st.agencyReconciliation.prConfirmedIds ?? [];
					if (ids.includes(prId)) return st;
					return {
						agencyReconciliation: {
							...st.agencyReconciliation,
							prConfirmedIds: [...ids, prId],
						},
					};
				});
				get().toast("PR weekly earnings confirmed", "success");
			},
			syncReconciliationFromLedger: () => {
				set((st) => syncLedgerState(st, {}));
			},

			agencyRoster: initialSnapshot.agencyRoster,
			editRosterSlot: (id, patch) => {
				const slot = get().agencyRoster.find((s) => s.id === id);
				set((st) => ({
					agencyRoster: st.agencyRoster.map((s) =>
						s.id === id ? { ...s, ...patch } : s,
					),
				}));
				if (slot) {
					const detail = [
						patch.outlet && patch.outlet !== slot.outlet
							? `outlet → ${patch.outlet}`
							: null,
						patch.shift && patch.shift !== slot.shift
							? `shift → ${patch.shift}`
							: null,
						patch.status && patch.status !== slot.status
							? `status → ${patch.status}`
							: null,
					]
						.filter(Boolean)
						.join(", ");
					if (detail) {
						get().pushNotify({
							type: "shift_edit",
							prId: slot.prId,
							prName: slot.prName,
							outlet: patch.outlet ?? slot.outlet,
							detail,
						});
					}
				}
				get().toast("Roster updated", "success");
			},
			cancelRosterShift: (rosterSlotId) => {
				const st = get();
				const slot = st.agencyRoster.find((s) => s.id === rosterSlotId);
				if (!slot) return;
				if (slot.checkedOutAt) {
					get().toast("Cannot cancel a completed shift", "warn");
					return;
				}
				const isTonight = slot.dateIso === DEFAULT_ROSTER_DATE_ISO;
				set((cur) => {
					const prSwapRequests = cur.prSwapRequests.map((s) =>
						s.rosterSlotId === rosterSlotId &&
						(s.status === "pending_agency" ||
							s.status === "pending_replacement")
							? { ...s, status: "declined" as const }
							: s,
					);
					let next: typeof cur = {
						...cur,
						agencyRoster: cur.agencyRoster.filter((s) => s.id !== rosterSlotId),
						prSwapRequests,
						shifts: cur.shifts.map((sh) => {
							if (
								!outletMatches(sh.outletName, slot.outlet) ||
								!sh.prs.includes(slot.prId)
							)
								return sh;
							const prs = sh.prs.filter((id) => id !== slot.prId);
							return { ...sh, prs, filled: prs.length };
						}),
					};
					if (slot.prId === TIED_DEMO_ROSTER_PR_ID && isTonight) {
						next = {
							...next,
							...patchPrSessionForRole(cur, "pr_tied", clearPrShiftSession()),
						};
					}
					return next;
				});
				get().pushNotify({
					type: "shift_edit",
					prId: slot.prId,
					prName: slot.prName,
					outlet: slot.outlet,
					detail: "shift cancelled by agency",
				});
				get().toast(
					`Shift cancelled — ${slot.prName} freed for ${slot.date}`,
					"info",
				);
			},
			requestOutletSwap: (id, targetOutlet, agencyNote) => {
				const slot = get().agencyRoster.find((s) => s.id === id);
				if (!slot) return;
				if (targetOutlet === slot.outlet) {
					get().toast("Choose a different outlet", "warn");
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const swap: OutletSwapRequest = {
					targetOutlet,
					status: "pending_pr",
					agencyName: "Atlas Agency",
					agencyNote,
					requestedAt: stamp,
					requestedAtMs: Date.now(),
				};
				set((st) => ({
					agencyRoster: st.agencyRoster.map((s) =>
						s.id === id
							? { ...s, status: "swap-pending" as const, outletSwap: swap }
							: s,
					),
				}));
				get().pushNotify({
					type: "swap_update",
					prId: slot.prId,
					prName: slot.prName,
					outlet: slot.outlet,
					status: "pending",
					notifyAgency: false,
				});
				get().toast(
					`Outlet swap sent to ${slot.prName} — awaiting PR approval`,
					"success",
				);
			},
			cancelOutletSwap: (id) => {
				set((st) => ({
					agencyRoster: st.agencyRoster.map((s) =>
						s.id === id
							? {
									...s,
									status:
										s.status === "swap-pending"
											? ("scheduled" as const)
											: s.status,
									outletSwap: undefined,
								}
							: s,
					),
				}));
				get().toast("Outlet swap request cancelled", "info");
			},
			approveOutletSwapByPr: (rosterSlotId) => {
				const slot = get().agencyRoster.find((s) => s.id === rosterSlotId);
				if (!slot?.outletSwap || slot.outletSwap.status !== "pending_pr")
					return;
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => ({
					agencyRoster: st.agencyRoster.map((s) =>
						s.id === rosterSlotId
							? {
									...s,
									outlet: s.outletSwap!.targetOutlet,
									status: "scheduled" as const,
									outletSwap: {
										...s.outletSwap!,
										status: "approved" as const,
										respondedAt: stamp,
									},
								}
							: s,
					),
				}));
				get().toast(
					`Approved — shift moved to ${slot.outletSwap.targetOutlet}`,
					"success",
				);
			},
			assignPrToOutlet: ({
				prId,
				outlet,
				dateIso,
				dateLabel,
				shiftStart,
				shiftEnd,
				shift: shiftLabel,
				outletShiftId,
				event,
				payEstimate,
			}) => {
				const st = get();
				const pr = st.agencyPRs.find((p) => p.id === prId);
				if (!pr) return;
				if (pr.suspended || pr.detached) {
					get().toast(`${pr.name} is suspended or detached`, "warn");
					return;
				}
				const postedShiftId = outletShiftId?.startsWith("posted-")
					? outletShiftId.slice("posted-".length)
					: outletShiftId;
				const postedShift = postedShiftId
					? st.shifts.find((s) => s.id === postedShiftId)
					: undefined;
				const linkedDateIso = postedShift
					? shiftDateIso(postedShift.date, postedShift.dateIso)
					: dateIso;
				const linkedDateLabel = postedShift
					? postedShift.date === "Tonight" || postedShift.date === "Tomorrow"
						? fmtDateLabelFromIso(linkedDateIso)
						: postedShift.date
					: dateLabel;
				const existingActive = st.agencyRoster.find(
					(s) =>
						s.prId === prId &&
						s.dateIso === linkedDateIso &&
						!s.checkedOutAt &&
						s.status !== "unavailable" &&
						s.status !== "outlet-request-pending",
				);
				if (existingActive) {
					const crossAgency = agencyIdOf(existingActive) !== st.activeAgencyId;
					const bookingAgencyName =
						getPrAgencyById(agencyIdOf(existingActive))?.name ??
						"another agency";
					get().toast(
						crossAgency
							? `${pr.name} already booked by ${bookingAgencyName} on ${linkedDateLabel} — cannot double-book across agencies`
							: `${pr.name} already has a shift on this date`,
						"warn",
					);
					return;
				}
				const existingDayOff = st.agencyRoster.find(
					(s) =>
						s.prId === prId &&
						s.dateIso === linkedDateIso &&
						isPrMarkedDayOff(s),
				);
				if (existingDayOff) {
					get().toast(
						`${pr.name} marked ${linkedDateLabel} unavailable on their schedule — they must reopen the day first`,
						"warn",
					);
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const reusableExisting = st.agencyRoster.find(
					(s) =>
						s.prId === prId &&
						s.dateIso === linkedDateIso &&
						s.status === "outlet-request-pending",
				);
				const id =
					reusableExisting?.id ?? "rs" + Date.now().toString(36).slice(-6);
				const shift = shiftLabel ?? `${shiftStart} — ${shiftEnd}`;
				const isTonight = linkedDateIso === DEFAULT_ROSTER_DATE_ISO;
				const slot: AgencyRosterSlot = {
					id,
					prId,
					prName: pr.name,
					outlet,
					date: linkedDateLabel,
					dateIso: linkedDateIso,
					shift,
					shiftStart,
					shiftEnd,
					status: "scheduled",
					estPayout: payEstimate,
					agencyId: st.activeAgencyId,
					payTierId:
						prPayClass(pr) === "commissionOnly" ? "commission_only" : undefined,
					agencyAssignment: {
						agencyName:
							getPrAgencyById(st.activeAgencyId)?.name ?? "Atlas Agency",
						assignedAt: stamp,
						assignedAtMs: Date.now(),
						agencyNote: event,
						outletShiftId,
					},
				};
				set((cur) => {
					const nextRoster = reusableExisting
						? cur.agencyRoster.map((s) =>
								s.id === reusableExisting.id ? slot : s,
							)
						: [slot, ...cur.agencyRoster];
					const nextShifts = postedShiftId
						? addPrToPostedOutletShift(cur.shifts, postedShiftId, prId, outlet)
						: addPrToOutletShift(cur.shifts, outlet, prId);
					return {
						agencyRoster: nextRoster,
						shifts: syncAgencyRosterToOutletShifts(nextShifts, nextRoster),
						...(prId === TIED_DEMO_ROSTER_PR_ID && isTonight
							? patchPrSessionForRole(cur, "pr_tied", {
									shiftAccepted: true,
									pendingApproval: false,
									acceptedShiftIndex: shiftIndexForOutlet(outlet),
									checkedIn: false,
									checkedOut: false,
								})
							: {}),
					};
				});
				get().toast(
					`${pr.name} scheduled at ${outlet} · ${dateLabel}`,
					"success",
				);
				get().pushNotify({
					type: "shift_assigned",
					prId,
					prName: pr.name,
					outlet,
					detail: `${outlet} · ${event ?? shift} — cancel per agency policy if needed`,
				});
			},
			approveAgencyAssignmentByPr: (rosterSlotId) => {
				const st = get();
				const slot = st.agencyRoster.find((s) => s.id === rosterSlotId);
				if (!slot) return;
				if (slot.status === "scheduled") return;
				if (slot.status !== "assignment-pending") return;
				const applicantId = slot.agencyAssignment?.shiftApplicantId;
				const outletRequested = slot.agencyAssignment?.requestedByOutlet;
				const app = applicantId
					? st.shiftApplicants.find((a) => a.id === applicantId)
					: undefined;
				const shift = app
					? st.shifts.find((s) => s.id === app.shiftId)
					: undefined;
				if (outletRequested && app && shift) {
					if (shift.prs.length >= shift.quantity) {
						get().toast("Shift is already full", "warn");
						return;
					}
					if (shift.prs.includes(app.prId)) {
						get().toast("You are already on this shift", "info");
						return;
					}
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const isTonight = slot.dateIso === DEFAULT_ROSTER_DATE_ISO;
				set((cur) => {
					let shiftApplicants = cur.shiftApplicants;
					let shifts = cur.shifts;
					if (outletRequested && app && shift) {
						shiftApplicants = cur.shiftApplicants.map((a) =>
							a.id === applicantId ? { ...a, status: "accepted" as const } : a,
						);
						shifts = cur.shifts.map((sh) =>
							sh.id === app.shiftId
								? {
										...sh,
										prs: [...sh.prs, app.prId],
										filled: sh.prs.length + 1,
									}
								: sh,
						);
					}
					return {
						shiftApplicants,
						shifts,
						agencyRoster: cur.agencyRoster.map((s) =>
							s.id === rosterSlotId
								? {
										...s,
										status: "scheduled" as const,
										agencyAssignment: s.agencyAssignment
											? { ...s.agencyAssignment, respondedAt: stamp }
											: { assignedAt: stamp, respondedAt: stamp },
									}
								: s,
						),
						...(slot.prId === TIED_DEMO_ROSTER_PR_ID && isTonight
							? patchPrSessionForRole(cur, "pr_tied", {
									shiftAccepted: true,
									pendingApproval: false,
									acceptedShiftIndex: shiftIndexForOutlet(slot.outlet),
									checkedIn: false,
									checkedOut: false,
								})
							: {}),
					};
				});
				get().toast(
					`${slot.outlet} shift accepted — check in when ready`,
					"success",
				);
				get().pushNotify({
					type: "shift_edit",
					prId: slot.prId,
					prName: slot.prName,
					outlet: slot.outlet,
					detail: `${slot.prName} accepted the shift`,
				});
			},
			confirmOutletRosterSlot: (rosterSlotId) => {
				const st = get();
				const slot = st.agencyRoster.find((s) => s.id === rosterSlotId);
				if (!slot || slot.status !== "outlet-pending") return;
				const prId = getPrRosterId(st.prSubRole);
				if (slot.prId !== prId) {
					get().toast("This shift is not assigned to you", "warn");
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const isTonight = slot.dateIso === DEFAULT_ROSTER_DATE_ISO;
				set((cur) => ({
					agencyRoster: cur.agencyRoster.map((s) =>
						s.id === rosterSlotId
							? {
									...s,
									status: "scheduled" as const,
									agencyAssignment: s.agencyAssignment
										? { ...s.agencyAssignment, respondedAt: stamp }
										: { assignedAt: stamp, respondedAt: stamp },
								}
							: s,
					),
					...(slot.prId === TIED_DEMO_ROSTER_PR_ID && isTonight
						? patchPrSessionForRole(cur, "pr_tied", {
								shiftAccepted: true,
								pendingApproval: false,
								acceptedShiftIndex: shiftIndexForOutlet(slot.outlet),
								checkedIn: false,
								checkedOut: false,
							})
						: {}),
				}));
				get().toast(
					`${slot.outlet} confirmed your shift — check in when ready`,
					"success",
				);
				get().pushNotify({
					type: "shift_assigned",
					prId: slot.prId,
					prName: slot.prName,
					outlet: slot.outlet,
				});
			},
			declineAgencyAssignmentByPr: (rosterSlotId) => {
				const st = get();
				const slot = st.agencyRoster.find((s) => s.id === rosterSlotId);
				if (!slot || slot.status !== "assignment-pending") return;
				const applicantId = slot.agencyAssignment?.shiftApplicantId;
				const outletRequested = slot.agencyAssignment?.requestedByOutlet;
				const app = applicantId
					? st.shiftApplicants.find((a) => a.id === applicantId)
					: undefined;
				set((cur) => {
					let shiftApplicants = cur.shiftApplicants;
					let shifts = cur.shifts;
					if (outletRequested && app) {
						shiftApplicants = cur.shiftApplicants.map((a) =>
							a.id === applicantId ? { ...a, status: "pending" as const } : a,
						);
						shifts = cur.shifts.map((sh) =>
							sh.id === app.shiftId
								? {
										...sh,
										prs: sh.prs.filter((id) => id !== app.prId),
										filled: Math.max(
											0,
											sh.filled - (sh.prs.includes(app.prId) ? 1 : 0),
										),
									}
								: sh,
						);
					}
					const withoutSlot = cur.agencyRoster.filter(
						(s) => s.id !== rosterSlotId,
					);
					return {
						shiftApplicants,
						shifts,
						agencyRoster: outletRequested
							? mergeOutletRequestRosterSlots(
									withoutSlot,
									shifts,
									shiftApplicants,
								)
							: withoutSlot,
					};
				});
				get().toast(`Declined shift at ${slot.outlet}`, "info");
				if (outletRequested) {
					get().pushNotify({
						type: "shift_edit",
						prId: slot.prId,
						prName: slot.prName,
						outlet: slot.outlet,
						detail: `${slot.prName} declined the outlet shift offer`,
					});
				}
			},
			togglePrDayAvailability: (dateIso) => {
				const st = get();
				const prId = getPrRosterId(st.prSubRole);
				const profile = getPrProfile(st.prSubRole);
				if (!prId) return;

				const daySlots = st.agencyRoster.filter(
					(s) => s.prId === prId && s.dateIso === dateIso,
				);
				const dateLabel = fmtDateLabelFromIso(dateIso);
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});

				if (prDayIsUnavailable(daySlots)) {
					const unavailableSlot = daySlots.find(
						(s) => s.status === "unavailable",
					);
					if (!unavailableSlot) return;
					const syncNotes = buildAvailabilityOpsNotifications({
						prName: profile.name,
						dateLabel,
						available: true,
						at: stamp,
					});
					set((cur) => ({
						agencyRoster: cur.agencyRoster.filter(
							(s) => s.id !== unavailableSlot.id,
						),
						opsNotifications: [...syncNotes, ...cur.opsNotifications],
					}));
					get().pushNotify({
						type: "shift_edit",
						prId,
						prName: profile.name,
						outlet: "—",
						detail: `${dateLabel} open again on PR schedule`,
					});
					get().toast(
						`${dateLabel} open again — Atlas & outlets synced`,
						"success",
					);
					return;
				}

				if (!canTogglePrDayAvailability(daySlots)) {
					get().toast("Cancel booked shifts on this day first", "warn");
					return;
				}

				const unavailableSlot: AgencyRosterSlot = {
					id: `rs-unavail-${prId}-${dateIso}`,
					prId,
					prName: profile.name,
					outlet: "—",
					date: dateLabel,
					dateIso,
					shift: "—",
					shiftStart: "00:00",
					shiftEnd: "00:00",
					status: "unavailable",
					prUnavailableNote: "PR marked day off on schedule",
					cancelledAt: stamp,
				};
				const syncNotes = buildAvailabilityOpsNotifications({
					prName: profile.name,
					dateLabel,
					available: false,
					at: stamp,
				});
				set((cur) => ({
					agencyRoster: [
						...cur.agencyRoster.filter(
							(s) =>
								!(
									s.prId === prId &&
									s.dateIso === dateIso &&
									s.status === "assignment-pending"
								),
						),
						unavailableSlot,
					],
					opsNotifications: [...syncNotes, ...cur.opsNotifications],
				}));
				get().pushNotify({
					type: "shift_edit",
					prId,
					prName: profile.name,
					outlet: "—",
					detail: `${dateLabel} marked unavailable on PR schedule`,
				});
				get().toast(
					`${dateLabel} blocked — synced to Atlas & outlets`,
					"success",
				);
			},
			setPrDayUnavailable: (dateIso, note) => {
				const st = get();
				const prId = getPrRosterId(st.prSubRole);
				if (!prId) return;
				const daySlots = st.agencyRoster.filter(
					(s) => s.prId === prId && s.dateIso === dateIso,
				);
				if (prDayIsUnavailable(daySlots)) return;
				if (!canTogglePrDayAvailability(daySlots)) {
					get().toast(
						"Cancel the shift first — then mark the day unavailable",
						"warn",
					);
					return;
				}
				get().togglePrDayAvailability(dateIso);
				if (note) {
					set((cur) => ({
						agencyRoster: cur.agencyRoster.map((s) =>
							s.prId === prId &&
							s.dateIso === dateIso &&
							s.status === "unavailable"
								? { ...s, prUnavailableNote: note }
								: s,
						),
					}));
				}
			},
			clearPrDayUnavailable: (dateIso) => {
				const st = get();
				const prId = getPrRosterId(st.prSubRole);
				if (!prId) return;
				const daySlots = st.agencyRoster.filter(
					(s) => s.prId === prId && s.dateIso === dateIso,
				);
				if (!prDayIsUnavailable(daySlots)) return;
				get().togglePrDayAvailability(dateIso);
			},
			cancelPrRosterShift: (rosterSlotId) => {
				const st = get();
				const prId = getPrRosterId(st.prSubRole);
				const slot = st.agencyRoster.find((s) => s.id === rosterSlotId);
				if (!slot || slot.prId !== prId) return;
				if (["on-duty", "en-route"].includes(slot.status)) {
					get().toast("Check out first — cannot cancel while on duty", "warn");
					return;
				}
				const evalResult = evaluateShiftCancellation(
					new Date(),
					slot.dateIso,
					slot.shiftStart,
					slot.estPayout
						? Math.min(slot.estPayout, CANCEL_RULES.defaultDailyWagesRm)
						: CANCEL_RULES.defaultDailyWagesRm,
				);
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((cur) => {
					const applicantId = slot.agencyAssignment?.shiftApplicantId;
					const app = applicantId
						? cur.shiftApplicants.find((a) => a.id === applicantId)
						: undefined;
					let shiftApplicants = cur.shiftApplicants;
					const shifts = removePrFromOutletShifts(
						cur.shifts,
						slot.outlet,
						slot.prId,
					);
					if (app?.status === "accepted") {
						shiftApplicants = cur.shiftApplicants.map((a) =>
							a.id === applicantId ? { ...a, status: "pending" as const } : a,
						);
					}
					return {
						agencyRoster: cur.agencyRoster.map((s) =>
							s.id === rosterSlotId
								? {
										...s,
										status: "unavailable" as const,
										payDeductionRm: evalResult.deductionRm,
										cancelledAt: stamp,
										prUnavailableNote: "Shift cancelled by PR",
									}
								: s,
						),
						shiftApplicants,
						shifts,
						prUpcomingShifts: cur.prUpcomingShifts.filter((u) => {
							const key = `${u.date[0]}-${String(u.date[1]).padStart(2, "0")}-${String(u.date[2]).padStart(2, "0")}`;
							return !(key === slot.dateIso && u.outlet === slot.outlet);
						}),
						...(slot.dateIso === DEFAULT_ROSTER_DATE_ISO &&
						slot.prId === getPrRosterId(cur.prSubRole)
							? {
									shiftAccepted: false,
									pendingApproval: false,
									acceptedShiftIndex: null,
									checkedIn: false,
									checkedOut: false,
								}
							: {}),
					};
				});
				const penalty =
					evalResult.deductionRm > 0
						? ` · −RM ${evalResult.deductionRm} on next PV`
						: " · no deduction";
				get().toast(
					`Shift cancelled at ${slot.outlet}${penalty}`,
					evalResult.tier === "safe" ? "info" : "warn",
				);
				get().pushNotify({
					type: "shift_edit",
					prId: slot.prId,
					prName: slot.prName,
					outlet: slot.outlet,
					detail: `PR cancelled shift${evalResult.deductionRm > 0 ? ` · −RM ${evalResult.deductionRm}` : ""}`,
				});
			},
			declineOutletSwapByPr: (rosterSlotId) => {
				const slot = get().agencyRoster.find((s) => s.id === rosterSlotId);
				if (!slot?.outletSwap) return;
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => ({
					agencyRoster: st.agencyRoster.map((s) =>
						s.id === rosterSlotId
							? {
									...s,
									status: "scheduled" as const,
									outletSwap: {
										...s.outletSwap!,
										status: "declined" as const,
										respondedAt: stamp,
									},
								}
							: s,
					),
				}));
				get().toast("Declined agency outlet swap", "warn");
			},
			approvePrSwapRequest: (swapId, replacementPrId) => {
				const st = get();
				const swap = st.prSwapRequests.find((s) => s.id === swapId);
				if (!swap || swap.status !== "pending_agency") return;
				const replacement = st.agencyPRs.find((p) => p.id === replacementPrId);
				if (!replacement || replacement.suspended || replacement.detached) {
					get().toast("Pick an active PR for replacement", "warn");
					return;
				}
				if (replacementPrId === swap.requestingPrId) {
					get().toast("Replacement must be a different PR", "warn");
					return;
				}
				const slot = st.agencyRoster.find((s) => s.id === swap.rosterSlotId);
				if (!slot) {
					get().toast("Roster slot no longer exists", "warn");
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((cur) => ({
					prSwapRequests: cur.prSwapRequests.map((s) =>
						s.id === swapId
							? {
									...s,
									status: "pending_replacement" as const,
									replacementPrId,
									replacementPrName: replacement.name,
									replacementOfferedAt: stamp,
									replacementDeclineReason: undefined,
									replacementDeclinedAt: undefined,
								}
							: s,
					),
					...(swap.requestingPrId === TIED_DEMO_ROSTER_PR_ID
						? patchPrSessionForRole(cur, "pr_tied", clearPrShiftSession())
						: {}),
				}));
				get().toast(
					`Offer sent to ${replacement.name} — awaiting their response`,
					"success",
				);
				get().pushNotify({
					type: "swap_update",
					prId: replacementPrId,
					prName: replacement.name,
					outlet: swap.outlet,
					status: "offer",
					requestingPrName: swap.requestingPrName,
					notifyAgency: true,
					notifyPr: true,
				});
			},
			acceptSwapReplacement: (swapId) => {
				const st = get();
				const swap = st.prSwapRequests.find((s) => s.id === swapId);
				if (
					!swap ||
					swap.status !== "pending_replacement" ||
					!swap.replacementPrId
				)
					return;
				const prId = getPrRosterId(st.prSubRole);
				if (swap.replacementPrId !== prId) {
					get().toast("This swap offer is not assigned to you", "warn");
					return;
				}
				const replacement = st.agencyPRs.find(
					(p) => p.id === swap.replacementPrId,
				);
				if (!replacement) return;
				const slot = st.agencyRoster.find((s) => s.id === swap.rosterSlotId);
				if (!slot) {
					get().toast("Roster slot no longer exists", "warn");
					return;
				}
				const targetSlot = swap.targetRosterSlotId
					? st.agencyRoster.find((s) => s.id === swap.targetRosterSlotId)
					: undefined;
				const targetOutlet = swap.targetOutlet ?? targetSlot?.outlet;
				const targetDateIso = swap.targetDateIso ?? targetSlot?.dateIso;
				const targetShift = swap.targetShift ?? targetSlot?.shift;
				if (!targetOutlet || !targetDateIso || !targetShift) {
					get().toast(
						"Swap target shift is missing — request a new swap",
						"warn",
					);
					return;
				}
				const sourceIdx = shiftIndexForOutlet(swap.outlet);
				const requestingPr = st.agencyPRs.find(
					(p) => p.id === swap.requestingPrId,
				);
				const swapStamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const outletPendingMeta = {
					agencyName: "Atlas Agency",
					agencyNote: `Swap from ${swap.outlet} — outlet must confirm before check-in`,
					assignedAt: swapStamp,
					assignedAtMs: Date.now(),
				};
				set((cur) => {
					const replacementSession = patchPrSessionForRole(cur, "pr_tied", {
						shiftAccepted: true,
						pendingApproval: false,
						acceptedShiftIndex: sourceIdx,
						checkedIn: false,
						checkedOut: false,
					});
					const requestingRole = "pr_tied";
					const requestingSession = patchPrSessionForRole(
						{ ...cur, ...replacementSession },
						requestingRole,
						clearPrShiftSession(),
					);
					let agencyRoster = cur.agencyRoster.map((s) =>
						s.id === swap.rosterSlotId
							? {
									...s,
									prId: swap.replacementPrId!,
									prName: replacement.name,
									status:
										s.status === "on-duty" || s.status === "en-route"
											? ("scheduled" as const)
											: s.status,
									checkedInAt: undefined,
									floorDrinks: 0,
									floorTips: 0,
								}
							: s,
					);
					if (swap.targetRosterSlotId) {
						agencyRoster = agencyRoster.map((s) =>
							s.id === swap.targetRosterSlotId
								? {
										...s,
										prId: swap.requestingPrId,
										prName: swap.requestingPrName,
										status: "outlet-pending" as const,
										agencyAssignment: outletPendingMeta,
									}
								: s,
						);
					} else {
						agencyRoster = ensureRosterSlot(
							agencyRoster,
							{
								prId: swap.requestingPrId,
								prName: requestingPr?.name ?? swap.requestingPrName,
								outlet: targetOutlet,
								dateIso: targetDateIso,
								shift: targetShift,
							},
							"outlet-pending",
							{ agencyAssignment: outletPendingMeta },
						);
					}
					const shiftsAfterSource = cur.shifts.map((sh) => {
						if (
							shiftDateIso(sh.date) !== swap.dateIso ||
							!outletMatches(sh.outletName, swap.outlet)
						) {
							return sh;
						}
						if (!sh.prs.includes(swap.requestingPrId)) return sh;
						return {
							...sh,
							prs: sh.prs.map((id) =>
								id === swap.requestingPrId ? swap.replacementPrId! : id,
							),
						};
					});
					return {
						...replacementSession,
						...requestingSession,
						prSwapRequests: cur.prSwapRequests.map((s) => {
							if (s.id === swapId) return { ...s, status: "approved" as const };
							if (
								s.rosterSlotId === swap.rosterSlotId &&
								s.requestingPrId === swap.requestingPrId &&
								s.id !== swapId &&
								(s.status === "pending_agency" ||
									s.status === "pending_replacement")
							) {
								return { ...s, status: "declined" as const };
							}
							return s;
						}),
						agencyRoster,
						shifts: addPrToOutletShift(
							shiftsAfterSource,
							targetOutlet,
							swap.requestingPrId,
						),
					};
				});
				get().toast(
					`Swap approved — ${targetOutlet} awaiting outlet confirmation. ${replacement.name} covers ${swap.outlet}.`,
					"success",
				);
				get().pushNotify({
					type: "swap_update",
					prId: swap.requestingPrId,
					prName: swap.requestingPrName,
					outlet: targetOutlet,
					status: "approved",
					notifyAgency: true,
				});
				get().pushNotify({
					type: "shift_assigned",
					prId: swap.replacementPrId,
					prName: replacement.name,
					outlet: swap.outlet,
				});
				get().pushNotify({
					type: "shift_assigned",
					prId: swap.requestingPrId,
					prName: swap.requestingPrName,
					outlet: targetOutlet,
				});
			},
			rejectSwapReplacement: (swapId, reason) => {
				const trimmed = reason.trim();
				if (!trimmed) {
					get().toast("Please give a reason for declining", "warn");
					return;
				}
				const st = get();
				const swap = st.prSwapRequests.find((s) => s.id === swapId);
				if (
					!swap ||
					swap.status !== "pending_replacement" ||
					!swap.replacementPrId
				)
					return;
				const prId = getPrRosterId(st.prSubRole);
				if (swap.replacementPrId !== prId) {
					get().toast("This swap offer is not assigned to you", "warn");
					return;
				}
				const replacement = st.agencyPRs.find(
					(p) => p.id === swap.replacementPrId,
				);
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				set((cur) => ({
					prSwapRequests: cur.prSwapRequests.map((s) =>
						s.id === swapId
							? {
									...s,
									status: "pending_agency" as const,
									replacementPrId: undefined,
									replacementPrName: undefined,
									replacementOfferedAt: undefined,
									replacementDeclineReason: trimmed,
									replacementDeclinedAt: stamp,
								}
							: s,
					),
					...(swap.requestingPrId === TIED_DEMO_ROSTER_PR_ID
						? patchPrSessionForRole(
								cur,
								"pr_tied",
								defaultPrShiftSessionForRole("pr_tied", {
									agencyRoster: cur.agencyRoster,
									prSwapRequests: cur.prSwapRequests,
								}),
							)
						: {}),
				}));
				get().toast("Declined — agency will find another replacement", "info");
				get().pushNotify({
					type: "swap_update",
					prId: swap.replacementPrId,
					prName: replacement?.name ?? "PR",
					outlet: swap.outlet,
					status: "replacement_declined",
					requestingPrName: swap.requestingPrName,
					reason: trimmed,
					notifyPr: false,
					notifyAgency: true,
				});
			},
			declinePrSwapRequest: (swapId) => {
				const swap = get().prSwapRequests.find((s) => s.id === swapId);
				set((st) => ({
					prSwapRequests: st.prSwapRequests.map((s) =>
						s.id === swapId ? { ...s, status: "declined" as const } : s,
					),
				}));
				if (swap) {
					get().pushNotify({
						type: "swap_update",
						prId: swap.requestingPrId,
						prName: swap.requestingPrName,
						outlet: swap.outlet,
						status: "declined",
					});
				}
				get().toast("Swap request declined", "info");
			},
			demoAutoAssignPr: (dateIso) => {
				const st = get();
				const openShifts =
					buildPlanningWeekOutletShiftMap({
						weekDays: [dateIso],
						shifts: st.shifts,
						roster: st.agencyRoster,
						tiedOffers: PR_AGENCY_TIED_OFFERS,
						todayIso: DEFAULT_ROSTER_DATE_ISO,
						commissionRules: st.outletCommissionRules,
						outletWorkspace: st.outletWorkspace,
					})[dateIso] ?? [];
				const outletShift = openShifts.find((s) => s.openSlots > 0);
				if (!outletShift) {
					get().toast("No open outlet shifts on this date", "warn");
					return;
				}
				const free = getFreePrsWithDistances(
					st.agencyPRs.filter((p) => !p.suspended && !p.detached),
					st.agencyRoster,
					dateIso,
				);
				const pick = free[0];
				if (!pick) {
					get().toast("No free PRs to auto-assign", "warn");
					return;
				}
				const [y, m, d] = dateIso.split("-").map(Number);
				const dateLabel = new Date(y, m - 1, d).toLocaleDateString("en-MY", {
					weekday: "short",
					day: "numeric",
					month: "short",
					year: "numeric",
				});
				const { shiftStart, shiftEnd } = parseShiftWindow(outletShift.shift);
				get().assignPrToOutlet({
					prId: pick.pr.id,
					outlet: outletShift.outlet,
					dateIso,
					dateLabel,
					shiftStart,
					shiftEnd,
					shift: outletShift.shift,
					outletShiftId: outletShift.id,
					event: outletShift.event,
					payEstimate: outletShift.payEstimate,
				});
				get().toast(
					`AI auto-assign · ${pick.pr.name} → ${outletShift.outlet}`,
					"success",
				);
			},
			flagRosterAttendance: (slotId, flag) => {
				const slot = get().agencyRoster.find((s) => s.id === slotId);
				if (!slot) return;
				const togglingOff =
					(flag === "late" && slot.lateFlag) ||
					(flag === "no-show" && slot.noShowFlag);
				set((st) => ({
					agencyRoster: st.agencyRoster.map((s) =>
						s.id === slotId
							? {
									...s,
									lateFlag: flag === "late" ? !s.lateFlag : s.lateFlag,
									noShowFlag: flag === "no-show" ? !s.noShowFlag : s.noShowFlag,
								}
							: s,
					),
				}));
				if (togglingOff) {
					get().toast(
						flag === "late" ? "Late flag removed" : "No-show flag removed",
						"info",
					);
				} else {
					get().toast(
						flag === "late" ? "Late flag (+15 min)" : "No-show flag (+30 min)",
						"warn",
					);
				}
			},
			adjustAgencyReconciliation: ({ drinks, tips, reason }) => {
				const trimmed = reason.trim();
				if (!trimmed) {
					get().toast("Adjustment reason required", "warn");
					return;
				}
				set((st) => {
					const adj =
						(st.agencyReconciliation.agencyAdjustDrinks ?? 0) + (drinks ?? 0);
					const adjTips =
						(st.agencyReconciliation.agencyAdjustTips ?? 0) + (tips ?? 0);
					const varianceDelta = (drinks ?? 0) * 15 + (tips ?? 0);
					return {
						agencyReconciliation: {
							...st.agencyReconciliation,
							agencyAdjustDrinks: adj,
							agencyAdjustTips: adjTips,
							agencyAdjustReason: trimmed,
							pvTotal: st.agencyReconciliation.pvTotal + varianceDelta,
							variance:
								st.agencyReconciliation.outletSalesTotal -
								(st.agencyReconciliation.pvTotal + varianceDelta),
							agencyConfirmed: false,
						},
					};
				});
				get().toast("Reconciliation adjusted — re-confirm required", "info");
			},

			agencyPRs: initialSnapshot.agencyPRs,
			specialServiceOrders: SEED_SPECIAL_SERVICES.map((r) => ({ ...r })),
			outletCommissionRules: [...OUTLET_COMMISSION_RULES],
			scalingTierMultipliers: { ...SCALING_TIER_MULTIPLIERS },
			suspendAgencyPr: (prId) => {
				const pr = get().agencyPRs.find((p) => p.id === prId);
				if (!pr) return;
				set((st) => ({
					agencyPRs: st.agencyPRs.map((p) =>
						p.id === prId ? { ...p, suspended: true } : p,
					),
				}));
				get().toast(`${pr.name} suspended — shifts paused`, "warn");
			},
			detachAgencyPr: (prId) => {
				const pr = get().agencyPRs.find((p) => p.id === prId);
				if (!pr) return;
				const tiedSince = pr.tiedSince
					? new Date(pr.tiedSince).getTime()
					: Date.now() - 400 * 86400000;
				if (Date.now() - tiedSince < 365 * 86400000) {
					get().toast("Tied < 1 year — use Request admin detach", "warn");
					return;
				}
				set((st) => {
					const nextAgencyPRs = st.agencyPRs.map((p) =>
						p.id === prId ? { ...p, detached: true, suspended: true } : p,
					);
					return {
						agencyPRs: nextAgencyPRs,
					};
				});
				get().toast(`${pr.name} detached from agency roster`, "info");
			},
			requestAgencyPrDetach: (prId) => {
				const pr = get().agencyPRs.find((p) => p.id === prId);
				if (!pr) return;
				get().toast(
					`Detach request sent for ${pr.name} — InnocenZ admin will review`,
					"info",
				);
			},
			setAgencyPrKpiTier: (prId, tier) => {
				set((st) => ({
					agencyPRs: st.agencyPRs.map((p) =>
						p.id === prId ? { ...p, kpiTier: tier } : p,
					),
				}));
				get().toast(`KPI tier set to ${tier}`, "success");
			},
			setAgencyPrTrainingTier: (prId, tier) => {
				set((st) => ({
					agencyPRs: st.agencyPRs.map((p) =>
						p.id === prId ? { ...p, trainingLevel: tier } : p,
					),
				}));
				get().toast(`Training tier set to ${tier}`, "success");
			},
			updateAgencyPrProfile: (prId, patch) => {
				const pr = get().agencyPRs.find((p) => p.id === prId);
				if (!pr) return;
				const myPrId = getPrRosterId(get().prSubRole);
				const syncPortal =
					prId === myPrId
						? {
								...(patch.name?.trim()
									? { prDisplayName: patch.name.trim() }
									: {}),
								...(patch.email?.trim() ? { prEmail: patch.email.trim() } : {}),
							}
						: {};
				// Pay-class flips are recorded to an audit trail effective from the current
				// roster date, so past shifts keep paying the class in force when they ran.
				const payClassPatch =
					patch.payClass != null && patch.payClass !== prPayClass(pr)
						? applyPayClassChange(pr, patch.payClass, DEFAULT_ROSTER_DATE_ISO)
						: {};
				set((st) => ({
					...syncPortal,
					agencyPRs: st.agencyPRs.map((p) =>
						p.id === prId ? { ...p, ...patch, ...payClassPatch } : p,
					),
					agencyRoster:
						patch.name && patch.name !== pr.name
							? st.agencyRoster.map((slot) =>
									slot.prId === prId ? { ...slot, prName: patch.name! } : slot,
								)
							: st.agencyRoster,
				}));
				get().toast(`${patch.name ?? pr.name} profile updated`, "success");
			},

			submitSpecialServiceOrder: (input) => {
				const st = get();
				const id = `SS-2026-${String(st.specialServiceOrders.length + 18).padStart(3, "0")}`;
				const order = buildSpecialServiceOrder(input, id);
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				set({ specialServiceOrders: [order, ...st.specialServiceOrders] });

				if (input.initiatedBy === "agency" || input.initiatedBy === "outlet") {
					if (input.initiatedBy === "agency") {
						get().pushNotify({
							type: "special_service_requested",
							orderId: id,
							serviceLabel,
							initiatedBy: "agency",
							prId: order.prId,
							prName: order.prName,
							outlet: order.outlet,
							notifyAgency: true,
						});
					}
					get().toast(
						`${serviceLabel} submitted — InnocenZ admin will review`,
						"info",
					);
				} else {
					get().pushNotify({
						type: "special_service_requested",
						orderId: id,
						serviceLabel,
						initiatedBy: input.initiatedBy,
						prId: order.prId,
						prName: order.prName,
						outlet: order.outlet,
						notifyAgency: true,
					});
					get().toast(`${serviceLabel} submitted — agency will review`, "info");
				}
				return id;
			},

			approveSpecialServiceByAgency: (orderId) => {
				const st = get();
				const current = st.specialServiceOrders.find((r) => r.id === orderId);
				if (!current || current.agencyAccepted !== "pending") return;
				const order = approveSpecialServiceByAgency(current);
				set({
					specialServiceOrders: st.specialServiceOrders.map((r) =>
						r.id === orderId ? order : r,
					),
				});
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				const isConfirmed = order.status === "confirmed";

				if (order.prAcceptance === "pending") {
					get().pushNotify({
						type: "special_service_requested",
						orderId,
						serviceLabel,
						initiatedBy: order.initiatedBy,
						prId: order.prId,
						prName: order.prName,
						outlet: order.outlet,
						notifyPr: true,
					});
				}

				if (isConfirmed) {
					get().pushNotify({
						type: "special_service_update",
						orderId,
						serviceLabel,
						status: "confirmed",
						prId: order.prId,
						prName: order.prName,
						outlet: order.outlet,
						by: "agency",
						notifyPr: order.initiatedBy === "pr",
						notifyOutlet: order.initiatedBy === "outlet",
					});
				}

				get().toast(
					order.prAcceptance === "pending"
						? `${serviceLabel} approved — awaiting PR`
						: isConfirmed
							? `${serviceLabel} confirmed`
							: `${serviceLabel} approved — awaiting acceptance`,
					"success",
				);
			},

			declineSpecialServiceByAgency: (orderId, reason) => {
				const st = get();
				const current = st.specialServiceOrders.find((r) => r.id === orderId);
				if (!current || current.agencyAccepted !== "pending") return;
				const order = declineSpecialServiceByAgency(current, reason);
				set({
					specialServiceOrders: st.specialServiceOrders.map((r) =>
						r.id === orderId ? order : r,
					),
				});
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				get().pushNotify({
					type: "special_service_update",
					orderId,
					serviceLabel,
					status: "declined",
					prId: order.prId,
					prName: order.prName,
					outlet: order.outlet,
					by: "agency",
					notifyPr: order.initiatedBy === "pr",
					notifyOutlet: order.initiatedBy === "outlet",
				});
				get().toast("Job posting request declined", "warn");
			},

			approveSpecialServiceByAdmin: (orderId) => {
				const st = get();
				const current = st.specialServiceOrders.find((r) => r.id === orderId);
				if (!current || current.adminAccepted !== "pending") return;
				const order = approveSpecialServiceByAdmin(current);
				set({
					specialServiceOrders: st.specialServiceOrders.map((r) =>
						r.id === orderId ? order : r,
					),
				});
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				get().pushNotify({
					type: "special_service_update",
					orderId,
					serviceLabel,
					status: "accepted",
					prId: order.prId,
					prName: order.prName,
					outlet: order.outlet,
					by: "admin",
					notifyAgency: order.initiatedBy === "agency",
					notifyOutlet: order.initiatedBy === "outlet",
				});
				get().toast(`${serviceLabel} accepted`, "success");
			},

			declineSpecialServiceByAdmin: (orderId, reason) => {
				const st = get();
				const current = st.specialServiceOrders.find((r) => r.id === orderId);
				if (!current || current.adminAccepted !== "pending") return;
				const order = declineSpecialServiceByAdmin(current, reason);
				set({
					specialServiceOrders: st.specialServiceOrders.map((r) =>
						r.id === orderId ? order : r,
					),
				});
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				get().pushNotify({
					type: "special_service_update",
					orderId,
					serviceLabel,
					status: "declined",
					prId: order.prId,
					prName: order.prName,
					outlet: order.outlet,
					by: "admin",
					notifyAgency: order.initiatedBy === "agency",
					notifyOutlet: order.initiatedBy === "outlet",
				});
				get().toast(`${serviceLabel} rejected`, "warn");
			},

			acceptSpecialServiceByPr: (orderId) => {
				const st = get();
				const current = st.specialServiceOrders.find((r) => r.id === orderId);
				if (!current || current.prAcceptance !== "pending") return;
				const order = acceptSpecialServiceByPr(current);
				set({
					specialServiceOrders: st.specialServiceOrders.map((r) =>
						r.id === orderId ? order : r,
					),
				});
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				get().pushNotify({
					type: "special_service_update",
					orderId,
					serviceLabel,
					status: order.status === "confirmed" ? "confirmed" : "accepted",
					prId: order.prId,
					prName: order.prName,
					outlet: order.outlet,
					by: "pr",
					notifyAgency: true,
					notifyOutlet:
						order.initiatedBy === "outlet" || order.initiatedBy === "agency",
				});
				get().toast(
					order.status === "confirmed"
						? `${serviceLabel} confirmed`
						: "Accepted — awaiting outlet",
					"success",
				);
			},

			declineSpecialServiceByPr: (orderId, reason) => {
				const st = get();
				const current = st.specialServiceOrders.find((r) => r.id === orderId);
				if (!current || current.prAcceptance !== "pending") return;
				const order = declineSpecialServiceByPr(current, reason);
				set({
					specialServiceOrders: st.specialServiceOrders.map((r) =>
						r.id === orderId ? order : r,
					),
				});
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				get().pushNotify({
					type: "special_service_update",
					orderId,
					serviceLabel,
					status: "declined",
					prId: order.prId,
					prName: order.prName,
					outlet: order.outlet,
					by: "pr",
					notifyAgency: true,
					notifyOutlet:
						order.initiatedBy === "outlet" || order.initiatedBy === "agency",
				});
				get().toast("Service declined", "warn");
			},

			acceptSpecialServiceByOutlet: (orderId) => {
				const st = get();
				const current = st.specialServiceOrders.find((r) => r.id === orderId);
				if (!current || current.outletAcceptance !== "pending") return;
				const order = acceptSpecialServiceByOutlet(current);
				set({
					specialServiceOrders: st.specialServiceOrders.map((r) =>
						r.id === orderId ? order : r,
					),
				});
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				get().pushNotify({
					type: "special_service_update",
					orderId,
					serviceLabel,
					status: order.status === "confirmed" ? "confirmed" : "accepted",
					prId: order.prId,
					prName: order.prName,
					outlet: order.outlet,
					by: "outlet",
					notifyAgency: true,
					notifyPr: order.prAcceptance === "pending",
				});
				get().toast(
					order.status === "confirmed"
						? `${serviceLabel} confirmed`
						: "Accepted — awaiting PR",
					"success",
				);
			},

			declineSpecialServiceByOutlet: (orderId, reason) => {
				const st = get();
				const current = st.specialServiceOrders.find((r) => r.id === orderId);
				if (!current || current.outletAcceptance !== "pending") return;
				const order = declineSpecialServiceByOutlet(current, reason);
				set({
					specialServiceOrders: st.specialServiceOrders.map((r) =>
						r.id === orderId ? order : r,
					),
				});
				const serviceLabel = specialServiceTypeLabel(
					order.serviceType,
					order.customServiceName,
				);
				get().pushNotify({
					type: "special_service_update",
					orderId,
					serviceLabel,
					status: "declined",
					prId: order.prId,
					prName: order.prName,
					outlet: order.outlet,
					by: "outlet",
					notifyAgency: true,
					notifyPr: order.initiatedBy === "agency",
				});
				get().toast("Service declined", "warn");
			},

			saveOutletCommissionRule: (outlet, patch) => {
				set((st) => {
					const nextRules = st.outletCommissionRules.map((r) =>
						r.outlet === outlet ? { ...r, ...patch } : r,
					);
					return {
						outletCommissionRules: nextRules,
						outletWorkspace: syncWorkspaceFromCommissionRules(
							st.outletWorkspace,
							nextRules,
						),
					};
				});
				get().toast(
					`Commission rules updated for ${outlet} · outlet workspace synced`,
					"success",
				);
			},
			saveScalingMultipliers: (multipliers) => {
				set({ scalingTierMultipliers: multipliers });
				get().toast("Scaling tier multipliers saved", "success");
			},
			inviteFinanceHead: (email) => {
				if (!email.trim()) return;
				set((st) => ({
					agencyFinanceHead: {
						...st.agencyFinanceHead,
						email: email.trim(),
						eSignatureStored: false,
					},
				}));
				get().toast(
					`Invite sent to ${email} — Finance Head must complete IC + e-signature`,
					"info",
				);
			},
			shiftHistory: initialSnapshot.shiftHistory,

			prs: initialSnapshot.prs,
			shifts: initialSnapshot.shifts,
			outletPnl: initialSnapshot.outletPnl,
			outletPnlSyncAt: initialSnapshot.outletPnlSyncAt,
			outletMoneyEditCount: initialSnapshot.outletMoneyEditCount,
			updateOutletShiftMoney: (shiftId, patch) => {
				const st = get();
				const menu = st.outletWorkspace.drinkMenu ?? DEFAULT_OUTLET_DRINK_MENU;
				const nextShifts = st.shifts.map((sh) => {
					if (sh.id !== shiftId) return sh;
					const merged = withShiftFinancialDefaults({ ...sh, ...patch }, menu);
					return merged;
				});
				const sync = applyOutletFinancialSync(
					nextShifts,
					st.outletMoneyEditCount + 1,
					Date.now(),
					st.agencyRoster,
					st.agencyReconciliation,
					menu,
					st.outletCommissionRules,
				);
				set(sync);
				get().toast(
					"Synced to Atlas Agency · PNL & PR commission updated",
					"success",
				);
			},
			adjustOutletShiftUnits: (shiftId, delta) => {
				const st = get();
				const menu = st.outletWorkspace.drinkMenu ?? DEFAULT_OUTLET_DRINK_MENU;
				const shift = st.shifts.find((sh) => sh.id === shiftId);
				const nextShifts = st.shifts.map((sh) => {
					if (sh.id !== shiftId) return sh;
					const drinkUnits = Math.max(0, (sh.drinkUnits ?? 0) + delta);
					const merged = withShiftFinancialDefaults(
						{ ...sh, drinkUnits },
						menu,
					);
					return merged;
				});
				const nextRoster =
					shift && delta > 0
						? st.agencyRoster.map((slot) => {
								if (
									slot.status !== "on-duty" ||
									!outletMatches(slot.outlet, shift.outletName)
								) {
									return slot;
								}
								return {
									...slot,
									floorDrinks: (slot.floorDrinks ?? 0) + delta,
								};
							})
						: st.agencyRoster;
				const sync = applyOutletFinancialSync(
					nextShifts,
					st.outletMoneyEditCount + 1,
					Date.now(),
					nextRoster,
					st.agencyReconciliation,
					menu,
					st.outletCommissionRules,
				);
				set({ ...sync, agencyRoster: nextRoster });
				get().toast("Live sales updated · agency payroll view synced", "info");
			},
			adjustOutletDrinkSale: (shiftId, drinkId, delta) => {
				const st = get();
				const wsMenu =
					st.outletWorkspace.drinkMenu ?? DEFAULT_OUTLET_DRINK_MENU;
				const shift = st.shifts.find((sh) => sh.id === shiftId);
				if (!shift) return;
				const menu = effectiveShiftDrinkMenu(shift, wsMenu);
				const drink = menu.find((d) => d.id === drinkId);
				if (!drink) return;
				const nextShifts = st.shifts.map((sh) => {
					if (sh.id !== shiftId) return sh;
					const hadPerDrinkCounts = Boolean(
						sh.drinkUnitCounts && Object.keys(sh.drinkUnitCounts).length > 0,
					);
					const counts = { ...(sh.drinkUnitCounts ?? {}) };
					const nextQty = Math.max(0, (counts[drinkId] ?? 0) + delta);
					if (nextQty === 0) delete counts[drinkId];
					else counts[drinkId] = nextQty;
					let legacyDrinkSalesRm = sh.legacyDrinkSalesRm;
					if (!hadPerDrinkCounts && delta > 0) {
						legacyDrinkSalesRm = computeDrinkSales(
							{ drinkUnits: sh.drinkUnits, perDrinkRm: sh.perDrinkRm },
							[],
						);
					}
					const drinkUnits = Object.values(counts).reduce(
						(sum, qty) => sum + qty,
						0,
					);
					const merged = withShiftFinancialDefaults(
						{ ...sh, drinkUnitCounts: counts, drinkUnits, legacyDrinkSalesRm },
						menu,
					);
					return merged;
				});
				const nextRoster =
					shift && delta > 0
						? st.agencyRoster.map((slot) => {
								if (
									slot.status !== "on-duty" ||
									!outletMatches(slot.outlet, shift.outletName)
								) {
									return slot;
								}
								return {
									...slot,
									floorDrinks: (slot.floorDrinks ?? 0) + delta,
								};
							})
						: st.agencyRoster;
				const sync = applyOutletFinancialSync(
					nextShifts,
					st.outletMoneyEditCount + 1,
					Date.now(),
					nextRoster,
					st.agencyReconciliation,
					menu,
					st.outletCommissionRules,
				);
				set({ ...sync, agencyRoster: nextRoster });
				const label = delta > 0 ? `+1 ${drink.name}` : `-1 ${drink.name}`;
				get().toast(`${label} · RM ${drink.priceRm}`, "info");
			},
			bookings: initialSnapshot.bookings,
			pvs: initialSnapshot.pvs,
			walletBalance: initialSnapshot.walletBalance,
			ratings: initialSnapshot.ratings,
			outletWorkspace: initialSnapshot.outletWorkspace,
			agencyPenaltyRules: initialSnapshot.agencyPenaltyRules,
			outletSettings: initialSnapshot.outletSettings,
			outletOwner: initialSnapshot.outletOwner,
			outletSubscriptionBilling: syncOutletSubscriptionBilling(
				OUTLET_SUBSCRIPTION_BILLING.map((inv) => ({ ...inv })),
				initialSnapshot.outletOwner.subscriptionPlanId,
			),
			outletFinanceHead: initialSnapshot.outletFinanceHead,
			outletOpsHead: initialSnapshot.outletOpsHead,
			shiftApplicants: initialSnapshot.shiftApplicants,
			postSealRatePrompt: initialSnapshot.postSealRatePrompt,
			paymentCardLast4: initialSnapshot.paymentCardLast4,
			pendingPRs: initialSnapshot.pendingPRs,
			pendingAgencyLinks: initialSnapshot.pendingAgencyLinks ?? [],
			approveAgencyLink: (id) => {
				const link = get().pendingAgencyLinks.find((l) => l.id === id);
				if (!link) return;
				set((st) => ({
					pendingAgencyLinks: st.pendingAgencyLinks.map((l) =>
						l.id === id ? { ...l, status: "approved" as const } : l,
					),
					// If this is the logged-in PR, reflect the new agency on their profile.
					prAgencies:
						getPrRosterId(st.prSubRole) === link.prId &&
						!st.prAgencies.includes(link.agencyId)
							? [...st.prAgencies, link.agencyId]
							: st.prAgencies,
				}));
				get().toast(`${link.prName} linked to ${link.agencyName}`, "success");
			},
			rejectAgencyLink: (id) => {
				const link = get().pendingAgencyLinks.find((l) => l.id === id);
				if (!link) return;
				set((st) => ({
					pendingAgencyLinks: st.pendingAgencyLinks.map((l) =>
						l.id === id ? { ...l, status: "rejected" as const } : l,
					),
				}));
				get().toast(
					`${link.prName}'s link to ${link.agencyName} declined`,
					"info",
				);
			},
			requestPrAgencyChange: (nextIds) => {
				const st = get();
				const prId = getPrRosterId(st.prSubRole);
				const prName =
					st.agencyPRs.find((p) => p.id === prId)?.name ??
					getPrProfile(st.prSubRole).name;
				const current = st.prAgencies;
				const added = nextIds.filter((id) => !current.includes(id));
				const removed = current.filter((id) => !nextIds.includes(id));
				if (added.length === 0 && removed.length === 0) return;
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				// Adding an agency → a pending link request lands in that agency's Approvals (dispatch).
				const newLinks: PendingAgencyLink[] = added.map((agencyId) => ({
					id: `pal-${prId}-${agencyId}-${Date.now()}`,
					prId,
					prName,
					agencyId,
					agencyName: getPrAgencyById(agencyId)?.name ?? agencyId,
					status: "pending" as const,
					requestedAt: stamp,
				}));
				set((s) => ({
					prAgencies: nextIds,
					pendingAgencyLinks: [
						...s.pendingAgencyLinks.filter(
							(l) =>
								!(
									l.prId === prId &&
									added.includes(l.agencyId) &&
									l.status === "pending"
								),
						),
						...newLinks,
					],
				}));
				for (const agencyId of added) {
					get().toast(
						`${getPrAgencyById(agencyId)?.name ?? "Agency"} notified to dispatch you`,
						"success",
					);
				}
				for (const agencyId of removed) {
					get().toast(
						`${getPrAgencyById(agencyId)?.name ?? "Agency"} notified to suspend you`,
						"info",
					);
				}
			},
			pendingCutlostRequests: initialSnapshot.pendingCutlostRequests ?? [],

			approvePendingPR: (id) => {
				const pending = get().pendingPRs.find((p) => p.id === id);
				if (!pending || pending.status !== "pending") return;
				const managed = pendingPRToManagedPR(pending);
				set((st) => {
					const alreadyOnRoster = st.agencyPRs.some((p) => p.id === managed.id);
					const nextAgencyPRs = alreadyOnRoster
						? st.agencyPRs
						: [...st.agencyPRs, managed];
					return {
						pendingPRs: st.pendingPRs.map((p) =>
							p.id === id ? { ...p, status: "approved" as const } : p,
						),
						agencyPRs: nextAgencyPRs,
						prs: marketplacePrsFromAgency(nextAgencyPRs),
					};
				});
				get().toast(
					`${pending.name} approved — added to roster & marketplace`,
					"success",
				);
			},
			rejectPendingPR: (id, reason) => {
				set((st) => ({
					pendingPRs: st.pendingPRs.map((p) =>
						p.id === id
							? {
									...p,
									status: "rejected",
									rejectReason: reason ?? "Did not meet agency criteria",
								}
							: p,
					),
				}));
				get().toast("PR rejected — notification sent", "warn");
			},
			invitePendingPR: ({ name, ic, mobile, email }) => {
				const id = "pr-inv-" + Date.now();
				const now = new Date();
				const submittedAt = `${now.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })} · ${now.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}`;
				set((st) => ({
					pendingPRs: [
						{
							id,
							name,
							ic,
							mobile,
							email,
							languages: "Pending profile",
							status: "pending",
							source: "owner-invite",
							hasIcPhotos: false,
							hasSelfie: false,
							portfolioCount: 0,
							portfolioPhotos: Array.from(
								{ length: PORTFOLIO_SLOT_COUNT },
								() => null,
							),
							submittedAt,
						},
						...st.pendingPRs,
					],
				}));
				get().toast(
					`Invite sent to ${name} — awaiting profile completion`,
					"success",
				);
			},
			submitPrRegistration: (input) => {
				const id = `signup-${Date.now()}`;
				const now = new Date();
				const submittedAt = `${now.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })} · ${now.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}`;
				const portfolioPhotos = [
					...input.portfolio,
					...Array(
						Math.max(0, PORTFOLIO_SLOT_COUNT - input.portfolio.length),
					).fill(null),
				].slice(0, PORTFOLIO_SLOT_COUNT) as (string | null)[];
				const portfolioCount = portfolioPhotos.filter(Boolean).length;
				const floorNickname = input.floorNickname.trim();
				const icName = input.icName.trim() || floorNickname;
				set((st) => ({
					pendingPRs: [
						{
							id,
							name: floorNickname,
							icName,
							languages: input.nationality
								? `EN · ${input.nationality}`
								: "Pending profile",
							ic: input.ic,
							mobile: input.mobile,
							email: input.email,
							hasIcPhotos: Boolean(input.idPhotoFront && input.idPhotoBack),
							hasSelfie: Boolean(input.profilePhoto),
							portfolioCount,
							portfolioPhotos,
							submittedAt,
							source: "self-signup",
							status: "pending",
							agencyId: input.agencyId || undefined,
						},
						...st.pendingPRs,
					],
					prPortfolio: portfolioPhotos,
					prAvatarPhoto: input.profilePhoto ?? st.prAvatarPhoto,
					prDisplayName: floorNickname,
					prIcName: icName,
					prMobile: input.mobile,
					prEmail: input.email,
				}));
			},

			createShift: (s) => {
				const id = "s" + Math.random().toString(36).slice(2, 7);
				const row = withShiftFinancialDefaults({
					...s,
					id,
					status: "draft",
					filled: 0,
					prs: [],
				});
				set((st) => ({
					shifts: [row, ...st.shifts],
				}));
				get().toast("Shift request created", "success");
				return id;
			},
			createShifts: (items) => {
				if (items.length === 0) return;
				const st = get();
				const ws = st.outletWorkspace;
				const newShifts: ShiftRequest[] = items.map((s) => {
					const prs = s.prs ?? [];
					const hours = shiftHoursFromLabel(s.shift);
					const tierRates = s.tierRates ?? cloneTierRates(ws.tierRates);
					const tierIPay = tierRates["Tier I"].wagePerHour;
					const eventDrinkMenu =
						s.eventKind === "special" && s.eventDrinkMenu?.length
							? s.eventDrinkMenu.map((d) => ({ ...d }))
							: undefined;
					const perDrinkRm = eventDrinkMenu?.length
						? averageDrinkPrice(eventDrinkMenu)
						: (s.perDrinkRm ?? ws.perDrinkRm);
					const dateIso =
						s.dateIso ??
						resolveOutletShiftDateIso(
							s.date,
							s.dateIso,
							DEFAULT_ROSTER_DATE_ISO,
						);
					return withShiftFinancialDefaults(
						{
							...s,
							id: "s" + Math.random().toString(36).slice(2, 7),
							status: "open",
							dateIso,
							filled: prs.length,
							prs,
							requestedPrIds: prs.length > 0 ? [...prs] : undefined,
							payPerHour: tierIPay,
							tierRates,
							eventDrinkMenu,
							estimatedCost:
								s.estimatedCost ??
								estimateShiftLaborCost({
									tierRates,
									hours,
									quantity: Math.max(prs.length, s.quantity),
									prIds: prs,
									prTierById: Object.fromEntries(
										st.agencyPRs.map((p) => [p.id, p.trainingLevel]),
									),
								}),
							perDrinkRm,
							perTableRm: s.perTableRm ?? ws.perTableRm,
						},
						ws.drinkMenu ?? DEFAULT_OUTLET_DRINK_MENU,
					);
				});
				set((cur) => ({
					shifts: [...newShifts, ...cur.shifts],
				}));
				get().toast(
					`${newShifts.length} shift${newShifts.length !== 1 ? "s" : ""} posted`,
					"success",
				);
			},
			deleteShift: (shiftId) => {
				const shift = get().shifts.find((s) => s.id === shiftId);
				if (!shift || shift.status === "sealed") return;
				set((st) => ({
					shifts: st.shifts.filter((s) => s.id !== shiftId),
					shiftApplicants: st.shiftApplicants.filter(
						(a) => a.shiftId !== shiftId,
					),
				}));
				get().toast("Shift removed", "info");
			},
			saveAgencyPenaltyRules: (next) => {
				set({ agencyPenaltyRules: normalizePenaltyRules(next) });
				get().toast("Penalty rules saved", "success");
			},
			saveOutletWorkspace: (patch) => {
				set((st) => {
					const next = normalizeOutletWorkspace({
						...st.outletWorkspace,
						...patch,
					});
					if (patch.drinkMenu) {
						next.perDrinkRm = averageDrinkPrice(next.drinkMenu);
					}
					const menu = next.drinkMenu;
					const nextRules = syncCommissionRulesFromWorkspace(
						next,
						st.outletCommissionRules,
					);
					const nextShifts = st.shifts.map((sh) => {
						if (!outletMatches(sh.outletName, next.outletName)) return sh;
						const pricingPatch =
							sh.eventKind === "special"
								? { perTableRm: next.perTableRm }
								: { perDrinkRm: next.perDrinkRm, perTableRm: next.perTableRm };
						const merged = withShiftFinancialDefaults(
							{ ...sh, ...pricingPatch },
							menu,
						);
						return merged;
					});
					const reconciliation = buildReconciliationFromLedger(st, {
						prPaymentVouchers: st.prPaymentVouchers,
					});
					const sync = applyOutletFinancialSync(
						nextShifts,
						st.outletMoneyEditCount,
						Date.now(),
						st.agencyRoster,
						reconciliation,
						menu,
						nextRules,
					);
					return {
						outletWorkspace: next,
						outletCommissionRules: nextRules,
						...sync,
					};
				});
				get().toast(
					"Workspace saved · synced to agency commission & PNL",
					"success",
				);
			},
			saveOutletSettings: (patch) => {
				set((st) => ({ outletSettings: { ...st.outletSettings, ...patch } }));
				get().toast("Settings saved", "success");
			},
			saveOutletOwner: (patch) => {
				set((st) => ({ outletOwner: { ...st.outletOwner, ...patch } }));
			},
			recordOutletSubscriptionPlanChange: (planId) => {
				const plan = getOutletSubscriptionPlan(planId);
				const invoice = outletSubscriptionInvoiceForPlan(plan);
				set((st) => {
					const withoutDup = st.outletSubscriptionBilling.filter(
						(inv) => inv.id !== invoice.id,
					);
					return {
						outletSubscriptionBilling: syncOutletSubscriptionBilling(
							[invoice, ...withoutDup],
							planId,
						),
					};
				});
			},
			saveOutletProfileSettings: (data) => {
				const orgName = data.owner.orgName.trim();
				set({
					outletOwner: {
						...data.owner,
						ownerName: data.owner.ownerName.trim(),
						orgName,
					},
					outletFinanceHead: { ...data.financeHead },
					outletOpsHead: { ...data.opsHead },
					outletSettings: {
						...get().outletSettings,
						venueName: orgName,
						location: data.location.trim(),
					},
					outletWorkspace: {
						...get().outletWorkspace,
						outletName: orgName,
					},
				});
				get().toast("Outlet settings saved", "success");
			},
			sendOutletOtp: () => {
				const ch = get().outletOwner.otpChannel;
				get().toast(
					`OTP sent to your ${ch === "email" ? "email" : "mobile"}`,
					"info",
				);
			},
			verifyOutletOtp: (code) => {
				if (code === "123456" || code.length === 6) {
					set((st) => ({
						outletOwner: { ...st.outletOwner, accountActivated: true },
					}));
					get().toast("Account activated ✓", "success");
					return true;
				}
				get().toast("Invalid OTP — try 123456 for demo", "warn");
				return false;
			},
			setReconciliationVarianceReason: (reason) => {
				set((st) => ({
					agencyReconciliation: {
						...st.agencyReconciliation,
						varianceReason: reason.trim(),
					},
				}));
			},
			respondToApplicant: (applicantId, accept) => {
				const st = get();
				const app = st.shiftApplicants.find((a) => a.id === applicantId);
				if (!app || app.status !== "pending") return;
				const shift = st.shifts.find((s) => s.id === app.shiftId);
				if (!shift || shift.status === "sealed") return;
				if (accept && shift.prs.length >= shift.quantity) {
					get().toast("Shift is already full", "warn");
					return;
				}
				set((cur) => {
					const agencyPr = cur.agencyPRs.find((p) => p.id === app.prId);
					const rosterSeed = {
						prId: app.prId,
						prName: agencyPr?.name ?? app.prName,
						outlet: shift.outletName,
						dateIso: shiftDateIso(shift.date),
						shift: shift.shift,
					};
					return {
						shiftApplicants: cur.shiftApplicants.map((a) =>
							a.id === applicantId
								? { ...a, status: accept ? "accepted" : "declined" }
								: a,
						),
						shifts: accept
							? cur.shifts.map((sh) =>
									sh.id === app.shiftId
										? {
												...sh,
												prs: [...sh.prs, app.prId],
												filled: sh.prs.length + 1,
											}
										: sh,
								)
							: cur.shifts,
						agencyRoster: accept
							? ensureRosterSlot(cur.agencyRoster, rosterSeed, "scheduled")
							: cur.agencyRoster,
					};
				});
				get().toast(
					accept ? `${app.prName} added to shift` : `Declined ${app.prName}`,
					accept ? "success" : "info",
				);
				if (accept && shift) {
					get().pushNotify({
						type: "shift_assigned",
						prId: app.prId,
						prName: app.prName,
						outlet: shift.outletName,
					});
				}
			},
			approveOutletPrRequest: (rosterSlotId) => {
				const st = get();
				const slot = st.agencyRoster.find((s) => s.id === rosterSlotId);
				const applicantId = slot?.agencyAssignment?.shiftApplicantId;
				if (!slot || slot.status !== "outlet-request-pending" || !applicantId)
					return;
				const app = st.shiftApplicants.find((a) => a.id === applicantId);
				if (!app || app.status !== "pending") return;
				const shift = st.shifts.find((s) => s.id === app.shiftId);
				if (!shift || shift.status === "sealed") return;
				if (shift.prs.length >= shift.quantity) {
					get().toast("Shift is already full", "warn");
					return;
				}
				const stamp = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const isTonight = slot.dateIso === DEFAULT_ROSTER_DATE_ISO;
				set((cur) => {
					const nextRoster = cur.agencyRoster.map((s) =>
						s.id === rosterSlotId
							? {
									...s,
									status: "scheduled" as const,
									agencyAssignment: s.agencyAssignment
										? {
												...s.agencyAssignment,
												assignedAt: stamp,
												assignedAtMs: Date.now(),
												requestedByOutlet: true,
												respondedAt: stamp,
												outletShiftId:
													s.agencyAssignment.outletShiftId ?? shift.id,
											}
										: {
												assignedAt: stamp,
												assignedAtMs: Date.now(),
												respondedAt: stamp,
												outletShiftId: shift.id,
											},
								}
							: s,
					);
					const nextShifts = cur.shifts.map((sh) =>
						sh.id === app.shiftId
							? {
									...sh,
									prs: [...sh.prs, app.prId],
									filled: sh.prs.length + 1,
								}
							: sh,
					);
					return {
						agencyRoster: nextRoster,
						shiftApplicants: cur.shiftApplicants.map((a) =>
							a.id === applicantId ? { ...a, status: "accepted" as const } : a,
						),
						shifts: syncAgencyRosterToOutletShifts(nextShifts, nextRoster),
						...(slot.prId === TIED_DEMO_ROSTER_PR_ID && isTonight
							? patchPrSessionForRole(cur, "pr_tied", {
									shiftAccepted: true,
									pendingApproval: false,
									acceptedShiftIndex: shiftIndexForOutlet(shift.outletName),
									checkedIn: false,
									checkedOut: false,
								})
							: {}),
					};
				});
				get().toast(
					`${app.prName} scheduled at ${shift.outletName}`,
					"success",
				);
				get().pushNotify({
					type: "shift_assigned",
					prId: app.prId,
					prName: app.prName,
					outlet: shift.outletName,
					detail: `${shift.outletName} · ${shift.event} — cancel per agency policy if needed`,
				});
			},
			declineOutletPrRequest: (rosterSlotId) => {
				const st = get();
				const slot = st.agencyRoster.find((s) => s.id === rosterSlotId);
				const applicantId = slot?.agencyAssignment?.shiftApplicantId;
				if (!slot || slot.status !== "outlet-request-pending" || !applicantId)
					return;
				const app = st.shiftApplicants.find((a) => a.id === applicantId);
				set((cur) => ({
					shiftApplicants: cur.shiftApplicants.map((a) =>
						a.id === applicantId ? { ...a, status: "declined" as const } : a,
					),
					agencyRoster: cur.agencyRoster.filter((s) => s.id !== rosterSlotId),
				}));
				get().toast(
					app
						? `Declined outlet request for ${app.prName}`
						: "Outlet request declined",
					"info",
				);
			},
			requestOutletPrsForShift: (shiftId, prIds) => {
				if (prIds.length === 0) return;
				const st = get();
				const shift = st.shifts.find((s) => s.id === shiftId);
				if (!shift || shift.status === "sealed") return;
				const existing = st.shiftApplicants.filter(
					(a) => a.shiftId === shiftId,
				);
				const pendingPrIds = new Set(
					existing
						.filter(
							(a) => a.status === "pending" && a.source === "outlet_request",
						)
						.map((a) => a.prId),
				);
				const onShift = new Set(shift.prs);
				const remaining = Math.max(
					0,
					shift.quantity - shift.filled - pendingPrIds.size,
				);
				if (remaining === 0) {
					get().toast("All PR slots are filled or already requested", "warn");
					return;
				}
				const toRequest = prIds
					.filter((id) => !onShift.has(id) && !pendingPrIds.has(id))
					.slice(0, remaining);
				if (toRequest.length === 0) {
					get().toast("Those PRs are already on this shift or pending", "warn");
					return;
				}
				const newApplicants: ShiftApplicant[] = toRequest.map((prId) => {
					const pr =
						st.prs.find((p) => p.id === prId) ??
						st.agencyPRs.find((p) => p.id === prId);
					return {
						id: `app-${shiftId}-${prId}`,
						shiftId,
						prId,
						prName: pr?.name ?? prId,
						// 0 = "no rating on file", the same spelling the comcard
						// measurements use. It was `?? 4`, which handed an unrated PR a
						// four-star record on the outlet's applicant list.
						rating: pr?.rating ?? 0,
						status: "pending" as const,
						source: "outlet_request" as const,
					};
				});
				const newRosterSlots = newApplicants.map((app) =>
					outletRequestRosterSlotFromApplicant(app, shift),
				);
				set((cur) => ({
					shiftApplicants: [...newApplicants, ...cur.shiftApplicants],
					agencyRoster: [...newRosterSlots, ...cur.agencyRoster],
					shifts: cur.shifts.map((sh) => {
						if (sh.id !== shiftId) return sh;
						const named = new Set(sh.requestedPrIds ?? []);
						for (const id of toRequest) named.add(id);
						return { ...sh, requestedPrIds: [...named] };
					}),
				}));
				get().toast(
					`Requested ${toRequest.map((id) => st.prs.find((p) => p.id === id)?.name ?? id).join(", ")} · pending agency`,
					"success",
				);
			},
			syncOutletRequestRoster: () => {
				set((st) => ({
					agencyRoster: syncEarlyReleasesToRoster(
						mergeOutletRequestRosterSlots(
							st.agencyRoster,
							st.shifts,
							st.shiftApplicants,
						),
						st.shifts,
					),
				}));
			},
			payOutletInvoice: (collectionId) => {
				get().markCollectionSettled(collectionId);
				get().toast("Payment processed · receipt emailed", "success");
			},
			updateOutletPaymentCard: (last4) => {
				set({ paymentCardLast4: last4.replace(/\D/g, "").slice(-4) });
				get().toast("Card updated for subscription billing", "success");
			},
			clearPostSealRatePrompt: () => set({ postSealRatePrompt: null }),
			ensurePrShiftResumed: (opts) => {
				const patch = resumePrShiftPatch(get());
				if (!Object.keys(patch).length) return false;
				set((st) => {
					const merged = { ...st, ...patch };
					const role = st.prSubRole;
					return {
						...patch,
						prSessionByRole: role
							? { ...st.prSessionByRole, [role]: extractPrShiftSession(merged) }
							: st.prSessionByRole,
					};
				});
				get().syncLivePrCheckInToRoster();
				if (!opts?.silent) {
					get().toast("Shift resumed · check-in and logs restored", "info");
				}
				return true;
			},
			syncLivePrCheckInToRoster: () => {
				const st = get();
				const attendance = resolveTiedPrAttendance(st);
				if (attendance) {
					const checkInTime =
						attendance.session.timeIn.match(/\d{1,2}:\d{2}/)?.[0] ??
						new Date().toLocaleTimeString("en-MY", {
							hour: "2-digit",
							minute: "2-digit",
						});
					const next = rosterCheckIn(
						st.agencyRoster,
						attendance.prId,
						attendance.session.outlet,
						checkInTime,
						{
							prName: attendance.prName,
							dateIso: DEFAULT_ROSTER_DATE_ISO,
							shift: attendance.session.shiftTime,
						},
					);
					const match = (roster: typeof next) =>
						roster.find(
							(s) =>
								s.prId === attendance.prId &&
								s.dateIso === DEFAULT_ROSTER_DATE_ISO &&
								outletMatches(s.outlet, attendance.session.outlet),
						);
					const before = match(st.agencyRoster);
					const after = match(next);
					if (
						after?.status !== before?.status ||
						after?.checkedInAt !== before?.checkedInAt ||
						after?.checkedOutAt !== before?.checkedOutAt
					) {
						set({ agencyRoster: next });
					}
					return;
				}

				const tiedCache = st.prSessionByRole?.pr_tied;
				const liveOnTied = st.prSubRole === "pr_tied";
				const checkedOut = liveOnTied
					? st.checkedOut
					: (tiedCache?.checkedOut ?? st.checkedOut);
				const checkedIn = liveOnTied
					? st.checkedIn
					: (tiedCache?.checkedIn ?? st.checkedIn);
				const closedShift = liveOnTied
					? st.prCheckInMeta?.closedShift
					: tiedCache?.prCheckInMeta?.closedShift;
				const offer = activePrShiftOffer(st);
				const outlet =
					closedShift?.outlet ?? st.prActiveShift?.outlet ?? offer.outlet;
				const prId = TIED_DEMO_ROSTER_PR_ID;

				if (checkedOut) {
					const checkOutTime =
						closedShift?.timeOut?.match(/\d{1,2}:\d{2}/)?.[0] ??
						new Date().toLocaleTimeString("en-MY", {
							hour: "2-digit",
							minute: "2-digit",
						});
					const next = rosterCheckOut(
						st.agencyRoster,
						prId,
						outlet,
						checkOutTime,
					);
					const before = st.agencyRoster.find(
						(s) =>
							s.prId === prId &&
							s.dateIso === DEFAULT_ROSTER_DATE_ISO &&
							outletMatches(s.outlet, outlet),
					);
					const after = next.find(
						(s) =>
							s.prId === prId &&
							s.dateIso === DEFAULT_ROSTER_DATE_ISO &&
							outletMatches(s.outlet, outlet),
					);
					if (
						after?.status !== before?.status ||
						after?.checkedInAt !== before?.checkedInAt ||
						after?.checkedOutAt !== before?.checkedOutAt
					) {
						set({ agencyRoster: next });
					}
					return;
				}

				let changed = false;
				const next = st.agencyRoster.map((s) => {
					if (
						s.prId === prId &&
						s.dateIso === DEFAULT_ROSTER_DATE_ISO &&
						outletMatches(s.outlet, outlet) &&
						s.status === "on-duty" &&
						s.checkedInAt &&
						!checkedIn
					) {
						changed = true;
						return {
							...s,
							status: "scheduled" as const,
							checkedInAt: undefined,
						};
					}
					return s;
				});
				if (changed) set({ agencyRoster: next });
			},
			togglePrOnShift: (shiftId, prId) =>
				set((st) => ({
					shifts: st.shifts.map((sh) => {
						if (sh.id !== shiftId) return sh;
						const has = sh.prs.includes(prId);
						const prs = has
							? sh.prs.filter((p) => p !== prId)
							: [...sh.prs, prId];
						return { ...sh, prs, filled: prs.length };
					}),
				})),
			releaseOutletPrsEarly: (shiftId, prIds) => {
				const st = get();
				const shift = st.shifts.find((sh) => sh.id === shiftId);
				if (!shift || shift.status === "sealed") return;
				const alreadyReleased = new Set(shift.releasedEarlyPrIds ?? []);
				const activePrIds = new Set(outletShiftActivePrIds(shift));
				const valid = prIds.filter(
					(id) => activePrIds.has(id) && !alreadyReleased.has(id),
				);
				if (!valid.length) {
					get().toast("No PRs available to release", "warn");
					return;
				}
				const checkOutTime = outletPlanningReleaseClock(
					shift.shift,
					outletNowClockLabel(),
				);
				set((cur) => {
					const shifts = cur.shifts.map((sh) => {
						if (sh.id !== shiftId) return sh;
						const releasedEarlyPrIds = mergeReleasedEarlyPrIds(
							sh.releasedEarlyPrIds,
							valid,
						);
						const releasedEarlyAt = mergeReleasedEarlyAt(
							sh.releasedEarlyAt,
							releasedEarlyAtForPrIds(valid, checkOutTime),
						);
						const prs = sh.prs.filter((id) => !valid.includes(id));
						return {
							...sh,
							prs,
							filled: prs.length,
							releasedEarlyPrIds,
							releasedEarlyAt,
						};
					});
					const agencyRoster = syncEarlyReleasesToRoster(
						cur.agencyRoster,
						shifts,
					);
					return {
						agencyRoster,
						shifts: syncAgencyRosterToOutletShifts(shifts, agencyRoster),
					};
				});
				for (const prId of valid) {
					const pr = st.agencyPRs.find((p) => p.id === prId);
					get().pushNotify({
						type: "shift_edit",
						prId,
						prName: pr?.name ?? prId,
						outlet: shift.outletName,
						detail:
							"Released early — paid for hours worked + commissions; available to reassign or sent home",
					});
				}
				get().toast(
					`${valid.length} PR${valid.length === 1 ? "" : "s"} released early · paid hours worked · available to reassign`,
					"success",
				);
			},
			cutOutletUnfilledDemand: (shiftId, slots) => {
				const shift = get().shifts.find((sh) => sh.id === shiftId);
				if (!shift || shift.status === "sealed" || slots <= 0) return;
				const unfilled = outletUnfilledDemandSlots(shift);
				const cut = Math.min(slots, unfilled);
				if (cut <= 0) {
					get().toast("No open demand slots to cut", "warn");
					return;
				}
				const tierRates = resolveShiftTierRates(shift, get().outletWorkspace);
				const prTierById = Object.fromEntries(
					get().agencyPRs.map((p) => [p.id, p.trainingLevel]),
				);
				const perSlot = outletShiftPlannedLaborPerSlot(
					shift,
					tierRates,
					prTierById,
				);
				const laborCut = Math.round(perSlot * cut);
				set((st) => ({
					shifts: st.shifts.map((sh) => {
						if (sh.id !== shiftId) return sh;
						return {
							...sh,
							demandCut: (sh.demandCut ?? 0) + cut,
						};
					}),
				}));
				get().toast(
					`Cut ${cut} open slot${cut === 1 ? "" : "s"} · planned labor reduced by RM ${laborCut.toLocaleString("en-MY")}`,
					"success",
				);
			},
			requestOutletCutlostReduction: (shiftId, payload) => {
				const st = get();
				const shift = st.shifts.find((sh) => sh.id === shiftId);
				if (!shift || shift.status === "sealed") return;

				const pendingForShift = st.pendingCutlostRequests.some(
					(r) => r.shiftId === shiftId && r.status === "pending",
				);
				if (pendingForShift) {
					get().toast(
						"A cutlost request is already awaiting agency approval",
						"warn",
					);
					return;
				}

				const tierRates = resolveShiftTierRates(shift, st.outletWorkspace);
				const prTierById = Object.fromEntries(
					st.agencyPRs.map((p) => [p.id, p.trainingLevel]),
				);
				const cutlostBefore = outletShiftCutLossForShift(
					shift,
					tierRates,
					prTierById,
				);

				let estimatedSavings = 0;
				let releasedPrIds: string[] | undefined;
				let releasedPrNames: string[] | undefined;
				let slotsCut: number | undefined;
				let rationale: string[] | undefined;
				let model: "guaranteed" | "best_effort" | undefined;
				const kind = payload.kind;

				if (payload.kind === "best_effort") {
					model = "best_effort";
					const alreadyReleased = new Set(shift.releasedEarlyPrIds ?? []);
					const activePrIds = new Set(outletShiftActivePrIds(shift));
					const validPrs = payload.prIds.filter(
						(id) => activePrIds.has(id) && !alreadyReleased.has(id),
					);
					const unfilled = outletUnfilledDemandSlots(shift);
					const cut = Math.min(payload.slotsCut, unfilled);
					releasedPrIds = validPrs.length ? validPrs : undefined;
					releasedPrNames = validPrs.map(
						(id) => st.agencyPRs.find((p) => p.id === id)?.name ?? id,
					);
					slotsCut = cut > 0 ? cut : undefined;
					rationale = payload.rationale;
					const releaseAtClock = outletPlanningReleaseClock(shift.shift);
					const nextReleased = mergeReleasedEarlyPrIds(
						shift.releasedEarlyPrIds,
						validPrs,
					);
					estimatedSavings = outletShiftCutLossSavings(
						shift,
						tierRates,
						prTierById,
						{
							demandCut: (shift.demandCut ?? 0) + (cut > 0 ? cut : 0),
							releasedEarlyPrIds: nextReleased,
							releasedEarlyAt: mergeReleasedEarlyAt(
								shift.releasedEarlyAt,
								releasedEarlyAtForPrIds(validPrs, releaseAtClock),
							),
							releaseAtClock,
						},
						"best_effort",
					);
					if (!cut && !validPrs.length) {
						get().toast("No cutlost actions available for this plan", "warn");
						return;
					}
				} else if (payload.kind === "release_prs") {
					model = payload.model ?? "guaranteed";
					const alreadyReleased = new Set(shift.releasedEarlyPrIds ?? []);
					const activePrIds = new Set(outletShiftActivePrIds(shift));
					const valid = payload.prIds.filter(
						(id) => activePrIds.has(id) && !alreadyReleased.has(id),
					);
					if (!valid.length) {
						get().toast("No PRs available to release", "warn");
						return;
					}
					releasedPrIds = valid;
					releasedPrNames = valid.map(
						(id) => st.agencyPRs.find((p) => p.id === id)?.name ?? id,
					);
					const releaseAtClock = outletPlanningReleaseClock(shift.shift);
					const nextReleased = mergeReleasedEarlyPrIds(
						shift.releasedEarlyPrIds,
						valid,
					);
					estimatedSavings = outletShiftCutLossSavings(
						shift,
						tierRates,
						prTierById,
						{
							releasedEarlyPrIds: nextReleased,
							releasedEarlyAt: mergeReleasedEarlyAt(
								shift.releasedEarlyAt,
								releasedEarlyAtForPrIds(valid, releaseAtClock),
							),
							releaseAtClock,
						},
						model === "guaranteed" ? "guaranteed" : "best_effort",
					);
				} else {
					model = payload.model ?? "guaranteed";
					const unfilled = outletUnfilledDemandSlots(shift);
					const cut = Math.min(payload.slots, unfilled);
					if (cut <= 0) {
						get().toast("No open demand slots to cut", "warn");
						return;
					}
					slotsCut = cut;
					estimatedSavings = outletShiftCutLossSavings(
						shift,
						tierRates,
						prTierById,
						{
							demandCut: (shift.demandCut ?? 0) + cut,
						},
					);
				}

				if (estimatedSavings <= 0) {
					get().toast(
						"This option would not save on cutlost / unused wages",
						"warn",
					);
					return;
				}

				const requestedAt = new Date().toLocaleString("en-MY", {
					day: "numeric",
					month: "short",
					hour: "2-digit",
					minute: "2-digit",
				});
				const req: PendingCutlostRequest = {
					id: `cutlost-${Date.now()}`,
					shiftId,
					outletName: shift.outletName,
					shiftEvent: shift.event,
					shiftLabel: shift.shift,
					dateLabel: shift.date,
					kind,
					model,
					status: "pending",
					releasedPrIds,
					releasedPrNames,
					slotsCut,
					estimatedSavings,
					cutlostBefore,
					requestedAt,
					rationale,
				};

				set({ pendingCutlostRequests: [req, ...st.pendingCutlostRequests] });
				// One notification per PR the plan would release, exactly as
				// `releaseOutletPrsEarly` above does it: `shift_edit` is PR-scoped —
				// the agency line is titled with the PR's name and only that PR sees
				// the host copy. A cut-slots-only request releases nobody, so it
				// raises none; the agency still picks it up from the approval queue
				// set on the line above.
				for (const prId of req.releasedPrIds ?? []) {
					const pr = st.agencyPRs.find((p) => p.id === prId);
					get().pushNotify({
						type: "shift_edit",
						prId,
						prName: pr?.name ?? prId,
						outlet: shift.outletName,
						detail: `Cutlost request · ${cutlostRequestTitle(req)}`,
					});
				}
				get().toast("Sent to agency for approval", "info");
			},
			approveCutlostRequest: (id) => {
				const st = get();
				const req = st.pendingCutlostRequests.find((r) => r.id === id);
				if (!req || req.status !== "pending") return;

				if (req.kind === "best_effort") {
					if (req.slotsCut)
						get().cutOutletUnfilledDemand(req.shiftId, req.slotsCut);
					if (req.releasedPrIds?.length)
						get().releaseOutletPrsEarly(req.shiftId, req.releasedPrIds);
				} else if (req.kind === "release_prs" && req.releasedPrIds?.length) {
					get().releaseOutletPrsEarly(req.shiftId, req.releasedPrIds);
				} else if (req.kind === "cut_slots" && req.slotsCut) {
					get().cutOutletUnfilledDemand(req.shiftId, req.slotsCut);
				}

				set({
					pendingCutlostRequests: st.pendingCutlostRequests.map((r) =>
						r.id === id ? { ...r, status: "approved" as const } : r,
					),
				});
				get().toast(`${req.outletName} cutlost request approved`, "success");
			},
			rejectCutlostRequest: (id, reason) => {
				set((st) => ({
					pendingCutlostRequests: st.pendingCutlostRequests.map((r) =>
						r.id === id
							? {
									...r,
									status: "rejected" as const,
									declineReason: reason?.trim() || "Declined by agency",
								}
							: r,
					),
				}));
				get().toast("Cutlost request declined", "info");
			},
			easeOutletSalesTarget: (shiftId, reducePct) => {
				const shift = get().shifts.find((sh) => sh.id === shiftId);
				if (!shift || shift.status === "sealed" || reducePct <= 0) return;
				const current = shift.salesTargetPct ?? 100;
				const next = Math.max(50, current - reducePct);
				if (next === current) {
					get().toast("Sales target is already at the minimum (50%)", "warn");
					return;
				}
				set((st) => ({
					shifts: st.shifts.map((sh) =>
						sh.id === shiftId ? { ...sh, salesTargetPct: next } : sh,
					),
				}));
				get().toast(
					`Sales target eased to ${next}% for the rest of tonight`,
					"success",
				);
			},
			confirmShift: (shiftId) => {
				const shift = get().shifts.find((sh) => sh.id === shiftId);
				set((st) => ({
					shifts: st.shifts.map((sh) =>
						sh.id === shiftId ? { ...sh, status: "confirmed" } : sh,
					),
				}));
				if (shift) {
					shift.prs.forEach((prId) => {
						const pr = get().agencyPRs.find((p) => p.id === prId);
						get().pushNotify({
							type: "shift_assigned",
							prId,
							prName: pr?.name ?? prId,
							outlet: shift.outletName,
						});
					});
				}
				get().toast("Booking confirmed · PRs notified", "success");
			},
			sealShift: (shiftId) => {
				const st = get();
				const shift = st.shifts.find((sh) => sh.id === shiftId);
				if (!shift) return;
				const today = new Date();
				const dateIso = DEFAULT_ROSTER_DATE_ISO;
				const dateDisplay = today.toLocaleDateString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
				});
				const newRows: ShiftHistoryRow[] = shift.prs.map((prId) => {
					const pr = st.agencyPRs.find((p) => p.id === prId);
					const roster = st.agencyRoster.find(
						(s) =>
							s.prId === prId &&
							s.status === "on-duty" &&
							outletMatches(s.outlet, shift.outletName),
					);
					const drinkUnits = Math.round(
						(shift.drinkUnits ?? 0) / Math.max(shift.prs.length, 1),
					);
					const tipSalesRm = roster?.floorTips ?? 0;
					const perDrinkRm =
						shift.perDrinkRm ??
						typicalDrinkPrice(st.outletWorkspace.drinkMenu ?? []) ??
						st.outletWorkspace.perDrinkRm;
					const sealed = sealShiftHistoryAmounts({
						outlet: shift.outletName,
						drinkUnits,
						tipSalesRm,
						hoursWorked: 6,
						perDrinkRm,
						rules: st.outletCommissionRules,
						prTier: pr?.trainingLevel,
						payClass: pr ? prPayClassOnDate(pr, dateIso) : undefined,
					});
					return buildShiftHistoryRow({
						prId,
						prName: pr?.name ?? prId,
						outlet: shift.outletName,
						dateIso,
						dateDisplay,
						totalPayout: sealed.totalPayout,
						totalDrinks: sealed.totalDrinks,
						drinkSalesRm: sealed.drinkSalesRm,
						totalTips: sealed.totalTips,
						totalTables: sealed.totalTables,
						wagesRm: sealed.wagesRm,
						otRm: sealed.otRm,
						drinkCommissionRm: sealed.drinkCommissionRm,
						tipCommissionRm: sealed.tipCommissionRm,
						durationHours: 6,
					});
				});
				set({
					...syncLedgerState(st, {
						shifts: st.shifts.map((sh) =>
							sh.id === shiftId ? { ...sh, status: "sealed" } : sh,
						),
						shiftHistory: mergeShiftHistory(st.shiftHistory, newRows),
					}),
					postSealRatePrompt: { shiftId, prIds: [...shift.prs] },
				});
				shift.prs.forEach((pid) => {
					const pr = st.agencyPRs.find((p) => p.id === pid);
					get().pushNotify({
						type: "rating_prompt",
						prId: pid,
						prName: pr?.name ?? pid,
						outlet: shift.outletName,
						audience: "outlet",
					});
				});
				const recon = get().agencyReconciliation;
				if (isWeeklyReconciliationSunday() && !recon.outletConfirmed) {
					get().pushNotify({
						type: "reconciliation_due",
						outlet: shift.outletName,
					});
				}
				get().toast(
					"Shift sealed · rate PRs within 24h · PVs synced",
					"success",
				);
			},

			acceptBooking: (id) => {
				set((st) => ({
					bookings: st.bookings.map((b) =>
						b.id === id ? { ...b, status: "accepted" } : b,
					),
				}));
				get().toast("Shift accepted", "success");
			},
			checkIn: (id) => {
				const time = new Date().toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => ({
					bookings: st.bookings.map((b) =>
						b.id === id ? { ...b, status: "checked-in", checkedInAt: time } : b,
					),
				}));
				get().toast("Checked in · GPS verified", "success");
			},
			checkOut: (id) => {
				const time = new Date().toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				});
				set((st) => ({
					bookings: st.bookings.map((b) =>
						b.id === id ? { ...b, status: "completed", checkedOutAt: time } : b,
					),
				}));
				get().toast("Checked out · shift saved to history", "info");
			},

			signPv: (id) => {
				const pv = get().pvs.find((p) => p.id === id);
				if (!pv) return;
				const total = pv.wages + pv.drinkCommission + pv.tipCommission;
				set((st) => ({
					pvs: st.pvs.map((p) =>
						p.id === id ? { ...p, status: "signed" } : p,
					),
					walletBalance: st.walletBalance + total,
				}));
				get().toast(`PV signed · RM ${total} credited to wallet`, "success");
			},
			disputePv: (id, reason) => {
				set((st) => ({
					pvs: st.pvs.map((p) =>
						p.id === id ? { ...p, status: "disputed" } : p,
					),
				}));
				get().toast(`Dispute raised: ${reason}`, "warn");
			},
			withdraw: (amount) => {
				if (amount > get().walletBalance)
					return get().toast("Insufficient balance", "warn");
				set((st) => ({ walletBalance: st.walletBalance - amount }));
				get().toast(`RM ${amount} withdrawal queued · T+1`, "success");
			},
			ratePr: (prId, stars, note, tags) => {
				const pr = get().prs.find((p) => p.id === prId);
				if (!pr) return;
				// WHICH shift this verdict is about, captured BEFORE the set() below
				// — that set removes this PR from the prompt and drops the prompt
				// entirely once it empties, so reading it from the async submit
				// afterwards would find the shift gone on the last PR rated.
				//
				// Only when the prompt actually names this PR: rating someone from
				// the Ratings screen is not about the shift a prompt happens to be
				// open for. Absent, the server attributes it to the PR's latest
				// night at this venue.
				const openPrompt = get().postSealRatePrompt;
				const ratedShiftId = openPrompt?.prIds.includes(prId)
					? openPrompt.shiftId
					: undefined;
				const lowShift = stars < RATING_SUSPEND_SHIFT_THRESHOLD;
				const stamp = new Date().toLocaleDateString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
				});
				set((st) => {
					const prompt = st.postSealRatePrompt;
					const nextPrompt =
						prompt && prompt.prIds.includes(prId)
							? {
									...prompt,
									prIds: prompt.prIds.filter((id) => id !== prId),
								}
							: prompt;
					const agencyPr = st.agencyPRs.find((p) => p.id === prId);
					const nextConsecutive = lowShift
						? (agencyPr?.consecutiveLowRatings ?? 0) + 1
						: 0;
					const nextRating = agencyPr
						? Math.round(((agencyPr.rating * 9 + stars) / 10) * 10) / 10
						: stars;
					const suspendStreak =
						nextConsecutive >= CONSECUTIVE_LOW_SUSPEND_COUNT;
					const nextAgencyPRs = st.agencyPRs.map((p) =>
						p.id === prId
							? {
									...p,
									rating: nextRating,
									consecutiveLowRatings: nextConsecutive,
									suspended: suspendStreak ? true : p.suspended,
								}
							: p,
					);
					return {
						ratings: [
							{
								id: "r" + Date.now(),
								pr: pr.name,
								stars,
								note,
								tags,
								date: stamp,
							},
							...st.ratings,
						],
						postSealRatePrompt:
							nextPrompt && nextPrompt.prIds.length > 0 ? nextPrompt : null,
						agencyPRs: nextAgencyPRs,
						prs: marketplacePrsFromAgency(nextAgencyPRs),
					};
				});
				// Persist to the backend rating table in a REAL outlet session. The
				// rate UI is demo-driven (no real-session PR/shift data), so this only
				// lands the rating — but it must not land SILENTLY.
				//
				// It used to swallow the error while the toast below fired
				// unconditionally: a real outlet was told "Rating submitted" even when
				// the POST failed, and the agency then never saw the rating. The store
				// write above is optimistic, so a failure has to be said out loud.
				//
				// onRefreshFail stays a no-op deliberately: a rating is not worth
				// ejecting someone mid-shift over an expired token.
				void (async () => {
					const { getOutletIdentity } = await import(
						"@agency-portal/lib/outlet-identity"
					);
					const identity = getOutletIdentity();
					if (!identity) return;
					try {
						const { submitRating } = await import("@/services/rating");
						await submitRating(
							{
								outletId: identity.outletId,
								prId,
								prName: pr.name,
								stars,
								note,
								tags: tags ?? [],
								// Names the rated night, which is what decides which
								// agency may read this rating — only the one that
								// staffed it. Omitted when the rating did not come
								// from a post-seal prompt.
								shiftId: ratedShiftId,
							},
							() => {},
						);
					} catch (error) {
						get().toast(
							`Rating saved on this device only — the agency was not told. ${
								error instanceof Error ? error.message : "Please try again."
							}`,
							"warn",
						);
					}
				})();
				get().toast("Rating submitted", "success");
			},

			toasts: [],
			toast: (message, tone = "info") => {
				const id = ++toastId;
				set((st) => ({ toasts: [...st.toasts, { id, message, tone }] }));
				setTimeout(() => get().dismissToast(id), 2800);
			},
			dismissToast: (id) =>
				set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
		}),
		{
			name: "innocenz-store",
			/**
			 * PER-TAB, same contract as the auth tokens and the portal identity
			 * (`tab-scoped-storage.ts`): sessionStorage, with the shared
			 * localStorage slot used only to seed a brand-new tab once.
			 *
			 * One shared localStorage blob meant two portals open in two tabs wrote
			 * over each other: the sub-role an agency-finance login persisted was
			 * the sub-role the owner's tab rehydrated, so the owner got the finance
			 * permission matrix while their token, nav and module grants all still
			 * said owner. Identity keys are additionally kept out of the blob
			 * entirely — see `partialize`.
			 */
			storage: createJSONStorage(() => ({
				getItem: (name) => readTabScoped(name),
				setItem: (name, value) => writeTabScoped(name, value),
				removeItem: (name) => removeTabScoped(name),
			})),
			onRehydrateStorage: () => (state) => {
				if (!state?.prSubRole) return;
				writePersistedPrSubRole(state.prSubRole);
				const role = state.prSubRole;
				const cached = state.prSessionByRole?.[role];
				const session =
					cached ??
					defaultPrShiftSessionForRole(role, {
						agencyRoster: state.agencyRoster ?? [],
						prSwapRequests: state.prSwapRequests ?? [],
					});
				Object.assign(state, applyPrShiftSession(session));
			},
			partialize: (s) => {
				const role = s.prSubRole;
				const prSessionByRole = role
					? { ...s.prSessionByRole, [role]: extractPrShiftSession(s) }
					: s.prSessionByRole;
				return {
					// `role`, `agencySubRole`, `outletSubRole`, `user` and
					// `activeAgencyId` are deliberately NOT persisted. Who you are and
					// what you may do is derived per tab from the tab-scoped token and
					// identity (login → startAgency/OutletRealSession, reload → the
					// portal route's identity re-derive). Storage was the only place
					// those could disagree with the token, and a stale sub-role read
					// like a broken permission rather than a stale cache.
					prSubRole: s.prSubRole,
					shifts: s.shifts,
					outletPnl: s.outletPnl,
					outletPnlSyncAt: s.outletPnlSyncAt,
					outletMoneyEditCount: s.outletMoneyEditCount,
					bookings: s.bookings,
					pvs: s.pvs,
					walletBalance: s.walletBalance,
					ratings: s.ratings,
					pendingPRs: s.pendingPRs,
					pendingAgencyLinks: s.pendingAgencyLinks,
					pendingCutlostRequests: s.pendingCutlostRequests,
					prSessionByRole,
					shiftAccepted: s.shiftAccepted,
					pendingApproval: s.pendingApproval,
					acceptedShiftIndex: s.acceptedShiftIndex,
					checkedIn: s.checkedIn,
					checkedOut: s.checkedOut,
					drinks: s.drinks,
					tables: s.tables,
					prPaymentVouchers: s.prPaymentVouchers,
					prComcard: s.prComcard,
					prPortfolio: s.prPortfolio,
					prLanguages: s.prLanguages,
					prDisplayName: s.prDisplayName,
					prEmail: s.prEmail,
					prAvatarPhoto: s.prAvatarPhoto,
					prPayrollAgencyId: s.prPayrollAgencyId,
					prAgencies: s.prAgencies,
					prNotifications: s.prNotifications,
					opsNotifications: s.opsNotifications,
					adminNotifications: s.adminNotifications,
					posIntegrationQuoteRequests: s.posIntegrationQuoteRequests,
					sosIncidents: s.sosIncidents,
					notificationPrefs: s.notificationPrefs,
					prDeclinedOfferIds: s.prDeclinedOfferIds,
					prMarketplaceApplication: s.prMarketplaceApplication,
					prUpcomingShifts: s.prUpcomingShifts,
					prSwapRequests: s.prSwapRequests,
					prAgencyTiedAt: s.prAgencyTiedAt,
					prCheckInMeta: s.prCheckInMeta,
					prLeaveRequest: s.prLeaveRequest,
					prReceiptScans: s.prReceiptScans,
					prActiveShift: s.prActiveShift,
					agencyOwner: s.agencyOwner,
					agencyFinanceHead: s.agencyFinanceHead,
					agencyCollections: s.agencyCollections,
					agencyReconciliation: s.agencyReconciliation,
					agencyRoster: s.agencyRoster,
					agencyPRs: s.agencyPRs,
					specialServiceOrders: s.specialServiceOrders,
					outletCommissionRules: s.outletCommissionRules,
					scalingTierMultipliers: s.scalingTierMultipliers,
					shiftHistory: s.shiftHistory,
					outletWorkspace: s.outletWorkspace,
					outletSettings: s.outletSettings,
					outletOwner: s.outletOwner,
					outletSubscriptionBilling: s.outletSubscriptionBilling,
					outletFinanceHead: s.outletFinanceHead,
					outletOpsHead: s.outletOpsHead,
					shiftApplicants: s.shiftApplicants,
					paymentCardLast4: s.paymentCardLast4,
					postSealRatePrompt: s.postSealRatePrompt,
				};
			},
			merge: (persisted, current) => {
				const p = persisted as Partial<StoreState> | undefined;
				const seedById = Object.fromEntries(
					LIVE_SEED_PR_PVS.map((s) => [s.id, s]),
				);
				const persistedPvs = p?.prPaymentVouchers ?? [];
				const mergedFromPersisted =
					persistedPvs.length > 0
						? persistedPvs.map((pv) => {
								const seed = seedById[pv.id];
								if (!seed) {
									const prName = pv.prName === "Luna" ? "Vicky" : pv.prName;
									if (pv.financeHeadName === LEGACY_FINANCE_HEAD_SIGNER) {
										return {
											...pv,
											prName,
											...financeHeadStampFromProfile(
												DEFAULT_FINANCE_HEAD,
												pv.financeHeadSignedAt,
											),
										};
									}
									if (!pv.financeHeadSignatureDataUrl && pv.financeHeadName) {
										const stamp = financeHeadStampFromProfile(
											{ ...DEFAULT_FINANCE_HEAD, name: pv.financeHeadName },
											pv.financeHeadSignedAt,
										);
										return {
											...pv,
											prName,
											financeHeadSignatureDataUrl:
												stamp.financeHeadSignatureDataUrl,
										};
									}
									if (
										!pv.prSignatureDataUrl &&
										(pv.prSignedAt ||
											pv.status === "PAID" ||
											pv.status === "SIGNED") &&
										prName
									) {
										return {
											...pv,
											prName,
											prSignatureDataUrl: buildDemoESignatureDataUrl(prName),
										};
									}
									return { ...pv, prName };
								}
								const identityFromSeed =
									pv.prIc !== seed.prIc ||
									pv.prName === "Jaya Nair" ||
									pv.prName === "Jaya" ||
									pv.prName === "Luna";
								const isDemoTimelinePv = pv.id in DEMO_PV_ISSUED_WEEKS_AGO;
								return {
									...seed,
									...pv,
									prName: seed.prName,
									prIc: seed.prIc,
									status: isDemoTimelinePv
										? seed.status
										: seed.status === "PAID" || seed.status === "SIGNED"
											? seed.status
											: (pv.status ?? seed.status),
									issued:
										isDemoTimelinePv || seed.weekStartIso
											? seed.issued
											: (pv.issued ?? seed.issued),
									due: pv.due ?? seed.due,
									cycle:
										isDemoTimelinePv || seed.weekStartIso
											? seed.cycle
											: (pv.cycle ?? seed.cycle),
									weekStartIso: seed.weekStartIso ?? pv.weekStartIso,
									weekEndIso: seed.weekEndIso ?? pv.weekEndIso,
									outlet:
										isDemoTimelinePv || seed.weekStartIso
											? seed.outlet
											: (pv.outlet ?? seed.outlet),
									financeHeadName:
										pv.financeHeadName === LEGACY_FINANCE_HEAD_SIGNER
											? seed.financeHeadName
											: (pv.financeHeadName ?? seed.financeHeadName),
									financeHeadSignedAt:
										pv.financeHeadSignedAt ?? seed.financeHeadSignedAt,
									financeHeadSignatureDataUrl:
										pv.financeHeadSignatureDataUrl ??
										seed.financeHeadSignatureDataUrl,
									prSignatureDataUrl: identityFromSeed
										? (seed.prSignatureDataUrl ??
											buildDemoESignatureDataUrl(seed.prName))
										: (pv.prSignatureDataUrl ??
											seed.prSignatureDataUrl ??
											(pv.prSignedAt ||
											pv.status === "PAID" ||
											pv.status === "SIGNED"
												? buildDemoESignatureDataUrl(pv.prName ?? seed.prName)
												: undefined)),
									prDisputeReason: pv.prDisputeReason ?? seed.prDisputeReason,
									disputedAt: pv.disputedAt ?? seed.disputedAt,
									disputeUpdatedAt:
										pv.disputeUpdatedAt ?? seed.disputeUpdatedAt,
									disputeNote: pv.disputeNote ?? seed.disputeNote,
									shiftSessionId: seed.weekStartIso
										? seed.shiftSessionId
										: (pv.shiftSessionId ?? seed.shiftSessionId),
									timeIn: seed.weekStartIso
										? undefined
										: (pv.timeIn ?? seed.timeIn),
									timeOut: seed.weekStartIso
										? undefined
										: (pv.timeOut ?? seed.timeOut),
									shiftTime: seed.weekStartIso
										? undefined
										: (pv.shiftTime ?? seed.shiftTime),
									receiptIds: pv.receiptIds?.length
										? pv.receiptIds
										: seed.receiptIds,
									rows:
										isDemoTimelinePv || seed.weekStartIso
											? seed.rows
											: pv.rows?.length
												? pv.rows.map((row, idx) => ({
														...seed.rows[idx],
														...row,
														receiptIds:
															row.receiptIds ?? seed.rows[idx]?.receiptIds,
													}))
												: seed.rows,
								};
							})
						: [];
				const persistedIds = new Set(mergedFromPersisted.map((pv) => pv.id));
				const missingSeedPvs = LIVE_SEED_PR_PVS.filter(
					(s) => !persistedIds.has(s.id),
				);
				const mergedPvsBase = remapSeedPaymentVouchers(
					persistedPvs.length > 0
						? [...mergedFromPersisted, ...missingSeedPvs]
						: LIVE_SEED_PR_PVS,
				);
				const seedScanById = Object.fromEntries(
					LIVE_SEED_RECEIPT_SCANS.map((s) => [s.id, s]),
				);
				const seedScanByRef = Object.fromEntries(
					LIVE_SEED_RECEIPT_SCANS.filter((s) => s.receiptRef).map((s) => [
						s.receiptRef!,
						s,
					]),
				);
				const persistedScans = p?.prReceiptScans ?? [];
				const userScans = persistedScans
					.filter((s) => !seedScanById[s.id])
					.map((s) => {
						const seed = seedScanByRef[s.receiptRef ?? ""];
						const base = { ...s, receiptRef: s.receiptRef ?? `LEGACY-${s.id}` };
						if (!seed || !isLegacyReceiptScanIdentity(s)) return base;
						return {
							...base,
							prId: seed.prId,
							prName: seed.prName,
							prCode: seed.prCode,
						};
					});
				const mergedScansBase = [
					...userScans,
					...LIVE_SEED_RECEIPT_SCANS.map((seed) =>
						mergePersistedReceiptScanWithSeed(
							seed,
							persistedScans.find((s) => s.id === seed.id),
						),
					),
				].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
				const persistedShiftRows = migrateShiftHistoryFinancials(
					migrateShiftHistoryPrNames(
						(p?.shiftHistory ?? []).map((row) => {
							const dateIso = migrateDemoDateIso(row.dateIso);
							return dateIso === row.dateIso
								? row
								: {
										...row,
										dateIso,
										dateDisplay: fmtDateLabelFromIso(dateIso),
									};
						}),
						current.shiftHistory,
					),
				);
				const mergedShiftHistory = prepareShiftHistoryForDisplay(
					migrateShiftHistoryFinancials(
						migrateShiftHistoryPrNames(
							mergeShiftHistory(persistedShiftRows, current.shiftHistory),
							current.shiftHistory,
						),
					),
				);
				const mergedAgencyPRsForLedger = normalizeAgencyPrs(
					mergeAgencyPRs(p?.agencyPRs, current.agencyPRs),
				);
				const demoLedger = mergeHistoryDemoLedger({
					shiftHistory: mergedShiftHistory,
					scans: mergedScansBase,
					pvs: mergedPvsBase,
					profile: getPrProfile("pr_tied"),
				});
				const mergedPvs = demoLedger.pvs;
				const mergedScans = syncAgencyPayrollReceiptScans(
					demoLedger.scans,
					mergedPvs,
					mergedAgencyPRsForLedger,
				);
				const mergedShiftHistorySynced = prepareShiftHistoryForDisplay(
					migrateShiftHistoryFinancials(
						migrateShiftHistoryPrNames(
							syncAgencyPayrollShiftHistory(
								mergedShiftHistory,
								mergedPvs,
								mergedAgencyPRsForLedger,
								// Rehydrate: the signed-in agency comes from the persisted blob.
								getPrAgencyById(
									p?.activeAgencyId ?? DEFAULT_TIED_AGENCY_ID,
								)?.name ?? "",
							),
							current.shiftHistory,
							mergedAgencyPRsForLedger,
						),
					),
				);
				const portalForAgencySync = {
					prDisplayName:
						p?.prDisplayName === "Luna"
							? null
							: (p?.prDisplayName ?? current.prDisplayName),
					prIcName: p?.prIcName ?? current.prIcName,
					prMobile: p?.prMobile ?? current.prMobile,
					prEmail: (() => {
						const raw = p?.prEmail ?? current.prEmail;
						if (!raw || raw.toLowerCase() === "luna@inz.my") return null;
						return raw;
					})(),
					prAvatarPhoto: migratePrPortfolioAssetPath(
						p?.prAvatarPhoto ?? current.prAvatarPhoto,
					),
					prComcard: {
						...(p?.prComcard ?? current.prComcard),
						imageUrl:
							migratePrPortfolioAssetPath(
								p?.prComcard?.imageUrl ?? current.prComcard.imageUrl,
							) ?? undefined,
					},
					prPortfolio: (p?.prPortfolio?.some(Boolean)
						? (p!.prPortfolio as (string | null)[])
						: current.prPortfolio
					).map((slot) => migratePrPortfolioAssetPath(slot)),
					prLanguages: p?.prLanguages?.length
						? p.prLanguages
						: current.prLanguages,
				};
				const seedAgencyById = Object.fromEntries(
					initialSnapshot.agencyPRs.map((s) => [s.id, s]),
				);
				const mergedAgencyPRs = mergedAgencyPRsForLedger.map((pr) => {
					let next = syncAgencyPrFromPrPortal(
						pr,
						TIED_DEMO_ROSTER_PR_ID,
						portalForAgencySync,
					);
					const seed = seedAgencyById[pr.id];
					if (seed && pr.id === TIED_DEMO_ROSTER_PR_ID) {
						next = {
							...next,
							name: next.name === "Luna" ? seed.name : next.name,
							email:
								!next.email || next.email.toLowerCase() === "luna@inz.my"
									? seed.email
									: next.email,
							avatarPhoto:
								migratePrPortfolioAssetPath(
									next.avatarPhoto ?? seed.avatarPhoto ?? null,
								) ??
								seed.avatarPhoto ??
								null,
							comcardImageUrl:
								migratePrPortfolioAssetPath(
									next.comcardImageUrl ?? seed.comcardImageUrl,
								) ?? seed.comcardImageUrl,
							portfolioPhotos: (next.portfolioPhotos?.some(Boolean)
								? next.portfolioPhotos
								: seed.portfolioPhotos
							)?.map((photo) => migratePrPortfolioAssetPath(photo) ?? photo),
						};
					} else if (seed?.comcardImageUrl) {
						next = {
							...next,
							comcardImageUrl:
								migratePrPortfolioAssetPath(
									next.comcardImageUrl ?? seed.comcardImageUrl,
								) ?? seed.comcardImageUrl,
						};
					}
					return next;
				});
				const merged = {
					...current,
					...p,
					prPaymentVouchers: mergedPvs,
					prPortfolio: (p?.prPortfolio?.some(Boolean)
						? [
								...p.prPortfolio,
								...Array(
									Math.max(0, PORTFOLIO_SLOT_COUNT - p.prPortfolio.length),
								).fill(null),
							].slice(0, PORTFOLIO_SLOT_COUNT)
						: current.prPortfolio
					).map((slot) => migratePrPortfolioAssetPath(slot)),
					prComcard: {
						...(p?.prComcard ?? current.prComcard),
						imageUrl:
							migratePrPortfolioAssetPath(
								p?.prComcard?.imageUrl ?? current.prComcard.imageUrl,
							) ?? undefined,
					},
					prLanguages: p?.prLanguages?.length
						? p.prLanguages
						: current.prLanguages,
					prDisplayName:
						p?.prDisplayName === "Luna"
							? null
							: (p?.prDisplayName ?? current.prDisplayName),
					prEmail: (() => {
						const raw = p?.prEmail ?? current.prEmail;
						if (!raw || raw.toLowerCase() === "luna@inz.my") return null;
						return raw;
					})(),
					prPayrollAgencyId: p?.prPayrollAgencyId ?? current.prPayrollAgencyId,
					prAgencies: p?.prAgencies ?? current.prAgencies,
					prNotifications: p?.prNotifications?.length
						? p.prNotifications
						: current.prNotifications,
					opsNotifications: p?.opsNotifications ?? current.opsNotifications,
					adminNotifications:
						p?.adminNotifications ?? current.adminNotifications ?? [],
					posIntegrationQuoteRequests:
						p?.posIntegrationQuoteRequests ??
						current.posIntegrationQuoteRequests ??
						[],
					sosIncidents: p?.sosIncidents ?? current.sosIncidents,
					notificationPrefs: p?.notificationPrefs ?? current.notificationPrefs,
					prDeclinedOfferIds:
						p?.prDeclinedOfferIds ?? current.prDeclinedOfferIds,
					prMarketplaceApplication:
						p?.prMarketplaceApplication ?? current.prMarketplaceApplication,
					prUpcomingShifts: remapSeedUpcomingShifts(
						p?.prUpcomingShifts?.length
							? p.prUpcomingShifts
							: current.prUpcomingShifts,
					),
					prSwapRequests: mergePrSwapRequests(
						p?.prSwapRequests,
						current.prSwapRequests,
						mergeAgencyRoster(p?.agencyRoster, initialSnapshot.agencyRoster),
					),
					prAgencyTiedAt: p?.prAgencyTiedAt ?? current.prAgencyTiedAt,
					prCheckInMeta: p?.prCheckInMeta ?? current.prCheckInMeta,
					prAvatarPhoto: migratePrPortfolioAssetPath(
						p?.prAvatarPhoto ?? current.prAvatarPhoto,
					),
					prReceiptScans: mergedScans.length
						? mergedScans
						: current.prReceiptScans,
					prActiveShift: p?.prActiveShift ?? current.prActiveShift,
					shiftHistory: migrateShiftHistoryFinancials(
						migrateShiftHistoryPrNames(
							mergedShiftHistorySynced,
							current.shiftHistory,
							mergedAgencyPRs,
						),
					),
					pendingPRs: mergePendingPRs(p?.pendingPRs, current.pendingPRs),
					pendingCutlostRequests:
						p?.pendingCutlostRequests ?? current.pendingCutlostRequests,
					agencyPRs: mergedAgencyPRs,
					specialServiceOrders: mergeSpecialServiceOrders(
						p?.specialServiceOrders,
						SEED_SPECIAL_SERVICES,
						mergedAgencyPRs,
					),
					prs: marketplacePrsFromAgency(mergedAgencyPRs),
					agencyRoster: (() => {
						const roster = rosterWithTiedPrAttendance(
							mergeAutoConfirmAgencyAssignments(
								mergeDemoHennessyRosterFloor(
									mergeDemoRosterAssignmentSlots(
										mergeAgencyRoster(
											p?.agencyRoster,
											initialSnapshot.agencyRoster,
										),
										initialSnapshot.agencyRoster,
									),
									initialSnapshot.agencyRoster,
								),
							),
							{
								prSubRole: p?.prSubRole ?? current.prSubRole,
								checkedIn: p?.checkedIn ?? current.checkedIn,
								checkedOut: p?.checkedOut ?? current.checkedOut,
								prActiveShift: p?.prActiveShift ?? current.prActiveShift,
								prSessionByRole:
									p?.prSessionByRole ?? current.prSessionByRole ?? {},
								prCheckInMeta: p?.prCheckInMeta ?? current.prCheckInMeta ?? {},
								agencyPRs: mergedAgencyPRs,
								acceptedShiftIndex:
									p?.acceptedShiftIndex ?? current.acceptedShiftIndex,
								agencyRoster: p?.agencyRoster ?? current.agencyRoster,
								shifts: p?.shifts ?? current.shifts,
							},
						);
						return syncEarlyReleasesToRoster(
							roster,
							p?.shifts ?? current.shifts,
						);
					})(),
					outletCommissionRules: (() => {
						const ws = normalizeOutletWorkspace(
							p?.outletWorkspace ?? current.outletWorkspace,
						);
						const legacyMult =
							p?.scalingTierMultipliers ?? current.scalingTierMultipliers;
						const rules = migrateLegacyOutletCommissionRules(
							ensureOutletRuleTierMultipliers(
								p?.outletCommissionRules?.length
									? p.outletCommissionRules
									: current.outletCommissionRules,
								legacyMult,
							),
						);
						return syncCommissionRulesFromWorkspace(ws, rules);
					})(),
					scalingTierMultipliers:
						p?.scalingTierMultipliers ?? current.scalingTierMultipliers,
					outletWorkspace: normalizeOutletWorkspace(
						p?.outletWorkspace ?? current.outletWorkspace,
					),
					// Persisted blobs written before 0113 carry the rules under
					// `outletWorkspace.penaltyRules`; normalize() fills the gap from
					// defaults either way, so an old blob rehydrates rather than
					// leaving the editor with three undefined rules.
					agencyPenaltyRules: normalizePenaltyRules(
						p?.agencyPenaltyRules ?? current.agencyPenaltyRules,
					),
					shifts: (() => {
						const ws = normalizeOutletWorkspace(
							p?.outletWorkspace ?? current.outletWorkspace,
						);
						const menu = ws.drinkMenu;
						const mergedRoster = rosterWithTiedPrAttendance(
							mergeAutoConfirmAgencyAssignments(
								mergeDemoHennessyRosterFloor(
									mergeDemoRosterAssignmentSlots(
										mergeAgencyRoster(
											p?.agencyRoster,
											initialSnapshot.agencyRoster,
										),
										initialSnapshot.agencyRoster,
									),
									initialSnapshot.agencyRoster,
								),
							),
							{
								prSubRole: p?.prSubRole ?? current.prSubRole,
								checkedIn: p?.checkedIn ?? current.checkedIn,
								checkedOut: p?.checkedOut ?? current.checkedOut,
								prActiveShift: p?.prActiveShift ?? current.prActiveShift,
								prSessionByRole:
									p?.prSessionByRole ?? current.prSessionByRole ?? {},
								prCheckInMeta: p?.prCheckInMeta ?? current.prCheckInMeta ?? {},
								agencyPRs: mergedAgencyPRs,
								acceptedShiftIndex:
									p?.acceptedShiftIndex ?? current.acceptedShiftIndex,
								agencyRoster: p?.agencyRoster ?? current.agencyRoster,
								shifts: p?.shifts ?? current.shifts,
							},
						);
						const merged = mergeDemoShiftDates(
							mergeDemoShiftStaffing(
								mergeDemoCalendarPastShifts(
									(p?.shifts ?? current.shifts).map((sh) =>
										migrateShiftTierRates(
											withShiftFinancialDefaults(sh, menu),
											ws,
										),
									),
									initialSnapshot.shifts,
								),
								initialSnapshot.shifts,
							),
							initialSnapshot.shifts,
						);
						return syncAgencyRosterToOutletShifts(merged, mergedRoster);
					})(),
					outletPnl: (() => {
						const ws = normalizeOutletWorkspace(
							p?.outletWorkspace ?? current.outletWorkspace,
						);
						const menu = ws.drinkMenu;
						const rules = p?.outletCommissionRules?.length
							? syncCommissionRulesFromWorkspace(ws, p.outletCommissionRules)
							: syncCommissionRulesFromWorkspace(
									ws,
									current.outletCommissionRules,
								);
						const shifts = (p?.shifts ?? current.shifts).map((sh) =>
							migrateShiftTierRates(withShiftFinancialDefaults(sh, menu), ws),
						);
						return recomputeAllOutletPnl(
							shifts,
							undefined,
							mergeAgencyRoster(p?.agencyRoster, initialSnapshot.agencyRoster),
							menu,
							rules,
						);
					})(),
					outletPnlSyncAt: p?.outletPnlSyncAt ?? current.outletPnlSyncAt,
					outletMoneyEditCount:
						p?.outletMoneyEditCount ?? current.outletMoneyEditCount,
					outletSettings:
						p?.outletSettings ??
						current.outletSettings ??
						DEFAULT_OUTLET_SETTINGS,
					outletOwner: (() => {
						const saved =
							p?.outletOwner ?? current.outletOwner ?? DEFAULT_OUTLET_OWNER;
						const merged = { ...DEFAULT_OUTLET_OWNER, ...saved };
						if (!merged.avatarPhoto && merged.orgName.trim() === "Velvet 23") {
							merged.avatarPhoto = VELVET_23_OUTLET_LOGO;
						}
						return merged;
					})(),
					outletSubscriptionBilling: syncOutletSubscriptionBilling(
						p?.outletSubscriptionBilling ??
							current.outletSubscriptionBilling ??
							OUTLET_SUBSCRIPTION_BILLING,
						(p?.outletOwner ?? current.outletOwner ?? DEFAULT_OUTLET_OWNER)
							.subscriptionPlanId,
					),
					outletFinanceHead:
						p?.outletFinanceHead ??
						current.outletFinanceHead ??
						DEFAULT_OUTLET_FINANCE_HEAD,
					outletOpsHead:
						p?.outletOpsHead ??
						current.outletOpsHead ??
						DEFAULT_OUTLET_OPS_HEAD,
					shiftApplicants: p?.shiftApplicants ?? current.shiftApplicants ?? [],
					agencyFinanceHead: (() => {
						const saved = p?.agencyFinanceHead;
						const base = current.agencyFinanceHead;
						if (!saved) return base;
						return {
							...base,
							...saved,
							signatureDataUrl: saved.signatureDataUrl ?? base.signatureDataUrl,
						};
					})(),
					agencyCollections: mergeAgencyCollections(
						p?.agencyCollections,
						current.agencyCollections,
					),
					agencyOwner: syncAgencyOwnerSubscriptionPlan(
						{
							...DEFAULT_AGENCY_OWNER,
							...current.agencyOwner,
							...p?.agencyOwner,
						},
						getAgencyManagedPvs(mergedPvs, mergedAgencyPRs),
						getPreviousWeekSundayIso(),
					),
					paymentCardLast4:
						p?.paymentCardLast4 ?? current.paymentCardLast4 ?? "4242",
					postSealRatePrompt: p?.postSealRatePrompt ?? null,
					prSessionByRole: p?.prSessionByRole ?? current.prSessionByRole ?? {},
					// Identity is never restored from storage. `partialize` stopped
					// writing these, but a blob written before that change still holds
					// them and `...p` above would happily re-apply the previous
					// operator's sub-role. Pin them to the initial state instead.
					role: current.role,
					agencySubRole: current.agencySubRole,
					outletSubRole: current.outletSubRole,
					user: current.user,
					activeAgencyId: current.activeAgencyId,
				};
				if (merged.prSubRole) {
					const role = merged.prSubRole;
					const cached = merged.prSessionByRole?.[role];
					const session =
						cached ??
						defaultPrShiftSessionForRole(role, {
							agencyRoster: merged.agencyRoster ?? [],
							prSwapRequests: merged.prSwapRequests ?? [],
						});
					Object.assign(merged, applyPrShiftSession(session));
				}
				return merged;
			},
		},
	),
);
