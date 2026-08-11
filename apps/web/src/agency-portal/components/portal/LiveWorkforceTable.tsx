import {
	comcardPreviewFromSlot,
	PrComcardIdentity,
} from "@agency-portal/components/agency/PrComcardIdentity";
import { PrFaceBubble } from "@agency-portal/components/agency/PrFaceBubble";
import { RosterAmountButton } from "@agency-portal/components/agency/RosterAmountButton";
import {
	type RosterEarningsSheetKind,
	RosterShiftEarningsSheets,
} from "@agency-portal/components/agency/RosterShiftEarningsSheets";
import { formatRM, IzPill } from "@agency-portal/components/iz/ui";
import { PortalClickableTableRow } from "@agency-portal/components/portal/PortalClickableTableRow";
import { usePrPhotoById } from "@agency-portal/hooks/use-pr-photo";
import type {
	AgencyManagedPR,
	AgencyRosterSlot,
	LiveWorkforceEntry,
} from "@agency-portal/lib/agency-demo";
import {
	agencyPortalLabel,
	resolveRosterPrName,
	rosterSlotAgencyName,
	rosterSlotsForAgency,
	scopeToAgency,
} from "@agency-portal/lib/agency-demo";
import { formatAttendanceStamp } from "@agency-portal/lib/attendance-stamp";
import {
	type OutletPrLiveSales,
	type RosterShiftEarningsContext,
	rosterSlotLiveFloorSales,
} from "@agency-portal/lib/outlet-financial-sync";
import {
	deriveLiveWorkforce,
	outletMatches,
} from "@agency-portal/lib/portal-sync";
import { formatPrDisplayName } from "@agency-portal/lib/pr-demo";
import { formatRosterShiftTime } from "@agency-portal/lib/pr-session";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { useStore } from "@agency-portal/lib/store";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function formatFloorDrinks(floor: OutletPrLiveSales): string {
	return floor.drinkSalesRm > 0 ? formatRM(floor.drinkSalesRm) : "—";
}

function formatFloorTips(floor: OutletPrLiveSales): string {
	return floor.tipRm > 0 ? formatRM(floor.tipRm) : "—";
}

const LIVE_STATUS_LABEL: Record<
	LiveWorkforceEntry["status"],
	{ label: string; variant: "green" | "amber" | "red" | "violet" | "ink" }
> = {
	"on-duty": { label: "On duty", variant: "green" },
	"en-route": { label: "Scheduled", variant: "ink" },
	"checked-out": { label: "Checked out", variant: "ink" },
	out: { label: "Out", variant: "ink" },
};

export function workforceStatusVariant(
	status: LiveWorkforceEntry["status"] | "scheduled" | "checked-out",
) {
	if (status === "on-duty") return "green" as const;
	if (status === "en-route") return "violet" as const;
	if (status === "scheduled") return "amber" as const;
	if (status === "checked-out") return "ink" as const;
	return "ink" as const;
}

export function workforceStatusLabel(
	status: LiveWorkforceEntry["status"] | "scheduled" | "checked-out",
) {
	if (status === "on-duty") return "ON-DUTY";
	if (status === "en-route") return "EN-ROUTE";
	if (status === "scheduled") return "BOOKED";
	if (status === "checked-out") return "RELEASED";
	return "OUT";
}

