import {
	AgencyReceiptsPanel,
	receiptsInPayrollWeek,
} from "@agency-portal/components/agency/AgencyReceiptsPanel";
import { CancellationFeesPanel } from "@agency-portal/components/agency/CancellationFeesPanel";
import { DisputeQueuePanel } from "@agency-portal/components/agency/DisputeQueuePanel";
import { OvertimeQueuePanel } from "@agency-portal/components/agency/OvertimeQueuePanel";
import { PayrollVerifyPanel } from "@agency-portal/components/agency/PayrollVerifyPanel";
import { UnchargedFeesPanel } from "@agency-portal/components/agency/UnchargedFeesPanel";
import { PvSummaryView } from "@agency-portal/components/iz/PvSummaryView";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { SignatureInkMark } from "@agency-portal/components/iz/SignatureInkMark";
import {
	formatRM,
	IzCard,
	IzCardTitle,
	IzKpiLabel,
	IzPageTitle,
	IzPill,
} from "@agency-portal/components/iz/ui";
import { PortalBackButton } from "@agency-portal/components/Nav";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { PrSignaturePad } from "@agency-portal/components/pr/PrSignaturePad";
import { useAgencyDisputes } from "@agency-portal/hooks/use-agency-disputes";
import { useAgencyOvertime } from "@agency-portal/hooks/use-agency-overtime";
import { useAgencyPvDayReview } from "@agency-portal/hooks/use-agency-pv-day-review";
import {
	isBackedVoucherId,
	useAgencyPvDetail,
	useAgencyPvs,
	useVoucherPayeeBank,
} from "@agency-portal/hooks/use-agency-pvs";
import { useAgencyReceipts } from "@agency-portal/hooks/use-agency-receipts";
import { useMySignature } from "@agency-portal/hooks/use-my-signature";
import { usePvIssuer } from "@agency-portal/hooks/use-pv-issuer";
import {
	agencySubscriptionBillingForWeeklyPv,
	nowAgencyDateTime,
	ownedByAgency,
} from "@agency-portal/lib/agency-demo";
import {
	agencyPvStatusLabel,
	getAgencyManagedReceiptScans,
	receiptsForPv,
	resolvePvPrLabel,
	resolvePvPrName,
} from "@agency-portal/lib/agency-payroll";
import { AGENCY_SUB_ROLE_LABELS } from "@agency-portal/lib/agency-rbac";
import {
	DEMO_PV_ISSUED_WEEKS_AGO,
	demoPayrollWeekBoundsForWeeksAgo,
	downloadPvReceipt,
	FINANCE_HEAD_LABEL,
	getLatestPvIssuedMs,
	getPvNetTotal,
	getPvSalesTotal,
	PAYROLL_CYCLE,
	type PrPaymentVoucher,
	type PrPvRow,
	type PrPvStatus,
	type PrReceiptScan,
	parsePvIssuedMs,
	pvStatusPillVariant,
	receiptEntryLoggedLabel,
	receiptEntryMethod,
	receiptEntryMethodLabel,
	receiptStatusLabel,
	reconcilePvTotals,
	resolvePvPayByDue,
	sortPvsBySales,
} from "@agency-portal/lib/pr-demo";
import {
	disputeDaysRemaining,
	PV_WORKFLOW_STEPS,
	type PvEarningsBreakdown,
	pvWorkflowStepIndex,
	summarizePv,
} from "@agency-portal/lib/pv-breakdown";
import { downloadPvBreakdownCsv } from "@agency-portal/lib/pv-pdf";
import {
	buildAgencyPayee,
	formatPvSignStamp,
} from "@agency-portal/lib/pv-template";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	CheckCircle2,
	ChevronRight,
	Clock,
	FileText,
	Filter,
	Pencil,
	Receipt,
	Send,
	Sheet,
	Shield,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { dayMonthLabel } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { createVoucherExportTicket } from "@/services/payment-voucher";
export const Route = createFileRoute("/agency/pv")({
	component: AgencyPV,
	validateSearch: (
		search: Record<string, unknown>,
	): {
		status?: PvStatusFilter;
		pv?: string;
		tab?: PvSubTab;
		receipt?: string;
	} => {
		const status = search.status;
		const valid: PvStatusFilter[] = [
			"PENDING_REVIEW",
			"SENT",
			"SIGNED",
			"DISPUTED",
			"TO_PAY",
		];
		let statusFilter: PvStatusFilter | undefined;
		if (
			typeof status === "string" &&
			valid.includes(status as PvStatusFilter)
		) {
			statusFilter = status as PvStatusFilter;
		}
		const pv =
			typeof search.pv === "string" && search.pv.trim()
				? search.pv.trim()
				: undefined;
		/**
		 * A specific receipt to land on.
		 *
		 * `?tab=receipts` alone was not enough: the receipts list is scoped to the
		 * selected WEEK, so a link from the home page opened whichever week the
		 * page defaults to and showed a list the receipt was not in. The id lets
		 * the page pick the week that actually holds it.
		 */
		const receipt =
			typeof search.receipt === "string" && search.receipt.trim()
				? search.receipt.trim()
				: undefined;
		/**
		 * Which SUB-tab to open on.
		 *
		 * Needed because a dispute is its OWN row, keyed to a day and a component —
		 * it is not a voucher status. So a link from the agency home cannot aim at
		 * one with `?status=DISPUTED`: that filters the voucher list by a status the
		 * voucher does not hold and lands on "No vouchers match these filters" while
		 * the dispute sits one sub-tab away.
		 */
		const validTabs: PvSubTab[] = [
			"vouchers",
			"receipts",
			"disputes",
			"overtime",
		];
		const tab =
			typeof search.tab === "string" &&
			validTabs.includes(search.tab as PvSubTab)
				? (search.tab as PvSubTab)
				: undefined;
		return { status: statusFilter, pv, tab, receipt };
	},
});

function statusPill(status: PrPvStatus) {
	return pvStatusPillVariant(status);
}

type PvStatusFilter = "all" | "TO_PAY" | PrPvStatus;

type PayrollWeekTab = "this_week" | "last_week" | "last_last_week";

/*
 * "payouts" is GONE (owner's call, 3 Sep 2026): *"remove the payout run
 * completely"*. The Payout runs tab rendered on This Week and Last Week only —
 * the two weeks nobody pays from — and duplicated what the PAYMENT week's
 * "Signed PVs · manual payment" lane already does, one voucher at a time.
 *
 * The batch itself is NOT deleted: `PayoutRunsPanel`, `use-payout-batches` and
 * the backend's /payout-batch routes are all still here and still tested. What
 * is gone is the way in. Removing the tab rather than the feature keeps the
 * bank-file lane recoverable by mounting it somewhere, instead of needing it
 * rebuilt — and leaves the settled runs in the database addressable.
 */
type PvSubTab = "vouchers" | "receipts" | "disputes" | "overtime";

/**
 * What last week's tab shows — every state a voucher for that week can be in,
 * INCLUDING signed.
 *
 * SIGNED was missing, and the effect was that a voucher vanished from the tab at
 * the exact moment it became real: PV-000004 for 26 Jul–01 Aug sat in the PR's
 * History as "Signed 4 Aug 2026 · RM 700.00" while the agency's Last Week tab
 * for that same week read "0 PVs · No vouchers match these filters". The one
 * screen an agency uses to look back at a week could not show the week's only
 * voucher.
 *
 * PAID is still absent and stays absent: `payrollActivePvs` drops it, because a
 * paid voucher belongs to History. Signed-but-unpaid is the state this tab most
 * needs to show — it is the money still owed.
 */
const LAST_WEEK_REVIEW_STATUSES = new Set<PrPvStatus>([
	"SENT",
	"PENDING_REVIEW",
	"DISPUTED",
	"SIGNED",
]);

/**
 * Does this voucher belong to the tab covering `weekStartIso`–`weekEndIso`?
 *
 * The tabs are Sun–Sat payroll weeks, and since 3 Aug 2026 so is the backend —
 * `week_start` is now a SUNDAY, matching this screen exactly.
 *
 * Matching stays containment-based rather than string equality even though the
 * two now agree. It was written because they did NOT agree: a Sunday tab start
 * could never equal a Monday `week_start`, and equality silently hid every real
 * voucher here. Containment is correct under either convention — a date sits in
 * exactly one Sun–Sat week — so it is the test that cannot break again if the
 * cadence is ever changed. The row still prints its own week wherever one
 * diverges, rather than letting the tab label speak for it.
 */
function pvBelongsToPayrollWeek(
	pv: PrPaymentVoucher,
	weekStartIso: string,
	weekEndIso: string,
	lastWeekStart: string,
	lastLastWeekStart: string,
): boolean {
	if (pv.weekStartIso) {
		return pv.weekStartIso >= weekStartIso && pv.weekStartIso <= weekEndIso;
	}
	const weeksAgo = DEMO_PV_ISSUED_WEEKS_AGO[pv.id];
	if (weeksAgo === 0) return weekStartIso === lastWeekStart;
	if (weeksAgo === 1) return weekStartIso === lastLastWeekStart;
	return false;
}

/**
 * `label` is a FUNCTION of the dictionary, not a string.
 *
 * This sits at module scope, where the locale hook cannot run, so it cannot
 * hold finished copy. It also must not hold a dictionary KEY: a key is itself a
 * `string`, so rendering one type-checks perfectly and ships "statusSent" to
 * the screen — which is exactly what happened here. A resolver function cannot
 * be rendered by accident; forgetting to call it is a type error.
 *
 * `value` stays the API's enum — it is what the chip writes to `?status=`.
 */
const PV_STATUS_FILTERS: {
	value: PvStatusFilter;
	label: (t: PortalTranslations) => string;
}[] = [
	{ value: "all", label: (t) => t.common.all },
	{ value: "PENDING_REVIEW", label: (t) => t.payroll.statusPendingReview },
	{ value: "SENT", label: (t) => t.payroll.statusSent },
	{ value: "DISPUTED", label: (t) => t.payroll.statusDisputed },
	{ value: "TO_PAY", label: (t) => t.payroll.statusSigned },
];

function statusFiltersForWeek(tab: PayrollWeekTab) {
	// "To pay" only means something once a PR has signed, which cannot have
	// happened for a week still running or one awaiting review.
	if (tab === "last_week" || tab === "this_week") {
		return PV_STATUS_FILTERS.filter((f) => f.value !== "TO_PAY");
	}
	return PV_STATUS_FILTERS;
}

/**
 * "2026-07-20" -> "20 Jul", so a week range reads "20 Jul – 26 Jul 2026".
 *
 * `T00:00:00` keeps the parse LOCAL — a bare `YYYY-MM-DD` is UTC midnight,
 * which in Asia/Kuala_Lumpur draws the previous day — so the label is read off
 * the local parts and the helper is called with `utc` left false.
 *
 * The month word comes from the dictionary rather than a hardcoded `"en-GB"`,
 * which pinned English regardless of the language switch. `t` is a PARAMETER,
 * last and with no default: module scope cannot call a hook, and a default
 * would pin the label to one language just as firmly as the old tag did.
 */
function shortIsoDay(iso: string, t: PortalTranslations): string {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return dayMonthLabel(d, t);
}

