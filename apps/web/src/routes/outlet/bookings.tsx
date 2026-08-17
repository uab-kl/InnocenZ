import { IzSectionLabel } from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { OutletServicePostSection } from "@agency-portal/components/outlet/outlet-service-post";
import {
	applyWorkspaceRatesToDraftShift,
	buildLanguagesLabel,
	type DraftShift,
	DraftShiftEditor,
	DraftShiftSummary,
	defaultComposerPayTierRows,
	draftTierRatesFromWorkspace,
	eachJobDateFromIsos,
	estimateDraftShiftCost,
	formatJobDate,
	formatJobDates,
	isoFromJobDate,
	newDraftShift,
	resolveDraftEventName,
	starTierToMinRating,
	workspaceTierRatesSignature,
} from "@agency-portal/components/outlet/post-job-fields";
import { PostJobActionPanel } from "@agency-portal/components/outlet/post-job-shift-ui";
import { useOutletPostJob } from "@agency-portal/hooks/use-outlet-post-job";
import { useOutletPrPool } from "@agency-portal/hooks/use-outlet-pr-pool";
import { useOutletWorkspace } from "@agency-portal/hooks/use-outlet-workspace";
import {
	getOutletSubscriptionPlan,
	isOtherDressCode,
	isOtherSpecialEvent,
	outletNamedPrCountForDate,
	outletPrHeadcountForDate,
	resolveDressCode,
} from "@agency-portal/lib/outlet-demo";
import { OUTLET_SERVICES_ENABLED } from "@agency-portal/lib/phase-flags";
import {
	basePayFromPayTierRows,
	clonePostJobPayTierRow,
	totalPrCountFromPayTierRows,
} from "@agency-portal/lib/post-job-pay-tiers";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { cn } from "@agency-portal/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { startOfToday } from "date-fns";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";

type PostJobTab = "shifts" | "services";

/**
 * The server's own explanation of a failed post, when it sent one. Every
 * rejection here is actionable by a human (link the venue to an agency, get the
 * role granted, re-activate the membership) and none of them are fixed by
 * retrying, so the message has to reach the screen.
 */
function postShiftErrorMessage(err: unknown): string {
	const message = (
		err as { response?: { data?: { message?: string } } } | undefined
	)?.response?.data?.message;
	return message?.trim() || "Could not post shifts — please try again";
}

export const Route = createFileRoute("/outlet/bookings")({
	validateSearch: (search: Record<string, unknown>): { tab?: PostJobTab } => ({
		tab: search.tab === "services" ? "services" : "shifts",
	}),

	component: PostJobPage,
});

