import { AgencyBroadcastSheet } from "@agency-portal/components/agency/AgencyBroadcastSheet";
import { Comcard3dPreviewVisual } from "@agency-portal/components/agency/Comcard3dPreview";
import { ManagePrGridCard } from "@agency-portal/components/agency/ManagePrGridCard";
import { PenaltyRulesEditor } from "@agency-portal/components/agency/PenaltyRulesEditor";
import { toComcardPreview } from "@agency-portal/components/agency/PrComcardIdentity";
import { ProfileLanguagePicker } from "@agency-portal/components/iz/ProfileLanguagePicker";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import {
	IzCard,
	IzCardTitle,
	IzKpiLabel,
	IzPageTitle,
	IzPill,
	IzSectionLabel,
	IzSelect,
} from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import {
	canGeneratePortfolioComcard,
	PortfolioGalleryTile,
} from "@agency-portal/components/pr/PortfolioComcardVisual";
import { useAgencyPenaltyProposals } from "@agency-portal/hooks/use-agency-penalty-proposals";
import { useAgencyPenaltyRules } from "@agency-portal/hooks/use-agency-penalty-rules";
import {
	shiftOutcomeLabel,
	useAgencyPrShiftHistory,
} from "@agency-portal/hooks/use-agency-pr-shift-history";
import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import {
	type AgencyRating,
	useAgencyRatings,
} from "@agency-portal/hooks/use-agency-ratings";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	collectAgencyPrLanguages,
	languagesFromPr,
	resolveAgencyPrPhoto,
	sortAgencyPrsByName,
} from "@agency-portal/lib/agency-demo";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import {
	getAgencyPrFlags,
	isAgencyPrActive,
	RATING_WARN_THRESHOLD,
	tiedMonthsLabel,
} from "@agency-portal/lib/agency-pr-flags";
import { shiftHistoryForPr } from "@agency-portal/lib/portal-sync";
import {
	evaluatePrPenalties,
	normalizePenaltyRules,
	PR_PAY_CLASS_LABELS,
	PR_PAY_CLASSES,
	type PrPayClass,
	prAttendanceWindow,
	prPayClass,
	totalPenaltyFineRm,
} from "@agency-portal/lib/pr-penalties";
import {
	displayAverage,
	formatStars,
	summarizePrRatings,
} from "@agency-portal/lib/pr-rating-summary";
import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	ChevronDown,
	Lock,
	Megaphone,
	MousePointerClick,
	Pencil,
	RotateCcw,
	Star,
	UserMinus,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { languageLabel, raceLabel } from "@/lib/portal-i18n/language-label";

/** How many shifts the card shows. Content, not styling — leave it at 3. */
const SHIFT_HISTORY_ROWS = 3;

const KPI_TIER_OPTIONS = ["A", "B", "C"] as const;
const TRAINING_TIER_OPTIONS = [
	"Tier I",
	"Tier II",
	"Tier III",
	"Tier IV",
	"Tier V",
] as const;

export const Route = createFileRoute("/agency/prs")({
	component: AgencyManagePRs,
	validateSearch: (search: Record<string, unknown>): { pr?: string } => ({
		pr:
			typeof search.pr === "string" && search.pr.trim()
				? search.pr.trim()
				: undefined,
	}),
});