function WorkforceRow({
	entry,
	slot,
	profile,
	floor,
	prId,
	agencyLabel,
	onOpenEarningsSheet,
}: {
	entry: LiveWorkforceEntry;
	slot?: AgencyRosterSlot;
	profile?: AgencyManagedPR;
	floor: OutletPrLiveSales;
	prId?: string;
	agencyLabel?: string;
	onOpenEarningsSheet?: (
		kind: RosterEarningsSheetKind,
		slot: AgencyRosterSlot,
	) => void;
}) {
	const st = LIVE_STATUS_LABEL[entry.status];
	const previewSlot = slot ?? { prId: prId ?? entry.id, prName: entry.prName };
	const label = agencyLabel ?? (slot ? rosterSlotAgencyName(slot) : undefined);

	return (
		<PortalClickableTableRow
			target={prId ? { to: "/agency/prs", search: { pr: prId } } : undefined}
		>
			<td>
				<div className="iz-portal-table-pr">
					<PrComcardIdentity
						pr={comcardPreviewFromSlot(previewSlot, profile)}
						profile={profile}
						agencyName={label}
					/>
					<div className="iz-portal-table-pr-meta">
						<span className="iz-portal-table-name">{entry.prName}</span>
						{profile?.trainingLevel && (
							<span className="iz-roster-tier-tag">
								{profile.trainingLevel}
							</span>
						)}
					</div>
				</div>
			</td>
			<td className="iz-portal-table-meta">{label ?? "—"}</td>
			<td className="iz-portal-table-meta">{entry.outlet}</td>
			<td className="iz-portal-table-meta iz-portal-table-shift">
				{slot ? formatRosterShiftTime(slot) : "—"}
			</td>
			<td className="iz-portal-table-meta">
				{(() => {
					// Local time, never the raw UTC stamp a backend slot carries.
					const stamp = slot?.checkedInAt ?? entry.checkIn;
					return stamp ? formatAttendanceStamp(stamp, slot?.dateIso) : "—";
				})()}
			</td>
			<td className="iz-portal-table-status">
				<IzPill variant={st.variant} className="!py-0.5 !text-[9px]">
					{st.label}
				</IzPill>
			</td>
			<td className="iz-portal-table-meta">
				{onOpenEarningsSheet && slot ? (
					<RosterAmountButton
						label="drinks"
						stopRowNavigation
						onClick={() => onOpenEarningsSheet("drinks", slot)}
					>
						{formatFloorDrinks(floor)}
					</RosterAmountButton>
				) : (
					formatFloorDrinks(floor)
				)}
			</td>
			<td className="iz-portal-table-meta">
				{onOpenEarningsSheet && slot ? (
					<RosterAmountButton
						label="tips"
						stopRowNavigation
						onClick={() => onOpenEarningsSheet("tips", slot)}
					>
						{formatFloorTips(floor)}
					</RosterAmountButton>
				) : (
					formatFloorTips(floor)
				)}
			</td>
		</PortalClickableTableRow>
	);
}