function PostJobPage() {
	const navigate = useNavigate({ from: Route.fullPath });

	const { tab: searchTab } = Route.useSearch();

	const can = useOutletCan();
	const canPostShifts = can("postJob");

	// PHASE 2 — the agency add-on "Services" tab is deferred. The flag now lives in
	// lib/phase-flags.ts so the /outlet/special-service entry point reads the same
	// one; it used to be a local `false` here, which left that route redirecting
	// into a tab this component could never render.
	//
	// The role check is kept live alongside it rather than commented out, so
	// flipping the flag restores the feature already correctly scoped.
	const canOrderServices =
		OUTLET_SERVICES_ENABLED && can("orderSpecialService");

	const tab: PostJobTab = useMemo(() => {
		if (searchTab === "services" && canOrderServices) return "services";

		if (searchTab === "shifts" && canPostShifts) return "shifts";

		if (canPostShifts) return "shifts";

		// Never fall through to "services" while it is switched off — that would
		// select a tab with no form behind it. Reachable only for a role with
		// neither capability, which the guard below catches anyway.
		return canOrderServices ? "services" : "shifts";
	}, [searchTab, canPostShifts, canOrderServices]);

	const setTab = (next: PostJobTab) => {
		navigate({ search: { tab: next } });
	};

	const {
		createShifts,
		outletWorkspace,
		agencyPRs,
		shifts,
		outletOwner,
		toast,
	} = useStore();

	// On a real outlet session, posting writes to the backend; a demo session
	// keeps the local store. `backed` decides which path submitNew takes.
	const { backed, postShifts, isPosting, bookedShifts } = useOutletPostJob();

	// Daily plan caps count already-booked shifts. On a backed session the demo
	// `shifts` store is empty, so count the real backend bookings instead —
	// otherwise every cap silently reads zero and never triggers.
	const capShifts = backed ? bookedShifts : shifts;

	// Same story for the "Select PRs" list: the demo `prs` slice is blanked for a
	// real login, so the picker needs the backend pool or it shows nobody.
	const prPool = useOutletPrPool();
	// Same again for the price list: the Workspace page reads the outlet's real
	// `outlet_drink_menu`, so Post Job must too or the two screens disagree.
	const backedWorkspace = useOutletWorkspace();
	const workspaceMenu = backedWorkspace.workspace?.drinkMenu;
	// ...and the same again for the RATE CARD, which was still store-only. The
	// Workspace page picks the backend copy the identical way; leaving Post Job on
	// the store meant a real outlet saw blank tier rates here and a full card
	// there, and "Reset to workspace rates" reset to the blank one.
	const effectiveWorkspace =
		backedWorkspace.backed && backedWorkspace.workspace
			? backedWorkspace.workspace
			: outletWorkspace;
	const prPoolEmptyHint = !prPool.backed
		? undefined
		: prPool.isLoading
			? "Loading your PRs…"
			: "No PRs to name yet — you can only request PRs who have worked a shift at your venue. Post the shift without naming anyone and the agency will staff it.";

	const subscriptionPlan = getOutletSubscriptionPlan(
		outletOwner.subscriptionPlanId,
	);
	const outletName = outletWorkspace.outletName;

	const [composer, setComposer] = useState<DraftShift>(() =>
		newDraftShift(undefined, effectiveWorkspace),
	);

	const [draftShifts, setDraftShifts] = useState<DraftShift[]>([]);

	const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

	// The backend card arrives a beat after mount, so this signature change is
	// also what seeds a real session's composer — it starts on the store's blank
	// rates and is re-synced the moment the real ones land.
	const workspaceRatesKey = workspaceTierRatesSignature(
		effectiveWorkspace.tierRates,
	);
	const prevWorkspaceRatesKey = useRef(workspaceRatesKey);

	useEffect(() => {
		if (prevWorkspaceRatesKey.current === workspaceRatesKey) return;
		prevWorkspaceRatesKey.current = workspaceRatesKey;
		setComposer((c) => ({
			...c,
			...applyWorkspaceRatesToDraftShift(c, effectiveWorkspace),
		}));
		setDraftShifts((cur) =>
			cur.map((s) => ({
				...s,
				...applyWorkspaceRatesToDraftShift(s, effectiveWorkspace),
			})),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- sync post-job drafts when workspace rates are saved
	}, [workspaceRatesKey]);

	const namedPrsOnDate = (jobDate: Date, excludeShiftId?: string) => {
		const iso = isoFromJobDate(jobDate);
		const booked = outletNamedPrCountForDate(capShifts, outletName, iso);
		const fromDrafts = draftShifts
			.filter((d) => d.id !== excludeShiftId)
			.flatMap((d) =>
				eachJobDateFromIsos(d.selectedDateIsos).map((day) => ({
					day,
					prIds: d.prIds,
				})),
			)
			.filter(({ day }) => isoFromJobDate(day) === iso)
			.reduce((sum, { prIds }) => sum + prIds.length, 0);
		return booked + fromDrafts;
	};

	const headcountOnDate = (jobDate: Date, excludeShiftId?: string) => {
		const iso = isoFromJobDate(jobDate);
		const booked = outletPrHeadcountForDate(capShifts, outletName, iso);
		const fromDrafts = draftShifts
			.filter((d) => d.id !== excludeShiftId)
			.flatMap((d) =>
				eachJobDateFromIsos(d.selectedDateIsos).map((day) => ({
					day,
					quantity: d.quantity,
				})),
			)
			.filter(({ day }) => isoFromJobDate(day) === iso)
			.reduce((sum, { quantity }) => sum + quantity, 0);
		return booked + fromDrafts;
	};

	const peopleRemainingForShift = (
		shift: DraftShift,
		excludeShiftId?: string,
	) => {
		const days = eachJobDateFromIsos(shift.selectedDateIsos);
		if (days.length === 0) return subscriptionPlan.prPerDayMax;
		return Math.min(
			...days.map((day) =>
				Math.max(
					0,
					subscriptionPlan.prPerDayMax - headcountOnDate(day, excludeShiftId),
				),
			),
		);
	};

	const namedPrsOnDateForShift = (
		shift: DraftShift,
		excludeShiftId?: string,
	) => {
		const days = eachJobDateFromIsos(shift.selectedDateIsos);
		if (days.length === 0)
			return namedPrsOnDate(startOfToday(), excludeShiftId);
		return Math.max(...days.map((day) => namedPrsOnDate(day, excludeShiftId)));
	};

	const composerNamedPrsOnDate = useMemo(
		() => namedPrsOnDateForShift(composer),
		[composer.selectedDateIsos, capShifts, draftShifts, outletName],
	);

	const composerPeopleRemaining = useMemo(
		() => peopleRemainingForShift(composer),
		[
			composer,
			capShifts,
			draftShifts,
			subscriptionPlan.prPerDayMax,
			outletName,
		],
	);

	const prTierById = useMemo(
		() => Object.fromEntries(agencyPRs.map((p) => [p.id, p.trainingLevel])),
		[agencyPRs],
	);

	const addDraftShift = () => {
		if (composerPeopleRemaining <= 0) {
			toast("Daily PR limit reached for the selected date(s)", "warn");
			return;
		}

		if (totalPrCountFromPayTierRows(composer.payTierRows) <= 0) {
			toast("Set PR count per tier before adding a shift", "warn");
			return;
		}

		if (composer.quantity <= 0) {
			toast("Set people needed before adding a shift", "warn");
			return;
		}

		if (
			composer.eventKind === "special" &&
			isOtherSpecialEvent(composer.specialEventType) &&
			!composer.customSpecialEventName?.trim()
		) {
			toast("Name your special event type", "warn");
			return;
		}

		if (
			isOtherDressCode(composer.dressCode) &&
			!composer.customDressCode?.trim()
		) {
			toast("Name your dress code", "warn");
			return;
		}

		const snapshot = newDraftShift({
			selectedDateIsos: [...composer.selectedDateIsos],

			// Kept raw, blank included: the summary card and the post payload each
			// resolve the placeholder's suggestion, so re-editing this shift still
			// shows an empty field rather than text to delete.
			event: composer.event,

			eventKind: composer.eventKind,

			specialEventType: composer.specialEventType,

			customSpecialEventName:
				composer.customSpecialEventName?.trim() || undefined,

			eventDrinkMenu:
				composer.eventKind === "special"
					? composer.eventDrinkMenu?.map((d) => ({ ...d }))
					: undefined,

			langs: [...composer.langs],

			otherLang: composer.otherLang,

			starTiers: [...composer.starTiers],

			shiftTime: composer.shiftTime,

			quantity: composer.quantity,

			prIds: [...composer.prIds],

			payPerHour: composer.payPerHour,

			tierRates: composer.tierRates,

			payTierRows: [...composer.payTierRows],

			dressCode: composer.dressCode,

			customDressCode: composer.customDressCode?.trim() || undefined,

			destination: composer.destination,
		});

		setDraftShifts((cur) => [...cur, snapshot]);

		const resetPayTierRows = defaultComposerPayTierRows(
			effectiveWorkspace.tierRates,
			6,
		);
		setComposer((c) => ({
			...c,
			tierRates: draftTierRatesFromWorkspace(effectiveWorkspace),
			payPerHour: effectiveWorkspace.tierRates["Tier I"].wagePerHour,
			payTierRows: resetPayTierRows,
			quantity: totalPrCountFromPayTierRows(resetPayTierRows),
			prIds: [],
		}));

		setEditingShiftId(null);
	};

	const updateDraftShift = (id: string, patch: Partial<DraftShift>) => {
		setDraftShifts((cur) =>
			cur.map((s) => (s.id === id ? { ...s, ...patch } : s)),
		);
	};

	const removeDraftShift = (id: string) => {
		setDraftShifts((cur) => cur.filter((s) => s.id !== id));

		if (editingShiftId === id) setEditingShiftId(null);
	};

	const sectionDate =
		draftShifts.length > 0
			? formatJobDates(draftShifts[0].selectedDateIsos)
			: formatJobDates(composer.selectedDateIsos);

	const totalHeadcount =
		draftShifts.reduce((sum, s) => sum + s.quantity, 0) +
		(draftShifts.length === 0
			? totalPrCountFromPayTierRows(composer.payTierRows)
			: 0);

	const totalCost =
		draftShifts.reduce(
			(sum, s) => sum + estimateDraftShiftCost(s, prTierById),
			0,
		) +
		(draftShifts.length === 0
			? estimateDraftShiftCost(composer, prTierById)
			: 0);

	const shiftCountForPost = draftShifts.length > 0 ? draftShifts.length : 1;

	const submitNew = () => {
		const shiftsToPost = draftShifts.length > 0 ? draftShifts : [composer];
		if (shiftsToPost.length === 0) return;

		for (const s of shiftsToPost) {
			if (
				s.eventKind === "special" &&
				isOtherSpecialEvent(s.specialEventType) &&
				!s.customSpecialEventName?.trim()
			) {
				toast("Name your special event type before posting", "warn");
				return;
			}
			if (isOtherDressCode(s.dressCode) && !s.customDressCode?.trim()) {
				toast("Name your dress code before posting", "warn");
				return;
			}
		}

		const expandedShifts = shiftsToPost.flatMap((s) =>
			eachJobDateFromIsos(s.selectedDateIsos).map((jobDate) => ({
				...s,
				jobDate,
			})),
		);

		const byDate = new Map<string, number>();
		const byDateHeadcount = new Map<string, number>();
		for (const s of expandedShifts) {
			if (s.prIds.length > subscriptionPlan.prSelectMax) {
				toast(
					`Shift exceeds your plan — max ${subscriptionPlan.prSelectMax} named PRs per shift (${formatJobDate(s.jobDate)})`,
					"warn",
				);
				return;
			}
			if (s.quantity > subscriptionPlan.prPerDayMax) {
				toast(
					`People needed exceeds your ${subscriptionPlan.label} plan (${subscriptionPlan.prPerDayMax}/day) for ${formatJobDate(s.jobDate)}`,
					"warn",
				);
				return;
			}
			const iso = isoFromJobDate(s.jobDate);
			if (s.prIds.length > 0) {
				byDate.set(iso, (byDate.get(iso) ?? 0) + s.prIds.length);
			}
			byDateHeadcount.set(iso, (byDateHeadcount.get(iso) ?? 0) + s.quantity);
		}
		for (const [iso, total] of byDate) {
			const existing = outletNamedPrCountForDate(capShifts, outletName, iso);
			if (existing + total > subscriptionPlan.prPerDayMax) {
				toast(
					`Daily named-PR limit is ${subscriptionPlan.prPerDayMax} — ${existing} already named on ${iso}, cannot add ${total} more`,
					"warn",
				);
				return;
			}
		}
		for (const [iso, total] of byDateHeadcount) {
			const existing = outletPrHeadcountForDate(capShifts, outletName, iso);
			if (existing + total > subscriptionPlan.prPerDayMax) {
				toast(
					`Daily PR headcount limit is ${subscriptionPlan.prPerDayMax} — ${existing} already booked on ${iso}, cannot add ${total} more`,
					"warn",
				);
				return;
			}
		}

		const postItems = expandedShifts.map((s) => ({
			outletName,

			date: formatJobDate(s.jobDate),

			dateIso: isoFromJobDate(s.jobDate),

			shift: s.shiftTime,

			quantity: s.quantity,

			// Exactly what the outlet asked for — a preference, not a filter. It used
			// to fall back to the languages of the named PRs, which posted a request
			// nobody had made and made the field read as a restriction.
			languages: buildLanguagesLabel(s.langs, s.otherLang),

			// Posting straight from the composer skips addDraftShift, so fall back
			// to the placeholder's suggestion here too rather than post a blank name.
			event: resolveDraftEventName(s),

			eventKind: s.eventKind,

			specialEventType:
				s.eventKind === "special" ? s.specialEventType : undefined,

			customSpecialEventName:
				s.eventKind === "special" && isOtherSpecialEvent(s.specialEventType)
					? s.customSpecialEventName?.trim() || undefined
					: undefined,

			eventDrinkMenu:
				s.eventKind === "special"
					? s.eventDrinkMenu?.map((d) => ({ ...d }))
					: undefined,

			preferredRating: Math.min(...s.starTiers.map(starTierToMinRating)),

			preferredStarTiers: s.starTiers,

			estimatedCost: estimateDraftShiftCost(s, prTierById),

			liveSales: 0,

			payPerHour: basePayFromPayTierRows(s.payTierRows),

			tierRates: s.tierRates,

			payTierRows: s.payTierRows.map(clonePostJobPayTierRow),

			dressCode: resolveDressCode(s.dressCode, s.customDressCode),

			destination: s.destination,

			prs: s.prIds,
		}));

		const resetForm = () => {
			setComposer(newDraftShift(undefined, effectiveWorkspace));
			setDraftShifts([]);
			setEditingShiftId(null);
		};

		// Real session → persist to the backend; the outletId and routed agency are
		// resolved server-side. Pay-tier rows are persisted as per-shift rate
		// overrides; the remaining demo-only fields in postItems (drink menus,
		// dress code, star tiers, named PRs) are dropped by the mapper.
		if (backed) {
			postShifts(postItems)
				.then(() => {
					toast(
						`Posted ${postItems.length} shift${postItems.length !== 1 ? "s" : ""}`,
						"success",
					);
					resetForm();
				})
				.catch((err) => {
					// Show what the server actually said. The generic retry message hid
					// every real cause — above all "This outlet has no onboarding agency
					// to request PR from" (the venue is not linked to an agency), which
					// no amount of retrying fixes and which reads on screen as the post
					// having silently vanished.
					console.error("[PostJob] POST /shift failed", err);
					toast(postShiftErrorMessage(err), "warn");
				});
			return;
		}

		// A real session that lost its outlet identity must NOT fall through to the
		// demo store: it would list the shift as posted while nothing reached the
		// database, and the row would evaporate on the next refresh.
		if (getPortalSessionKind() === "real") {
			toast(
				"Your outlet session has expired — sign out and sign in again before posting",
				"warn",
			);
			return;
		}

		createShifts(postItems);

		resetForm();
	};

	const showTabs = canPostShifts && canOrderServices;

	/**
	 * A role that may SEE this page without posting on it — the Director.
	 *
	 * The composer still renders, because the owner asked for Post Job read-only
	 * rather than hidden: a screen describing what a shift posting involves is
	 * worth reading even when you cannot file one. What changes is that every
	 * control in it is disabled and the post/cart bar is gone.
	 *
	 * The client is not the guarantee. Posting is `booking:create` server-side,
	 * which a Director does not hold, so anything that slips past the `fieldset`
	 * is refused by the API rather than quietly accepted. This is the label, not
	 * the lock.
	 */
	const viewOnly = !canPostShifts && can("viewBookings");

	if (!canPostShifts && !canOrderServices && !viewOnly) {
		// A role that CAN order services and only lacks shift posting is not
		// restricted — the services flow is switched off for phase 2. Saying
		// "your role cannot" there blames a permission for a product decision and
		// sends someone to ask for a role change that would not help. Outlet
		// finance is exactly that case.
		const blockedByPhase =
			!OUTLET_SERVICES_ENABLED && can("orderSpecialService");

		return (
			<div className="iz-screen">
				<header className="pt-1">
					<h2 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
						{blockedByPhase ? "Not available yet" : "Access restricted"}
					</h2>
				</header>

				<p className="iz-tiny iz-muted mt-3 rounded-2xl border border-dashed border-[var(--iz-line)] px-4 py-8 text-center">
					{blockedByPhase
						? "Ordering agency services is coming in a later release. Your role will have access when it does — nothing needs changing on your account."
						: "Your outlet role cannot post shifts or order services."}
				</p>
			</div>
		);
	}

	return (
		<OutletPage>
			{editingShiftId && tab === "shifts" && (
				<AppTopbar
					onBack={() => setEditingShiftId(null)}
					backLabel="Shift list"
				/>
			)}

			<OutletPageHeader
				eyebrow={outletName}
				title="Post Job"
				hint={
					viewOnly
						? "View only — your role can read shift postings but not create them"
						: tab === "shifts"
							? "Build your shift, then post when ready"
							: `${outletName} · agency add-ons`
				}
			/>

			{showTabs && (
				<div className="mt-3 flex gap-1 rounded-xl border border-[var(--iz-line)] bg-white/[0.02] p-1">
					<button
						type="button"
						onClick={() => setTab("shifts")}
						className={cn(
							"iz-btn iz-btn-sm min-w-0 flex-1 !py-2 !text-xs",

							tab === "shifts" ? "iz-btn-primary" : "iz-btn-ghost",
						)}
					>
						PR Shift
					</button>

					<button
						type="button"
						onClick={() => setTab("services")}
						className={cn(
							"iz-btn iz-btn-sm min-w-0 flex-1 !py-2 !text-xs",

							tab === "services" ? "iz-btn-primary" : "iz-btn-ghost",
						)}
					>
						<Sparkles className="h-3.5 w-3.5" /> Services
					</button>
				</div>
			)}

			{tab === "shifts" && (canPostShifts || viewOnly) ? (
				<section className="pt-1">
					{viewOnly && (
						<p className="iz-tiny iz-muted mt-1 mb-3 rounded-xl border border-dashed border-[var(--iz-line)] px-3 py-2">
							Read-only. You can see how shifts are posted at this venue, but
							only an Owner, Guarantor or Ops Head can post one.
						</p>
					)}
					{/*
					 * A native disabled fieldset, rather than a `readOnly` prop threaded
					 * through DraftShiftEditor: it turns off every input, select and
					 * button beneath it in one place, including inside components that
					 * know nothing about roles — so a field added later is inert by
					 * default instead of quietly editable.
					 */}
					<fieldset
						disabled={viewOnly}
						className={
							viewOnly ? "m-0 border-0 p-0 opacity-70" : "m-0 border-0 p-0"
						}
					>
						<div className="iz-post-job-layout">
							<div className="iz-post-job-layout__main">
								<DraftShiftEditor
									shift={composer}
									onChange={(patch) => setComposer((c) => ({ ...c, ...patch }))}
									title="Shift details"
									shiftIndex={1}
									shiftTotal={Math.max(1, draftShifts.length + 1)}
									namedPrsOnDate={composerNamedPrsOnDate}
									peopleRemaining={composerPeopleRemaining}
									prCandidates={prPool.backed ? prPool.prs : undefined}
									prEmptyHint={prPoolEmptyHint}
									workspaceMenu={workspaceMenu}
									workspaceRates={effectiveWorkspace}
								/>

								{draftShifts.length > 0 && (
									<>
										<div className="mt-4 flex items-center justify-between">
											<IzSectionLabel>
												Shifts for {sectionDate.toLowerCase()}
											</IzSectionLabel>
											<span className="text-[10px] text-[var(--iz-muted)]">
												{draftShifts.length} slot
												{draftShifts.length !== 1 ? "s" : ""}
											</span>
										</div>

										<div className="mt-3 flex flex-col gap-4">
											{draftShifts.map((s, i) =>
												editingShiftId === s.id ? (
													<DraftShiftEditor
														key={s.id}
														shift={s}
														onChange={(patch) => updateDraftShift(s.id, patch)}
														onRemove={() => removeDraftShift(s.id)}
														showRemove
														title="Shift details"
														shiftIndex={i + 1}
														shiftTotal={draftShifts.length}
														onDone={() => setEditingShiftId(null)}
														namedPrsOnDate={namedPrsOnDateForShift(s, s.id)}
														peopleRemaining={peopleRemainingForShift(s, s.id)}
														prCandidates={
															prPool.backed ? prPool.prs : undefined
														}
														prEmptyHint={prPoolEmptyHint}
														workspaceMenu={workspaceMenu}
														workspaceRates={effectiveWorkspace}
													/>
												) : (
													<DraftShiftSummary
														key={s.id}
														shift={s}
														title={`Shift ${i + 1}`}
														onEdit={() => setEditingShiftId(s.id)}
														onRemove={() => removeDraftShift(s.id)}
														showRemove
														workspaceMenu={workspaceMenu}
													/>
												),
											)}
										</div>
									</>
								)}
							</div>

							{/* Not merely disabled — a post/cart bar offers an action this
						    role does not have, so it is absent rather than greyed out. */}
							{!viewOnly && (
								<aside className="iz-post-job-layout__aside">
									<PostJobActionPanel
										headcount={totalHeadcount}
										cost={totalCost}
										shiftCount={shiftCountForPost}
										onAddShift={addDraftShift}
										onSubmit={submitNew}
										submitDisabled={totalHeadcount <= 0 || isPosting}
									/>
								</aside>
							)}
						</div>

						{!viewOnly && (
							<div
								className="iz-post-job-mobile-dock"
								aria-label="Shift summary and post actions"
							>
								<PostJobActionPanel
									headcount={totalHeadcount}
									cost={totalCost}
									shiftCount={shiftCountForPost}
									onAddShift={addDraftShift}
									onSubmit={submitNew}
									submitDisabled={totalHeadcount <= 0}
									compact
								/>
							</div>
						)}
					</fieldset>
				</section>
			) : canOrderServices ? (
				<OutletServicePostSection />
			) : null}
		</OutletPage>
	);
}