/**
 * The week a BACKEND voucher itself covers, or null for a demo one (whose
 * `cycle` string already is a date range).
 *
 * Still needed after the weeks were aligned to Sun–Sat (3 Aug 2026): the
 * backend's `cycle` column holds a CADENCE ("Weekly"), not a range, so without
 * this the row shows no dates at all and the only week on screen is the tab's.
 */
function pvOwnWeekLabel(
	pv: PrPaymentVoucher,
	t: PortalTranslations,
): string | null {
	if (!pv.weekStartIso || !pv.weekEndIso) return null;
	const year = pv.weekEndIso.slice(0, 4);
	return `${shortIsoDay(pv.weekStartIso, t)} – ${shortIsoDay(pv.weekEndIso, t)} ${year}`;
}

/**
 * The statuses a voucher for the CURRENT, still-running week can legitimately
 * hold. Same set as last week's: the week being open does not stop an agency
 * reviewing what has accrued so far, and a voucher already sent mid-week (it
 * happens) must not vanish from the only screen that can chase it.
 */
const THIS_WEEK_STATUSES = LAST_WEEK_REVIEW_STATUSES;

function AgencyPV() {
	const { t } = usePortalLocale();
	const navigate = useNavigate();
	const {
		status: statusFromSearch,
		pv: pvFromSearch,
		tab: tabFromSearch,
		receipt: receiptFromSearch,
	} = Route.useSearch();
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const prReceiptScans = useStore((s) => s.prReceiptScans ?? []);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const agencySubRole = useStore((s) => s.agencySubRole);
	const can = useAgencyCan();
	// Tenant scoping — attribute receipts to this agency via its OWNED PRs so a
	// shared PR (member of both agencies) never drags the other agency's payroll in.
	const agencyPRs = useMemo(
		() => ownedByAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	// Vouchers come from the backend (already agency-scoped server-side); the
	// Receipts sub-tab stays on the demo store — no backend for receipt scans.
	const { pvs: prPaymentVouchers } = useAgencyPvs();
	const [detailId, setDetailId] = useState<string | null>(null);
	const [payrollWeekTab, setPayrollWeekTab] =
		useState<PayrollWeekTab>("last_week");
	const [pvSubTab, setPvSubTab] = useState<PvSubTab>("vouchers");
	// Counts only. Both panels fetch the same queries themselves, and React Query
	// dedupes, so this costs no extra request. The COUNT is the point: these two
	// used to sit open above the fold, and an undecided overtime claim is WHY the
	// week below refuses to send — hiding that behind a click with no number
	// would turn a visible blocker into an invisible one.
	const { disputes: openDisputes } = useAgencyDisputes();
	const { claims: pendingOtClaims } = useAgencyOvertime();
	const [statusFilter, setStatusFilter] = useState<PvStatusFilter>("all");
	// Count only — the panel below runs the same query and React Query dedupes it.
	const { receipts: backendReceipts } = useAgencyReceipts();
	const { date, time } = nowAgencyDateTime();

	const payrollActivePvs = useMemo(
		() => prPaymentVouchers.filter((p) => p.status !== "PAID"),
		[prPaymentVouchers],
	);

	const paid = prPaymentVouchers.filter((p) => p.status === "PAID").length;

	const agencyReceiptScans = useMemo(
		() =>
			getAgencyManagedReceiptScans(
				prReceiptScans,
				agencyPRs,
				prPaymentVouchers,
			),
		[prReceiptScans, agencyPRs, prPaymentVouchers],
	);

	// -1 = the week still running. Same Sun–Sat shape as the other two, so the
	// three tabs are one convention rather than a special case bolted on.
	const thisWeekBounds = useMemo(
		() => demoPayrollWeekBoundsForWeeksAgo(-1),
		[],
	);
	const lastWeekBounds = useMemo(() => demoPayrollWeekBoundsForWeeksAgo(0), []);
	const lastLastWeekBounds = useMemo(
		() => demoPayrollWeekBoundsForWeeksAgo(1),
		[],
	);

	const thisWeekPvs = useMemo(() => {
		return payrollActivePvs.filter(
			(p) =>
				pvBelongsToPayrollWeek(
					p,
					thisWeekBounds.weekStartIso,
					thisWeekBounds.weekEndIso,
					lastWeekBounds.weekStartIso,
					lastLastWeekBounds.weekStartIso,
				) && THIS_WEEK_STATUSES.has(p.status),
		);
	}, [
		payrollActivePvs,
		thisWeekBounds.weekStartIso,
		thisWeekBounds.weekEndIso,
		lastWeekBounds.weekStartIso,
		lastLastWeekBounds.weekStartIso,
	]);

	const lastWeekPvs = useMemo(() => {
		return payrollActivePvs.filter(
			(p) =>
				pvBelongsToPayrollWeek(
					p,
					lastWeekBounds.weekStartIso,
					lastWeekBounds.weekEndIso,
					lastWeekBounds.weekStartIso,
					lastLastWeekBounds.weekStartIso,
				) && LAST_WEEK_REVIEW_STATUSES.has(p.status),
		);
	}, [
		payrollActivePvs,
		lastWeekBounds.weekStartIso,
		lastWeekBounds.weekEndIso,
		lastLastWeekBounds.weekStartIso,
	]);

	/**
	 * The payment week — EVERY voucher in it, not only the signed ones.
	 *
	 * By this week a voucher is *expected* to be signed and ready to pay, and the
	 * tab was written to show only `SIGNED` on that basis. But this is the ONLY
	 * tab whose window contains a two-week-old voucher, so filtering by status
	 * made an unsigned one invisible everywhere: the agency could not review it,
	 * could not send it, and the PR could therefore never sign it — RM 875.00 with
	 * no screen in the whole product, and nothing anywhere saying so.
	 *
	 * A voucher that missed its window is the exception the agency most needs to
	 * see. So the tab shows the week and flags what has not been signed; the
	 * "To pay" status chip still isolates the signed ones for the payment run.
	 */
	/**
	 * PLUS every SIGNED voucher, whatever week it belongs to.
	 *
	 * OWNER RULE (4 Aug 2026): *"after the pr sign the pv, the pv should come out
	 * at the payment week section"*. This tab is the PAYMENT QUEUE — the screen
	 * that answers "who am I paying now" — and it was filtering by CALENDAR DATE
	 * alone. So PV-000004, signed by the PR at 16:30 on 4 Aug, stayed in Last Week
	 * because its week was 26 Jul–01 Aug, while PV-000002 sat here purely by being
	 * older. Signing changed nothing on the one screen that pays it.
	 *
	 * A signature is what makes a voucher payable, so a signature is what puts it
	 * in the queue. `payrollActivePvs` has already dropped PAID, so a voucher
	 * leaves again the moment it is paid.
	 *
	 * It stays in its own week tab as well, deliberately. Removing it there would
	 * mean an agency looking for last week's voucher — by the week it was worked,
	 * which is how everyone refers to it — would not find it where they looked.
	 */
	const lastLastWeekPvs = useMemo(() => {
		const inWindow = payrollActivePvs.filter((p) =>
			pvBelongsToPayrollWeek(
				p,
				lastLastWeekBounds.weekStartIso,
				lastLastWeekBounds.weekEndIso,
				lastWeekBounds.weekStartIso,
				lastLastWeekBounds.weekStartIso,
			),
		);
		/*
		 * EVERYTHING still outstanding, not just the signed ones (owner, 24 Aug).
		 *
		 * The rescue used to read `status === "SIGNED"`, which caught the vouchers
		 * that were already payable and dropped every other kind on the floor.
		 * A voucher that had been SENT but not yet signed, from a week older than
		 * this window, matched no tab at all: not This Week, not Last Week, not
		 * here — because all three test containment on `weekStartIso` and it had
		 * simply aged past the last of them. PV-000006 (02–08 Aug, RM 3,708.20)
		 * was visible on 20 Aug, when this window WAS 02–08 Aug, and vanished when
		 * the window rolled forward on Sunday. DISPUTED and PENDING_REVIEW aged
		 * out the same way. The one voucher the page most wants chased is the
		 * overdue unsigned one, and it was the one that disappeared.
		 *
		 * So the queue now holds every voucher that is not finished. `status` is
		 * not tested at all: `payrollActivePvs` has already dropped PAID, and PAID
		 * is precisely what "resolved" means here — a voucher leaves this tab by
		 * being paid, never by growing old.
		 *
		 * In-window first, everything else after, so the week this tab is named
		 * for still reads as its subject rather than being lost in the queue.
		 * Duplication across tabs is deliberate and pre-existing: an agency
		 * looking for a voucher by the week it was WORKED still finds it there.
		 */
		const seen = new Set(inWindow.map((p) => p.id));
		const stillOutstanding = payrollActivePvs.filter((p) => !seen.has(p.id));
		return [...inWindow, ...stillOutstanding];
	}, [
		payrollActivePvs,
		lastWeekBounds.weekStartIso,
		lastLastWeekBounds.weekStartIso,
		lastLastWeekBounds.weekEndIso,
	]);

	const weekTabPvs = useMemo(() => {
		if (payrollWeekTab === "this_week") return thisWeekPvs;
		if (payrollWeekTab === "last_week") return lastWeekPvs;
		return lastLastWeekPvs;
	}, [payrollWeekTab, thisWeekPvs, lastWeekPvs, lastLastWeekPvs]);

	/**
	 * The first week tab actually holding a voucher of this status, newest first,
	 * or null if none does.
	 *
	 * Exists because a link that names a status must land where that status lives.
	 * Reading it from the data rather than hardcoding a tab means the payout cadence
	 * can move without this going stale — which is exactly how the previous
	 * hardcoded "last_week" ended up pointing at an empty list.
	 */
	const tabHoldingStatus = useCallback(
		(status: PrPvStatus): PayrollWeekTab | null => {
			const holds = (list: PrPaymentVoucher[]) =>
				list.some((p) => p.status === status);
			if (holds(thisWeekPvs)) return "this_week";
			if (holds(lastWeekPvs)) return "last_week";
			if (holds(lastLastWeekPvs)) return "last_last_week";
			return null;
		},
		[thisWeekPvs, lastWeekPvs, lastLastWeekPvs],
	);

	/**
	 * Which tab's list actually holds THIS voucher.
	 *
	 * Membership is not re-derived here: it asks the same three lists the tabs
	 * render, so a voucher can never be "in" a week the tab would not show it
	 * in. `pvBelongsToPayrollWeek` stays the single authority.
	 */
	const tabHoldingPv = useCallback(
		(pvId: string): PayrollWeekTab | null => {
			const holds = (list: PrPaymentVoucher[]) =>
				list.some((p) => p.id === pvId);
			if (holds(thisWeekPvs)) return "this_week";
			if (holds(lastWeekPvs)) return "last_week";
			if (holds(lastLastWeekPvs)) return "last_last_week";
			return null;
		},
		[thisWeekPvs, lastWeekPvs, lastLastWeekPvs],
	);

	useEffect(() => {
		// An explicit `?tab=` wins over the status branches below, which all assume
		// the caller meant the voucher list. A dispute link carries no status —
		// there is no voucher status that means "a dispute exists" — so without
		// this the link would land on Vouchers and show the wrong thing.
		if (tabFromSearch) setPvSubTab(tabFromSearch);
		if (statusFromSearch === ("PAID" as PvStatusFilter)) {
			void navigate({
				to: "/agency/history",
				search: { tab: "paid" },
				replace: true,
			});
			return;
		}
		if (statusFromSearch === "TO_PAY" || statusFromSearch === "SIGNED") {
			setPayrollWeekTab("last_last_week");
			setPvSubTab("vouchers");
			setStatusFilter(statusFromSearch === "TO_PAY" ? "TO_PAY" : "all");
		} else if (
			statusFromSearch === "SENT" ||
			statusFromSearch === "PENDING_REVIEW" ||
			statusFromSearch === "DISPUTED"
		) {
			// Whichever week actually holds a voucher of this status, rather than a
			// hardcoded "last_week". A real pending_review voucher lives in the week
			// still RUNNING, so the agency home's "Pending Agency Review" link landed
			// on Last Week and reported "No vouchers match these filters" while two
			// waited one tab away. last_week stays the fallback, so an empty result
			// still lands somewhere deliberate.
			setPayrollWeekTab(tabHoldingStatus(statusFromSearch) ?? "last_week");
			setPvSubTab("vouchers");
			setStatusFilter(statusFromSearch);
		} else if (statusFromSearch && statusFromSearch !== "PAID") {
			setStatusFilter(statusFromSearch);
		}
		if (pvFromSearch) {
			setDetailId(pvFromSearch);
			/*
			 * The week tab follows the VOUCHER, overriding the status-derived pick
			 * above.
			 *
			 * `?status=` says which KIND of voucher the caller meant; the voucher
			 * itself says which WEEK it belongs to, and only the second one is a
			 * fact about the thing on screen. The agency home links carry both, and
			 * with only the status consulted the tab landed on whichever week held
			 * *a* voucher of that status — This Week, for anything pending review.
			 * The detail then covered the wrong list, and pressing Return revealed
			 * it: a Last Week voucher closed onto the This Week tab.
			 *
			 * Left alone when the voucher is in none of the three lists, so an
			 * unresolvable id keeps the deliberate status pick rather than
			 * snapping somewhere arbitrary.
			 */
			const pvTab = tabHoldingPv(pvFromSearch);
			if (pvTab) setPayrollWeekTab(pvTab);
		}
		// tabHoldingStatus is a dependency on purpose: on first paint the vouchers
		// have not arrived, so the pick above would fall back and stick. Re-running
		// once they load is what makes it land on the right tab — and it cannot then
		// fight a manual tab click, because selectPayrollWeekTab clears these params.
		// tabFromSearch is a real dependency, not a lint appeasement: the sub-tab
		// buttons now clear it (see selectPvSubTab), so a re-run cannot fight a
		// manual click — which is exactly what listing it here would otherwise cause.
	}, [
		statusFromSearch,
		pvFromSearch,
		tabFromSearch,
		navigate,
		tabHoldingStatus,
		// Same reason as tabHoldingStatus: the lists are empty on first paint, so
		// the voucher resolves to no tab until they load. Re-running once they do
		// is what makes the tab land under the open detail.
		tabHoldingPv,
	]);

	const latestIssuedMs = useMemo(
		() => getLatestPvIssuedMs(weekTabPvs),
		[weekTabPvs],
	);

	const activeWeekBounds =
		payrollWeekTab === "last_last_week"
			? lastLastWeekBounds
			: payrollWeekTab === "this_week"
				? thisWeekBounds
				: lastWeekBounds;

	/**
	 * The dispute / overtime counts on the sub-tab labels, scoped to the SELECTED
	 * week — a dispute by its contested day, a claim by the night it was worked.
	 *
	 * These read the same two lists the panels themselves filter, and must use the
	 * same anchor, or the badge says 1 while the panel below it says none. That
	 * disagreement is worse than either number alone: it makes the screen look
	 * broken rather than empty.
	 */
	const weekOpenDisputes = useMemo(
		() =>
			openDisputes.filter(
				(d) =>
					d.disputeDate &&
					d.disputeDate >= activeWeekBounds.weekStartIso &&
					d.disputeDate <= activeWeekBounds.weekEndIso,
			),
		[openDisputes, activeWeekBounds.weekStartIso, activeWeekBounds.weekEndIso],
	);

	const weekPendingOtClaims = useMemo(
		() =>
			pendingOtClaims.filter((c) => {
				if (!c.shiftDate) return false;
				const day = c.shiftDate.slice(0, 10);
				return (
					day >= activeWeekBounds.weekStartIso &&
					day <= activeWeekBounds.weekEndIso
				);
			}),
		[
			pendingOtClaims,
			activeWeekBounds.weekStartIso,
			activeWeekBounds.weekEndIso,
		],
	);

	/*
	 * IS THE OVERTIME TAB OFFERED ON THIS WEEK?
	 *
	 * Everywhere except the payment week: yes. On the PAYMENT week it was hidden
	 * outright (owner's rule, 3 Aug 2026) on the premise that "by then every
	 * voucher is signed, and a signed voucher's figures are settled". That
	 * premise stopped holding — the payment week now lists UNSIGNED vouchers too,
	 * which the status-chip comment below already acknowledges — and the
	 * consequence was reported on 3 Sep 2026: PV-000009's two undecided claims
	 * sat on a week whose only control for deciding them was not rendered. The
	 * panel's own cross-week line said "switch weeks above to decide them",
	 * naming a week that then offered no tab to switch to.
	 *
	 * So it appears exactly when there is something to decide, which honours the
	 * original rule in the case that rule was written for: a genuinely settled
	 * payment week has no pending claim, so it still shows no tab. `pvSubTab`
	 * keeps it alive while it is the one selected, so deciding the last claim
	 * cannot pull the panel out from under the person deciding it.
	 */
	const showOvertimeTab =
		payrollWeekTab !== "last_last_week" ||
		weekPendingOtClaims.length > 0 ||
		pvSubTab === "overtime";

	const activeWeekStats = useMemo(() => {
		const signed = weekTabPvs.filter((p) => p.status === "SIGNED");
		const prCount = new Set(
			weekTabPvs.map((p) => resolvePvPrName(p, agencyPRs)),
		).size;
		const pvCount = weekTabPvs.length;
		return {
			prCount,
			pvCount,
			pendingPayout:
				Math.round(signed.reduce((sum, p) => sum + getPvNetTotal(p), 0) * 100) /
				100,
			signedCount: signed.length,
			signedTotal:
				Math.round(signed.reduce((sum, p) => sum + getPvNetTotal(p), 0) * 100) /
				100,
		};
	}, [weekTabPvs, agencyPRs]);

	const activeWeekBilling = useMemo(
		() => agencySubscriptionBillingForWeeklyPv(activeWeekStats.pvCount, t),
		[activeWeekStats.pvCount, t],
	);

	/**
	 * The DATABASE's receipts for the selected week — what the Receipts sub-tab
	 * counts and lists.
	 *
	 * Anchored on the voucher's own `week_start`, the same containment rule the
	 * voucher rows use, rather than on when the receipt was uploaded: a receipt
	 * logged on Monday for last week's shift is last week's money.
	 */
	const activeWeekReceipts = useMemo(
		() =>
			receiptsInPayrollWeek(
				backendReceipts,
				activeWeekBounds.weekStartIso,
				activeWeekBounds.weekEndIso,
			),
		[
			backendReceipts,
			activeWeekBounds.weekStartIso,
			activeWeekBounds.weekEndIso,
		],
	);

	/**
	 * Forget where the caller asked us to land. Shared by the week tabs and the
	 * sub-tabs so there is one rule about when a landing instruction expires —
	 * having each button decide for itself is how one of them kept re-applying it.
	 */
	const clearLandingParams = () => {
		if (statusFromSearch || pvFromSearch || tabFromSearch) {
			void navigate({ to: "/agency/pv", search: {}, replace: true });
		}
	};

	const selectPayrollWeekTab = (tab: PayrollWeekTab) => {
		setPayrollWeekTab(tab);
		setStatusFilter("all");
		// The payment week hides Disputes, so landing on it while that is selected
		// would leave a panel open with no tab above it — and no way back except
		// guessing. Fall back to the tab that always exists.
		//
		// Overtime is NOT bounced any more: `showOvertimeTab` keeps its button
		// rendered whenever it is the selected tab, so the panel and its tab arrive
		// together. Bouncing it was the other half of the 3 Sep report — following
		// the panel's own "switch weeks above" advice landed the user on the
		// Vouchers tab instead, which reads as the claims having disappeared.
		if (tab === "last_last_week" && pvSubTab === "disputes") {
			setPvSubTab("vouchers");
		}
		// Drop the incoming ?status/?pv/?tab. They are an instruction about where to
		// land, and once the user has picked a tab themselves that instruction is
		// spent — leaving it in the URL lets the effect above re-apply it on the next
		// refetch and pull them off the tab they just chose.
		clearLandingParams();
	};

	/**
	 * Picking a sub-tab by hand, which also spends the `?tab=` instruction.
	 *
	 * The buttons called `setPvSubTab` directly. That was safe only while nothing
	 * in the URL named a sub-tab; now that a link from the agency home does, a bare
	 * setter would be undone the next time the landing effect re-runs — and it
	 * re-runs on every voucher refetch — snapping the user back to Disputes
	 * seconds after they clicked Receipts.
	 */
	const selectPvSubTab = (next: PvSubTab) => {
		setPvSubTab(next);
		clearLandingParams();
	};

	const statusFilteredPvs = useMemo(() => {
		if (statusFilter === "all") return weekTabPvs;
		if (statusFilter === "TO_PAY" || statusFilter === "SIGNED") {
			return weekTabPvs.filter((p) => p.status === "SIGNED");
		}
		return weekTabPvs.filter((p) => p.status === statusFilter);
	}, [weekTabPvs, statusFilter]);

	// The status chips apply on every tab now, including the payment week. They
	// were bypassed there because that tab held only SIGNED vouchers and a filter
	// over one status is pointless — now that it shows unsigned ones too, "To pay"
	// is what narrows it back down to the payment run.
	const filteredVouchers = useMemo(
		() => sortPvsBySales(statusFilteredPvs, "default"),
		[statusFilteredPvs],
	);

	/**
	 * Payment-week vouchers nobody has signed — overdue by the screen's own rule.
	 * Counted rather than hidden: this is the number that says money is stuck.
	 */
	const unsignedPaymentWeekPvs = useMemo(
		() => lastLastWeekPvs.filter((p) => p.status !== "SIGNED"),
		[lastLastWeekPvs],
	);

	const visibleStatusFilters = useMemo(
		() => statusFiltersForWeek(payrollWeekTab),
		[payrollWeekTab],
	);

	/**
	 * Land on the week that actually CONTAINS the linked receipt.
	 *
	 * `?tab=receipts` alone dropped the operator on whichever week the page
	 * defaults to (Last Week) — so clicking jk's receipt on the home page opened
	 * a list jk's receipt was not in, and it read as the link being broken.
	 *
	 * Anchored on the receipt's own date and matched against the same three week
	 * ranges the tabs use, so the tab that opens is the tab whose list holds it.
	 * If it belongs to none of them (older than the payment week) the tab is left
	 * alone rather than silently showing an unrelated week.
	 */
	useEffect(() => {
		if (!receiptFromSearch) return;
		const target = backendReceipts.find((r) => r.id === receiptFromSearch);
		const day = target?.receiptDate?.slice(0, 10);
		if (!day) return;
		const inRange = (b: { weekStartIso: string; weekEndIso: string }) =>
			day >= b.weekStartIso && day <= b.weekEndIso;
		if (inRange(thisWeekBounds)) setPayrollWeekTab("this_week");
		else if (inRange(lastWeekBounds)) setPayrollWeekTab("last_week");
		else if (inRange(lastLastWeekBounds)) setPayrollWeekTab("last_last_week");
	}, [
		receiptFromSearch,
		backendReceipts,
		thisWeekBounds,
		lastWeekBounds,
		lastLastWeekBounds,
	]);

	useEffect(() => {
		// "To pay" is offered only on the Payment Week tab; leaving it selected while
		// switching to a week that cannot have signed vouchers filters the list to
		// nothing and reads as an empty week.
		if (payrollWeekTab !== "last_last_week" && statusFilter === "TO_PAY") {
			setStatusFilter("all");
		}
	}, [payrollWeekTab, statusFilter]);

	const statusCounts = useMemo(() => {
		const counts: Record<PvStatusFilter, number> = {
			all: weekTabPvs.length,
			PENDING_REVIEW: 0,
			SENT: 0,
			SIGNED: 0,
			TO_PAY: 0,
			DISPUTED: 0,
			PAID: 0,
		};
		for (const p of weekTabPvs) {
			counts[p.status] += 1;
			if (p.status === "SIGNED") counts.TO_PAY += 1;
		}
		return counts;
	}, [weekTabPvs]);

	const hasActiveFilters = statusFilter !== "all";

	const clearFilters = () => {
		setStatusFilter("all");
	};

	const detail = prPaymentVouchers.find((p) => p.id === detailId);

	if (detail) {
		return (
			<div className="iz-screen">
				{/* The back control ALONE, exactly as Manage Outlet does it.

				    The lingering black box was never the button — it was `AppTopbar`,
				    which wraps whatever it is given in a `<header class="iz-topbar">`
				    carrying a gradient, a bottom border and 14px of padding. That
				    header exists to hold an avatar and identity beside the back pill;
				    here it held nothing else, so it rendered as a dark strip with one
				    small button parked in it. Manage Outlet never had the box because
				    it never mounted the header — it renders the button directly, which
				    is what this now does too.

				    `--lg` supplies the 42px height, `--pill` the 999px radius, brighter
				    border and brighter label. */}
				<PortalBackButton
					onBack={() => setDetailId(null)}
					className="iz-topbar-back--lg iz-topbar-back--pill"
				/>
				<PvDetail
					pv={detail}
					receiptScans={receiptsForPv(agencyReceiptScans, detail)}
					onClose={() => setDetailId(null)}
				/>
			</div>
		);
	}

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>{t.payroll.title}</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">
					{date} · {time} · {t.history.cycleLabel}{" "}
					<span className="text-[var(--iz-gold-l)]">{PAYROLL_CYCLE.range}</span>
					<IzPill variant="violet" className="ml-1.5 !py-0 !text-[9px]">
						{t.payroll.perItemCalc}
					</IzPill>
				</p>
				<p className="iz-tiny iz-muted2 mt-1">
					{AGENCY_SUB_ROLE_LABELS[agencySubRole ?? "agency_owner"](t)} ·{" "}
					{t.payroll.signingChainHint}
				</p>
			</header>

			{/* Disputes and overtime used to render open here, above the weeks. They
			    now live in the sub-tab row below beside Payment Vouchers / Receipts,
			    at the owner's request, because on a quiet week two empty panels ate
			    the first screen. Their COUNTS ride on the tab labels so an
			    outstanding item is still visible without opening the tab — an
			    undecided overtime claim is why a week refuses to send. Still NOT on
			    the approvals page: that route is gated on `approvePrSignups`, which
			    agency finance does not hold, and finance may decide overtime. */}

			<div className="iz-payroll-tabs mt-3">
				{/* The week still running. Vouchers accrue into it as shifts complete, so
				    without this tab a real voucher for the current week has nowhere to
				    appear at all. */}
				<button
					type="button"
					className={`iz-payroll-tab${payrollWeekTab === "this_week" ? " on" : ""}`}
					onClick={() => selectPayrollWeekTab("this_week")}
				>
					{t.payroll.thisWeek}
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${payrollWeekTab === "last_week" ? " on" : ""}`}
					onClick={() => selectPayrollWeekTab("last_week")}
				>
					{t.payroll.lastWeek}
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${payrollWeekTab === "last_last_week" ? " on" : ""}`}
					onClick={() => selectPayrollWeekTab("last_last_week")}
				>
					{t.payroll.paymentWeek}
				</button>
			</div>

			<p className="iz-tiny iz-muted2 mt-2">
				{payrollWeekTab === "this_week"
					? `${thisWeekBounds.cycle} · ${t.payroll.inProgressNotClosed}`
					: payrollWeekTab === "last_week"
						? `${lastWeekBounds.cycle} · ${t.payroll.pendingPrReviewOrDispute}`
						: // Not a week at all any more, and no longer only the signed ones:
							// this tab holds EVERY voucher that is not yet paid, from any
							// week, until it is. Naming a date range described a list it had
							// stopped matching, and "Signed vouchers" now describes a subset
							// of what is on screen. Say what the list actually is.
							`${t.payroll.outstandingVouchersPrefix} · ${
								unsignedPaymentWeekPvs.length > 0
									? `${unsignedPaymentWeekPvs.length} ${t.payroll.notSignedYet}`
									: t.payroll.readyToPay
							}`}
				{" · "}
				{activeWeekStats.pvCount} {t.agencyHome.pvs} ·{" "}
				{activeWeekBilling.plan.label} · {activeWeekBilling.priceLabel}
				{activeWeekBilling.plan.renegotiate && (
					<span className="text-[var(--iz-amber)]">
						{" "}
						· {t.payroll.contactAdminPricing}
					</span>
				)}
			</p>

			<div className="iz-grid3 mt-3">
				<div className="iz-stat-tile">
					<div className="n text-[var(--iz-gold-l)]">
						{activeWeekStats.prCount}
					</div>
					<IzKpiLabel>PR</IzKpiLabel>
				</div>
				<div className="iz-stat-tile">
					<div className="n">{activeWeekStats.pvCount}</div>
					<IzKpiLabel>PV</IzKpiLabel>
				</div>
				<div className="iz-stat-tile">
					<div className="n text-[var(--iz-gold-l)]">
						{formatRM(activeWeekStats.pendingPayout)}
					</div>
					<IzKpiLabel>{t.payroll.pendingPayout}</IzKpiLabel>
				</div>
			</div>

			{/* Above the tabs, not inside one: an uncollected fee is not scoped to
			    the voucher/receipt/dispute view someone happens to be on, and
			    burying it under a tab is how it went unbilled in the first place.

			    Not on the PAYMENT WEEK tab at all, though. Those vouchers are signed
			    and queued to pay, and a signed voucher cannot take another line — so
			    every action the panel offers is refused there. It used to render
			    read-only, which is a debt shown to someone forbidden to act on it;
			    the two weeks that CAN still take a charge are where it belongs. */}
			{payrollWeekTab !== "last_last_week" && (
				<div className="mt-2.5">
					{/* `weekStart`/`weekEnd` follow the tabs, so "record this week's
					    penalties" seals the week the operator is looking at, not whatever
					    week today falls in.

					    `canMark` is `raisePv`, NOT `editSettings`: recording and settling
					    charges is payroll bookkeeping, which the finance head does on this
					    very screen. `editSettings` is owner-only and made this a list
					    finance could read but never act on. Writing the fine SCHEDULE
					    stays owner-only — that is policy, this is bookkeeping. */}
					<UnchargedFeesPanel
						canMark={can("raisePv")}
						weekStart={
							payrollWeekTab === "this_week"
								? thisWeekBounds.weekStartIso
								: lastWeekBounds.weekStartIso
						}
						weekEnd={
							payrollWeekTab === "this_week"
								? thisWeekBounds.weekEndIso
								: lastWeekBounds.weekEndIso
						}
					/>
				</div>
			)}

			<div className="iz-payroll-tabs mt-2.5">
				<button
					type="button"
					className={`iz-payroll-tab${pvSubTab === "vouchers" ? " on" : ""}`}
					onClick={() => selectPvSubTab("vouchers")}
				>
					{t.payroll.paymentVouchers} ({weekTabPvs.length})
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${pvSubTab === "receipts" ? " on" : ""}`}
					onClick={() => selectPvSubTab("receipts")}
				>
					{t.receipts.receipts} ({activeWeekReceipts.length})
				</button>
				{/* Disputes is hidden on the PAYMENT week (owner's rule, 3 Aug 2026):
				    by then a voucher's figures are settled, and a dispute belongs to a
				    week still under review. Overtime USED to be hidden by this same
				    rule and no longer is — see `showOvertimeTab` for why the premise
				    stopped holding.
				    Both ARE week-scoped (owner's rule, 11 Aug 2026): *"the dispute
				    should sit with the week it is disputed at"*. They were not, and one
				    claim appeared under every week with an identical count while the
				    Vouchers and Receipts counts beside it moved — which reads as the
				    filter leaking between weeks. The blocker they used to keep visible
				    has not been thrown away: each panel counts its off-week open items
				    on a line of its own, and the agency home lists every open one
				    regardless of week. */}
				{payrollWeekTab !== "last_last_week" && (
					<button
						type="button"
						className={`iz-payroll-tab${pvSubTab === "disputes" ? " on" : ""}`}
						onClick={() => selectPvSubTab("disputes")}
					>
						{t.agencyHome.disputes} ({weekOpenDisputes.length})
					</button>
				)}
				{/* See `showOvertimeTab`: on the payment week this is offered only
				    while that week still has a claim nobody has decided. */}
				{showOvertimeTab && (
					<button
						type="button"
						className={`iz-payroll-tab${pvSubTab === "overtime" ? " on" : ""}`}
						onClick={() => selectPvSubTab("overtime")}
					>
						{t.payroll.overtime} ({weekPendingOtClaims.length})
					</button>
				)}
			</div>

			{pvSubTab === "disputes" && (
				<DisputeQueuePanel
					weekStartIso={activeWeekBounds.weekStartIso}
					weekEndIso={activeWeekBounds.weekEndIso}
				/>
			)}
			{pvSubTab === "overtime" && (
				<OvertimeQueuePanel
					weekStartIso={activeWeekBounds.weekStartIso}
					weekEndIso={activeWeekBounds.weekEndIso}
				/>
			)}

			{pvSubTab === "vouchers" && (
				<OutletSection
					title={t.payroll.paymentVouchers}
					iconKey="Payment Vouchers"
					hint={activeWeekBounds.cycle}
				>
					{payrollWeekTab === "last_last_week" && (
						<IzCard
							flat
							className="!mb-2.5 border-[rgba(232,194,122,.3)] bg-[linear-gradient(180deg,rgba(232,194,122,.05),transparent)]"
						>
							<div className="iz-between">
								<div>
									<p className="iz-sm font-bold">
										{t.payroll.signedPvsManualPayment}
									</p>
									{/* The "pays each PR individually — no scheduled auto-transfer"
									    line was removed (owner's call, 17 Aug 2026): it describes
									    how the product works rather than telling the agency
									    anything actionable, and the counts line below already says
									    what to do. */}
									<p className="iz-tiny iz-muted2 mt-0.5">
										{activeWeekStats.signedCount} {t.payroll.signedCountSuffix}{" "}
										· {t.payroll.use} <b>{t.payroll.toPay}</b>{" "}
										{t.payroll.useToRecordTransfer} ·{" "}
										<Link
											to="/agency/history"
											search={{ tab: "paid" }}
											className="text-[var(--iz-gold-l)]"
										>
											{paid} {t.payroll.paidInHistory}
										</Link>
									</p>
								</div>
								<b className="font-sora text-base text-[var(--iz-gold)]">
									{formatRM(activeWeekStats.signedTotal)}
								</b>
							</div>
							<p className="iz-tiny iz-muted2 mt-2">
								{t.payroll.duplicatePaymentBlocked}
							</p>
						</IzCard>
					)}
					{payrollWeekTab === "last_last_week" &&
						unsignedPaymentWeekPvs.length > 0 && (
							<IzCard
								flat
								className="!mb-2.5 border-[rgba(244,183,64,.4)] bg-[rgba(244,183,64,.08)]"
							>
								{/* Two whole sentences rather than an "s"/"is"/"are" the code
								    splices in: Chinese has no plural and no verb agreement, so a
								    template stitched out of English inflections cannot be
								    translated at all — only the English can be repaired. */}
								<p className="iz-sm font-bold text-[var(--iz-amber)]">
									{fill(
										unsignedPaymentWeekPvs.length === 1
											? t.agencyPv.unsignedVoucherOne
											: t.agencyPv.unsignedVoucherMany,
										{ n: unsignedPaymentWeekPvs.length },
									)}
								</p>
								{/* The whole reason this card exists: by the payment week a voucher
								    should already be signed, so one that is not has fallen out of
								    the flow — and before this tab showed it, nothing anywhere in
								    the product would ever have mentioned it again. */}
								<p className="iz-tiny iz-muted2 mt-0.5">
									{t.agencyPv.overdueUnsignedHint}
								</p>
								<ul className="mt-1.5 space-y-0.5">
									{unsignedPaymentWeekPvs.map((p) => (
										<li key={p.id} className="iz-tiny iz-muted2">
											{/* `resolvePvPrLabel`, not `resolvePvPrName` — the sibling
										    list below already used the label, so one screen printed
										    "Victoria Tan Mei Lin" here and "(Vicky) Victoria Tan Mei
										    Lin" there, for the same PR. */}
											{resolvePvPrLabel(p, agencyPRs)} ·{" "}
											{formatRM(getPvNetTotal(p))} ·{" "}
											{agencyPvStatusLabel(p.status, t)}
										</li>
									))}
								</ul>
							</IzCard>
						)}
					{payrollWeekTab !== "last_last_week" && (
						<IzCard flat className="!mb-2.5">
							<div className="flex items-center gap-2 iz-tiny iz-muted">
								<Filter className="h-3.5 w-3.5 shrink-0" />
								{t.payroll.filterAndSort}
								{hasActiveFilters && (
									<button
										type="button"
										className="ml-auto text-[var(--iz-gold-l)]"
										onClick={clearFilters}
									>
										{t.payroll.clearAll}
									</button>
								)}
							</div>

							<p className="iz-filter-group-label">{t.table.status}</p>
							<div className="iz-filter-chips">
								{visibleStatusFilters.map((f) => {
									const active = statusFilter === f.value;
									const count = statusCounts[f.value];
									return (
										<button
											key={f.value}
											type="button"
											className={`iz-filter-chip${active ? " on" : ""}`}
											onClick={() => setStatusFilter(f.value)}
										>
											{f.label(t)}
											<span className="iz-filter-chip__count">({count})</span>
										</button>
									);
								})}
							</div>
						</IzCard>
					)}

					{filteredVouchers.length === 0 ? (
						/* The empty state stays FULL WIDTH — it is a sentence about the
						   whole list, and half a row of centred text with a hole beside it
						   reads as a layout fault rather than as an answer. */
						<IzCard className="text-center">
							<p className="iz-sm iz-muted">
								{payrollWeekTab === "last_last_week"
									? t.payroll.noSignedVouchersThisWeek
									: t.payroll.noVouchersMatch}
							</p>
							{payrollWeekTab !== "last_last_week" && hasActiveFilters && (
								<button
									type="button"
									className="iz-chip mt-2"
									onClick={clearFilters}
								>
									{t.payroll.clearFilters}
								</button>
							)}
						</IzCard>
					) : (
						/* Two columns from `xl`, like the Receipts, Disputes and Overtime
						   queues below it. `items-start` so a voucher carrying an extra
						   line does not stretch the one beside it. Nothing in this card
						   truncates — the file has no `truncate` at all — so halving the
						   width costs no words; the id gets `break-words` because a UUID is
						   one unbreakable token that would otherwise run past the card. */
						<div className="grid items-start gap-2.5 xl:grid-cols-2">
							{filteredVouchers.map((pv) => (
								<button
									key={pv.id}
									type="button"
									className="iz-card iz-between w-full cursor-pointer text-left"
									onClick={() => setDetailId(pv.id)}
								>
									<div className="min-w-0">
										<div className="font-sora break-words text-[15px] font-bold">
											{pv.id}
										</div>
										<p className="iz-tiny iz-muted mt-0.5">
											{resolvePvPrLabel(pv, agencyPRs)} · {pv.outlet}
										</p>
										{pv.prIc && (
											<p className="iz-tiny iz-muted2">
												{t.outletSettings.ic} {pv.prIc}
											</p>
										)}
										<p className="iz-tiny iz-muted2 mt-0.5">
											{t.history.cycleLabel}: {pv.cycle}
										</p>
										{/* A backend voucher's own week runs Mon–Sun while these tabs
										    are Sun–Sat, so the tab heading is one day out from the
										    week this voucher actually covers. Print the voucher's
										    range rather than letting the heading speak for it. */}
										{pvOwnWeekLabel(pv, t) && (
											<p className="iz-tiny iz-muted2">
												{t.agencyPv.weekWorked}: {pvOwnWeekLabel(pv, t)}
											</p>
										)}
										<p className="iz-tiny iz-muted2">
											{t.history.issued} {pv.issued} · {t.agencyHome.payBy}{" "}
											{resolvePvPayByDue(pv)}
											{parsePvIssuedMs(pv.issued) >= latestIssuedMs &&
												latestIssuedMs > 0 && (
													<span className="ml-1 text-[var(--iz-violet)]">
														· {t.agencyPv.latest}
													</span>
												)}
										</p>
										<p className="iz-tiny text-[var(--iz-gold-l)] mt-0.5">
											{t.history.sales} {formatRM(getPvSalesTotal(pv))}
										</p>
									</div>
									<div className="shrink-0 text-right">
										<IzPill variant={statusPill(pv.status)}>
											{agencyPvStatusLabel(pv.status, t)}
										</IzPill>
										<div className="iz-ledger font-sora mt-1.5 text-base font-bold">
											{formatRM(getPvNetTotal(pv))}
										</div>
										<p className="iz-tiny iz-muted2 mt-0.5">
											{t.payroll.netPayable}
										</p>
									</div>
								</button>
							))}
						</div>
					)}
				</OutletSection>
			)}

			{pvSubTab === "receipts" && (
				<AgencyReceiptsPanel
					weekStartIso={activeWeekBounds.weekStartIso}
					weekEndIso={activeWeekBounds.weekEndIso}
					focusReceiptId={receiptFromSearch}
					onOpenPv={(voucherId) => setDetailId(voucherId)}
				/>
			)}
		</div>
	);
}

// Takes `t` rather than reading it itself: this is a plain helper, not a
// component, so it cannot call the locale hook. Its only caller is a component
// that already holds one.
function receiptScanStatusPill(
	scan: PrReceiptScan,
	t: PortalTranslations,
): {
	variant: "green" | "amber" | "red" | "ink" | "violet" | "gold";
	label: string;
} {
	if (scan.logSource === "manual") {
		if (scan.agencyVerification === "pending")
			return { variant: "amber", label: t.payroll.verify };
		if (scan.agencyVerification === "approved")
			return { variant: "green", label: t.payroll.verified };
		if (scan.agencyVerification === "rejected")
			return { variant: "ink", label: t.payroll.rejected };
	}
	const variant =
		scan.status === "paid"
			? "green"
			: scan.status === "in_pv"
				? "amber"
				: "ink";
	return { variant, label: receiptStatusLabel(scan.status, t) };
}

function ReceiptScanRow({
	scan,
	onClick,
	compact = false,
	onVerify,
}: {
	scan: PrReceiptScan;
	onClick?: () => void;
	/** Hide line items — used on the agency receipts list (details in sheet). */
	compact?: boolean;
	onVerify?: (scanId: string, decision: "approved" | "rejected") => void;
}) {
	const { t } = usePortalLocale();
	const [y, m, d] = scan.date;
	const entry = receiptEntryMethod(scan);
	const pendingSelfLog =
		scan.logSource === "manual" && scan.agencyVerification === "pending";
	const statusPill = receiptScanStatusPill(scan, t);

	const body = (
		<IzCard
			flat
			className={`!mb-2${pendingSelfLog ? " iz-receipt-selflog-pending" : ""}${onClick && !pendingSelfLog ? " !mb-0 transition-colors hover:border-[var(--iz-gold-d)]" : ""}`}
		>
			<div className="iz-between items-start gap-2">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-sora text-sm font-bold">{scan.receiptRef}</p>
						{scan.logSource === "manual" && (
							<IzPill variant="amber">{t.agencyHub.selfLog}</IzPill>
						)}
					</div>
					<p className="iz-tiny iz-muted2 mt-0.5 font-mono">{scan.id}</p>
					<p className="iz-tiny iz-muted mt-0.5">
						{scan.prName} · {scan.outlet}
					</p>
					{scan.manualReason && (
						<p className="iz-tiny text-[var(--iz-amber)] mt-1">
							{scan.manualReason}
						</p>
					)}
					{scan.prId && (
						<p className="iz-tiny iz-muted2">
							{t.agencyPv.prIdLabel} {scan.prId}
						</p>
					)}
					<p className="iz-tiny iz-muted2 mt-0.5">
						{receiptEntryLoggedLabel(scan, t)}
					</p>
					<p className="iz-tiny iz-muted2">
						{t.table.shiftDay} {d}/{m}/{y}
					</p>
				</div>
				<div className="flex shrink-0 items-start gap-2 text-right">
					<div>
						{scan.logSource === "manual" ? (
							<IzPill variant={statusPill.variant}>{statusPill.label}</IzPill>
						) : (
							<IzPill variant={entry === "manual" ? "violet" : "ink"}>
								{receiptEntryMethodLabel(entry, t)}
							</IzPill>
						)}
						<p className="iz-ledger mt-1 text-sm font-bold">
							{formatRM(scan.totalLogged)}
						</p>
						<p className="iz-tiny iz-muted2">
							{t.agencyPv.commissionShort} {formatRM(scan.totalCommission)}
						</p>
					</div>
					{onClick && !pendingSelfLog && (
						<ChevronRight
							className="mt-1 h-4 w-4 text-[var(--iz-muted)]"
							aria-hidden
						/>
					)}
				</div>
			</div>
			{!compact && (
				<div className="mt-2 border-t border-[var(--iz-line)] pt-2">
					{scan.items.map((item) => (
						<p
							key={`${scan.id}-${item.label}`}
							className="iz-tiny iz-muted py-0.5"
						>
							{item.qty}× {item.label} · {formatRM(item.amount)}
						</p>
					))}
				</div>
			)}
			{pendingSelfLog && onVerify && (
				<div className="mt-2 flex gap-2 border-t border-[var(--iz-line)] pt-2">
					<button
						type="button"
						className="iz-btn iz-btn-soft flex-1 !py-1.5 !text-xs"
						onClick={() => onVerify(scan.id, "rejected")}
					>
						{t.common.reject}
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-primary flex-1 !py-1.5 !text-xs"
						onClick={() => onVerify(scan.id, "approved")}
					>
						<CheckCircle2 className="h-3 w-3" /> {t.agencyPv.verifySelfLog}
					</button>
				</div>
			)}
		</IzCard>
	);

	if (onClick && !pendingSelfLog) {
		return (
			<button
				type="button"
				className="mb-2 block w-full text-left"
				onClick={onClick}
			>
				{body}
			</button>
		);
	}

	return body;
}

/**
 * The rail's captions, keyed by the STEP's own key.
 *
 * `PV_WORKFLOW_STEPS` is a module-scope const in `pv-breakdown`, so its `label`
 * is a finished English string it has no hook to translate. Resolving here — by
 * key, through a FUNCTION of the dictionary — leaves the order and the enum
 * where they belong and puts only the words under the locale. Holding a key
 * *name* instead would type-check and render "stepRaisePv" on screen.
 *
 * Falls through to the step's own label, so a step added over there still shows
 * something rather than blanking the rail.
 */
const PV_WORKFLOW_STEP_LABELS: Record<
	string,
	(t: PortalTranslations) => string
> = {
	raise: (t) => t.agencyPv.stepRaisePv,
	finance: (t) => t.payroll.financeSign,
	sent: (t) => t.agencyPv.stepSentToPr,
	signed: (t) => t.agencyPv.stepPrSigned,
	paid: (t) => t.agencyPv.stepPaid,
};

function PvWorkflowRail({ status }: { status: PrPvStatus }) {
	const { t } = usePortalLocale();
	const active = pvWorkflowStepIndex(status);
	return (
		<div className="mb-2.5 flex gap-1 overflow-x-auto pb-1">
			{PV_WORKFLOW_STEPS.map((step, idx) => {
				const done = idx <= active;
				const current = idx === active;
				return (
					<div
						key={step.key}
						className={`shrink-0 rounded-lg border px-2 py-1.5 text-center ${
							current
								? "border-[var(--iz-gold)] bg-[rgba(232,194,122,.12)]"
								: done
									? "border-[var(--iz-green)]/40 text-[var(--iz-green)]"
									: "border-[var(--iz-line)] text-[var(--iz-muted)]"
						}`}
					>
						<p className="iz-tiny font-semibold">
							{PV_WORKFLOW_STEP_LABELS[step.key]?.(t) ?? step.label}
						</p>
					</div>
				);
			})}
		</div>
	);
}

function PvBreakdownCard({ breakdown }: { breakdown: PvEarningsBreakdown }) {
	const { t } = usePortalLocale();
	// `key` is the bucket, not the label. Keying a row on its own translated text
	// remounts every row the moment the locale changes.
	const rows = [
		{ key: "wages", label: t.money.dailyWages, value: breakdown.wages },
		{
			key: "drinks",
			label: t.payroll.drinkCommissions,
			value: breakdown.drinks,
		},
		{ key: "tips", label: t.payroll.tipCommissions, value: breakdown.tips },
		{
			key: "overtime",
			label: t.payroll.overtimeCheckOut,
			value: breakdown.overtime,
		},
	].filter((r) => r.value > 0);
	if (breakdown.other > 0)
		rows.push({ key: "other", label: t.payroll.other, value: breakdown.other });
	return (
		<IzCard flat className="mb-2.5">
			{/* `uppercase` carries the heading's shouty look, which used to be baked
			    into the literal. Chinese has no case, so the class is a no-op there —
			    a second all-caps key would have been a second term for a heading the
			    dictionary already names. */}
			<p className="iz-tiny iz-muted2 mb-2 tracking-wide uppercase">
				{t.payroll.fourPartBreakdown}
			</p>
			{rows.map((r) => (
				<div key={r.key} className="iz-v-sum">
					<span className="iz-muted">{r.label}</span>
					<b>{formatRM(r.value)}</b>
				</div>
			))}
			<div className="iz-v-sum tot">
				<span>{t.payroll.subtotal}</span>
				<b className="text-[var(--iz-gold)]">{formatRM(breakdown.total)}</b>
			</div>
		</IzCard>
	);
}

function PvDetail({
	pv,
	receiptScans,
	onClose,
}: {
	pv: PrPaymentVoucher;
	receiptScans: PrReceiptScan[];
	onClose: () => void;
}) {
	const { t } = usePortalLocale();
	const {
		editLines,
		sendToPr,
		resend,
		resolveDispute,
		overrideSigned,
		financeSign,
		isSigning,
		markPaid,
	} = useAgencyPvs();
	const [signOpen, setSignOpen] = useState(false);
	const [signError, setSignError] = useState<string | null>(null);
	const [bankRef, setBankRef] = useState("");
	const deductId = useId();
	const agencyPRs = useStore((s) => s.agencyPRs);
	const toast = useStore((s) => s.toast);
	// The letterhead the printed voucher carries — the signed-in agency, so this
	// document names the same company the PR's copy of it does. Undefined on a
	// demo session, which falls the template back to its own issuer.
	const pvIssuer = usePvIssuer();
	// The list omits line items — pull the full voucher (falls back to the list
	// row until it resolves).
	const detailPv = useAgencyPvDetail(pv.id, pv);
	const v = detailPv ?? pv;
	// Shares the day-review panel's fetch (same query key), so the button and the
	// panel below it can never disagree about whether a day is held.
	const { sendGate } = useAgencyPvDayReview(pv.id);
	const [editing, setEditing] = useState(false);
	const [overrideOpen, setOverrideOpen] = useState(false);
	const [overrideReason, setOverrideReason] = useState("");
	const can = useAgencyCan();
	const canOverride = can("overrideSignedPv");
	/*
	 * IS THIS VOUCHER ON THE WEEK THAT IS STILL RUNNING?
	 *
	 * Owner's rule (12 Aug 2026): a PV under **This Week** carries no signing
	 * function — it signs from Last Week. The reason is that the figures are not
	 * final: a shift worked tonight, a receipt logged tomorrow or a penalty
	 * charged before the send all still change the total, and a finance signature
	 * is an attestation to a total.
	 *
	 * Derived from the VOUCHER's own week, not from which tab happens to be
	 * selected. The tab is where the user clicked; the week is a property of the
	 * document, and it is the same answer whether the card was reached from This
	 * Week, from a `?status=` deep link, or from Payment Week. Gating on the tab
	 * would leave the pad reachable by the other two routes into this card.
	 *
	 * Uses the SAME helper and the SAME three bounds the list uses to sort
	 * vouchers into tabs, so "is in the This Week list" and "is refused a
	 * signature" cannot drift apart.
	 */
	const { weekStillOpen, thisWeekCycle } = useMemo(() => {
		const thisWeek = demoPayrollWeekBoundsForWeeksAgo(-1);
		const lastWeek = demoPayrollWeekBoundsForWeeksAgo(0);
		const lastLastWeek = demoPayrollWeekBoundsForWeeksAgo(1);
		return {
			thisWeekCycle: thisWeek.cycle,
			weekStillOpen: pvBelongsToPayrollWeek(
				v,
				thisWeek.weekStartIso,
				thisWeek.weekEndIso,
				lastWeek.weekStartIso,
				lastLastWeek.weekStartIso,
			),
		};
	}, [v]);
	const [rows, setRows] = useState<PrPvRow[]>(v.rows);
	const [deduct, setDeduct] = useState(v.deduct);

	/**
	 * Has the agency signed? Read from the voucher, never from local state — the
	 * server is the authority, and a locally-remembered signature would leave the
	 * Send button enabled against a 409.
	 */
	const financeSigned = Boolean(v.financeHeadSignedAt);

	/**
	 * The signer's own signature on file, if they have recorded one — the ink the
	 * tap-to-sign button sends. Null means no stored signature OR stored ink that
	 * will not parse, and both cases fall back to the pad: a one-tap button that
	 * posts something the server rejects would be worse than no button.
	 */
	const { ink: storedSignature } = useMySignature();

	const handleFinanceSign = async (ink: {
		w: number;
		h: number;
		strokes: [number, number][][];
	}) => {
		setSignError(null);
		try {
			await financeSign({ id: pv.id, signature: ink });
			setSignOpen(false);
			toast(t.payroll.voucherSignedCanSend, "success");
		} catch (error) {
			// The server's refusal verbatim: each one is a real rule (already sent,
			// wrong role), not a generic failure the agency has to guess at.
			setSignError(
				(error as { response?: { data?: { message?: string } } } | null)
					?.response?.data?.message ?? t.payroll.couldNotRecordSignature,
			);
		}
	};
	// Refresh the editable copy when the real line items arrive.
	useEffect(() => {
		if (!editing) {
			setRows(v.rows);
			setDeduct(v.deduct);
		}
	}, [v, editing]);

	// The printed voucher needs the REAL account, not a demo fixture — see the
	// note on buildAgencyPayee. Blank when the PR has not entered one.
	const payeeBank = useVoucherPayeeBank(v.id);
	const payee = buildAgencyPayee(v, agencyPRs, payeeBank.data);
	const { logout } = useAuth();
	const [pdfOpening, setPdfOpening] = useState(false);
	/**
	 * Opens the SERVER's voucher PDF in a new tab.
	 *
	 * The tab is opened SYNCHRONOUSLY, before the await, and only then pointed at
	 * the URL. A `window.open` that happens after an awaited request is a popup
	 * the browser did not see the click for, and Safari and Firefox block it —
	 * the user would press PDF and get nothing at all, which is a worse failure
	 * than the HTML tab this replaced.
	 *
	 * A demo voucher has no backend row and therefore no ticket to mint; it says
	 * so rather than opening a tab onto a 404.
	 */
	const openOfficialPdf = async () => {
		if (!pvIssuer.issuer || pdfOpening) return;
		if (!isBackedVoucherId(v.id)) {
			toast(t.payroll.officialPvDemoOnly, "warn");
			return;
		}
		const tab = window.open("", "_blank");
		setPdfOpening(true);
		try {
			const links = await createVoucherExportTicket(v.id, logout);
			if (tab) tab.location.href = links.pdfUrl;
			else window.location.href = links.pdfUrl;
			toast(t.payroll.officialPvOpened, "success");
		} catch (error) {
			tab?.close();
			toast(
				toMutationError(error, t.payroll.officialPvFailed)?.message ??
					t.payroll.officialPvFailed,
				"warn",
			);
		} finally {
			setPdfOpening(false);
		}
	};
	const breakdown = summarizePv(editing ? { ...v, rows, deduct } : v);
	const prHasSigned = Boolean(
		v.prSignedAt || v.status === "PAID" || v.status === "SIGNED",
	);
	const prSigPreview = v.prSignatureDataUrl;
	const disputeDays = disputeDaysRemaining(v.disputedAt);
	const displayPv: PrPaymentVoucher = editing
		? reconcilePvTotals({ ...v, rows, deduct })
		: v;

	const saveEdit = () => {
		editLines(pv.id, rows, deduct);
		setEditing(false);
	};

	return (
		<>
			<div className="iz-pv-detail-bar mb-2.5">
				<div className="iz-pv-detail-bar-main">
					<IzPill variant={statusPill(pv.status)}>
						{agencyPvStatusLabel(pv.status, t)}
					</IzPill>
					<span className="iz-pv-detail-id">{pv.id}</span>
				</div>
				<button type="button" className="iz-chip" onClick={onClose}>
					{t.common.close}
				</button>
			</div>

			<PvWorkflowRail status={pv.status} />

			<IzCard flat className="mb-2">
				<p className="iz-tiny iz-muted2">{t.payroll.dualSignPv}</p>
				{/*
					WHO SIGNED, AND AS WHAT — both read off this voucher.
					
					This printed `FINANCE_HEAD_LABEL`, a demo constant reading
					"Finance Head · Atlas Agency". Two things wrong on a real session:
					it announced every signer as the finance head (an OWNER signed
					PV-000010, reported 3 Sep 2026), and it hardcoded ONE agency's
					trading name onto every agency's voucher — the same demo-data leak
					`.cursor/rules/no-demo-data-on-real-sessions.mdc` covers, hidden
					here because the agency testing it happened to be Atlas.
					
					A voucher with no recorded capacity prints the agency alone rather
					than guessing a title; see migration 0149.
				*/}
				<p className="iz-tiny mt-1">
					{t.agencyPv.signerFirst} ·{" "}
					{[v.financeHeadRole, pvIssuer.issuer?.name]
						.filter((part): part is string => Boolean(part?.trim()))
						.join(" · ") || FINANCE_HEAD_LABEL}
					: <b className="text-[var(--iz-txt)]">{v.financeHeadName}</b>
					{v.financeHeadSignedAt
						? ` · ${formatPvSignStamp(v.financeHeadSignedAt)}`
						: ` · ${t.agencyPv.pendingSignature}`}
				</p>
				{/* The drawn mark, read from the voucher's own `finance_head_signature`.
				    Reads `v`, not `pv` — the ink rides on the DETAIL fetch, and the list
				    row has never carried it. The demo data URL is the fallback, not the
				    source: it is drawn from the signer's NAME, so preferring it showed a
				    signature for anyone on file. */}
				{financeSigned && (
					<div className="iz-pv-sig-preview mt-1.5">
						{v.financeHeadSignatureInk ? (
							<SignatureInkMark
								ink={v.financeHeadSignatureInk}
								label={fill(t.agencyPv.signatureOf, {
									name: v.financeHeadName,
								})}
							/>
						) : v.financeHeadSignatureDataUrl ? (
							<img
								src={v.financeHeadSignatureDataUrl}
								alt={fill(t.agencyPv.signatureOf, {
									name: v.financeHeadName,
								})}
							/>
						) : null}
					</div>
				)}
				<p className="iz-tiny iz-muted mt-2">
					{t.agencyPv.signerSecond} · PR ({pv.prName}):
					{prHasSigned ? (
						<>
							{" "}
							<b className="text-[var(--iz-txt)]">{pv.prName}</b>
							{v.prSignedAt ? ` · ${formatPvSignStamp(v.prSignedAt)}` : ""}
							{" · "}
							<span className="text-[var(--iz-green)]">
								{t.agencyPv.eSignOnFile} ✓
							</span>
						</>
					) : pv.status === "SENT" || pv.status === "PENDING_REVIEW" ? (
						` ${t.agencyPv.awaitingManualSign}`
					) : (
						" —"
					)}
				</p>
				{prHasSigned && (v.prSignatureInk || prSigPreview) && (
					<div className="iz-pv-sig-preview mt-1.5">
						{v.prSignatureInk ? (
							<SignatureInkMark
								ink={v.prSignatureInk}
								label={fill(t.agencyPv.signatureOf, { name: pv.prName })}
							/>
						) : (
							<img
								src={prSigPreview}
								alt={fill(t.agencyPv.signatureOf, { name: pv.prName })}
							/>
						)}
					</div>
				)}
			</IzCard>

			<PvBreakdownCard breakdown={breakdown} />

			{pv.status === "DISPUTED" && (
				<IzCard flat className="mb-2 border-[var(--iz-red)]">
					<p className="iz-tiny font-bold text-[var(--iz-red)]">
						{t.payroll.prDisputeResolveWithin}
					</p>
					{pv.disputedAt && (
						<p className="iz-tiny iz-muted2 mt-0.5">
							{t.agencyPv.raised} {pv.disputedAt}
						</p>
					)}
					{disputeDays !== null && (
						<p className="iz-tiny flex items-center gap-1 text-[var(--iz-amber)] mt-1">
							<Clock className="h-3 w-3" />
							{disputeDays > 0
								? fill(t.agencyPv.daysLeftToAdjust, { n: disputeDays })
								: t.payroll.past7DaysFollowUp}
						</p>
					)}
					{pv.disputeUpdatedAt && (
						<p className="iz-tiny text-[var(--iz-amber)]">
							{t.agencyPv.prUpdated} {pv.disputeUpdatedAt}
						</p>
					)}
					{pv.prDisputeReason && (
						<div className="mt-2 rounded-[12px] border border-[rgba(255,107,107,.2)] bg-[rgba(0,0,0,.15)] p-3">
							<p className="iz-tiny iz-muted2 tracking-wide">
								{t.payroll.prReason}
							</p>
							<p className="iz-sm mt-1 leading-relaxed">{pv.prDisputeReason}</p>
						</div>
					)}
					{pv.disputeNote && (
						<p className="iz-tiny iz-muted mt-2">
							<b className="text-[var(--iz-muted)]">{t.payroll.agencyNote}</b>{" "}
							{pv.disputeNote}
						</p>
					)}
				</IzCard>
			)}

			<PvSummaryView pv={displayPv} payee={payee} className="mb-2.5" />

			{receiptScans.length > 0 && (
				<OutletSection
					title={t.payroll.receiptScans}
					iconKey="Receipt scans"
					hint={`${receiptScans.length} ${t.payroll.onThisPv}`}
				>
					{receiptScans.map((scan) => (
						<ReceiptScanRow key={scan.id} scan={scan} />
					))}
				</OutletSection>
			)}

			{pv.status === "DISPUTED" && rows.length > 0 && (
				<OutletSection
					title={t.payroll.editLineItems}
					iconKey="Edit line items"
					hint={t.payroll.disputeResolution}
					trailing={
						<button
							type="button"
							className="iz-chip"
							onClick={() => setEditing(!editing)}
						>
							<Pencil className="mr-1 inline h-3 w-3" />{" "}
							{editing ? t.common.cancel : t.common.edit}
						</button>
					}
				>
					<IzCard>
						{rows.map((r, idx) => (
							<div
								key={r.i}
								className="iz-v-sum border-b border-[var(--iz-line)] py-2 last:border-0"
							>
								<div className="min-w-0 pr-2">
									{editing ? (
										<input
											className="w-full rounded bg-[var(--iz-bg2)] px-2 py-1 text-sm"
											value={r.desc}
											onChange={(e) => {
												const next = [...rows];
												next[idx] = { ...r, desc: e.target.value };
												setRows(next);
											}}
										/>
									) : (
										<span className="iz-sm">{r.desc}</span>
									)}
									<p className="iz-tiny iz-muted2 mt-0.5">
										{r.date} ({r.day}) · {r.outlet} · {r.ref}
									</p>
								</div>
								{editing ? (
									<input
										type="number"
										className="w-20 rounded bg-[var(--iz-bg2)] px-2 py-1 text-right text-sm"
										value={r.amt}
										onChange={(e) => {
											const next = [...rows];
											next[idx] = { ...r, amt: Number(e.target.value) };
											setRows(next);
										}}
									/>
								) : (
									<b className="iz-ledger shrink-0">{formatRM(r.amt)}</b>
								)}
							</div>
						))}
						{editing && (
							<div className="mt-2">
								<label htmlFor={deductId} className="iz-tiny iz-muted">
									{t.payroll.deductions}
								</label>
								<input
									id={deductId}
									type="number"
									className="mt-1 w-full rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-3 py-2 text-sm"
									value={deduct}
									onChange={(e) => setDeduct(Number(e.target.value))}
								/>
								<button
									type="button"
									className="iz-btn iz-btn-primary mt-2 w-full"
									onClick={saveEdit}
								>
									{t.payroll.saveDisputeEdit}
								</button>
							</div>
						)}
					</IzCard>
				</OutletSection>
			)}

			{/* No letterhead, no document — see AgencyPaidPvDetail for the why. */}
			<div className="mt-2.5 flex gap-2">
				{/*
					OPENS THE SERVER'S PDF — the same bytes the PR downloads.
					
					It used to call `downloadPvBreakdownPdf`, which wrote HTML into a
					blank tab: a page that looks like a voucher but has no PDF viewer
					around it — no page controls, no download, no print — while the PR
					opened a real PDF. Two renderings of one signed document, and only
					one of them was a document.
					
					Still gated on `pvIssuer.issuer`: a session that cannot say which
					company it is has no business printing a letterhead, and that rule
					predates this change.
				*/}
				<button
					type="button"
					disabled={!pvIssuer.issuer || pdfOpening}
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs disabled:opacity-50"
					onClick={() => void openOfficialPdf()}
				>
					<FileText className="h-4 w-4 shrink-0" /> PDF
				</button>
				<button
					type="button"
					disabled={!pvIssuer.issuer}
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs disabled:opacity-50"
					onClick={() => {
						if (!pvIssuer.issuer) return;
						downloadPvBreakdownCsv(displayPv, payee, pvIssuer.issuer);
						toast(t.payroll.excelDownloaded, "success");
					}}
				>
					<Sheet className="h-4 w-4 shrink-0" /> Excel
				</button>
			</div>
			{!pvIssuer.issuer && (
				<p className="iz-tiny iz-muted2 mt-1.5 text-center">
					{pvIssuer.status === "loading"
						? t.agencyPv.loadingLetterhead
						: t.agencyPv.letterheadUnavailable}
				</p>
			)}
			<p className="iz-tiny iz-muted2 mt-1.5 text-center">
				{t.agencyPv.printLayoutNote}
			</p>

			{/* `pr-demo`'s plain-text receipt, not the letterhead PDF — same name,
			    different function, prints no issuer. Deliberately not gated on
			    `pvIssuer`. */}
			{pv.status === "PAID" && (
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-2 w-full"
					onClick={() => {
						downloadPvReceipt(displayPv, {
							name: payee.name,
							bank: payee.bank ?? "Maybank",
							acc: payee.accountNo ?? "",
							ic: payee.ic ?? pv.prIc ?? "",
						});
						toast(t.payroll.receiptDownloaded, "success");
					}}
				>
					<Receipt className="h-4 w-4" /> {t.payroll.downloadPaymentReceipt}
				</button>
			)}

			{/* The day review gates this: the backend refuses a send while any day is
			    held or undecided, so the button says why instead of 409-ing. */}
			{pv.status === "PENDING_REVIEW" && can("raisePv") && (
				<>
					{/*
					 * The agency's own signature, ahead of the send — the rail's
					 * "Finance sign" step, which until 3 Aug 2026 was a label with no
					 * action behind it. The server refuses the send without it (409),
					 * so the pad is offered here rather than letting the button fail.
					 */}
					{!financeSigned && weekStillOpen && (
						<div className="mt-2 rounded-xl border border-[rgba(232,194,122,.35)] p-3">
							<p className="iz-sm font-bold">
								{t.agencyPv.signingOpensWhenWeekCloses}
							</p>
							{/* Split around the bold tab NAME, not mid-sentence by accident:
							    the cycle rides in as a {cycle} slot so each language can put
							    it where its own grammar wants, and the two halves meet either
							    side of the one word that must stay emphasised. */}
							<p className="iz-tiny iz-muted2 mt-0.5">
								{fill(t.agencyPv.weekStillOpenBody, { cycle: thisWeekCycle })}{" "}
								<b>{t.payroll.lastWeek}</b> {t.agencyPv.weekStillOpenTail}
							</p>
						</div>
					)}

					{!financeSigned && !weekStillOpen && (
						<div className="mt-2 rounded-xl border border-[rgba(232,194,122,.35)] p-3">
							<p className="iz-sm font-bold">
								{t.payroll.financeSignatureRequired}
							</p>
							<p className="iz-tiny iz-muted2 mt-0.5">
								{t.agencyPv.signToAttest}
							</p>
							{signError && (
								<p className="iz-tiny mt-1.5 text-[var(--iz-red,#c0554f)]">
									{signError}
								</p>
							)}
							{signOpen ? (
								<div className="mt-2">
									<PrSignaturePad
										label={t.payroll.drawYourSignature}
										onConfirm={() => {
											/* the PNG is not persisted — strokes are */
										}}
										onConfirmInk={(ink) => void handleFinanceSign(ink)}
										onCancel={() => setSignOpen(false)}
									/>
								</div>
							) : storedSignature ? (
								/*
								 * Tap-to-sign. The stored ink is PRE-LOADED, never applied
								 * automatically: opening the voucher and pressing this is
								 * still the act of signing, and the preview above the button
								 * shows exactly which mark is about to go on the document.
								 * Drawing a fresh one stays available, because a signer must
								 * be able to sign as themselves today rather than as their
								 * past self.
								 */
								<>
									<div className="mt-2 flex h-14 items-end rounded-lg border border-[var(--iz-line)] bg-white/95 px-2 py-1">
										<SignatureInkMark
											ink={JSON.stringify(storedSignature)}
											label={t.payroll.yourSignatureOnFile}
											className="h-10 w-full"
										/>
									</div>
									<button
										type="button"
										className="iz-btn iz-btn-primary mt-2 w-full"
										disabled={isSigning}
										onClick={() => void handleFinanceSign(storedSignature)}
									>
										<Pencil className="h-4 w-4" />
										{isSigning
											? t.payroll.signing
											: t.payroll.signWithMySignature}
									</button>
									<button
										type="button"
										className="iz-btn iz-btn-ghost mt-1.5 w-full"
										disabled={isSigning}
										onClick={() => setSignOpen(true)}
									>
										{t.agencyPv.drawDifferentSignature}
									</button>
								</>
							) : (
								<>
									<button
										type="button"
										className="iz-btn iz-btn-primary mt-2 w-full"
										disabled={isSigning}
										onClick={() => setSignOpen(true)}
									>
										<Pencil className="h-4 w-4" /> {t.agencyPv.signThisVoucher}
									</button>
									<p className="iz-tiny iz-muted2 mt-1 text-center">
										{t.agencyPv.saveSignatureHint}
									</p>
								</>
							)}
						</div>
					)}
					{/*
					 * NOT RENDERED AT ALL on the in-progress week — not merely disabled.
					 *
					 * The send cannot happen before the agency signs, and signing cannot
					 * happen before the week closes, so on a live week this button has no
					 * reachable path to working. A greyed control still advertises an
					 * action and invites the reader to hunt for what unlocks it; the
					 * notice above already says what has to happen and when. The server
					 * refuses this lane too (409, same rule), so hiding it is the UI
					 * agreeing with the API rather than being the only thing enforcing it.
					 */}
					{!weekStillOpen && (
						<>
							<button
								type="button"
								className="iz-btn iz-btn-primary mt-2 w-full"
								disabled={!sendGate.allowed || !financeSigned}
								onClick={() => sendToPr(pv.id)}
							>
								<Send className="h-4 w-4" /> {t.agencyPv.sendToPrForESign}
							</button>
							{!financeSigned && (
								<p className="iz-tiny iz-muted2 mt-1 text-center">
									{t.agencyPv.signAboveFirst}
								</p>
							)}
						</>
					)}
					{/* Only once we know WHY. While the fetch is in flight the button is
						    disabled with no caption — a reason would be a guess. The day
						    review is retired, so the pointer goes to the Receipts section
						    where the approve action now lives, and to the Overtime tab for
						    a claim nobody has decided. Keyed on the two concrete blockers
						    rather than on `!allowed`, because the in-flight state is also
						    "not allowed" and has nothing to point at yet. */}
					{/* `sendGate.reason` still arrives in English from the hook; only the
						    pointer after it is under the locale here. */}
					{!sendGate.allowed &&
						(sendGate.pendingReceipts.length > 0 ||
							sendGate.pendingOvertime.length > 0) && (
							<p className="iz-tiny iz-muted2 mt-1 text-center">
								{sendGate.reason} —{" "}
								{[
									sendGate.pendingReceipts.length > 0
										? t.agencyPv.approveInPayrollReceipts
										: null,
									sendGate.pendingOvertime.length > 0
										? t.agencyPv.decideInPayrollOvertime
										: null,
								]
									.filter(Boolean)
									.join(" ")}
							</p>
						)}
				</>
			)}

			{(pv.status === "DISPUTED" || pv.status === "SENT") && (
				<button
					type="button"
					className="iz-btn iz-btn-soft mt-2 w-full"
					onClick={() => resend(pv.id)}
				>
					{t.agencyPv.resendToPr}
				</button>
			)}

			{pv.status === "DISPUTED" && (
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-2"
					onClick={() => resolveDispute(pv.id)}
				>
					{t.agencyPv.resolveDisputeAndReassign}
				</button>
			)}

			{/*
			 * Recording the bank transfer — the last step of the rail, and the one
			 * that had no action behind it: the payment week card has always said
			 * "use To pay to record each bank transfer" while offering nothing to
			 * record it with, so a signed voucher could never become paid.
			 *
			 * Only on a SIGNED voucher: paying one the PR has not counter-signed
			 * would settle a figure nobody agreed to. The bank reference is optional
			 * because a transfer can be real without its reference being to hand,
			 * and blocking the record would lose the more important fact.
			 */}
			{pv.status === "SIGNED" && can("raisePv") && (
				<div className="mt-2 rounded-xl border border-[rgba(93,217,160,.35)] p-3">
					<p className="iz-sm font-bold">{t.payroll.recordPayment}</p>
					<p className="iz-tiny iz-muted2 mt-0.5">{t.agencyPv.markPaidHint}</p>
					<input
						type="text"
						className="mt-2 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
						placeholder={t.payroll.bankReferenceOptional}
						value={bankRef}
						onChange={(e) => setBankRef(e.target.value)}
						aria-label={t.payroll.bankReference}
					/>
					<button
						type="button"
						className="iz-btn iz-btn-primary mt-2 w-full"
						onClick={() => {
							markPaid(pv.id, bankRef.trim() || undefined);
							setBankRef("");
							// The amount arrives as a SLOT, already run through formatRM —
							// baking "RM" into a key would give the currency a second home.
							toast(
								fill(t.agencyPv.recordedAsPaid, {
									amount: formatRM(getPvNetTotal(pv)),
								}),
								"success",
							);
						}}
					>
						<CheckCircle2 className="h-4 w-4" /> {t.agencyPv.markAsPaid}
					</button>
				</div>
			)}

			{pv.overrideAudit && (
				<IzCard flat className="mt-2 border-[var(--iz-amber)]">
					<p className="iz-tiny flex items-center gap-1 text-[var(--iz-amber)]">
						<Shield className="h-3 w-3" />{" "}
						{fill(t.agencyPv.overriddenByAt, {
							by: pv.overrideAudit.by,
							at: pv.overrideAudit.at,
						})}
					</p>
					<p className="iz-tiny iz-muted mt-1">{pv.overrideAudit.reason}</p>
				</IzCard>
			)}

			{canOverride && (pv.status === "SIGNED" || pv.status === "PAID") && (
				<button
					type="button"
					className="iz-btn iz-btn-ghost mt-2 w-full"
					onClick={() => setOverrideOpen(true)}
				>
					{t.agencyPv.overrideSignedPvAuditLogged}
				</button>
			)}

			<IzSheet open={overrideOpen} onClose={() => setOverrideOpen(false)}>
				<IzCardTitle>{t.payroll.overrideSignedPv}</IzCardTitle>
				<p className="iz-tiny iz-muted mb-3">{t.agencyPv.overrideExplainer}</p>
				<textarea
					className="iz-field-input min-h-[80px]"
					value={overrideReason}
					onChange={(e) => setOverrideReason(e.target.value)}
					placeholder={t.payroll.reasonForOverride}
				/>
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-3 w-full"
					disabled={!overrideReason.trim()}
					onClick={() => {
						overrideSigned(pv.id, overrideReason);
						setOverrideOpen(false);
						setOverrideReason("");
					}}
				>
					{t.agencyPv.confirmOverride}
				</button>
			</IzSheet>

			{/* The day-review panel is GONE (owner's call, 23 Aug 2026): the
          Payroll › Receipts section is the review now, and the send gate
          asks about receipt statuses rather than day sign-offs. */}
			{/* Cancellation fees are charged AUTOMATICALLY now (0130), so the
          agency's decision is whether to waive one — and that decision belongs
          beside the voucher the deduction is actually on, not on the uncharged
          Finance list, which no longer sees them. Renders nothing when the
          voucher carries none, which is most of them. */}
			<CancellationFeesPanel voucherId={pv.id} canWaive={can("raisePv")} />
			<PayrollVerifyPanel voucherId={pv.id} />

			<button
				type="button"
				className="iz-btn iz-btn-soft mt-2"
				onClick={onClose}
			>
				{t.common.back}
			</button>
		</>
	);
}
