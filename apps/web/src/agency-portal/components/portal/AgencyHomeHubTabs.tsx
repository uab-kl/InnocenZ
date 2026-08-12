import { workingDayIso } from "@agency-portal/components/agency/AgencyReceiptsPanel";
import { formatRM, IzPill } from "@agency-portal/components/iz/ui";
import { LiveWorkforceTable } from "@agency-portal/components/portal/LiveWorkforceTable";
import { PortalClickableTableRow } from "@agency-portal/components/portal/PortalClickableTableRow";
import { PortalTableAvatar } from "@agency-portal/components/portal/PortalTableAvatar";
import { useAgencyApprovalQueue } from "@agency-portal/hooks/use-agency-approval-queue";
import { useAgencyDisputes } from "@agency-portal/hooks/use-agency-disputes";
import { useAgencyOvertime } from "@agency-portal/hooks/use-agency-overtime";
import { useAgencyPrPhotos } from "@agency-portal/hooks/use-agency-pr-photos";
import { useAgencyPvs } from "@agency-portal/hooks/use-agency-pvs";
import { useAgencyReceipts } from "@agency-portal/hooks/use-agency-receipts";
import { rosterSlotsForAgency } from "@agency-portal/lib/agency-demo";
import { agencyPvStatusLabel } from "@agency-portal/lib/agency-payroll";
import type { AgencySubRole } from "@agency-portal/lib/agency-rbac";
import { cutlostRequestTitle } from "@agency-portal/lib/outlet-cutlost-requests";
import { deriveLiveWorkforce } from "@agency-portal/lib/portal-sync";
import { pvStatusPillVariant } from "@agency-portal/lib/pr-demo";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCanFor } from "@agency-portal/lib/use-portal-can";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

type HubTab =
	| "on-duty"
	| "approvals"
	| "review"
	| "disputes"
	| "receipts"
	| "overtime";

/**
 * What colour a tab's number goes when it is non-zero and NOT the open tab.
 *
 * Red is reserved for a PR contesting money — the only one of these where
 * somebody is already unhappy. The rest are amber: outstanding work, nothing
 * wrong yet. Green means people are on the floor, which is good news.
 */
const HUB_TAB_ALERT_COLOR: Record<HubTab, string> = {
	"on-duty": "text-[var(--iz-green)]",
	approvals: "text-[var(--iz-amber)]",
	review: "text-[var(--iz-amber)]",
	disputes: "text-[var(--iz-red)]",
	receipts: "text-[var(--iz-amber)]",
	overtime: "text-[var(--iz-amber)]",
};

/** The PR app's own words for each bucket, so both sides read the same. */
const DISPUTE_COMPONENT_LABEL: Record<string, string> = {
	wages: "Daily wages",
	drinks: "Drinks",
	tips: "Tips",
	others: "Others",
};

/** "2026-08-06" -> "Thu 6 Aug", the day the PR is contesting. */
function formatDisputeDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

function HubPanelLink({
	to,
	search,
	label,
}: {
	to: string;
	search?: Record<string, string>;
	label: string;
}) {
	return (
		<Link to={to} search={search} className="iz-portal-hub-link">
			{label} <ChevronRight className="shrink-0" />
		</Link>
	);
}