function AgencyManagePRs() {
	const { t } = usePortalLocale();
	const { pr: prFromSearch } = Route.useSearch();
	const navigate = useNavigate({ from: "/agency/prs" });
	// Manage-PR reads real backend PRs (mapped to the demo shape) and writes the
	// backend-backed actions; demo-only sections below still read the demo store.
	const {
		prs: agencyPRs,
		saveProfile: updateAgencyPrProfile,
		suspend: suspendAgencyPr,
		detach: detachAgencyPr,
	} = useAgencyPrs();
	const shiftHistory = useStore((s) => s.shiftHistory);
	// Real ratings an outlet left on this agency's PRs. Written to the `rating`
	// table since the rate sheet shipped, but never read back until now — a real
	// rating was invisible here while demo rows showed fine.
	const demoRatings = useStore((s) => s.ratings);
	const backendRatings = useAgencyRatings();
	const ratings = backendRatings.backed ? backendRatings.ratings : demoRatings;
	const requestAgencyPrDetach = useStore((s) => s.requestAgencyPrDetach);
	// Backend rules when signed in for real; the demo store otherwise. A demo
	// session must never render another agency's fine schedule.
	const backendPenalties = useAgencyPenaltyRules();
	const toast = useStore((s) => s.toast);
	const demoPenaltyRules = useStore((s) => s.agencyPenaltyRules);
	const saveDemoPenaltyRules = useStore((s) => s.saveAgencyPenaltyRules);
	const rawPenaltyRules = backendPenalties.backed
		? backendPenalties.rules
		: demoPenaltyRules;
	const can = useAgencyCan();
	const canEditPenalties = can("editSettings");
	// Real breaches, evaluated server-side. The demo computation below only ever
	// worked on demo PRs — `shiftsThisWeek` and friends do not exist on a backend
	// PR, so every window read empty and this panel always said "No active
	// penalties this week" no matter what the roster had done.
	const backendProposals = useAgencyPenaltyProposals();
	const penalizedPrs = useMemo(() => {
		// null = the backend rules are still in flight. Falling through to
		// normalizePenaltyRules(undefined) would evaluate everyone against the
		// DEFAULT schedule and flash fines this agency may never have written.
		if (!rawPenaltyRules) return [];
		const rules = normalizePenaltyRules(rawPenaltyRules);
		return agencyPRs
			.map((pr) => {
				const breaches = evaluatePrPenalties(prAttendanceWindow(pr), rules);
				return { pr, breaches, total: totalPenaltyFineRm(breaches) };
			})
			.filter((x) => x.breaches.length > 0)
			.sort((a, b) => b.total - a.total);
	}, [agencyPRs, rawPenaltyRules]);
	const [ageMin, setAgeMin] = useState("");
	const [ratingMin, setRatingMin] = useState("");
	const [lang, setLang] = useState("");
	const [race, setRace] = useState("");
	const [place, setPlace] = useState("");
	const [expMin, setExpMin] = useState("");
	const [detailId, setDetailId] = useState<string | null>(null);
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [broadcastOpen, setBroadcastOpen] = useState(false);
	const [penaltiesOpen, setPenaltiesOpen] = useState(false);
	const [penaltyRulesOpen, setPenaltyRulesOpen] = useState(false);
	const langSelectId = useId();
	const raceSelectId = useId();
	const placeSelectId = useId();

	useEffect(() => {
		if (prFromSearch) setDetailId(prFromSearch);
	}, [prFromSearch]);

	const openPrProfile = (id: string) => {
		setDetailId(id);
		void navigate({ search: { pr: id } });
	};

	const closePrProfile = () => {
		setDetailId(null);
		void navigate({ search: { pr: undefined } });
	};

	const canManage = can("managePr");

	const languages = useMemo(
		() => collectAgencyPrLanguages(agencyPRs),
		[agencyPRs],
	);
	const races = useMemo(
		() => [...new Set(agencyPRs.map((p) => p.race).filter(Boolean))],
		[agencyPRs],
	);
	const places = useMemo(
		() => [...new Set(agencyPRs.map((p) => p.place).filter(Boolean))],
		[agencyPRs],
	);

	const filtered = useMemo(
		() =>
			sortAgencyPrsByName(
				agencyPRs.filter((p) => {
					if (p.detached) return false;
					if (ageMin && (p.age ?? 0) < Number(ageMin)) return false;
					// Judge the real average, not the `rating: 0` placeholder every
					// backend PR carries — that made any Min-rating filter empty the grid.
					if (ratingMin) {
						const avg = displayAverage(p, summarizePrRatings(ratings, p));
						if (avg === null || avg < Number(ratingMin)) return false;
					}
					const langs = languagesFromPr(p);
					if (
						lang &&
						!langs.some((l) => l.toLowerCase() === lang.toLowerCase())
					)
						return false;
					if (race && p.race !== race) return false;
					if (place && p.place !== place) return false;
					if (expMin && (p.yearsExp ?? 0) < Number(expMin)) return false;
					return true;
				}),
			),
		[agencyPRs, ratings, ageMin, ratingMin, lang, race, place, expMin],
	);

	/*
	 * The denominator for "N of M".
	 *
	 * NOT `agencyPRs.length`: `filtered` drops detached PRs unconditionally,
	 * before any filter is applied, so counting the raw list would have the bar
	 * reporting a narrowing that no filter performed — "12 of 20" with every
	 * field empty.
	 */
	const totalPrs = useMemo(
		() => agencyPRs.filter((p) => !p.detached).length,
		[agencyPRs],
	);
	const activeFilterCount = [
		ageMin,
		ratingMin,
		expMin,
		lang,
		race,
		place,
	].filter(Boolean).length;
	const clearPrFilters = () => {
		setAgeMin("");
		setRatingMin("");
		setExpMin("");
		setLang("");
		setRace("");
		setPlace("");
	};

	// HOISTED ABOVE the `if (detail)` early return below. React counts hooks per
	// render: with this useMemo left underneath it, opening a PR detail (which is
	// local `detailId` state, so the SAME component instance re-renders) called one
	// hook fewer than the previous render and React threw "Rendered fewer hooks
	// than expected". Keep every hook above that return.
	// Name + id together, drawn from the SAME rows the cards render, so the
	// broadcast sheet cannot list a different person than the one ticked. Built
	// off `filtered` rather than `agencyPRs` for the same reason: a selection
	// only ever comes from what is on screen.
	const selectedRecipients = useMemo(
		() =>
			filtered
				.filter((p) => selected.has(p.id))
				.map((p) => ({ id: p.id, name: p.name })),
		[filtered, selected],
	);

	const detail = agencyPRs.find((p) => p.id === detailId);
	const activeCount = useMemo(
		() => filtered.filter((p) => isAgencyPrActive(p)).length,
		[filtered],
	);

	if (!canManage) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>{t.managePr.accessRestricted}</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						{t.managePr.financeCannotManageRoster}
					</p>
				</IzCard>
			</div>
		);
	}

	if (detail) {
		return (
			<AgencyPrDetail
				detail={detail}
				shiftHistory={shiftHistory}
				ratings={ratings}
				onBack={closePrProfile}
				onSaveProfile={updateAgencyPrProfile}
				onSuspend={suspendAgencyPr}
				onDetach={detachAgencyPr}
				onRequestDetach={requestAgencyPrDetach}
			/>
		);
	}

	const toggleSelect = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const selectAllFiltered = () => {
		setSelected(new Set(filtered.map((p) => p.id)));
	};


	const openBroadcast = () => {
		if (!selectMode) {
			setSelectMode(true);
			return;
		}
		if (selected.size > 0) setBroadcastOpen(true);
	};

	const finishBroadcast = () => {
		setSelectMode(false);
		setSelected(new Set());
	};

	return (
		<div className="iz-screen">
			<header className="iz-pr-manage-header">
				<div className="min-w-0">
					<IzPageTitle>{t.managePr.title}</IzPageTitle>
					<p className="iz-tiny iz-muted mt-0.5">{t.managePr.subtitle}</p>
				</div>
				<div className="iz-pr-manage-header__actions">
					<button
						type="button"
						className={`iz-pr-manage-header__btn${selectMode ? " iz-pr-manage-header__btn--active" : ""}`}
						onClick={() => {
							setSelectMode(!selectMode);
							setSelected(new Set());
						}}
					>
						<MousePointerClick className="h-4 w-4" />
						{selectMode ? "Cancel" : t.managePr.select}
					</button>
					<button
						type="button"
						className="iz-pr-manage-header__btn iz-pr-manage-header__btn--primary"
						onClick={openBroadcast}
					>
						<Megaphone className="h-4 w-4" />
						{t.managePr.broadcast}
					</button>
				</div>
			</header>

			<IzCard flat className="border-[var(--iz-line2)]">
				<button
					type="button"
					onClick={() => setPenaltiesOpen((v) => !v)}
					aria-expanded={penaltiesOpen}
					className="flex w-full items-center gap-1.5 text-left"
				>
					<ChevronDown
						className={`h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)] transition-transform ${
							penaltiesOpen ? "" : "-rotate-90"
						}`}
					/>
					<b className="iz-tiny uppercase tracking-wide text-[var(--iz-red,#e5484d)]">
						{t.managePr.recentPenalties}
					</b>
					{backendProposals.backed
						? backendProposals.count > 0 && (
								<span className="iz-tiny iz-muted2">
									· {backendProposals.count} breach
									{backendProposals.count > 1 ? "es" : ""} · RM{" "}
									{backendProposals.totalRm} total
								</span>
							)
						: penalizedPrs.length > 0 && (
								<span className="iz-tiny iz-muted2">
									· {penalizedPrs.length} PR{penalizedPrs.length > 1 ? "s" : ""}{" "}
									· RM {penalizedPrs.reduce((s, x) => s + x.total, 0)} total
								</span>
							)}
				</button>

				{/* Real session → the backend's evaluation. Demo session → the demo
				    store's, which is the only place those counters exist. */}
				{penaltiesOpen && backendProposals.backed && (
					<div className="mt-2 flex flex-col gap-1.5">
						{backendProposals.isLoading && (
							<p className="iz-sm iz-muted2">{t.managePr.loadingPenalties}</p>
						)}
						{backendProposals.isError && (
							<p className="iz-sm text-[var(--iz-red,#e5484d)]">
								{t.managePr.penaltiesLoadFailed}
							</p>
						)}
						{!backendProposals.isLoading &&
							!backendProposals.isError &&
							backendProposals.count === 0 && (
								<p className="iz-sm iz-muted2">
									{t.managePr.noActivePenalties}
								</p>
							)}
						{backendProposals.proposals.map((p) => (
							<div
								key={`${p.prId}-${p.ruleType}`}
								className="rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2"
							>
								<div className="flex items-center justify-between gap-2">
									<b className="iz-sm text-[var(--iz-txt)]">
										{p.prName ?? "PR"}
									</b>
									<span className="iz-sm font-semibold tabular-nums text-[var(--iz-red,#e5484d)]">
										RM {Number(p.fineRm).toFixed(2)}
									</span>
								</div>
								<div className="iz-tiny iz-muted2">
									{p.ruleType.replace(/_/g, " ")} · {p.detail}
								</div>
								{/* Recorded vs still just a finding — a proposal corrects
								    itself as the week goes on, a recorded charge does not. */}
								<div className="iz-tiny iz-muted2">
									{p.sealed
										? "recorded as owed — see Payroll & PV"
										: "not recorded yet · record it on Payroll & PV"}
								</div>
							</div>
						))}
					</div>
				)}

				{penaltiesOpen &&
					!backendProposals.backed &&
					(penalizedPrs.length === 0 ? (
						<p className="iz-sm iz-muted2 mt-2">
							{t.managePr.noActivePenaltiesThisWeek}
						</p>
					) : (
						<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
							{penalizedPrs.map((x) => (
								<button
									key={x.pr.id}
									type="button"
									onClick={() => openPrProfile(x.pr.id)}
									className="block w-full cursor-pointer rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2 text-left transition-colors hover:border-[var(--iz-line2)] hover:bg-[rgba(255,255,255,0.04)]"
								>
									<div className="flex items-center justify-between gap-2">
										<b className="iz-sm text-[var(--iz-txt)]">{x.pr.name}</b>
										<span className="iz-sm font-semibold tabular-nums text-[var(--iz-red,#e5484d)]">
											{x.total > 0 ? `RM ${x.total}` : t.managePr.warning}
										</span>
									</div>
									<div className="mt-1 flex flex-col gap-1">
										{x.breaches.map((b) => (
											<div
												key={b.ruleId}
												className="flex items-baseline justify-between gap-2"
											>
												<span className="iz-sm leading-snug">
													<span className="text-[var(--iz-muted)]">
														{b.label}
													</span>
													<span className="iz-muted2"> · {b.detail}</span>
												</span>
												{b.fineRm > 0 && (
													<span className="iz-sm shrink-0 tabular-nums text-[var(--iz-muted2)]">
														RM {b.fineRm}
													</span>
												)}
											</div>
										))}
									</div>
								</button>
							))}
						</div>
					))}
			</IzCard>

			<IzCard flat className="border-[var(--iz-line2)]">
				<button
					type="button"
					onClick={() => setPenaltyRulesOpen((v) => !v)}
					aria-expanded={penaltyRulesOpen}
					className="flex w-full items-center gap-1.5 text-left"
				>
					<ChevronDown
						className={`h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)] transition-transform ${
							penaltyRulesOpen ? "" : "-rotate-90"
						}`}
					/>
					<b className="iz-tiny uppercase tracking-wide">
						{t.managePr.attendanceAndPenaltyRules}
					</b>
					<span className="iz-tiny iz-muted2">
						{t.managePr.appliesToEveryPr}
					</span>
				</button>
				{penaltyRulesOpen && !rawPenaltyRules && (
					<p className="iz-sm mt-2 text-[var(--iz-red,#e5484d)]">
						{backendPenalties.isError
							? "Could not load penalty rules — the agency penalty-rules endpoint failed."
							: t.managePr.loadingPenaltyRules}
					</p>
				)}
				{penaltyRulesOpen && rawPenaltyRules && (
					<div className="mt-3">
						<PenaltyRulesEditor
							rules={rawPenaltyRules}
							readOnly={!canEditPenalties || backendPenalties.isSaving}
							onChange={(next) => {
								if (!canEditPenalties) return;
								// One editor, two sinks: a real session writes through to
								// `agency_penalty_rule`, a demo session only touches the
								// store. Falling back to the store on a real session would
								// show a saved-looking change the backend never received.
								if (backendPenalties.backed) {
									backendPenalties.save(next).catch(() => {
										toast(t.managePr.couldNotSavePenaltyRules, "warn");
									});
								} else {
									saveDemoPenaltyRules(next);
								}
							}}
						/>
					</div>
				)}
			</IzCard>

			{/* The house filter bar — same one the roster tabs and Manage Outlet use.
			    These were six placeholder-only boxes: the moment you picked a value the
			    word telling you what it meant was replaced by the value itself. */}
			<div className="iz-roster-filterbar iz-roster-filterbar--fill">
				<div className="iz-roster-filterbar__head">
					<span className="iz-roster-filterbar__title">
						{t.managePr.filterPrs}
					</span>
					<span className="iz-roster-filterbar__spacer" />
					<span className="iz-roster-filterbar__count">
						{filtered.length} {t.roster.countOf} {totalPrs}
					</span>
					{activeFilterCount > 0 && (
						<button
							type="button"
							className="iz-roster-filterbar__clear"
							onClick={clearPrFilters}
						>
							<RotateCcw className="h-3.5 w-3.5" />
							{t.rosterGrid.clearFilters}
							<span className="iz-roster-filterbar__badge">
								{activeFilterCount}
							</span>
						</button>
					)}
				</div>

				<div className="iz-roster-filterbar__row">
					<label className="iz-roster-filterbar__field">
						<span className="iz-roster-filterbar__label">{t.managePr.age}</span>
						<input
							type="number"
							className="iz-roster-filterbar__input iz-roster-filterbar__input--num"
							placeholder={t.managePr.minAge}
							value={ageMin}
							onChange={(e) => setAgeMin(e.target.value)}
						/>
					</label>
					<label className="iz-roster-filterbar__field">
						<span className="iz-roster-filterbar__label">
							{t.managePr.rating}
						</span>
						<input
							type="number"
							min={0}
							max={5}
							step={0.1}
							className="iz-roster-filterbar__input iz-roster-filterbar__input--num"
							placeholder={t.managePr.minRating}
							value={ratingMin}
							onChange={(e) => setRatingMin(e.target.value)}
						/>
					</label>
					<label className="iz-roster-filterbar__field">
						<span className="iz-roster-filterbar__label">
							{t.managePr.experience}
						</span>
						<input
							type="number"
							className="iz-roster-filterbar__input iz-roster-filterbar__input--num"
							placeholder={t.managePr.minYears}
							value={expMin}
							onChange={(e) => setExpMin(e.target.value)}
						/>
					</label>
					<label htmlFor={langSelectId} className="iz-roster-filterbar__field">
						<span className="iz-roster-filterbar__label">
							{t.managePr.languages}
						</span>
						<IzSelect
							id={langSelectId}
							block
							value={lang}
							onChange={(e) => setLang(e.target.value)}
						>
							<option value="">{t.managePr.allLanguages}</option>
							{languages.map((l) => (
								<option key={l} value={l}>
									{languageLabel(l, t)}
								</option>
							))}
						</IzSelect>
					</label>
					<label htmlFor={raceSelectId} className="iz-roster-filterbar__field">
						<span className="iz-roster-filterbar__label">
							{t.managePr.race}
						</span>
						<IzSelect
							id={raceSelectId}
							block
							value={race}
							onChange={(e) => setRace(e.target.value)}
						>
							<option value="">{t.managePr.allRaces}</option>
							{races.map((r) => (
								<option key={r} value={r}>
									{raceLabel(r, t)}
								</option>
							))}
						</IzSelect>
					</label>
					<label htmlFor={placeSelectId} className="iz-roster-filterbar__field">
						<span className="iz-roster-filterbar__label">
							{t.managePr.place}
						</span>
						<IzSelect
							id={placeSelectId}
							block
							value={place}
							onChange={(e) => setPlace(e.target.value)}
						>
							<option value="">{t.managePr.allPlaces}</option>
							{places.map((pl) => (
								<option key={pl} value={pl}>
									{pl}
								</option>
							))}
						</IzSelect>
					</label>
				</div>
			</div>

			<section className="mt-4">
				<div className="iz-pr-manage-stats">
					<span className="iz-pr-manage-stats__count">
						{filtered.length} PR{filtered.length !== 1 ? "S" : ""}
					</span>
					<span className="iz-pr-manage-stats__active">
						{activeCount} {t.managePr.active}
					</span>
				</div>
				{selectMode && (
					<p className="iz-tiny iz-muted2 mb-2">
						{selected.size === 0
							? t.managePr.tapToMultiSelect
							: fill(t.managePr.nSelected, { n: selected.size })}
						{selected.size > 0 && (
							<>
								{" · "}
								<button
									type="button"
									className="iz-link !text-xs"
									onClick={selectAllFiltered}
								>
									{t.managePr.selectAll}
								</button>
							</>
						)}
					</p>
				)}
				{selectMode && selected.size > 0 && (
					<button
						type="button"
						className="iz-btn iz-btn-primary mb-3 w-full !py-2.5 !text-xs"
						onClick={() => setBroadcastOpen(true)}
					>
						<Megaphone className="h-3.5 w-3.5" />{" "}
						{fill(t.managePr.broadcastMessage, { n: selected.size })}
					</button>
				)}
				<div className="iz-pr-manage-grid">
					{filtered.map((p) => {
						const averageRating = displayAverage(
							p,
							summarizePrRatings(ratings, p),
						);
						const flags = getAgencyPrFlags(p, averageRating);
						const active = isAgencyPrActive(p);
						const picked = selectMode && selected.has(p.id);
						return (
							<ManagePrGridCard
								key={p.id}
								pr={p}
								active={active}
								flags={flags}
								averageRating={averageRating}
								selectMode={selectMode}
								picked={picked}
								onActivate={() => {
									if (selectMode) toggleSelect(p.id);
									else openPrProfile(p.id);
								}}
							/>
						);
					})}
				</div>
			</section>

			<AgencyBroadcastSheet
				open={broadcastOpen}
				onClose={() => setBroadcastOpen(false)}
				recipients={selectedRecipients}
				onSent={finishBroadcast}
			/>
		</div>
	);
}