export function LiveWorkforceTable({
	dateIso = DEFAULT_ROSTER_DATE_ISO,
	rosterLink = "/agency/roster",
	title = "Live workforce",
	outletFilter,
	linkPrProfiles = false,
	hideHeaderLink = false,
	embedded = false,
	className,
}: {
	dateIso?: string;
	rosterLink?: string;
	title?: string;
	outletFilter?: string;
	linkPrProfiles?: boolean;
	hideHeaderLink?: boolean;
	embedded?: boolean;
	className?: string;
}) {
	// Agency portal — scope live workforce to PRs under the signed-in agency
	// (ownership or dual-tied membership). Outlet live floor uses a separate component.
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const allAgencyRoster = useStore((s) => s.agencyRoster);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const agencyPRs = useMemo(
		() => scopeToAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	const agencyRoster = useMemo(
		() => rosterSlotsForAgency(allAgencyRoster, allAgencyPRs, activeAgencyId),
		[allAgencyRoster, allAgencyPRs, activeAgencyId],
	);
	const shifts = useStore((s) => s.shifts);
	const drinkMenu = useStore((s) => s.outletWorkspace.drinkMenu ?? []);
	const receiptScans = useStore((s) => s.prReceiptScans ?? []);
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);
	const happyHourStart = useStore((s) => s.outletWorkspace.happyHourStart);
	const happyHourEnd = useStore((s) => s.outletWorkspace.happyHourEnd);
	const workspaceTierRates = useStore((s) => s.outletWorkspace.tierRates);
	const commissionOnlyRates = useStore(
		(s) => s.outletWorkspace.commissionOnlyRates,
	);

	const [earningsSheet, setEarningsSheet] = useState<{
		kind: RosterEarningsSheetKind;
		slot: AgencyRosterSlot;
	} | null>(null);

	const rosterScope = useMemo(
		() => agencyRoster.filter((slot) => slot.dateIso === dateIso),
		[agencyRoster, dateIso],
	);

	const earningsContext = useMemo((): RosterShiftEarningsContext | null => {
		if (!workspaceTierRates) return null;
		return {
			rosterScope,
			agencyPRs,
			outletShifts: shifts as RosterShiftEarningsContext["outletShifts"],
			drinkMenu,
			receiptScans,
			happyHourStart,
			happyHourEnd,
			workspaceTierRates,
			commissionOnlyRates,
		};
	}, [
		rosterScope,
		agencyPRs,
		shifts,
		drinkMenu,
		receiptScans,
		happyHourStart,
		happyHourEnd,
		workspaceTierRates,
		commissionOnlyRates,
	]);

	const openEarningsSheet = (
		kind: RosterEarningsSheetKind,
		slot: AgencyRosterSlot,
	) => {
		setEarningsSheet({ kind, slot });
	};
	const workforce = useMemo(
		() =>
			deriveLiveWorkforce(
				agencyRoster,
				dateIso,
				outletCommissionRules,
				perDrinkRm,
				agencyPRs,
			),
		[agencyRoster, dateIso, outletCommissionRules, perDrinkRm, agencyPRs],
	);
	const filtered = outletFilter
		? workforce.filter(
				(w) => w.outlet === outletFilter || w.outlet.includes(outletFilter),
			)
		: workforce;

	const slotById = useMemo(() => {
		const map = new Map<string, AgencyRosterSlot>();
		for (const slot of agencyRoster) {
			if (slot.id) map.set(slot.id, slot);
		}
		return map;
	}, [agencyRoster]);

	const prIdBySlotId = useMemo(() => {
		const map = new Map<string, string>();
		for (const slot of agencyRoster) {
			if (slot.id && slot.prId) map.set(slot.id, slot.prId);
		}
		return map;
	}, [agencyRoster]);

	const prById = useMemo(
		() => new Map(agencyPRs.map((p) => [p.id, p])),
		[agencyPRs],
	);
	const viewingAgencyLabel = agencyPortalLabel(activeAgencyId);

	const panelClass = ["iz-portal-panel", className].filter(Boolean).join(" ");
	const wrapClass = embedded ? className : panelClass;

	const headerLink = !hideHeaderLink && (
		<Link to={rosterLink} className="iz-portal-hub-link">
			Full roster <ChevronRight className="shrink-0" />
		</Link>
	);

	const panelHead = (
		<div className="iz-portal-panel-head">
			<h3 className="font-sora text-base font-bold">{title}</h3>
			{headerLink}
		</div>
	);

	if (filtered.length === 0) {
		if (embedded) {
			return (
				<>
					{panelHead}
					<p className="iz-tiny iz-muted px-4 py-6 text-center">
						No PRs on floor right now.
					</p>
				</>
			);
		}

		return (
			<section className={wrapClass}>
				{panelHead}
				<p className="iz-tiny iz-muted px-4 py-6 text-center">
					No PRs on floor right now.
				</p>
			</section>
		);
	}

	const tableBody = (
		<>
			<p className="iz-tiny iz-muted2 mb-2 hidden md:block px-4 md:pr-0 md:pl-2">
				Tap <strong className="text-[var(--iz-gold-l)]">Drinks</strong> or{" "}
				<strong className="text-[var(--iz-gold-l)]">Tips</strong> for shift
				breakdown.
			</p>
			<div className="iz-portal-table-wrap">
				<table className="iz-portal-table">
					<thead>
						<tr>
							<th>PR</th>
							<th>Agency</th>
							<th>Outlet</th>
							<th>Shift</th>
							<th>Check-in</th>
							<th>Status</th>
							<th>Drinks</th>
							<th>Tips</th>
						</tr>
					</thead>
					<tbody>
						{filtered.map((w) => {
							const slot = slotById.get(w.id);
							const floor = slot
								? rosterSlotLiveFloorSales({
										slot,
										outletShifts: shifts,
										drinkMenu,
										receiptScans,
									})
								: { salesRm: 0, drinkSalesRm: 0, drinkUnits: 0, tipRm: 0 };
							const prId = linkPrProfiles ? prIdBySlotId.get(w.id) : undefined;
							return (
								<WorkforceRow
									key={w.id}
									entry={w}
									slot={slot}
									profile={prId ? prById.get(prId) : undefined}
									floor={floor}
									prId={prId}
									agencyLabel={viewingAgencyLabel}
									onOpenEarningsSheet={
										earningsContext ? openEarningsSheet : undefined
									}
								/>
							);
						})}
					</tbody>
				</table>
			</div>
			{earningsContext && (
				<RosterShiftEarningsSheets
					kind={earningsSheet?.kind ?? null}
					anchorSlot={earningsSheet?.slot ?? null}
					earningsContext={earningsContext}
					onClose={() => setEarningsSheet(null)}
				/>
			)}
		</>
	);

	if (embedded) {
		return (
			<>
				{panelHead}
				{tableBody}
			</>
		);
	}

	return (
		<section className={wrapClass}>
			{panelHead}
			{tableBody}
		</section>
	);
}

