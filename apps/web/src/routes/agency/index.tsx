import { IconGuide } from "@agency-portal/components/iz/IconGuide";
import { formatRM } from "@agency-portal/components/iz/ui";
import { AgencyHomeHubTabs } from "@agency-portal/components/portal/AgencyHomeHubTabs";
import { AiSuggestionsPanel } from "@agency-portal/components/portal/AiSuggestionsPanel";
import { useAgencyOutlets } from "@agency-portal/hooks/use-agency-outlets";
import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import { useAgencyPvs } from "@agency-portal/hooks/use-agency-pvs";
import { OUTLET_NAMES, scopeToAgency } from "@agency-portal/lib/agency-demo";
import {
	agencyPendingPayoutDeadline,
	agencyPrToPayTotal,
} from "@agency-portal/lib/agency-payroll";
import { LIVE_SEED_PR_PVS } from "@agency-portal/lib/pr-demo";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export const Route = createFileRoute("/agency/")({
	component: AgencyHub,
});

function AgencyHub() {
	const agencySubRole = useStore((s) => s.agencySubRole);
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const agencyPRs = useMemo(
		() => scopeToAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	const prPaymentVouchers = useStore((s) => s.prPaymentVouchers);
	// Real login → drive KPI tiles from the backend (PRs, PVs, outlet registry);
	// demo store otherwise. Same real-vs-demo split as the other wired screens.
	const backendOutlets = useAgencyOutlets();
	const backendPrs = useAgencyPrs();
	const backendPvs = useAgencyPvs();
	const backed = backendOutlets.backed;

	const prsForCalc = backed ? backendPrs.prs : (agencyPRs ?? []);
	const pvsForCalc = backed
		? backendPvs.pvs
		: prPaymentVouchers?.length
			? prPaymentVouchers
			: LIVE_SEED_PR_PVS;
	const prToPayTotal = useMemo(
		() => agencyPrToPayTotal(pvsForCalc, prsForCalc),
		[pvsForCalc, prsForCalc],
	);
	const payoutDeadline = useMemo(
		() => agencyPendingPayoutDeadline(pvsForCalc, prsForCalc),
		[pvsForCalc, prsForCalc],
	);
	// The Sunday payout job HOLDS a voucher it cannot send and tells the agency
	// by notification (weekly-payout.job.ts). A bell is easy to miss, and the
	// consequence is silent on this end and loud on the PR's: until finance acts,
	// last week shows them nothing. So the same queue is stated here, on the page
	// the agency actually lands on.
	//
	// PENDING_REVIEW is the only status finance can still sign from — once a
	// voucher is SENT the signature is locked out — so it is exactly the set that
	// needs a person. Split by whether the finance stamp is already on it:
	// "review" and "sign" are different jobs, and telling someone to review days
	// that are already approved sends them looking for work that is not there.
	const pvTodo = useMemo(() => {
		const pending = pvsForCalc.filter((pv) => pv.status === "PENDING_REVIEW");
		const unsigned = pending.filter((pv) => !pv.financeHeadSignedAt);
		return {
			sign: unsigned.length,
			review: pending.length - unsigned.length,
			total: pending.length,
		};
	}, [pvsForCalc]);
	const totalPrs = prsForCalc.filter((p) => !p.detached).length;
	const totalOutlets = backed
		? backendOutlets.outlets.length
		: OUTLET_NAMES.length;
	const isFinance = agencySubRole === "agency_finance";
	const showWorkforce = useAgencyCan()("viewWorkforce");
	const { t } = usePortalLocale();

	return (
		<div className="iz-screen iz-portal-page">
			{pvTodo.total > 0 && (
				<Link
					to="/agency/pv"
					search={{ status: "PENDING_REVIEW" }}
					className="iz-card no-underline mb-3 block border-l-4 border-l-[var(--iz-red)] p-3"
				>
					<div className="font-semibold">
						{pvTodo.sign > 0 && pvTodo.review === 0
							? t.agencyHome.pvTodoSignTitle
							: pvTodo.review > 0 && pvTodo.sign === 0
								? t.agencyHome.pvTodoReviewTitle
								: t.agencyHome.pvTodoBothTitle}
					</div>
					<p className="iz-tiny mt-1 leading-snug text-[var(--iz-muted2)]">
						{[
							pvTodo.sign > 0
								? `${pvTodo.sign} ${t.agencyHome.pvTodoSign}`
								: null,
							pvTodo.review > 0
								? `${pvTodo.review} ${t.agencyHome.pvTodoReview}`
								: null,
						]
							.filter(Boolean)
							.join(" · ")}
					</p>
					<p className="iz-tiny mt-1 leading-snug text-[var(--iz-red)]">
						{t.agencyHome.pvTodoBlocked}
					</p>
					<p className="iz-tiny mt-2 font-semibold">
						{t.agencyHome.pvTodoCta} →
					</p>
				</Link>
			)}

			<div className="iz-portal-kpi-grid iz-portal-desktop-only">
				<div className="iz-portal-kpi">
					<div className="l">{t.agencyHome.totalPr}</div>
					<div className="n">{totalPrs}</div>
				</div>
				<div className="iz-portal-kpi">
					<div className="l">{t.agencyHome.totalOutlets}</div>
					<div className="n">{totalOutlets}</div>
				</div>
				<Link
					to="/agency/pv"
					search={{ status: "TO_PAY" }}
					className="iz-portal-kpi iz-portal-kpi-payout no-underline"
				>
					<div className="l">{t.agencyHome.pendingPayout}</div>
					<div className="n">{formatRM(prToPayTotal)}</div>
					{payoutDeadline && prToPayTotal > 0 && (
						<p
							className={`iz-tiny mt-1 leading-snug ${
								payoutDeadline.isOverdue
									? "text-[var(--iz-red)]"
									: "text-[var(--iz-muted2)]"
							}`}
						>
							{payoutDeadline.isOverdue
								? `${t.agencyHome.overdue} · `
								: `${t.agencyHome.payBy} `}
							{payoutDeadline.payByLabel}
							{payoutDeadline.pvCount > 1
								? ` · ${payoutDeadline.pvCount} ${t.agencyHome.pvs}`
								: ""}
						</p>
					)}
				</Link>
			</div>

			<div className="iz-portal-home-grid">
				<div className="iz-portal-home-main">
					{/* Says what finance can DO, not which pages exist for it.
					    "payroll & PV only" was narrower than the role's actual reach —
					    finance also reads the roster (owner's call, 11 Aug 2026: keep it)
					    — so the banner contradicted the Roster item in its own sidebar.
					    Read-only is the part that matters and is still exactly true: every
					    write on the roster is gated on `assignShifts`, which finance does
					    not hold. */}
					{isFinance && (
						<p className="iz-tiny iz-muted mb-3 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
							{t.agencyHome.financeScopeBanner}
						</p>
					)}

					<AgencyHomeHubTabs agencySubRole={agencySubRole} />
				</div>

				{showWorkforce && !isFinance && (
					<aside className="iz-portal-home-aside iz-portal-desktop-only">
						<AiSuggestionsPanel />
					</aside>
				)}
			</div>

			<IconGuide className="iz-icon-guide--portal mt-6" />
		</div>
	);
}