type AgencyPrDraft = {
	name: string;
	icName: string;
	mobile: string;
	email: string;
	age: number;
	height: number;
	weight: number;
	race: string;
	place: string;
	yearsExp: number;
	languages: string[];
	kpiTier: string;
	trainingLevel: string;
	payClass: PrPayClass;
};

function buildAgencyPrDraft(pr: AgencyManagedPR): AgencyPrDraft {
	return {
		name: pr.name ?? "",
		icName: pr.icName ?? pr.name ?? "",
		mobile: pr.mobile ?? "",
		email: pr.email ?? "",
		// 0 = the account has no figure on file. The old `?? 22 / ?? 165 / ?? 52`
		// pre-filled the editor with a stranger's body, and saveEdit then WROTE it
		// to `user_profile` the moment the agency saved any unrelated change —
		// which is how the agency's numbers and the PR's own screen diverged.
		age: pr.age ?? 0,
		height: pr.height ?? 0,
		weight: pr.weight ?? 0,
		race: pr.race ?? "",
		place: pr.place ?? "",
		yearsExp: pr.yearsExp ?? 0,
		languages: [...(pr.languages ?? [])],
		// "" = nobody has graded this PR. It was `?? "B"`, and `display` is this
		// same draft — so the read-only card PRINTED a KPI tier the agency never
		// assigned, and `saveEdit` sent it on the next save of any unrelated
		// field, writing "B" into agency_pr.kpi_tier for good. Same bug class as
		// the deleted `?? 22 / ?? 165 / ?? 52`. Renders as an em-dash below and is
		// omitted from the save payload while it is blank.
		kpiTier: pr.kpiTier ?? "",
		trainingLevel: pr.trainingLevel,
		payClass: prPayClass(pr),
	};
}