/** Compact card list for outlet portal mobile/desktop */
export function LiveWorkforceList({
	dateIso = DEFAULT_ROSTER_DATE_ISO,
	outletName,
}: {
	dateIso?: string;
	outletName: string;
}) {
	const agencyRoster = useStore((s) => s.agencyRoster);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const shifts = useStore((s) => s.shifts);
	const prs = useStore((s) => s.prs);
	// Backend roster on a real login, demo store otherwise — see use-pr-photo.ts.
	const prPhotoById = usePrPhotoById();
	const syncLivePrCheckInToRoster = useStore(
		(s) => s.syncLivePrCheckInToRoster,
	);
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);

	useEffect(() => {
		syncLivePrCheckInToRoster();
	}, [syncLivePrCheckInToRoster, agencyRoster.length]);

	const tonightShift =
		shifts.find(
			(s) => s.date === "Tonight" && outletMatches(s.outletName, outletName),
		) ?? shifts.find((s) => outletMatches(s.outletName, outletName));

	const rosterTonight = useMemo(
		() =>
			agencyRoster.filter(
				(s) => s.dateIso === dateIso && outletMatches(s.outlet, outletName),
			),
		[agencyRoster, dateIso, outletName],
	);

	const rows = useMemo(() => {
		const bookedIds = tonightShift?.prs ?? [];
		const seen = new Set<string>();
		const list: {
			id: string;
			/** The PR, not the slot — `id` is the roster slot and cannot join a roster. */
			prId: string;
			prName: string;
			status: LiveWorkforceEntry["status"] | "scheduled";
		}[] = [];

		for (const prId of bookedIds) {
			if (seen.has(prId)) continue;
			seen.add(prId);
			const slot = rosterTonight.find((s) => s.prId === prId);
			const pr = prs.find((p) => p.id === prId);
			const status =
				slot?.status === "on-duty" && slot.checkedInAt
					? "on-duty"
					: slot?.status === "en-route"
						? "en-route"
						: ("scheduled" as const);
			list.push({
				id: slot?.id ?? prId,
				prId,
				prName: formatPrDisplayName(
					prId,
					resolveRosterPrName(prId, slot?.prName ?? pr?.name, agencyPRs),
				),
				status,
			});
		}

		if (list.length > 0) {
			return list.sort((a, b) => {
				const rank = (s: typeof a.status) =>
					s === "on-duty" ? 0 : s === "en-route" ? 1 : 2;
				return rank(a.status) - rank(b.status);
			});
		}

		return deriveLiveWorkforce(
			agencyRoster,
			dateIso,
			outletCommissionRules,
			perDrinkRm,
			agencyPRs,
		)
			.filter((w) => outletMatches(w.outlet, outletName))
			.map((w) => {
				// Already looked up for the display name — kept, so the row can
				// carry a face as well as a name rather than a coloured letter.
				const prId = agencyRoster.find((s) => s.id === w.id)?.prId ?? w.id;
				return {
					id: w.id,
					prId,
					prName: formatPrDisplayName(prId, w.prName),
					status: w.status,
				};
			});
	}, [
		tonightShift?.prs,
		rosterTonight,
		prs,
		agencyPRs,
		agencyRoster,
		dateIso,
		outletCommissionRules,
		perDrinkRm,
		outletName,
	]);

	const onFloorCount = rows.filter(
		(r) => r.status === "on-duty" || r.status === "en-route",
	).length;

	return (
		<section className="iz-portal-panel">
			<div className="iz-portal-panel-head">
				<h3 className="font-sora text-base font-bold">PR roster — tonight</h3>
				<span className="iz-tiny iz-muted">
					{onFloorCount} on floor · {rows.length} booked
				</span>
			</div>
			<ul className="iz-portal-roster-list">
				{rows.map((w) => (
					<li key={w.id} className="iz-portal-roster-row">
						<PrFaceBubble
							name={w.prName}
							photo={prPhotoById(w.prId, w.prName)}
							className="iz-portal-table-av"
						/>
						<span className="min-w-0 flex-1 truncate iz-portal-table-name">
							{w.prName}
						</span>
						<IzPill
							variant={workforceStatusVariant(w.status)}
							className="!py-0.5 !text-[9px]"
						>
							{workforceStatusLabel(w.status)}
						</IzPill>
					</li>
				))}
				{rows.length === 0 && (
					<li className="iz-tiny iz-muted px-4 py-5 text-center">
						No PRs booked yet.
					</li>
				)}
			</ul>
		</section>
	);
}