export function AgencyHomeHubTabs({
	agencySubRole,
}: {
	agencySubRole: AgencySubRole | null;
}) {
	const allAgencyRoster = useStore((s) => s.agencyRoster);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const agencyRoster = useMemo(
		() => rosterSlotsForAgency(allAgencyRoster, allAgencyPRs, activeAgencyId),
		[allAgencyRoster, allAgencyPRs, activeAgencyId],
	);
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);
	/**
	 * Vouchers and disputes from the BACKEND — the same two sources the Payroll
	 * screen reads.
	 *
	 * These tiles read the demo store slice `prPaymentVouchers`, which boots EMPTY
	 * on a real login. So the home page reported "PENDING AGENCY REVIEW 0" and
	 * "DISPUTES 0" while /agency/pv showed a real pending-review voucher and a real
	 * open dispute one click away — the tiles were not counting a different week,
	 * they were counting a different database.
	 *
	 * Both hooks are agency-scoped server-side and share their query keys with the
	 * Payroll screen, so react-query dedupes: no extra request, and the two screens
	 * cannot disagree.
	 */
	const { pvs: prPaymentVouchers } = useAgencyPvs();
	/**
	 * OPEN disputes, every week.
	 *
	 * Deliberately NOT week-scoped, unlike the Payroll sub-tab, which now sits with
	 * the week the claim was disputed in. This is the home page — the screen that
	 * answers "what needs me today" — so a claim must appear here whatever week it
	 * belongs to. That split is what lets Payroll scope by week without a blocker
	 * going dark.
	 */
	const { disputes: openDisputes, isLoading: disputesLoading } =
		useAgencyDisputes();
	/**
	 * Receipts still waiting on the agency, and overtime nobody has decided.
	 *
	 * Both are BLOCKERS rather than statistics: a voucher cannot be sent while one
	 * of its receipts sits at `pending`, and an undecided overtime claim holds its
	 * whole payroll week. Before this they were reachable only by opening Payroll
	 * and picking the right sub-tab, so the reason a week would not go out was two
	 * clicks from the screen that is supposed to say what is outstanding.
	 *
	 * Not week-scoped, for the same reason the disputes list here is not: this is
	 * the home page, and a blocker in any week still needs somebody today.
	 */
	const { receipts: allReceipts, isLoading: receiptsLoading } =
		useAgencyReceipts();
	const pendingReceipts = useMemo(
		() => allReceipts.filter((r) => r.status === "pending"),
		[allReceipts],
	);
	// Every row this endpoint returns is undecided — that is what it selects on —
	// so there is nothing further to filter.
	const { claims: pendingOvertime, isLoading: overtimeLoading } =
		useAgencyOvertime();

	const can = useAgencyCanFor(agencySubRole);
	/**
	 * `viewLiveFloor`, NOT `viewWorkforce`.
	 *
	 * This tile is who is on shift at this moment; `viewWorkforce` is the roster and
	 * the PR records, and finance holds that. Gating the tile on the broader
	 * permission is what put a live-floor tab on the finance home page underneath
	 * "Read-only overview — payroll & PV only", and it could not be taken off
	 * without also taking away Roster.
	 */
	const showWorkforce = can("viewLiveFloor");
	const showApprovals = can("approvePrSignups");
	const showPayroll = can("viewPv");
	/**
	 * Faces for the rows below. Every payroll row names its PR by `pr_id` and
	 * nothing else, so the photo has to be looked up — see use-agency-pr-photos.
	 *
	 * Gated on `viewWorkforce` because that is the permission behind the PR
	 * records the lookup reads. A role without it gets initials rather than a
	 * request that would 403 on every home page load.
	 */
	const prPhoto = useAgencyPrPhotos({ enabled: can("viewWorkforce") });

	const tabs = useMemo(() => {
		const list: { id: HubTab; label: string }[] = [];
		if (showWorkforce) list.push({ id: "on-duty", label: "PR ON DUTY" });
		if (showApprovals)
			list.push({ id: "approvals", label: "PENDING APPROVALS" });
		if (showPayroll) {
			list.push({ id: "review", label: "PENDING AGENCY REVIEW" });
			list.push({ id: "disputes", label: "DISPUTES" });
			// Both gate a week from going out — a pending receipt blocks its voucher
			// from being sent, an undecided overtime claim holds its whole payroll
			// week — so both belong on the screen that says what needs doing today.
			list.push({ id: "receipts", label: "PENDING RECEIPTS" });
			list.push({ id: "overtime", label: "PENDING OVERTIME" });
		}
		return list;
	}, [showWorkforce, showApprovals, showPayroll]);

	const defaultTab = tabs[0]?.id ?? "on-duty";
	const [tab, setTab] = useState<HubTab>(defaultTab);
	const activeTab = tabs.some((t) => t.id === tab) ? tab : defaultTab;

	const workforce = useMemo(
		() =>
			deriveLiveWorkforce(
				agencyRoster,
				DEFAULT_ROSTER_DATE_ISO,
				outletCommissionRules,
				perDrinkRm,
			),
		[agencyRoster, outletCommissionRules, perDrinkRm],
	);

	// One source with `/agency/pending`, so this tile can never again show 0 next
	// to a page listing real work. All four terms below are what its three tabs
	// count — MC/leave included, which this tile used to omit entirely.
	const approvals = useAgencyApprovalQueue();
	const { signups, linkRequests, cutlostRequests, leaveRequests } = approvals;
	const pendingReview = prPaymentVouchers.filter(
		(p) => p.status === "PENDING_REVIEW",
	);
	/**
	 * The dispute count is the DISPUTE TABLE's, not a voucher status.
	 *
	 * This filtered vouchers on `status === "DISPUTED"`, which is a different fact.
	 * A dispute is one row per day per component (`pv_dispute`); the voucher it
	 * hangs off does not have to be flipped to DISPUTED for a claim to be open, and
	 * on the live data it was not — so this tile read 0 against a real open claim.
	 * Counting the rows the reviewer must actually decide is the only number that
	 * matches the dispute queue.
	 */
	const counts: Record<HubTab, number> = {
		"on-duty": workforce.length,
		approvals: approvals.total,
		review: pendingReview.length,
		disputes: openDisputes.length,
		receipts: pendingReceipts.length,
		overtime: pendingOvertime.length,
	};

	if (tabs.length === 0) return null;

	return (
		<section className="iz-portal-panel iz-agency-home-hub">
			<div className="iz-agency-home-tabs">
				{tabs.map((t) => (
					<button
						key={t.id}
						type="button"
						className={`iz-agency-home-tab${activeTab === t.id ? " on" : ""}`}
						onClick={() => setTab(t.id)}
					>
						<div className="l">{t.label}</div>
						{/* A lookup, not a ternary chain. This was four nested conditionals
						    for four tabs; at six it stops being readable, and the next
						    person adding a tab would have had to work out where in the
						    chain it belongs rather than just naming its colour. */}
						<div
							className={`n${
								activeTab !== t.id && counts[t.id] > 0
									? ` ${HUB_TAB_ALERT_COLOR[t.id]}`
									: ""
							}`}
						>
							{counts[t.id]}
						</div>
					</button>
				))}
			</div>

			{activeTab === "on-duty" && showWorkforce && (
				<LiveWorkforceTable embedded linkPrProfiles />
			)}

			{activeTab === "approvals" && showApprovals && (
				<>
					<div className="iz-portal-panel-head">
						<h3 className="font-sora text-base font-bold">Pending approvals</h3>
						<HubPanelLink to="/agency/pending" label="Open approvals" />
					</div>
					{approvals.total === 0 ? (
						<p className="iz-tiny iz-muted px-4 py-6 text-center">
							{approvals.isLoading
								? "Loading approvals…"
								: "Nothing awaiting approval."}
						</p>
					) : (
						<div className="iz-portal-table-wrap">
							<table className="iz-portal-table">
								<thead>
									<tr>
										<th>Outlet / PR</th>
										<th>Type</th>
										<th>Details</th>
									</tr>
								</thead>
								<tbody>
									{signups.map((p) => (
										<PortalClickableTableRow
											key={p.id}
											target={{ to: "/agency/pending" }}
										>
											<td>
												<div className="iz-portal-table-pr">
													{/* A pending sign-up is not on the roster yet, so the
													    lookup cannot see her — but the Approvals payload
													    already carries her own photos, resolved. Her selfie
													    IS the account's profile photo. */}
													<PortalTableAvatar
														name={p.name}
														photo={
															p.selfiePhoto ??
															p.comcardImageUrl ??
															p.portfolioPhotos?.find(Boolean)
														}
													/>
													<span className="iz-portal-table-name">{p.name}</span>
												</div>
											</td>
											<td className="iz-portal-table-meta">New signup</td>
											<td className="iz-portal-table-meta">
												{p.languages || p.mobile}
											</td>
										</PortalClickableTableRow>
									))}
									{linkRequests.map((l) => (
										<PortalClickableTableRow
											key={l.id}
											target={{ to: "/agency/pending" }}
										>
											<td>
												<div className="iz-portal-table-pr">
													<PortalTableAvatar
														name={l.prName}
														photo={prPhoto(l.prId, l.prName)}
													/>
													<span className="iz-portal-table-name">
														{l.prName}
													</span>
												</div>
											</td>
											<td className="iz-portal-table-meta">Link request</td>
											<td className="iz-portal-table-meta">
												Wants to link · {l.requestedAt}
											</td>
										</PortalClickableTableRow>
									))}
									{leaveRequests.map((req) => {
										const prName = req.prName ?? "PR";
										return (
											<PortalClickableTableRow
												key={req.id}
												target={{
													to: "/agency/pending",
													search: { tab: "leaves" },
												}}
											>
												<td>
													<div className="iz-portal-table-pr">
														<PortalTableAvatar
															name={prName}
															photo={prPhoto(req.prId, req.prName)}
														/>
														<span className="iz-portal-table-name">
															{prName}
														</span>
													</div>
												</td>
												<td className="iz-portal-table-meta">MC / leave</td>
												<td className="iz-portal-table-meta">
													{req.outletName ?? "Outlet"} · {req.shiftDate ?? "—"}
												</td>
											</PortalClickableTableRow>
										);
									})}
									{cutlostRequests.map((req) => (
										<PortalClickableTableRow
											key={req.id}
											target={{
												to: "/agency/pending",
												search: { tab: "cutlost" },
											}}
										>
											<td>
												<div className="iz-portal-table-pr">
													{/* An OUTLET, not a PR — so NOT `prPhoto`, which would
													    be the wrong source for a venue. The row carries the
													    venue's own logo (`outletLogo`), which is the only
													    picture that can be right here. */}
													<PortalTableAvatar
														name={req.outletName}
														photo={req.outletLogo}
													/>
													<span className="iz-portal-table-name">
														{req.outletName}
													</span>
												</div>
											</td>
											<td className="iz-portal-table-meta">Cutlost request</td>
											<td className="iz-portal-table-meta">
												{cutlostRequestTitle(req)} · ~RM{" "}
												{Math.round(req.estimatedSavings).toLocaleString(
													"en-MY",
												)}
											</td>
										</PortalClickableTableRow>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}

			{activeTab === "review" && showPayroll && (
				<>
					<div className="iz-portal-panel-head">
						<h3 className="font-sora text-base font-bold">PV pending review</h3>
						<HubPanelLink
							to="/agency/pv"
							search={{ status: "PENDING_REVIEW" }}
							label="Open payroll"
						/>
					</div>
					{pendingReview.length === 0 ? (
						<p className="iz-tiny iz-muted px-4 py-6 text-center">
							No PVs awaiting review.
						</p>
					) : (
						<div className="iz-portal-table-wrap">
							<table className="iz-portal-table">
								<thead>
									<tr>
										<th>PR</th>
										<th>Outlet</th>
										<th>Net</th>
										<th>Status</th>
									</tr>
								</thead>
								<tbody>
									{pendingReview.map((pv) => (
										<PortalClickableTableRow
											key={pv.id}
											target={{
												to: "/agency/pv",
												search: { pv: pv.id, status: "PENDING_REVIEW" },
											}}
										>
											<td>
												<div className="iz-portal-table-pr">
													<PortalTableAvatar
														name={pv.prName}
														photo={prPhoto(pv.prId, pv.prNickname ?? pv.prName)}
													/>
													<span className="iz-portal-table-name">
														{pv.prName}
													</span>
												</div>
											</td>
											<td className="iz-portal-table-meta">{pv.outlet}</td>
											<td className="iz-portal-table-meta">
												{formatRM(pv.net)}
											</td>
											<td className="iz-portal-table-status">
												<IzPill
													variant={pvStatusPillVariant(pv.status)}
													className="!py-0.5 !text-[9px]"
												>
													{agencyPvStatusLabel(pv.status)}
												</IzPill>
											</td>
										</PortalClickableTableRow>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}

			{activeTab === "disputes" && showPayroll && (
				<>
					<div className="iz-portal-panel-head">
						<h3 className="font-sora text-base font-bold">Open disputes</h3>
						{/* `?tab=disputes`, NOT `?status=DISPUTED`. The claim's voucher is
						    usually still SENT, so a status link filtered the voucher list to
						    nothing and told the agency there was no dispute — on the very
						    row it was launched from. */}
						<HubPanelLink
							to="/agency/pv"
							search={{ tab: "disputes" }}
							label="Open payroll"
						/>
					</div>
					{openDisputes.length === 0 ? (
						<p className="iz-tiny iz-muted px-4 py-6 text-center">
							{disputesLoading ? "Loading disputes…" : "No open disputes."}
						</p>
					) : (
						<div className="iz-portal-table-wrap">
							<table className="iz-portal-table">
								<thead>
									<tr>
										<th>PR</th>
										{/* The day and the bucket, because that is what a dispute IS
										    — one claim about one component of one day. A voucher-level
										    row could not say which. */}
										<th>Day</th>
										<th>Component</th>
										<th>Voucher says</th>
									</tr>
								</thead>
								<tbody>
									{openDisputes.map((d) => {
										const prName =
											d.voucher?.prNickname?.trim() ||
											d.voucher?.prName?.trim() ||
											"PR";
										return (
											<PortalClickableTableRow
												key={d.id}
												target={{
													to: "/agency/pv",
													search: { tab: "disputes" },
												}}
											>
												<td>
													<div className="iz-portal-table-pr">
														<PortalTableAvatar
															name={prName}
															photo={prPhoto(d.voucher?.prId, prName)}
														/>
														<span className="iz-portal-table-name">
															{prName}
														</span>
													</div>
												</td>
												<td className="iz-portal-table-meta">
													{formatDisputeDay(d.disputeDate)}
												</td>
												<td className="iz-portal-table-meta">
													{DISPUTE_COMPONENT_LABEL[d.component] ?? d.component}
												</td>
												<td className="iz-portal-table-meta">
													{formatRM(Number(d.disputedAmount ?? 0))}
												</td>
											</PortalClickableTableRow>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}

			{activeTab === "receipts" && showPayroll && (
				<>
					<div className="iz-portal-panel-head">
						<h3 className="font-sora text-base font-bold">
							Receipts waiting on you
						</h3>
						<HubPanelLink
							to="/agency/pv"
							search={{ tab: "receipts" }}
							label="Open payroll"
						/>
					</div>
					{pendingReceipts.length === 0 ? (
						<p className="iz-tiny iz-muted px-4 py-6 text-center">
							{receiptsLoading
								? "Loading receipts…"
								: "No receipts awaiting approval."}
						</p>
					) : (
						<div className="iz-portal-table-wrap">
							<table className="iz-portal-table">
								<thead>
									<tr>
										<th>PR</th>
										<th>Receipt</th>
										<th>Shift day</th>
										<th>Logged</th>
									</tr>
								</thead>
								<tbody>
									{pendingReceipts.map((r) => {
										const prName =
											r.prNickname?.trim() || r.prName?.trim() || "PR";
										return (
											<PortalClickableTableRow
												key={r.id}
												// Carry the receipt id, not just the sub-tab. The
												// receipts list is scoped to the SELECTED WEEK, so
												// `tab=receipts` alone landed on whichever week the
												// page defaults to and showed a list this receipt was
												// not in — which reads as a broken link. The id lets
												// the page open the week that holds it and scroll to
												// the row.
												target={{
													to: "/agency/pv",
													search: { tab: "receipts", receipt: r.id },
												}}
											>
												<td>
													<div className="iz-portal-table-pr">
														<PortalTableAvatar
															name={prName}
															photo={prPhoto(r.prId, prName)}
														/>
														<span className="iz-portal-table-name">
															{prName}
														</span>
													</div>
												</td>
												<td className="iz-portal-table-meta">{r.receiptNo}</td>
												{/* The working day the money belongs to — the SAME rule
												    the Payroll receipts panel uses (`workingDayIso`:
												    line date, then the printed date, then logged-at).
												    Reading `receiptDate` directly printed a different
												    day for the same receipt: live rows carry
												    `receipt_date` = 16 Jun against lines dated 6 and
												    10 Aug, so this row said "Tue 16 Jun" while Payroll
												    filed it under "Mon 10 Aug". */}
												<td className="iz-portal-table-meta">
													{formatDisputeDay(workingDayIso(r))}
												</td>
												<td className="iz-portal-table-status">
													<IzPill
														variant="amber"
														className="!py-0.5 !text-[9px]"
													>
														{r.source === "manual" ? "Self-log" : "Scanned"}
													</IzPill>
												</td>
											</PortalClickableTableRow>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}

			{activeTab === "overtime" && showPayroll && (
				<>
					<div className="iz-portal-panel-head">
						<h3 className="font-sora text-base font-bold">
							Overtime awaiting a decision
						</h3>
						<HubPanelLink
							to="/agency/pv"
							search={{ tab: "overtime" }}
							label="Open payroll"
						/>
					</div>
					{pendingOvertime.length === 0 ? (
						<p className="iz-tiny iz-muted px-4 py-6 text-center">
							{overtimeLoading
								? "Loading overtime claims…"
								: "No overtime awaiting a decision."}
						</p>
					) : (
						<div className="iz-portal-table-wrap">
							<table className="iz-portal-table">
								<thead>
									<tr>
										<th>PR</th>
										<th>Outlet</th>
										<th>Shift day</th>
										{/* Priced server-side. Never recomputed from the minutes, or
										    the tile could name one figure while another lands on
										    the voucher. */}
										<th>Pays</th>
									</tr>
								</thead>
								<tbody>
									{pendingOvertime.map((c) => {
										const prName = c.prName?.trim() || "PR";
										return (
											<PortalClickableTableRow
												key={c.assignmentId}
												target={{
													to: "/agency/pv",
													search: { tab: "overtime" },
												}}
											>
												<td>
													<div className="iz-portal-table-pr">
														<PortalTableAvatar
															name={prName}
															photo={prPhoto(c.prId, prName)}
														/>
														<span className="iz-portal-table-name">
															{prName}
														</span>
													</div>
												</td>
												<td className="iz-portal-table-meta">
													{c.outletName ?? "Outlet"}
												</td>
												<td className="iz-portal-table-meta">
													{c.shiftDate
														? formatDisputeDay(c.shiftDate.slice(0, 10))
														: "—"}
												</td>
												<td className="iz-portal-table-meta">
													{formatRM(Number(c.amount ?? 0))}
												</td>
											</PortalClickableTableRow>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
		</section>
	);
}