function AgencyPrDetail({
	detail,
	shiftHistory,
	ratings,
	onBack,
	onSaveProfile,
	onSuspend,
	onDetach,
	onRequestDetach,
}: {
	detail: AgencyManagedPR;
	shiftHistory: ReturnType<typeof useStore.getState>["shiftHistory"];
	// Backend rows when the session is real, demo rows otherwise — demo rows just
	// carry no `prId`, which is exactly what summarizePrRatings falls back on.
	ratings: AgencyRating[];
	onBack: () => void;
	onSaveProfile: (
		prId: string,
		patch: Partial<
			Pick<
				AgencyManagedPR,
				| "name"
				| "icName"
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
	onSuspend: (prId: string) => void;
	onDetach: (prId: string) => void;
	onRequestDetach: (prId: string) => void;
}) {
	const { t } = usePortalLocale();
	const toast = useStore((s) => s.toast);
	const penaltyRules = normalizePenaltyRules(
		useStore((s) => s.agencyPenaltyRules),
	);
	const penaltyBreaches = evaluatePrPenalties(
		prAttendanceWindow(detail),
		penaltyRules,
	);
	const penaltyTotalRm = totalPenaltyFineRm(penaltyBreaches);
	const [editing, setEditing] = useState(false);
	const [suspendOpen, setSuspendOpen] = useState(false);
	const [detachOpen, setDetachOpen] = useState(false);
	const [draft, setDraft] = useState<AgencyPrDraft>(() =>
		buildAgencyPrDraft(detail),
	);
	const agencyRoster = useStore((s) => s.agencyRoster);
	const [payClassConfirm, setPayClassConfirm] = useState<{
		payload: Parameters<typeof onSaveProfile>[1];
		next: PrPayClass;
		conflicts: number;
	} | null>(null);
	const fieldId = useId();

	// Real worked shifts. Demo sessions have no backend identity, so they keep
	// reading the demo store — which is the only place their history exists.
	const backendShiftHistory = useAgencyPrShiftHistory(detail.id);
	const shiftRows = useMemo(
		() =>
			backendShiftHistory.backed
				? backendShiftHistory.rows
				: shiftHistoryForPr(shiftHistory, detail.id).map((h) => ({
						id: h.id,
						dateIso: h.dateIso ?? "",
						dateDisplay: h.dateDisplay,
						outlet: h.outlet,
						// Demo rows are a sealed log — every one of them was worked.
						status: "completed" as const,
					})),
		[
			backendShiftHistory.backed,
			backendShiftHistory.rows,
			shiftHistory,
			detail.id,
		],
	);
	const shiftHistoryLoading =
		backendShiftHistory.backed && backendShiftHistory.isLoading;
	const ratingSummary = useMemo(
		() => summarizePrRatings(ratings, detail),
		[ratings, detail],
	);
	const averageRating = displayAverage(detail, ratingSummary);
	const flags = getAgencyPrFlags(detail, averageRating);
	const tiedUnderOneYear = flags.tiedUnderOneYear;

	// Future booked shifts incompatible with a switch to commission-only
	// (commission-only PRs may only work commission-only shifts).
	const futureIncompatibleSlots = (next: PrPayClass) => {
		if (next !== "commissionOnly") return [];
		return agencyRoster.filter(
			(s) =>
				s.prId === detail.id &&
				s.dateIso >= DEFAULT_ROSTER_DATE_ISO &&
				s.status !== "unavailable" &&
				s.payTierId !== "commission_only",
		);
	};

	const startEdit = () => {
		setDraft(buildAgencyPrDraft(detail));
		setEditing(true);
	};

	const cancelEdit = () => {
		setDraft(buildAgencyPrDraft(detail));
		setEditing(false);
	};

	const saveEdit = () => {
		const name = draft.name.trim();
		if (!name) {
			toast(t.managePr.enterFloorNickname, "warn");
			return;
		}
		if (name.length < 2 || name.length > 20) {
			toast(t.managePr.nicknameLength, "warn");
			return;
		}
		const icName = draft.icName.trim();
		if (!icName) {
			toast(t.managePr.enterLegalIcName, "warn");
			return;
		}
		if (!draft.mobile.trim()) {
			toast(t.managePr.enterMobile, "warn");
			return;
		}
		if (draft.languages.length === 0) {
			toast(t.managePr.selectAtLeastOneLanguage, "warn");
			return;
		}
		// A measurement the PR has not given is OMITTED, never clamped. This used to
		// read `Math.max(18, …)` / `Math.max(140, …)` / `Math.max(35, …)`, so a
		// blank box was saved as age 18 / 140cm / 35kg — numbers nobody typed,
		// written to `user_profile` on any unrelated edit and permanently at odds
		// with what the PR sees on her own profile. `saveProfile` skips undefined
		// keys, so leaving one out leaves the stored value alone.
		const measure = (value: number, min: number, max: number) =>
			value > 0 ? Math.max(min, Math.min(max, Math.round(value))) : undefined;
		const age = measure(draft.age, 18, 60);
		const height = measure(draft.height, 140, 220);
		const weight = measure(draft.weight, 35, 120);
		const payload: Parameters<typeof onSaveProfile>[1] = {
			name,
			icName,
			mobile: draft.mobile.trim(),
			email: draft.email.trim(),
			...(age !== undefined ? { age } : {}),
			...(height !== undefined ? { height } : {}),
			...(weight !== undefined ? { weight } : {}),
			race: draft.race.trim(),
			place: draft.place.trim(),
			yearsExp: Math.max(0, Math.min(40, Math.round(draft.yearsExp))),
			languages: draft.languages,
			// Left out while blank, exactly like the measurements above: saveProfile
			// skips undefined keys, so an ungraded PR stays ungraded instead of
			// acquiring a tier from a save that was about their phone number.
			...(draft.kpiTier ? { kpiTier: draft.kpiTier } : {}),
			trainingLevel: draft.trainingLevel,
			payClass: draft.payClass,
		};
		// A pay-class flip is an employment change — confirm it (with any booking
		// conflicts) before applying. Everything else saves straight away.
		if (draft.payClass !== prPayClass(detail)) {
			setPayClassConfirm({
				payload,
				next: draft.payClass,
				conflicts: futureIncompatibleSlots(draft.payClass).length,
			});
			return;
		}
		onSaveProfile(detail.id, payload);
		setEditing(false);
	};

	const commitPayClassChange = () => {
		if (!payClassConfirm) return;
		onSaveProfile(detail.id, payClassConfirm.payload);
		setPayClassConfirm(null);
		setEditing(false);
	};

	const display = editing ? draft : buildAgencyPrDraft(detail);
	const avatarLetter = display.name.trim()[0]?.toUpperCase() ?? "?";
	const profilePhoto = resolveAgencyPrPhoto(detail);

	const confirmSuspend = () => {
		onSuspend(detail.id);
		setSuspendOpen(false);
	};

	const confirmDetach = () => {
		if (tiedUnderOneYear) return;
		onDetach(detail.id);
		setDetachOpen(false);
		onBack();
	};

	const requestAdminDetach = () => {
		onRequestDetach(detail.id);
		setDetachOpen(false);
	};

	return (
		<div className="iz-screen">
			<AppTopbar
				onBack={editing ? cancelEdit : onBack}
				backLabel={editing ? t.managePr.cancelEdit : t.managePr.prList}
			/>
			<header>
				<p className="iz-tiny iz-muted2 uppercase tracking-widest">
					{t.managePr.managedPr}
				</p>
				{/* The ONE payee formatter — "(Vicky) Victoria Tan Mei Lin". */}
				<IzPageTitle>
					{formatPayeeLabel(display.name, display.icName)}
				</IzPageTitle>
				<div className="mt-1 flex flex-wrap items-center gap-1.5">
					<IzPill
						variant={isAgencyPrActive(detail) ? "green" : "ink"}
						className="!py-0.5 !text-[9px]"
					>
						{isAgencyPrActive(detail) ? t.managePr.active : t.managePr.inactive}
					</IzPill>
					{/* Blank fields say so. "IC  · not rated yet" read as a broken line. */}
					<p className="iz-tiny iz-muted">
						IC {detail.ic || "—"} ·{" "}
						{averageRating === null
							? t.managePr.notRatedYet
							: `${formatStars(averageRating)} ★ avg`}
					</p>
				</div>
			</header>
			{editing && (
				<span className="iz-pill iz-pill-amber mt-2 !text-[10px]">
					{t.managePr.editing}
				</span>
			)}

			<IzCard
				className={`mt-3${editing ? " border-[rgba(217,185,122,.25)]" : ""}`}
			>
				<div className="flex gap-2.5">
					<div
						className={`iz-avatar iz-avatar--lg shrink-0${profilePhoto ? " iz-avatar-photo" : ""}`}
					>
						{/* `prPhotoSrc`, not `publicAssetPath`: a PR photo is an R2 object
						    key, and the /public helper cannot resolve one — it only worked
						    here because the mapper had already resolved it, and would have
						    broken the moment anything handed this a raw key. */}
						{profilePhoto ? (
							<img src={prPhotoSrc(profilePhoto) ?? undefined} alt="" />
						) : (
							avatarLetter
						)}
					</div>
					<div className="min-w-0 flex-1">
						<div className="iz-between items-start gap-2">
							{editing ? (
								<div className="iz-field !mb-0 min-w-0 flex-1">
									<label
										htmlFor={`${fieldId}-nickname`}
										className="!text-[9px]"
									>
										{t.managePr.floorNickname}
									</label>
									<input
										id={`${fieldId}-nickname`}
										type="text"
										value={draft.name}
										maxLength={20}
										onChange={(e) =>
											setDraft((p) => ({ ...p, name: e.target.value }))
										}
									/>
								</div>
							) : (
								<div className="font-sora text-[17px] font-bold">
									{formatPayeeLabel(display.name, display.icName)}
								</div>
							)}
							<span className="iz-tier shrink-0">
								<Star className="h-3 w-3" /> {display.trainingLevel}
							</span>
						</div>
						<p className="iz-tiny iz-muted mt-0.5">
							KPI {display.kpiTier || "—"} ·{" "}
							{display.languages.map((l) => languageLabel(l, t)).join(", ") ||
								t.managePr.noLanguages}
						</p>
					</div>
				</div>
			</IzCard>

			<div className="iz-outlet-stat-strip mt-3">
				<div className="iz-outlet-stat-cell">
					<IzKpiLabel>{t.managePr.rating}</IzKpiLabel>
					<div className="n text-[var(--iz-gold)]">
						{formatStars(averageRating)}
						{averageRating === null ? "" : "★"}
					</div>
				</div>
				<div className="iz-outlet-stat-cell">
					<IzKpiLabel>{t.managePr.attendance}</IzKpiLabel>
					{/* Em-dash, not 0% — see AgencyManagedPR.attendancePct. */}
					<div className="n">
						{detail.attendancePct === null ? "—" : `${detail.attendancePct}%`}
					</div>
				</div>
				<div className="iz-outlet-stat-cell">
					<IzKpiLabel>KPI</IzKpiLabel>
					<div className="n">{detail.kpiScore}</div>
				</div>
				<div className="iz-outlet-stat-cell">
					<IzKpiLabel>{t.managePr.paid}</IzKpiLabel>
					{/* Only abbreviate once there are thousands to abbreviate. The
					    unconditional "/1000 + k" was written against demo figures in
					    the thousands; a real settled voucher of RM 268.33 rendered as
					    "0.3k", which reads as almost nothing. */}
					<div className="n text-[var(--iz-gold-l)]">
						{detail.totalPaid >= 1000
							? `${(detail.totalPaid / 1000).toFixed(1)}k`
							: Math.round(detail.totalPaid).toString()}
					</div>
				</div>
			</div>

			<IzSectionLabel>{t.managePr.penalties}</IzSectionLabel>
			<IzCard flat>
				{penaltyBreaches.length === 0 ? (
					<p className="iz-sm iz-muted">{t.managePr.noActivePenalties}</p>
				) : (
					<div className="space-y-2">
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{penaltyBreaches.map((b) => (
								<div
									key={b.ruleId}
									className="rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2.5"
								>
									<div className="flex items-center justify-between gap-2">
										<span className="text-sm font-semibold text-[var(--iz-txt)]">
											{b.label}
										</span>
										<span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--iz-red,#e5484d)]">
											{b.fineRm > 0 ? `RM ${b.fineRm}` : t.managePr.warning}
										</span>
									</div>
									<p className="iz-sm iz-muted mt-0.5">{b.detail}</p>
								</div>
							))}
						</div>
						{penaltyTotalRm > 0 && (
							<div className="flex items-center justify-between rounded-lg bg-[rgba(229,72,77,0.08)] px-2.5 py-2">
								<span className="iz-sm font-semibold uppercase tracking-wide text-[var(--iz-red,#e5484d)]">
									{t.managePr.pendingDeduction}
								</span>
								<span className="text-base font-bold tabular-nums text-[var(--iz-red,#e5484d)]">
									RM {penaltyTotalRm}
								</span>
							</div>
						)}
					</div>
				)}
				<p className="iz-tiny iz-muted2 mt-2">
					{fill(t.managePr.previewOnly, {
						payClass: PR_PAY_CLASS_LABELS[prPayClass(detail)](t),
					})}
				</p>
			</IzCard>

			<IzSectionLabel>
				{detail.comcardImageUrl ||
				canGeneratePortfolioComcard(detail.portfolioPhotos ?? [])
					? t.managePr.photoComcard
					: "3D Comcard"}
				{editing && (
					<span className="ml-auto text-[var(--iz-gold-l)] normal-case tracking-normal">
						Editable
					</span>
				)}
			</IzSectionLabel>
			<IzCard
				className={editing ? "border-[rgba(217,185,122,.25)]" : undefined}
			>
				{editing ? (
					<div className="iz-comcard-edit">
						<AgencyComcardInput
							label={t.managePr.heightCm}
							value={draft.height}
							blankZero
							onChange={(n) => setDraft((p) => ({ ...p, height: n }))}
						/>
						<AgencyComcardInput
							label={t.managePr.weightKg}
							value={draft.weight}
							blankZero
							onChange={(n) => setDraft((p) => ({ ...p, weight: n }))}
						/>
						{/* Age follows the PR's IC, so it is shown locked rather than
						    hidden — the agency still needs to read it off the comcard,
						    they just cannot author it. The hook drops any `age` in the
						    patch and the server has no `dob` field to receive one. */}
						<AgencyComcardInput
							label={t.managePr.age}
							value={draft.age}
							blankZero
							onChange={() => {}}
							lockedNote="Age follows the PR's IC — it updates from their identity, not here."
						/>
					</div>
				) : (
					<Comcard3dPreviewVisual pr={toComcardPreview(detail)} />
				)}
			</IzCard>

			{(detail.portfolioPhotos?.some(Boolean) ?? false) && (
				<>
					<IzSectionLabel>{t.managePr.portfolioGallery}</IzSectionLabel>
					<IzCard>
						<div className="grid grid-cols-4 gap-2">
							{detail
								.portfolioPhotos!.filter((src): src is string => Boolean(src))
								.map((src) => (
									<PortfolioGalleryTile key={src} src={src} />
								))}
						</div>
						<p className="iz-tiny iz-muted2 mt-2">
							{fill(t.managePr.syncedFromPrProfile, { name: detail.name })}
						</p>
					</IzCard>
				</>
			)}

			<div className="iz-pr-profile-fields">
				<div>
					<IzSectionLabel>{t.managePr.contact}</IzSectionLabel>
					<IzCard
						flat
						className={editing ? "border-[rgba(217,185,122,.25)]" : undefined}
					>
						{editing ? (
							<div className="space-y-2">
								<div className="iz-field !mb-0">
									<label htmlFor={`${fieldId}-ic-name`}>
										{t.managePr.legalIcName}
									</label>
									<input
										id={`${fieldId}-ic-name`}
										value={draft.icName}
										onChange={(e) =>
											setDraft((p) => ({ ...p, icName: e.target.value }))
										}
									/>
								</div>
								<div className="iz-field !mb-0">
									<label htmlFor={`${fieldId}-mobile`}>
										{t.managePr.mobile}
									</label>
									<input
										id={`${fieldId}-mobile`}
										value={draft.mobile}
										onChange={(e) =>
											setDraft((p) => ({ ...p, mobile: e.target.value }))
										}
									/>
								</div>
								<div className="iz-field !mb-0">
									<label htmlFor={`${fieldId}-email`}>{t.managePr.email}</label>
									<input
										id={`${fieldId}-email`}
										type="email"
										value={draft.email}
										onChange={(e) =>
											setDraft((p) => ({ ...p, email: e.target.value }))
										}
									/>
								</div>
							</div>
						) : (
							<div className="iz-kv-list">
								<div className="iz-v-sum">
									<span className="iz-muted">{t.managePr.mobile}</span>
									<b>{display.mobile || "—"}</b>
								</div>
								<div className="iz-v-sum">
									<span className="iz-muted">{t.managePr.email}</span>
									<b>{display.email || "—"}</b>
								</div>
								<div className="iz-v-sum">
									<span className="iz-muted">IC</span>
									<b>{detail.ic || "—"}</b>
								</div>
							</div>
						)}
					</IzCard>
				</div>

				<div>
					<IzSectionLabel>{t.managePr.profileDetails}</IzSectionLabel>
					<IzCard
						flat
						className={editing ? "border-[rgba(217,185,122,.25)]" : undefined}
					>
						{editing ? (
							<div className="space-y-2">
								<div className="iz-field !mb-0">
									<label htmlFor={`${fieldId}-race`}>{t.managePr.race}</label>
									<input
										id={`${fieldId}-race`}
										value={draft.race}
										onChange={(e) =>
											setDraft((p) => ({ ...p, race: e.target.value }))
										}
									/>
								</div>
								<div className="iz-field !mb-0">
									<label htmlFor={`${fieldId}-place`}>{t.managePr.place}</label>
									<input
										id={`${fieldId}-place`}
										value={draft.place}
										onChange={(e) =>
											setDraft((p) => ({ ...p, place: e.target.value }))
										}
									/>
								</div>
								<AgencyComcardInput
									label={t.managePr.yearsExperience}
									value={draft.yearsExp}
									onChange={(n) => setDraft((p) => ({ ...p, yearsExp: n }))}
								/>
								<div className="iz-field !mb-0">
									<label htmlFor={`${fieldId}-kpi-tier`}>
										{t.managePr.kpiTier}
									</label>
									<IzSelect
										id={`${fieldId}-kpi-tier`}
										value={draft.kpiTier}
										onChange={(e) =>
											setDraft((p) => ({ ...p, kpiTier: e.target.value }))
										}
									>
										{/* An ungraded PR must be able to STAY ungraded — without
										    this option the select would silently settle on the
										    first tier and save it. */}
										<option value="">{t.managePr.notGraded}</option>
										{KPI_TIER_OPTIONS.map((tier) => (
											<option key={tier} value={tier}>
												Tier {tier}
											</option>
										))}
									</IzSelect>
								</div>
								<div className="iz-field !mb-0">
									<label htmlFor={`${fieldId}-training-tier`}>
										{t.managePr.trainingTier}
									</label>
									<IzSelect
										id={`${fieldId}-training-tier`}
										value={draft.trainingLevel}
										onChange={(e) =>
											setDraft((p) => ({ ...p, trainingLevel: e.target.value }))
										}
									>
										{TRAINING_TIER_OPTIONS.map((tier) => (
											<option key={tier} value={tier}>
												{tier}
											</option>
										))}
									</IzSelect>
								</div>
								<div className="iz-field !mb-0">
									<label htmlFor={`${fieldId}-pay-class`}>
										{t.managePr.payClass}
									</label>
									<IzSelect
										id={`${fieldId}-pay-class`}
										value={draft.payClass}
										onChange={(e) =>
											setDraft((p) => ({
												...p,
												payClass: e.target.value as PrPayClass,
											}))
										}
									>
										{PR_PAY_CLASSES.map((cls) => (
											<option key={cls} value={cls}>
												{PR_PAY_CLASS_LABELS[cls](t)}
											</option>
										))}
									</IzSelect>
								</div>
							</div>
						) : (
							<div className="iz-kv-list">
								<div className="iz-v-sum">
									<span className="iz-muted">{t.managePr.race}</span>
									<b>{display.race || "—"}</b>
								</div>
								<div className="iz-v-sum">
									<span className="iz-muted">{t.managePr.place}</span>
									<b>{display.place || "—"}</b>
								</div>
								<div className="iz-v-sum">
									<span className="iz-muted">{t.managePr.experience}</span>
									<b>{fill(t.managePr.yearsExp, { n: display.yearsExp })}</b>
								</div>
								<div className="iz-v-sum">
									<span className="iz-muted">{t.managePr.kpiTier}</span>
									<b>{display.kpiTier || "—"}</b>
								</div>
								<div className="iz-v-sum">
									<span className="iz-muted">{t.managePr.trainingTier}</span>
									<b>{display.trainingLevel}</b>
								</div>
								<div className="iz-v-sum">
									<span className="iz-muted">{t.managePr.payClass}</span>
									<b>{PR_PAY_CLASS_LABELS[display.payClass](t)}</b>
								</div>
							</div>
						)}
					</IzCard>
				</div>
			</div>

			<IzSectionLabel>{t.managePr.languages}</IzSectionLabel>
			<IzCard
				flat
				className={editing ? "border-[rgba(217,185,122,.25)]" : undefined}
			>
				{editing ? (
					<ProfileLanguagePicker
						value={draft.languages}
						onChange={(languages) => setDraft((p) => ({ ...p, languages }))}
					/>
				) : (
					<div className="flex flex-wrap gap-1.5">
						{display.languages.map((l) => (
							<IzPill key={l} variant="violet">
								{l}
							</IzPill>
						))}
					</div>
				)}
			</IzCard>

			{!editing && (
				<>
					{detail.suspended && (
						<IzCard flat className="mt-2.5 border-[var(--iz-red)]">
							<p className="iz-tiny text-[var(--iz-red)]">
								Suspended — shifts paused
							</p>
						</IzCard>
					)}
					{flags.warnLowAvg && !detail.suspended && (
						<IzCard flat className="mt-2.5 border-[var(--iz-amber)]">
							<p className="iz-tiny flex items-center gap-1 text-[var(--iz-amber)]">
								<AlertTriangle className="h-3 w-3" />
								Warn · average {formatStars(averageRating)}★ is below{" "}
								{RATING_WARN_THRESHOLD}★ — monitor performance
							</p>
						</IzCard>
					)}
					{flags.suspendStreak && !detail.suspended && (
						<IzCard flat className="mt-2.5 border-[var(--iz-red)]">
							<p className="iz-tiny text-[var(--iz-red)]">
								Auto-flag · {flags.suspendLabel} — consider suspend
							</p>
						</IzCard>
					)}
					{tiedUnderOneYear && (
						<IzCard flat className="mt-2.5 border-[var(--iz-violet)]">
							<p className="iz-tiny text-[var(--iz-violet-l)]">
								Tied {tiedMonthsLabel(detail)} · detach requires InnocenZ admin
								approval
							</p>
						</IzCard>
					)}

					<OutletSection
						title={t.managePr.shiftHistory}
						hint={
							shiftRows.length > SHIFT_HISTORY_ROWS
								? `Last ${SHIFT_HISTORY_ROWS} of ${shiftRows.length}`
								: undefined
						}
					>
						<IzCard flat>
							{/* Cells, not rows: three shifts laid across the card use its full
							    width, where stacked rows left the right half empty. Same grid
							    the Penalties block above uses. */}
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
								{shiftRows.slice(0, SHIFT_HISTORY_ROWS).map((h) => {
									const outcome = shiftOutcomeLabel(h.status);
									return (
										<div
											key={h.id}
											className="rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2.5"
										>
											<div className="flex items-start justify-between gap-2">
												<span className="iz-sm truncate font-semibold text-[var(--iz-txt)]">
													{h.outlet}
												</span>
												{outcome && (
													<IzPill
														variant={outcome.tone}
														className="shrink-0 !py-0.5 !text-[9px]"
													>
														{outcome.label}
													</IzPill>
												)}
											</div>
											<p className="iz-tiny iz-muted2 mt-0.5 tabular-nums">
												{h.dateDisplay}
											</p>
										</div>
									);
								})}
							</div>
							{/* An empty card reads as "broken"; say which it is. Payout is
							    omitted on purpose — see useAgencyPrShiftHistory. */}
							{shiftRows.length === 0 && (
								<p className="iz-tiny iz-muted">
									{shiftHistoryLoading ? "Loading…" : t.managePr.noShiftsYet}
								</p>
							)}
						</IzCard>
					</OutletSection>

					{(detail.payClassHistory?.length ?? 0) > 0 && (
						<OutletSection
							title={t.managePr.payClassHistory}
							hint={t.managePr.auditTrail}
						>
							<IzCard flat>
								{[...detail.payClassHistory!]
									.sort((a, b) => (a.fromIso < b.fromIso ? 1 : -1))
									.map((c) => (
										<div
											key={`${c.fromIso}-${c.payClass}`}
											className="iz-v-sum border-t border-[var(--iz-line)] py-1.5 first:border-0 first:pt-0"
										>
											<span className="iz-muted">From {c.fromIso}</span>
											<b>{PR_PAY_CLASS_LABELS[c.payClass](t)}</b>
										</div>
									))}
							</IzCard>
						</OutletSection>
					)}

					<OutletSection
						title={t.managePr.ratingsFeed}
						hint={
							ratingSummary.count > 0
								? `${ratingSummary.count} rating${ratingSummary.count > 1 ? "s" : ""}`
								: undefined
						}
					>
						<IzCard flat>
							{ratingSummary.rows.slice(0, 3).map((r) => (
								<p key={r.id} className="iz-tiny iz-muted py-1">
									{r.stars}★ · {r.note || t.managePr.noNote}
									{r.date ? ` · ${r.date}` : ""}
								</p>
							))}
							{ratingSummary.count === 0 && (
								<p className="iz-tiny iz-muted">{t.managePr.noRatingsYet}</p>
							)}
						</IzCard>
					</OutletSection>

					<OutletSection
						title={t.managePr.agencyActions}
						hint={t.managePr.discipline}
					>
						<div className="grid grid-cols-2 gap-2">
							<button
								type="button"
								className="iz-btn iz-btn-soft !text-xs"
								disabled={detail.suspended}
								onClick={() => setSuspendOpen(true)}
							>
								{t.managePr.suspend}
							</button>
							<button
								type="button"
								className="iz-btn iz-btn-soft !text-xs"
								onClick={() => setDetachOpen(true)}
							>
								<UserMinus className="h-3 w-3" />{" "}
								{tiedUnderOneYear
									? t.managePr.requestDetach
									: t.managePr.detach}
							</button>
						</div>
					</OutletSection>
				</>
			)}

			<div className="iz-profile-actions mt-4">
				{editing ? (
					<>
						<button
							type="button"
							className="iz-btn iz-btn-primary"
							onClick={saveEdit}
						>
							Save profile
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-soft mt-2.5"
							onClick={cancelEdit}
						>
							Cancel
						</button>
					</>
				) : (
					<button
						type="button"
						className="iz-btn iz-btn-primary"
						onClick={startEdit}
					>
						<Pencil className="h-4 w-4" /> {t.managePr.editProfile}
					</button>
				)}
			</div>

			<IzSheet open={suspendOpen} onClose={() => setSuspendOpen(false)}>
				<IzCardTitle>Suspend {detail.name}?</IzCardTitle>
				<p className="iz-tiny iz-muted mb-3 leading-relaxed">
					This pauses all shift offers and check-ins for this PR until you lift
					the suspension. Pending roster slots may need to be reassigned.
				</p>
				<div className="iz-grid2">
					<button
						type="button"
						className="iz-btn iz-btn-ghost"
						onClick={() => setSuspendOpen(false)}
					>
						Cancel
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-primary"
						onClick={confirmSuspend}
					>
						Confirm suspend
					</button>
				</div>
			</IzSheet>

			<IzSheet open={detachOpen} onClose={() => setDetachOpen(false)}>
				<IzCardTitle>
					{tiedUnderOneYear ? t.managePr.requestDetach : t.managePr.detach}{" "}
					{detail.name}?
				</IzCardTitle>
				<p className="iz-tiny iz-muted mb-3 leading-relaxed">
					{tiedUnderOneYear ? (
						<>
							This PR has been tied for {tiedMonthsLabel(detail)} (under 1
							year). Direct detach is blocked — submit a request for InnocenZ
							admin to review.
						</>
					) : (
						<>
							Detach removes this PR from your agency roster. They will no
							longer receive tied shifts or payroll from your agency.
						</>
					)}
				</p>
				<div className="iz-grid2">
					<button
						type="button"
						className="iz-btn iz-btn-ghost"
						onClick={() => setDetachOpen(false)}
					>
						Cancel
					</button>
					{tiedUnderOneYear ? (
						<button
							type="button"
							className="iz-btn iz-btn-primary"
							onClick={requestAdminDetach}
						>
							Submit admin request
						</button>
					) : (
						<button
							type="button"
							className="iz-btn iz-btn-primary"
							onClick={confirmDetach}
						>
							Confirm detach
						</button>
					)}
				</div>
			</IzSheet>

			<IzSheet
				open={payClassConfirm !== null}
				onClose={() => setPayClassConfirm(null)}
			>
				<IzCardTitle>{t.managePr.changePayClass}</IzCardTitle>
				<p className="iz-tiny iz-muted mb-3 leading-relaxed">
					{detail.name} moves from{" "}
					<b>{PR_PAY_CLASS_LABELS[prPayClass(detail)](t)}</b> to{" "}
					<b>
						{payClassConfirm
							? PR_PAY_CLASS_LABELS[payClassConfirm.next](t)
							: ""}
					</b>
					, effective {DEFAULT_ROSTER_DATE_ISO}. Shifts already worked or booked
					keep their original pay; new shifts use the new class.
				</p>
				{payClassConfirm && payClassConfirm.conflicts > 0 && (
					<IzCard flat className="mb-3 border-[var(--iz-amber)]">
						<p className="iz-tiny flex items-start gap-1 text-[var(--iz-amber)]">
							<AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
							{payClassConfirm.conflicts} upcoming booked shift
							{payClassConfirm.conflicts === 1 ? " is" : "s are"} not
							commission-only. Commission-only PRs may only work commission-only
							shifts — review or reassign these bookings.
						</p>
					</IzCard>
				)}
				<div className="iz-grid2">
					<button
						type="button"
						className="iz-btn iz-btn-ghost"
						onClick={() => setPayClassConfirm(null)}
					>
						Cancel
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-primary"
						onClick={commitPayClassChange}
					>
						Confirm change
					</button>
				</div>
			</IzSheet>
		</div>
	);
}

function AgencyComcardInput({
	label,
	value,
	onChange,
	blankZero,
	lockedNote,
}: {
	label: string;
	value: number;
	onChange: (n: number) => void;
	/**
	 * For height / weight / age, 0 means "the account has no figure on file", so
	 * the box shows empty rather than a 0 that reads like a measurement. Years of
	 * experience is NOT one of these — 0 years is a real answer.
	 */
	blankZero?: boolean;
	/**
	 * Present = this figure is not the agency's to change, and this is why.
	 * Shown on hover AND on click, because the two questions differ: hover asks
	 * "is this broken", click asks "why can't I". A greyed box that answers
	 * neither reads as a bug in the page.
	 */
	lockedNote?: string;
}) {
	const [noteShown, setNoteShown] = useState(false);
	const plainFieldId = useId();
	const shown =
		Number.isFinite(value) && !(blankZero && value === 0) ? value : "";

	if (lockedNote) {
		// Real association, not just proximity: the whole point of this branch is
		// that a sighted user sees a greyed box and a screen-reader user hears
		// "Age, dimmed" — both need the label tied to the control to get the
		// explanation, which rides on aria-describedby below.
		const fieldId = `comcard-locked-${label.replace(/\W+/g, "-").toLowerCase()}`;
		return (
			<div className="iz-comcard-field iz-comcard-field--locked">
				<label htmlFor={fieldId}>
					{label}
					<Lock
						className="ml-1 inline h-3 w-3 align-[-1px] opacity-70"
						aria-hidden
					/>
				</label>
				{/* Kept as a disabled input rather than swapped for text, so the
				    field keeps its size and the row still reads as one form. */}
				<input
					id={fieldId}
					type="number"
					inputMode="numeric"
					value={shown}
					disabled
					readOnly
					title={lockedNote}
					aria-describedby={`${fieldId}-note`}
				/>
				{/* The overlay carries the pointer handlers: a disabled input fires
				    no mouse events of its own, so hover and click on the control
				    itself would both go unheard. */}
				<button
					type="button"
					className="iz-comcard-field-lockhit"
					onMouseEnter={() => setNoteShown(true)}
					onMouseLeave={() => setNoteShown(false)}
					onFocus={() => setNoteShown(true)}
					onBlur={() => setNoteShown(false)}
					onClick={() => setNoteShown((s) => !s)}
					aria-label={`${label} — ${lockedNote}`}
				/>
				{/* Always in the DOM so `aria-describedby` always resolves; hidden
				    visually until hover/click, which is a SIGHTED affordance. A
				    screen reader gets the reason with the field either way. */}
				<p
					className="iz-comcard-field-locknote"
					id={`${fieldId}-note`}
					hidden={!noteShown}
				>
					{lockedNote}
				</p>
			</div>
		);
	}

	return (
		<div className="iz-comcard-field">
			<label htmlFor={plainFieldId}>{label}</label>
			<input
				id={plainFieldId}
				type="number"
				inputMode="numeric"
				value={shown}
				onChange={(e) => onChange(Number(e.target.value))}
			/>
		</div>
	);
}
