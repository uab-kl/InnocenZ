import { PhotoLightbox } from "@agency-portal/components/agency/ProofPhotoViewer";
import { IzSectionLabel } from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import { EventTemplatePicker } from "@agency-portal/components/outlet/EventTemplatePicker";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { OutletServicePostSection } from "@agency-portal/components/outlet/outlet-service-post";
import { PostJobAgencyPicker } from "@agency-portal/components/outlet/PostJobAgencyPicker";
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
import { useOutletAgencyLinks } from "@agency-portal/hooks/use-outlet-agency-links";
import { useOutletEffectivePlan } from "@agency-portal/hooks/use-outlet-effective-plan";
import { useOutletPostJob } from "@agency-portal/hooks/use-outlet-post-job";
import { useOutletPrPool } from "@agency-portal/hooks/use-outlet-pr-pool";
import { useOutletWorkspace } from "@agency-portal/hooks/use-outlet-workspace";
import {
	canonicalOutletName,
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
import {
	describeClashShift,
	findSlotClashes,
} from "@agency-portal/lib/shift-slot-clash";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { cn } from "@agency-portal/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { startOfToday } from "date-fns";
import { ChevronLeft, CircleHelp, Sparkles, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { ShiftTemplate } from "@/services/shift-template";

type PostJobTab = "shifts" | "services";

/**
 * The server's own explanation of a failed post, when it sent one. Every
 * rejection here is actionable by a human (link the venue to an agency, get the
 * role granted, re-activate the membership) and none of them are fixed by
 * retrying, so the message has to reach the screen.
 */
function postShiftErrorMessage(err: unknown, fallback: string): string {
	const message = (
		err as { response?: { data?: { message?: string } } } | undefined
	)?.response?.data?.message;
	// The server's own message wins when it has one — it names the actual cause
	// (no subscription, membership inactive) and is not something the client can
	// reconstruct. It arrives in English; translating it belongs on the backend,
	// not here. The `fallback` is the part this screen owns, so it is localised.
	return message?.trim() || fallback;
}

export const Route = createFileRoute("/outlet/bookings")({
	validateSearch: (search: Record<string, unknown>): { tab?: PostJobTab } => ({
		tab: search.tab === "services" ? "services" : "shifts",
	}),

	component: PostJobPage,
});

function PostJobPage() {
	const navigate = useNavigate({ from: Route.fullPath });
	const { t } = usePortalLocale();

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

	const { createShifts, outletWorkspace, agencyPRs, shifts, toast } =
		useStore();

	// On a real outlet session, posting writes to the backend; a demo session
	// keeps the local store. `backed` decides which path submitNew takes.
	const { backed, postShifts, isPosting, bookedShifts } = useOutletPostJob();

	// Daily plan caps count already-booked shifts. On a backed session the demo
	// `shifts` store is empty, so count the real backend bookings instead —
	// otherwise every cap silently reads zero and never triggers.
	const capShifts = backed ? bookedShifts : shifts;

	/**
	 * Which approved agencies this post goes to (0124). Applies to the WHOLE
	 * batch, not per draft: an operator composing a week of shifts is choosing a
	 * staffing partner for that week, and a per-row picker would ask the same
	 * question a dozen times. Seeded by the picker itself to "all approved".
	 *
	 * Declared HERE, above the PR pool, because the pool is now derived from it —
	 * "Send to" chooses the rosters, and Select PRs may only offer those.
	 */
	const [postAgencyIds, setPostAgencyIds] = useState<string[]>([]);

	// Same story for the "Select PRs" list: the demo `prs` slice is blanked for a
	// real login, so the picker needs the backend pool or it shows nobody.
	//
	// Scoped to the ticked agencies: an empty selection already means "all
	// approved" to both the picker and the server, so the default is unchanged.
	const prPool = useOutletPrPool(postAgencyIds);
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
			? t.postJob.loadingYourPrs
			: t.postJob.noPrsToNameYet;

	// The venue's REAL plan (member_subscription ledger) — the demo store id is
	// only the demo fallback. See the hook: Subscription said Enterprise while
	// this composer capped at Essential.
	const subscriptionPlan = useOutletEffectivePlan();
	const outletName = outletWorkspace.outletName;

	const [composer, setComposer] = useState<DraftShift>(() =>
		newDraftShift(undefined, effectiveWorkspace),
	);

	// The step BEFORE the form (owner's flow): null = show the event gallery,
	// "blank" = start fresh, a template = the card the composer was filled from.
	// Demo sessions skip the gallery — templates are backend rows only.
	const [eventChosen, setEventChosen] = useState<
		ShiftTemplate | "blank" | null
	>(null);

	const applyTemplate = (tpl: ShiftTemplate) => {
		setComposer({
			...newDraftShift(
				{
					eventKind: tpl.eventKind,
					specialEventType:
						tpl.eventKind === "special"
							? ((tpl.specialEventType ??
									"vip") as DraftShift["specialEventType"])
							: undefined,
					customSpecialEventName: tpl.customSpecialEventName ?? undefined,
					shiftTime: tpl.slot ?? undefined,
					quantity: tpl.quantity ?? undefined,
					langs: tpl.languages
						? tpl.languages
								.split(",")
								.map((x) => x.trim())
								.filter(Boolean)
						: undefined,
					dressCode: tpl.dressCode ?? undefined,
				},
				effectiveWorkspace,
			),
			// newDraftShift returns a fixed shape; the template link rides on top.
			templateId: tpl.id,
			templateName: tpl.name,
		});
		setEventChosen(tpl);
	};

	const [draftShifts, setDraftShifts] = useState<DraftShift[]>([]);
	// Whether this venue may post at all. Same hook the "Send to" picker reads, so
	// the button and the picker cannot disagree about it.
	const agencyLinks = useOutletAgencyLinks();

	// "What you can do here" — the page's own answer to "does it have X?".
	const [helpOpen, setHelpOpen] = useState(false);

	const [editingShiftId, setEditingShiftId] = useState<string | null>(null);

	// The backend card arrives a beat after mount, so this signature change is
	// also what seeds a real session's composer — it starts on the store's blank
	// rates and is re-synced the moment the real ones land.
	const workspaceRatesKey = workspaceTierRatesSignature(
		effectiveWorkspace.tierRates,
	);
	const prevWorkspaceRatesKey = useRef(workspaceRatesKey);

	// biome-ignore lint/correctness/useExhaustiveDependencies(effectiveWorkspace): the signature IS derived from effectiveWorkspace.tierRates, so the key can only change in the same render the workspace did — the closure is never stale. Listing the object as well would re-enter this effect on every render of an unrelated workspace field.
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

	// A NAMED PICK MUST NOT OUTLIVE ITS AGENCY BEING UNTICKED.
	//
	// Select PRs now lists only the ticked agencies' rosters, so unticking one
	// takes its people off the list — but ids already sitting on a draft stayed
	// behind, and the summary printed them as raw uuids (`formatDraftPrNames`
	// falls back to the id for anyone not in the pool). The server would have
	// dropped them anyway: shift creation keeps only requests addressed to an
	// invited agency. So the venue was shown, and counted, a name it was never
	// going to get.
	//
	// People needed is deliberately NOT lowered here. The outlet did not take
	// these heads off the shift — the change of agency did — and the slots still
	// have to be filled, now by whoever remains.
	useEffect(() => {
		// A demo session has no backend pool at all, and an empty or still-loading
		// one must never be read as "nobody qualifies" — that would wipe every pick
		// on each refetch.
		if (!prPool.backed || prPool.isLoading || prPool.prs.length === 0) return;
		const allowed = new Set(prPool.prs.map((pr) => pr.id));
		const keep = (ids: string[]) => ids.filter((id) => allowed.has(id));
		setComposer((c) =>
			keep(c.prIds).length === c.prIds.length
				? c
				: { ...c, prIds: keep(c.prIds) },
		);
		setDraftShifts((cur) =>
			cur.some((d) => keep(d.prIds).length !== d.prIds.length)
				? cur.map((d) => ({ ...d, prIds: keep(d.prIds) }))
				: cur,
		);
	}, [prPool.prs, prPool.backed, prPool.isLoading]);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: the array already lists every VALUE the helper reads (the composer's dates, the booked shifts, the drafts, the venue). namedPrsOnDateForShift is re-created each render, so adding it — or widening to the whole composer — would recompute this on every keystroke in the composer form and throw the memo away.
	const composerNamedPrsOnDate = useMemo(
		() => namedPrsOnDateForShift(composer),
		[composer.selectedDateIsos, capShifts, draftShifts, outletName],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: same as above — the per-day cap, the booked shifts, the drafts and the composer are all listed; only the re-created helper identity is missing, and listing it would defeat the memo.
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
			toast(t.postJob.dailyLimitReached, "warn");
			return;
		}

		if (totalPrCountFromPayTierRows(composer.payTierRows) <= 0) {
			toast(t.postJob.setPrCountPerTier, "warn");
			return;
		}

		if (composer.quantity <= 0) {
			toast(t.postJob.setPeopleNeeded, "warn");
			return;
		}

		if (
			composer.eventKind === "special" &&
			isOtherSpecialEvent(composer.specialEventType) &&
			!composer.customSpecialEventName?.trim()
		) {
			toast(t.postJob.nameEventType, "warn");
			return;
		}

		if (
			isOtherDressCode(composer.dressCode) &&
			!composer.customDressCode?.trim()
		) {
			toast(t.postJob.nameDressCode, "warn");
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
			? formatJobDates(draftShifts[0].selectedDateIsos, t)
			: formatJobDates(composer.selectedDateIsos, t);

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
				toast(t.postJob.nameEventTypeBeforePosting, "warn");
				return;
			}
			if (isOtherDressCode(s.dressCode) && !s.customDressCode?.trim()) {
				toast(t.postJob.nameDressCodeBeforePosting, "warn");
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
					fill(t.postJob.shiftExceedsPlan, {
						max: subscriptionPlan.prSelectMax,
						date: formatJobDate(s.jobDate, t),
					}),
					"warn",
				);
				return;
			}
			if (s.quantity > subscriptionPlan.prPerDayMax) {
				toast(
					fill(t.postJob.peopleExceedsPlan, {
						plan: subscriptionPlan.label,
						max: subscriptionPlan.prPerDayMax,
						date: formatJobDate(s.jobDate, t),
					}),
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
					fill(t.postJob.dailyNamedLimit, {
						max: subscriptionPlan.prPerDayMax,
						existing,
						date: iso,
						total,
					}),
					"warn",
				);
				return;
			}
		}
		for (const [iso, total] of byDateHeadcount) {
			const existing = outletPrHeadcountForDate(capShifts, outletName, iso);
			if (existing + total > subscriptionPlan.prPerDayMax) {
				toast(
					fill(t.postJob.dailyHeadcountLimit, {
						max: subscriptionPlan.prPerDayMax,
						existing,
						date: iso,
						total,
					}),
					"warn",
				);
				return;
			}
		}

		// TWO SHIFTS AT THE SAME TIME. Every check above measures a DAY — the tier
		// mix, the named-PR cap, the headcount — and a day's demand is additive, so
		// one night posted twice as 2 + 3 PRs reads as a legal 5 and nothing looked
		// at the clock. `capShifts` is the same list the caps count, narrowed to this
		// venue the same way they narrow it.
		const canonOutlet = canonicalOutletName(outletName);
		// Widened to the fields this check reads, which is also what lets the two
		// shapes behind `capShifts` (backend bookings / demo store rows) be walked as
		// one list — a union of array types has no callable `filter`.
		const bookedRows: {
			outletName: string;
			dateIso?: string;
			shift?: string;
			event?: string;
		}[] = capShifts;
		const clash = findSlotClashes(
			expandedShifts.map((s) => ({
				dateIso: isoFromJobDate(s.jobDate),
				shift: s.shiftTime,
				event: resolveDraftEventName(s),
			})),
			bookedRows
				.filter((s) => canonicalOutletName(s.outletName) === canonOutlet)
				.map((s) => ({
					dateIso: s.dateIso ?? "",
					shift: s.shift ?? "",
					event: s.event ?? "",
				})),
		)[0];

		// BOTH kinds are refused — the venue's rule is that its own shifts never overlap
		// (17 Aug 2026), and the backend refuses both with a 409, so warning and letting
		// it through would only trade a clear message for a failed post. They still read
		// differently because the remedies differ, and a refusal naming the wrong remedy
		// is barely better than none. Back-to-back is NOT refused: that constraint lives
		// on the PR who would have to travel, not on the venue.
		if (clash) {
			const other = describeClashShift(clash.against);
			const refusal: Record<typeof clash.kind, string> = {
				duplicate: fill(t.postJob.duplicateShift, { other }),
				overlap: fill(t.postJob.overlapShift, { other }),
			};
			toast(refusal[clash.kind], "warn");
			return;
		}

		const postItems = expandedShifts.map((s) => ({
			outletName,

			date: formatJobDate(s.jobDate, t),

			dateIso: isoFromJobDate(s.jobDate),

			shift: s.shiftTime,

			quantity: s.quantity,

			// Exactly what the outlet asked for — a preference, not a filter. It used
			// to fall back to the languages of the named PRs, which posted a request
			// nobody had made and made the field read as a restriction.
			languages: buildLanguagesLabel(s.langs, s.otherLang),

			// Posting straight from the composer skips addDraftShift, so fall back
			// to the placeholder's suggestion here too rather than post a blank name.
			// Unnamed + posted from a card → the CARD names the night, never the
			// generic suggestion. The field starts empty on purpose (20 Aug).
			event:
				s.event?.trim() || s.templateName?.trim() || resolveDraftEventName(s),

			eventKind: s.eventKind,

			templateId: s.templateId,

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

			// The picks as (person, membership) pairs (0131). Resolved through the
			// live pool so a demo id or a card whose membership is unknown simply
			// drops out — the server would refuse it anyway.
			requestedPrs: s.prIds
				.map((id) => prPool.prs.find((c) => c.id === id))
				.filter(
					(c): c is (typeof prPool.prs)[number] =>
						!!c && !!c.userId && !!c.agencyId,
				)
				.map((c) => ({ userId: c.userId, agencyId: c.agencyId as string })),
		}));

		const resetForm = () => {
			setComposer(newDraftShift(undefined, effectiveWorkspace));
			setEventChosen(null);
			setDraftShifts([]);
			setEditingShiftId(null);
		};

		// Real session → persist to the backend; the outletId and routed agency are
		// resolved server-side. Pay-tier rows are persisted as per-shift rate
		// overrides, named PRs as shift_pr_request rows (0131), and the dress code
		// as shift.dress_code (0132). Still demo-only in postItems: drink menus and
		// star tiers, which have no column behind them yet.
		if (backed) {
			postShifts(postItems, postAgencyIds)
				.then(() => {
					toast(
						fill(
							postItems.length === 1
								? t.postJob.postedShiftOne
								: t.postJob.postedShiftMany,
							{ n: postItems.length },
						),
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
					toast(postShiftErrorMessage(err, t.postJob.couldNotPost), "warn");
				});
			return;
		}

		// A real session that lost its outlet identity must NOT fall through to the
		// demo store: it would list the shift as posted while nothing reached the
		// database, and the row would evaporate on the next refresh.
		if (getPortalSessionKind() === "real") {
			toast(t.postJob.sessionExpired, "warn");
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
						{blockedByPhase
							? t.postJob.notAvailableYet
							: t.postJob.accessRestricted}
					</h2>
				</header>

				<p className="iz-tiny iz-muted mt-3 rounded-2xl border border-dashed border-[var(--iz-line)] px-4 py-8 text-center">
					{blockedByPhase
						? t.postJob.servicesComingLater
						: t.postJob.roleCannotPost}
				</p>
			</div>
		);
	}

	return (
		<OutletPage>
			{editingShiftId && tab === "shifts" && (
				<AppTopbar
					onBack={() => setEditingShiftId(null)}
					backLabel={t.postJob.shiftList}
				/>
			)}

			{/* The RETURN button (owner's ask): once an event is chosen, the top
				    bar carries the way back to the gallery — the same back pattern
				    every other page uses, not only the small "Change event" chip. */}
			{!editingShiftId &&
				backed &&
				eventChosen !== null &&
				tab === "shifts" && (
					<button
						type="button"
						className="iz-post-job-return"
						onClick={() => {
							setComposer(newDraftShift(undefined, effectiveWorkspace));
							setEventChosen(null);
						}}
					>
						<ChevronLeft className="h-4 w-4" aria-hidden />
						{t.postJob.returnBack}
					</button>
				)}

			<OutletPageHeader
				eyebrow={outletName}
				title={t.postJob.title}
				hint={
					viewOnly
						? t.postJob.viewOnlyHint
						: tab === "shifts"
							? t.postJob.buildHint
							: `${outletName} · ${t.postJob.agencyAddOns}`
				}
				trailing={
					<button
						type="button"
						className="iz-post-job-help-btn"
						aria-expanded={helpOpen}
						onClick={() => setHelpOpen((v) => !v)}
					>
						<CircleHelp className="h-4 w-4" aria-hidden />
						{t.postJob.whatYouCanDoHere}
					</button>
				}
			/>

			{helpOpen && (
				<div className="iz-post-job-help-panel">
					<p className="iz-post-job-help-panel__title">
						{t.postJob.whatYouCanDoHere}
					</p>
					<ul className="iz-post-job-help-panel__list">
						<li>{t.postJob.canDoPostJob1}</li>
						<li>{t.postJob.canDoPostJob2}</li>
						<li>{t.postJob.canDoPostJob3}</li>
						<li>{t.postJob.canDoPostJob4}</li>
						<li>{t.postJob.canDoPostJob5}</li>
						<li>{t.postJob.canDoPostJob6}</li>
					</ul>
				</div>
			)}

			{/* A venue with no APPROVED agency cannot post — the server refuses it.
			    Said here, at the top, rather than only in the "Send to" card: the
			    composer is long, and finding out after filling in a whole shift that
			    there is nobody to send it to is the worst possible moment. The two
			    states are kept apart because the next action differs — one is "go
			    link an agency", the other is "wait for them". */}
			{backed && !agencyLinks.isLoading && !agencyLinks.canPost && (
				<div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-300/5 px-4 py-3">
					<p className="text-sm font-semibold text-amber-300">
						{agencyLinks.awaitingApproval
							? t.postJob.waitingForAgency
							: t.postJob.linkAgencyBeforePosting}
					</p>
					<p className="iz-tiny iz-muted mt-1">
						{agencyLinks.awaitingApproval
							? "You have asked to work with an agency and they have not decided yet. Once one accepts, you can post shifts to them."
							: "Shifts are filled by PR agencies, so this venue needs at least one. Add one in Settings — they choose whether to accept."}
					</p>
					{!agencyLinks.awaitingApproval && (
						<Link
							to="/outlet/settings"
							className="iz-tiny mt-2 inline-block underline decoration-dotted underline-offset-2 hover:text-[var(--iz-gold)]"
						>
							{t.postJob.goToSettingsAgencies}
						</Link>
					)}
				</div>
			)}

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
						{t.postJob.prShift}
					</button>

					<button
						type="button"
						onClick={() => setTab("services")}
						className={cn(
							"iz-btn iz-btn-sm min-w-0 flex-1 !py-2 !text-xs",

							tab === "services" ? "iz-btn-primary" : "iz-btn-ghost",
						)}
					>
						<Sparkles className="h-3.5 w-3.5" /> {t.postJob.services}
					</button>
				</div>
			)}

			{tab === "shifts" && (canPostShifts || viewOnly) ? (
				<section className="pt-1">
					{viewOnly && (
						<p className="iz-tiny iz-muted mt-1 mb-3 rounded-xl border border-dashed border-[var(--iz-line)] px-3 py-2">
							{t.postJob.readOnlyNotice}
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
						{backed && !editingShiftId && eventChosen === null ? (
							<EventTemplatePicker
								onPick={applyTemplate}
								onBlank={() => setEventChosen("blank")}
							/>
						) : (
							<>
								<div className="iz-post-job-layout">
									<div className="iz-post-job-layout__main">
										{eventChosen && eventChosen !== "blank" && (
											<ChosenEventBar
												template={eventChosen}
												eventName={composer.event}
												onChange={() => {
													setComposer(
														newDraftShift(undefined, effectiveWorkspace),
													);
													setEventChosen(null);
												}}
											/>
										)}
										<DraftShiftEditor
											eventTypeLocked={Boolean(
												eventChosen && eventChosen !== "blank",
											)}
											shift={composer}
											onChange={(patch) =>
												setComposer((c) => ({ ...c, ...patch }))
											}
											title={t.postJob.shiftDetails}
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
																onChange={(patch) =>
																	updateDraftShift(s.id, patch)
																}
																onRemove={() => removeDraftShift(s.id)}
																showRemove
																title={t.postJob.shiftDetails}
																shiftIndex={i + 1}
																shiftTotal={draftShifts.length}
																onDone={() => setEditingShiftId(null)}
																namedPrsOnDate={namedPrsOnDateForShift(s, s.id)}
																peopleRemaining={peopleRemainingForShift(
																	s,
																	s.id,
																)}
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
																title={fill(t.postJob.shiftN, { n: i + 1 })}
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

									{/* NARROW SCREENS ONLY. The aside below is `display:none` under
							    900px, so without this copy the picker would vanish on a phone
							    and the venue would post to every agency without being asked.
							    Both copies are driven by the same state; only one is ever
							    visible. Real sessions only — a demo session has no links. */}
									{backed && (
										<div className="iz-post-job-sendto--mobile iz-post-job-summary-card mt-3">
											<p className="iz-post-job-summary-card__title">
												{t.postJob.sendTo}
											</p>
											<PostJobAgencyPicker
												value={postAgencyIds}
												onChange={setPostAgencyIds}
											/>
										</div>
									)}
									{/* `iz-post-job-layout` is a two-column grid, so this aside MUST be
							    the second child — an extra element between it and the composer
							    takes the right column and pushes the summary down into the left
							    one. "Send to" therefore lives INSIDE the aside, above the
							    summary, rather than beside it. */}
									<aside className="iz-post-job-layout__aside">
										{backed && (
											/* The SAME card as the Summary below it, reusing that component's
									   own classes rather than a hand-rolled border, so the two cannot
									   drift apart. */
											<div className="iz-post-job-summary-card mb-3">
												<p className="iz-post-job-summary-card__title">
													{t.postJob.sendTo}
												</p>
												<PostJobAgencyPicker
													value={postAgencyIds}
													onChange={setPostAgencyIds}
												/>
											</div>
										)}
										{!viewOnly && (
											<PostJobActionPanel
												headcount={totalHeadcount}
												cost={totalCost}
												shiftCount={shiftCountForPost}
												onAddShift={addDraftShift}
												onSubmit={submitNew}
												submitDisabled={
													totalHeadcount <= 0 ||
													isPosting ||
													(backed && !agencyLinks.canPost)
												}
											/>
										)}
									</aside>
								</div>

								{!viewOnly && (
									<section
										className="iz-post-job-mobile-dock"
										aria-label={t.postJob.shiftSummaryActions}
									>
										<PostJobActionPanel
											headcount={totalHeadcount}
											cost={totalCost}
											shiftCount={shiftCountForPost}
											onAddShift={addDraftShift}
											onSubmit={submitNew}
											submitDisabled={
												totalHeadcount <= 0 || (backed && !agencyLinks.canPost)
											}
											compact
										/>
									</section>
								)}
							</>
						)}
					</fieldset>
				</section>
			) : canOrderServices ? (
				<OutletServicePostSection />
			) : null}
		</OutletPage>
	);
}

/** The bar above the form naming the picked card, with the way back. */
function ChosenEventBar({
	template,
	eventName,
	onChange,
}: {
	template: ShiftTemplate;
	/** The composer's LIVE event name - may differ from the card's name. */
	eventName?: string;
	onChange: () => void;
}) {
	const { t } = usePortalLocale();
	const cover = apiAssetUrl(template.coverImage);
	// Owner's ask: tap the small picture to see it big. Zoom + pan included.
	const [zoomOpen, setZoomOpen] = useState(false);
	return (
		<div className="iz-chosen-event-bar">
			{cover ? (
				<button
					type="button"
					className="iz-event-cover-zoom"
					aria-label={template.name}
					onClick={() => setZoomOpen(true)}
				>
					<img className="iz-chosen-event-bar__thumb" src={cover} alt="" />
					{/* Says "this zooms" — the behaviour existed, nothing announced it. */}
					<span className="iz-zoom-badge" aria-hidden>
						<ZoomIn className="h-2.5 w-2.5" />
					</span>
				</button>
			) : (
				<span
					className="iz-chosen-event-bar__thumb iz-chosen-event-bar__thumb--empty"
					aria-hidden
				>
					<Sparkles className="h-3.5 w-3.5" />
				</span>
			)}
			<span className="iz-chosen-event-bar__name">
				<span className="iz-chosen-event-bar__top">
					{template.name}
					<span
						className={cn(
							"iz-chosen-event-bar__kind",
							template.eventKind === "special"
								? "iz-chosen-event-bar__kind--special"
								: "iz-chosen-event-bar__kind--normal",
						)}
					>
						{template.eventKind === "special"
							? t.postJob.specialEvent
							: t.postJob.normalEvent}
					</span>
				</span>
				{/* The shift's own name, live from the form - one night can be
				    renamed without touching the card. */}
				<span className="iz-chosen-event-bar__event">
					{t.postJob.eventName}:{" "}
					{eventName?.trim() || t.postJob.clickToPutEventName}
				</span>
			</span>
			<button type="button" className="iz-chip" onClick={onChange}>
				<ChevronLeft className="h-3.5 w-3.5" aria-hidden />
				{t.postJob.changeEvent}
			</button>
			{zoomOpen && cover && (
				<PhotoLightbox
					photo={cover}
					alt={template.name}
					onClose={() => setZoomOpen(false)}
				/>
			)}
		</div>
	);
}
