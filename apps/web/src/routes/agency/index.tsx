import { IconGuide } from "@agency-portal/components/iz/IconGuide";
import { UnpaidBillingBanner } from "@agency-portal/components/iz/UnpaidBillingBanner";
import { formatRM, IzPageTitle } from "@agency-portal/components/iz/ui";
import { AgencyHomeHubTabs } from "@agency-portal/components/portal/AgencyHomeHubTabs";
import { AiSuggestionsPanel } from "@agency-portal/components/portal/AiSuggestionsPanel";
import { useAgencyOutlets } from "@agency-portal/hooks/use-agency-outlets";
import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import { useAgencyPvs } from "@agency-portal/hooks/use-agency-pvs";
import { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import { OUTLET_NAMES, scopeToAgency } from "@agency-portal/lib/agency-demo";
import {
	agencyPendingPayoutDeadline,
	agencyPrToPayTotal,
} from "@agency-portal/lib/agency-payroll";
import { LIVE_SEED_PR_PVS } from "@agency-portal/lib/pr-demo";
import { useStore } from "@agency-portal/lib/store";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export const Route = createFileRoute("/agency/")({
	component: AgencyHub,
});

/**
 * How many seats the venues are asking this agency to fill today.
 *
 * The home page could say what the agency OWES (pending payout), what it HOLDS
 * (total PR, total outlets) and what it must DECIDE (the review tabs) — but not
 * what it has been ASKED for, which is the one number that expires. An outlet
 * posts a shift for tonight and, until now, nothing on this screen changed.
 *
 * Reads the same `useAutoAssignPlan("today")` the AI suggestion panel beside it
 * already mounts, so this shares its query keys and fires no extra request. It
 * is the count only — never which venue or which agency is competing for the
 * same PRs — and it links to the roster where the staffing actually happens.
 *
 * Hidden at zero rather than showing "0": a KPI that is nearly always nought
 * teaches people to stop reading it, and the whole point of this tile is to be
 * noticed on the day it is not.
 */
function PrNeededKpi() {
	const { t } = usePortalLocale();
	const { backed, plan } = useAutoAssignPlan("today");
	if (!backed || plan.openSlotCount <= 0) return null;
	return (
		<Link
			to="/agency/roster"
			className="iz-portal-kpi iz-portal-kpi-payout no-underline"
		>
			<div className="l">{t.agencyHome.prNeeded}</div>
			<div className="n">{plan.openSlotCount}</div>
			<p className="iz-tiny mt-1 leading-snug text-[var(--iz-muted2)]">
				{plan.pairs.length > 0
					? fill(t.agencyHome.prNeededReady, { n: plan.pairs.length })
					: t.agencyHome.prNeededNobodyFree}
			</p>
		</Link>
	);
}

/**
 * A hub figure that carries a link to the page it was counted from.
 *
 * The COUNT does not change — every number the owner asked to keep on Today is
 * still here, still read from the same hooks the destination screens read
 * (`useAgencyPrs`, `useAgencyOutlets`, `useAgencyPvs`). What was missing is the
 * other half of that: a figure quoted on one screen and listed on another with
 * no path between them is two facts a reader has to trust are equal. One click
 * is what makes them checkable.
 *
 * `to` is deliberately the router's own path union rather than `string`, so a
 * renamed route fails the build instead of shipping a dead tile. Omit it and the
 * tile renders as a plain figure — which is what a role that the destination
 * would bounce should get, rather than a link into a redirect.
 */
function KpiTile({
	label,
	value,
	to,
}: {
	label: string;
	value: number | string;
	to?: "/agency/prs" | "/agency/outlets";
}) {
	const body = (
		<>
			<div className="l">{label}</div>
			<div className="n">{value}</div>
		</>
	);
	if (!to) return <div className="iz-portal-kpi">{body}</div>;
	return (
		<Link to={to} className="iz-portal-kpi no-underline">
			{body}
		</Link>
	);
}

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

	/*
	 * ⚠️ NO DEMO FIXTURES ON A REAL SESSION — and `backed` was the wrong test.
	 *
	 * `backed` is `backendOutlets.backed`, i.e. "an outlet identity resolved".
	 * Until it does — and it never does for an agency whose venue list is still
	 * in flight — these fell through to `LIVE_SEED_PR_PVS` and `OUTLET_NAMES`,
	 * so a REAL agency home printed demo voucher money and demo venue names
	 * (Velvet 23, Onyx KL). That is the owner's explicit rule, broken.
	 *
	 * `buildBlankPortalReset()` cannot help here: it blanks the STORE, and these
	 * two are module CONSTANTS imported directly, so nothing it does reaches
	 * them. The session kind is the authority on whether demo data is allowed at
	 * all, so ask it.
	 */
	const isRealSession = getPortalSessionKind() === "real";
	const prsForCalc = backed
		? backendPrs.prs
		: isRealSession
			? []
			: (agencyPRs ?? []);
	const pvsForCalc = backed
		? backendPvs.pvs
		: isRealSession
			? []
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
	/*
	 * The PENDING_REVIEW banner is GONE (owner, 24 Aug 2026).
	 *
	 * It ran the identical query to the hub's "Pending agency review" tab — same
	 * array, same `status === "PENDING_REVIEW"` filter, same
	 * `/agency/pv?status=PENDING_REVIEW` destination — so it was a second
	 * rendering of one fact, and the worse of the two: the tab's rows carry
	 * `?pv=<id>` and open the voucher, while the banner passed status alone and
	 * let `tabHoldingStatus` snap to the FIRST week holding one, landing on a
	 * list showing 1 of 3.
	 *
	 * Its copy had also outlived its own premise. "Until this is done, the PR
	 * sees nothing for last week" was true while `getMyHistory` filtered to
	 * signed+paid; that filter was deliberately widened to all five statuses, so
	 * the PR now sees a pending_review week with its full breakdown under the
	 * line "Waiting for your agency to issue". The banner was telling the agency
	 * something the PR's own screen contradicts.
	 *
	 * Visibility is not lost with it — the hub strip shows the count without a
	 * click. What went is the consequence sentence, and the accurate version of
	 * that is "the PR cannot sign, so cannot be paid", which belongs beside the
	 * list it describes if it ever comes back.
	 */
	const totalPrs = prsForCalc.filter((p) => !p.detached).length;
	// Same rule as the two lists above: a real session counts its own venues or
	// nothing, never the demo registry.
	const totalOutlets = backed
		? backendOutlets.outlets.length
		: isRealSession
			? 0
			: OUTLET_NAMES.length;

	/*
	 * ⚠️ A FIGURE WE COULD NOT FETCH IS NOT A ZERO.
	 *
	 * Every one of these tiles reads a list that comes back `[]` on failure, so
	 * a broken request rendered as "0 PRs", "0 outlets" and "RM 0.00 pending
	 * payout" — in the same confident type a real zero uses. An agency glancing
	 * at this screen would read "nobody is owed anything" and move on.
	 *
	 * An em dash is the honest answer: we do not know. Deliberately not a
	 * spinner — these tiles have already settled, and a spinner that never
	 * resolves is its own lie.
	 */
	const prsUnknown = backed && backendPrs.isError;
	const outletsUnknown = backed && backendOutlets.isError;
	const payoutUnknown = backed && (backendPvs.isError || backendPrs.isError);
	const isFinance = agencySubRole === "agency_finance";
	const can = useAgencyCan();
	/*
	 * ⚠️ THE PERMISSION, NOT THE LANE — and the lane test was out of date.
	 *
	 * "PRs needed today" and the auto-assign panel are both about ASSIGNING: the
	 * tile counts open slots and links to the roster, the panel proposes pairs
	 * and confirms them. Both were hidden behind a hardcoded `!isFinance`,
	 * written when Finance was read-only on the roster.
	 *
	 * Finance has held `roster:update` (`assignShifts`) since 12 Sep 2026 —
	 * owner's rule, "other agency orgs member can assign member" — and the
	 * banner three screens down was already corrected to say so: "you can review
	 * and sign vouchers, and assign PRs on the roster". The page promised the
	 * work and then hid the two surfaces that start it.
	 *
	 * Asking `assignShifts` also keeps the Director out, which `!isFinance`
	 * never did: they hold `viewWorkforce` and were shown an auto-assign panel
	 * whose confirm the server refuses.
	 */
	const canAssignShifts = can("assignShifts");
	/*
	 * The SAME test `canAccessAgencyPath` applies to `/agency/prs` and
	 * `/agency/outlets`. Repeating the route's own rule here is what keeps the
	 * tile a plain figure for a role the destination would bounce, instead of a
	 * link that lands on a refusal.
	 *
	 * ⚠️ `managePr` ALONE since 12 Sep 2026. This read `showWorkforce ||
	 * can("managePr")`, and EVERY agency lane holds `workforce:read` — so the
	 * plain-figure branch was unreachable and the tile always linked. Both
	 * destinations hard-refuse on `managePr`, so Finance and Director followed a
	 * live link to "Access restricted" (reproduced in a browser). The route rule
	 * was corrected to match its pages; this now mirrors it again.
	 */
	const canOpenRecords = can("managePr");
	const { t } = usePortalLocale();

	return (
		<div className="iz-screen iz-portal-page">
			{/* The page names itself, like every other page in both portals.
			    This heading and its clock used to be drawn by the SHELL, on a
			    path test, which is why the date sat above the title on Roster and
			    below it here. `iconKey` takes the ENGLISH lookup key, not the
			    rendered words: `iconForNav` matches on text, so a translated
			    "今天" would resolve to a "?" glyph. */}
			<IzPageTitle level={1} iconKey="Today" dateTime>
				{t.common.today}
			</IzPageTitle>
			<div className="iz-portal-kpi-grid iz-portal-desktop-only">
				<KpiTile
					label={t.agencyHome.totalPr}
					value={prsUnknown ? "—" : totalPrs}
					to={canOpenRecords ? "/agency/prs" : undefined}
				/>
				<KpiTile
					label={t.agencyHome.totalOutlets}
					value={outletsUnknown ? "—" : totalOutlets}
					to={canOpenRecords ? "/agency/outlets" : undefined}
				/>
				{/* Rendered only for roles that can actually staff a shift, so the
				    hook inside it — and its roster queries — never mount for
				    finance, who holds no `viewLiveFloor` and would 403 on some. */}
				{canAssignShifts && <PrNeededKpi />}
				<Link
					to="/agency/pv"
					search={{ status: "TO_PAY" }}
					className="iz-portal-kpi iz-portal-kpi-payout no-underline"
				>
					<div className="l">{t.agencyHome.pendingPayout}</div>
					{/* An em dash, never RM 0.00, when the voucher or roster fetch
					    failed — see the note beside `payoutUnknown`. */}
					<div className="n">
						{payoutUnknown ? "—" : formatRM(prToPayTotal)}
					</div>
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
					{/* What the agency owes InnocenZ for its OWN subscription — not the
					    payout it owes its PRs, which is the KPI tile above. Two different
					    directions of money, so they must never share a surface. Hidden
					    entirely at zero. */}
					<UnpaidBillingBanner portal="agency" />

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

				{canAssignShifts && (
					<aside className="iz-portal-home-aside iz-portal-desktop-only">
						<AiSuggestionsPanel />
					</aside>
				)}
			</div>

			<IconGuide className="iz-icon-guide--portal mt-6" />
		</div>
	);
}
