import { isoKeyFromDate } from "@agency-portal/components/iz/HistDateCalendar";
import { formatRM, IzTimeInput } from "@agency-portal/components/iz/ui";
import {
	formatJobDates,
	JobMultiDatePicker,
} from "@agency-portal/components/outlet/post-job-fields";
import {
	type AgencyJobPostingStatusTone,
	type AgencySpecialServiceOffer,
	isOthersService,
	type SpecialServiceRecord,
	specialServiceOffer,
	specialServiceRemarkHint,
	specialServiceTypeLabel,
} from "@agency-portal/lib/special-service-demo";
import { cn } from "@agency-portal/lib/utils";
import { startOfToday } from "date-fns";
import { Pencil, X } from "lucide-react";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type JobPostingDraft = {
	selectedDateIsos: string[];
	serviceType: string;
	customServiceName: string;
	time: string;
	budget: string;
	remark: string;
	/**
	 * WHICH VENUE the job is for — the outlet's uuid, "" until chosen.
	 *
	 * A job posting is "outlet + service" (SpecialServiceSection says exactly
	 * that in its own comment), but the draft never carried an outlet: the submit
	 * path hardcoded `OUTLET_NAMES[0] ?? "Velvet 23"`, a demo constant, on the
	 * REAL backend branch. It reached the server as `outletName`, which the
	 * create handler ignores entirely — it reads `outletId` — so every real
	 * posting was filed against NO venue while a demo venue's name rode along in
	 * the payload.
	 *
	 * An id, not a name: `special_service` dropped its denormalised `outlet_name`
	 * column and reads the venue's name back through the FK.
	 */
	outletId: string;
};

export type QueuedJobPosting = JobPostingDraft & { id: string };

export function newJobPostingDraft(
	offers: AgencySpecialServiceOffer[],
): JobPostingDraft {
	const first = offers[0];
	return {
		selectedDateIsos: [isoKeyFromDate(startOfToday())],
		serviceType: first?.id ?? "transportation",
		customServiceName: "",
		time: "19:00",
		budget: "",
		remark: "",
		// Deliberately UNSET rather than pre-picked. Defaulting to "the first
		// venue" is how the demo constant got here in the first place, and a job
		// silently filed against a venue nobody chose is the same mistake with a
		// real id instead of a fake name.
		outletId: "",
	};
}

export function parseJobPostingDraft(
	draft: JobPostingDraft,
	opts?: { requireBudget?: boolean },
): { budget: number; offer: AgencySpecialServiceOffer } | null {
	const requireBudget = opts?.requireBudget ?? true;
	const budget = draft.budget ? Number(draft.budget) : 0;
	const offer = specialServiceOffer(draft.serviceType);
	if (!offer) return null;
	if (
		requireBudget &&
		(!draft.budget.trim() || !Number.isFinite(budget) || budget <= 0)
	)
		return null;
	if (isOthersService(draft.serviceType) && !draft.customServiceName.trim())
		return null;
	return { budget, offer };
}

export function formatPostedJobCost(amountOut: number): string {
	return amountOut > 0 ? formatRM(amountOut) : "—";
}

export function newQueuedJobPosting(draft: JobPostingDraft): QueuedJobPosting {
	return {
		...draft,
		id: `job-draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
	};
}

export function daysInJobDraft(
	draft: Pick<JobPostingDraft, "selectedDateIsos">,
): number {
	return draft.selectedDateIsos.length;
}

/**
 * `AGENCY_SPECIAL_SERVICE_OFFERS[].id` → the name rendered for it.
 *
 * The id is the `serviceType` / category stored on the record and posted to the
 * backend, and the offer's own `label` and `summary` ride along as the posting's
 * title and description — all three are DATA at the source and stay English
 * there. Only the copy on screen is translated, keyed on the id, which is the
 * shape the PR app already uses. The RECORD KEYS never change.
 */
const OFFER_LABEL: Record<string, (t: PortalTranslations) => string> = {
	transportation: (t) => t.adminService.catTransportation,
	delivery: (t) => t.adminService.catDelivery,
	wardrobe: (t) => t.adminService.catWardrobe,
	makeup: (t) => t.adminService.catMakeup,
	vip_escort: (t) => t.adminService.catVipEscort,
	uniform: (t) => t.adminService.catUniform,
	emergency_cover: (t) => t.adminService.catEmergencyCover,
	training: (t) => t.adminService.catTraining,
	others: (t) => t.adminService.catOthers,
	leave_agency: (t) => t.ssPortal.offerLeaveAgency,
};

const OFFER_SUMMARY: Record<string, (t: PortalTranslations) => string> = {
	transportation: (t) => t.ssPortal.offerTransportationSummary,
	delivery: (t) => t.ssPortal.offerDeliverySummary,
	wardrobe: (t) => t.ssPortal.offerWardrobeSummary,
	makeup: (t) => t.ssPortal.offerMakeupSummary,
	vip_escort: (t) => t.ssPortal.offerVipEscortSummary,
	uniform: (t) => t.ssPortal.offerUniformSummary,
	emergency_cover: (t) => t.ssPortal.offerEmergencyCoverSummary,
	training: (t) => t.ssPortal.offerTrainingSummary,
	others: (t) => t.ssPortal.offerOthersSummary,
	leave_agency: (t) => t.ssPortal.offerLeaveAgencySummary,
};

const OFFER_REMARK_HINT: Record<string, (t: PortalTranslations) => string> = {
	transportation: (t) => t.ssPortal.hintTransportation,
	delivery: (t) => t.ssPortal.hintDelivery,
	wardrobe: (t) => t.ssPortal.hintWardrobe,
	makeup: (t) => t.ssPortal.hintMakeup,
	vip_escort: (t) => t.ssPortal.hintVipEscort,
	uniform: (t) => t.ssPortal.hintUniform,
	emergency_cover: (t) => t.ssPortal.hintEmergencyCover,
	training: (t) => t.ssPortal.hintTraining,
	others: (t) => t.ssPortal.hintOthers,
	leave_agency: (t) => t.ssPortal.hintLeaveAgency,
};

/**
 * The offer's name on screen. An id with no entry falls through to the stored
 * English label, so a service added server-side keeps rendering rather than
 * blanking the cell.
 */
export function specialServiceOfferLabel(
	t: PortalTranslations,
	serviceType: string,
	customServiceName?: string,
): string {
	if (isOthersService(serviceType)) {
		const name = customServiceName?.trim();
		return name
			? fill(t.ssPortal.othersNamed, { name })
			: t.adminService.catOthers;
	}
	return (
		OFFER_LABEL[serviceType]?.(t) ??
		specialServiceTypeLabel(serviceType, customServiceName)
	);
}

export function specialServiceOfferSummary(
	t: PortalTranslations,
	serviceType: string,
): string {
	return (
		OFFER_SUMMARY[serviceType]?.(t) ??
		specialServiceOffer(serviceType)?.summary ??
		""
	);
}

export function specialServiceOfferRemarkHint(
	t: PortalTranslations,
	serviceType: string,
): string {
	return (
		OFFER_REMARK_HINT[serviceType]?.(t) ??
		specialServiceRemarkHint(serviceType, t)
	);
}

/*
 * Functions, not strings: a module-scope array cannot read `t`, and storing the
 * key NAME here would ship "ssPortal.budget" to the screen. `id` is a stable
 * React key so a locale switch re-renders the row instead of remounting it.
 */
const JOB_TABLE_HEADERS: {
	id: string;
	label: (t: PortalTranslations) => string;
	alignRight?: boolean;
}[] = [
	{ id: "date", label: (t) => t.postJob.date },
	{ id: "type", label: (t) => t.table.type },
	{ id: "budget", label: (t) => t.ssPortal.budget, alignRight: true },
	{ id: "time", label: (t) => t.postJob.time },
	{ id: "status", label: (t) => t.table.status },
	{ id: "remark", label: (t) => t.ssPortal.remark },
	{ id: "cost", label: (t) => t.ssPortal.cost, alignRight: true },
];

function JobTableHead() {
	const { t } = usePortalLocale();
	return (
		<thead>
			<tr>
				{JOB_TABLE_HEADERS.map((col) => (
					<th
						key={col.id}
						className={col.alignRight ? "text-right" : undefined}
					>
						{col.label(t)}
					</th>
				))}
			</tr>
		</thead>
	);
}

export function JobPostingMicroLabel({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("iz-job-posting-micro-label", className)}>
			{children}
		</span>
	);
}

export function JobStatusBadge({
	tone,
	label,
}: {
	tone: AgencyJobPostingStatusTone | "queued";
	label: string;
}) {
	return (
		<span className={cn("iz-job-status-badge", `iz-job-status-badge--${tone}`)}>
			<span className="iz-job-status-badge-dot" aria-hidden />
			{label}
		</span>
	);
}

function JobBudgetCell({ amount }: { amount: number }) {
	const isZero = amount === 0;
	return (
		<span
			className={cn(
				"iz-job-posting-budget font-semibold tabular-nums",
				isZero && "is-zero",
			)}
		>
			{formatRM(amount)}
		</span>
	);
}

function ComposerField({
	label,
	children,
	className,
}: {
	label: string;
	children: React.ReactNode;
	className?: string;
}) {
	/*
	 * A <div>, not a <label>: this is a caption over an arbitrary slot, and most
	 * of what callers put in that slot is not a labelable control at all — the
	 * multi-date picker and the service-type pill grid are both grids of buttons.
	 * A <label> wrapping those associates itself with the FIRST labelable
	 * descendant, so clicking the "Service type" caption activated the first
	 * service pill. Every control that IS labelable in here carries its own
	 * `aria-label`, so nothing loses its accessible name.
	 */
	return (
		<div
			className={cn(
				"iz-job-posting-field flex w-full min-w-0 flex-col gap-1",
				className,
			)}
		>
			<JobPostingMicroLabel>{label}</JobPostingMicroLabel>
			{children}
		</div>
	);
}

export function JobPostingComposer({
	draft,
	onChange,
	offers,
	title,
	onRemove,
	showRemove,
	onDone,
	outlets,
	outletsLoading,
	outletsError,
}: {
	draft: JobPostingDraft;
	onChange: (patch: Partial<JobPostingDraft>) => void;
	offers: AgencySpecialServiceOffer[];
	title?: string;
	onRemove?: () => void;
	showRemove?: boolean;
	onDone?: () => void;
	/**
	 * The venues this poster may choose between — the AGENCY's approved outlets.
	 *
	 * Omitted by the outlet portal's callers, which are already pinned to their
	 * own venue and have nothing to pick; the field renders only when supplied.
	 * Passed from the caller and never defaulted to a constant, following
	 * `AgencyOutletFilters.outletNames`: "an optional prop defaulting to that
	 * demo constant is how the wrong list got here".
	 */
	outlets?: { id: string; name: string }[];
	/** True while `outlets` is still being fetched — an empty list is not yet a fact. */
	outletsLoading?: boolean;
	/** True when the fetch failed — an empty list is not a fact then either. */
	outletsError?: boolean;
}) {
	const { t } = usePortalLocale();
	const offer = specialServiceOffer(draft.serviceType);

	return (
		<>
			{(title || showRemove || onDone) && (
				<div className="mb-2 flex items-center justify-between gap-2">
					{title ? (
						<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
							{title}
						</span>
					) : (
						<span />
					)}
					<div className="flex items-center gap-1.5">
						{onDone && (
							<button
								type="button"
								onClick={onDone}
								className="iz-chip px-2 py-1 text-[11px] font-semibold text-[var(--iz-gold)]"
							>
								{t.postJob.done}
							</button>
						)}
						{showRemove && onRemove && (
							<button
								type="button"
								onClick={onRemove}
								className="iz-chip flex h-6 w-6 items-center justify-center !p-0 text-[var(--iz-muted)]"
								aria-label={t.ssPortal.removeJob}
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>
			)}

			<div className="iz-job-posting-field-grid">
				<ComposerField label={t.postJob.date}>
					<div className="iz-job-posting-control">
						<JobMultiDatePicker
							embedded
							selectedDateIsos={draft.selectedDateIsos}
							onChange={(selectedDateIsos) => onChange({ selectedDateIsos })}
						/>
					</div>
				</ComposerField>
				<ComposerField label={t.ssPortal.budgetRm}>
					<input
						type="number"
						min={0}
						step={5}
						className="iz-job-posting-control iz-job-posting-input block w-full min-w-0"
						placeholder={t.ssPortal.enterAmount}
						aria-label={t.ssPortal.budget}
						value={draft.budget}
						onChange={(e) => onChange({ budget: e.target.value })}
					/>
				</ComposerField>
				<ComposerField label={t.postJob.startTime}>
					<div className="iz-job-posting-control">
						<IzTimeInput
							value={draft.time}
							onChange={(time) => onChange({ time })}
							className="iz-job-composer-slot w-full min-w-0"
							aria-label={t.postJob.startTime}
						/>
					</div>
				</ComposerField>
			</div>

			{outlets && (
				<ComposerField label={t.table.outlet} className="mt-3">
					<select
						className="iz-job-posting-control iz-job-posting-input block w-full min-w-0"
						aria-label={t.table.outlet}
						value={draft.outletId}
						onChange={(e) => onChange({ outletId: e.target.value })}
					>
						<option value="">{t.ssPortal.selectVenue}</option>
						{outlets.map((o) => (
							<option key={o.id} value={o.id}>
								{o.name}
							</option>
						))}
					</select>
					{/*
					 * "No linked venues yet" is a CLAIM ABOUT THE AGENCY, so it must
					 * not be printed while the list is merely in flight or has failed
					 * to load — an empty array means all three, and telling a real
					 * agency with five venues that it has none is the same class of
					 * lie as the demo constant this picker replaced.
					 */}
					{outlets.length === 0 && (
						<p className="iz-job-posting-type-summary">
							{outletsLoading
								? t.ssPortal.loadingVenues
								: outletsError
									? t.ssPortal.venuesLoadFailed
									: t.ssPortal.noLinkedVenues}
						</p>
					)}
				</ComposerField>
			)}

			<ComposerField label={t.ssPortal.serviceType} className="mt-3">
				<div className="iz-job-posting-type-grid">
					{offers.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() =>
								onChange({
									serviceType: option.id,
									customServiceName: isOthersService(option.id)
										? draft.customServiceName
										: "",
								})
							}
							className={cn(
								"iz-job-posting-type-pill",
								draft.serviceType === option.id && "is-active",
							)}
						>
							{specialServiceOfferLabel(t, option.id)}
						</button>
					))}
				</div>
				{offer && (
					<p className="iz-job-posting-type-summary">
						{specialServiceOfferSummary(t, offer.id)}
					</p>
				)}
				{isOthersService(draft.serviceType) && (
					<input
						type="text"
						className="iz-job-posting-control iz-job-posting-input mt-2 block w-full min-w-0"
						placeholder={t.ssPortal.nameYourService}
						aria-label={t.ssPortal.customServiceName}
						value={draft.customServiceName}
						onChange={(e) => onChange({ customServiceName: e.target.value })}
					/>
				)}
			</ComposerField>

			<ComposerField label={t.ssPortal.remark} className="mt-3">
				<textarea
					className="iz-job-posting-textarea w-full"
					aria-label={t.ssPortal.remark}
					placeholder={specialServiceOfferRemarkHint(t, draft.serviceType)}
					value={draft.remark}
					onChange={(e) => onChange({ remark: e.target.value })}
				/>
			</ComposerField>
		</>
	);
}

function JobPostingTable({ children }: { children: React.ReactNode }) {
	return (
		<div className="iz-job-postings-table-wrap">
			<table className="iz-data-table iz-job-postings-table">{children}</table>
		</div>
	);
}

export function JobQueueTable({
	rows,
	onEdit,
	onRemove,
	queueCostEstimate,
}: {
	rows: QueuedJobPosting[];
	onEdit: (id: string) => void;
	onRemove: (id: string) => void;
	queueCostEstimate?: (row: QueuedJobPosting) => number | undefined;
}) {
	const { t } = usePortalLocale();
	return (
		<JobPostingTable>
			<JobTableHead />
			<tbody>
				{rows.map((row, index) => {
					const parsed = parseJobPostingDraft(row);
					const budget = parsed?.budget ?? 0;
					const remark = row.remark.trim() || "—";
					const cost = queueCostEstimate?.(row);

					return (
						<tr key={row.id} className={index % 2 === 1 ? "is-alt" : undefined}>
							<td className="iz-job-posting-col-date whitespace-nowrap">
								<div className="flex items-start justify-between gap-2">
									<span>{formatJobDates(row.selectedDateIsos, t)}</span>
									<div className="flex shrink-0 items-center gap-0.5">
										<button
											type="button"
											onClick={() => onEdit(row.id)}
											className="iz-chip flex h-6 w-6 items-center justify-center !p-0"
											aria-label={t.ssPortal.editJob}
										>
											<Pencil className="h-3 w-3" />
										</button>
										<button
											type="button"
											onClick={() => onRemove(row.id)}
											className="iz-chip flex h-6 w-6 items-center justify-center !p-0 text-[var(--iz-muted)]"
											aria-label={t.ssPortal.removeJob}
										>
											<X className="h-3 w-3" />
										</button>
									</div>
								</div>
							</td>
							<td className="iz-job-posting-col-type whitespace-nowrap">
								{specialServiceOfferLabel(
									t,
									row.serviceType,
									row.customServiceName,
								)}
							</td>
							<td className="text-right whitespace-nowrap">
								<JobBudgetCell amount={budget} />
							</td>
							<td className="iz-job-posting-col-time whitespace-nowrap tabular-nums">
								{row.time}
							</td>
							<td>
								<JobStatusBadge tone="queued" label={t.ssPortal.queued} />
							</td>
							<td className="iz-job-posting-col-remark max-w-[180px]">
								<span className="line-clamp-2" title={remark}>
									{remark}
								</span>
							</td>
							<td className="iz-job-posting-col-cost text-right whitespace-nowrap font-semibold tabular-nums">
								{cost != null && cost > 0 ? formatRM(cost) : "—"}
							</td>
						</tr>
					);
				})}
			</tbody>
		</JobPostingTable>
	);
}

export function JobPostingsTable({
	rows,
	statusLabel,
	statusTone,
	emptyMessage,
}: {
	rows: SpecialServiceRecord[];
	/** Arrives ALREADY TRANSLATED — it lands inside the badge, mid-render. */
	statusLabel: (row: SpecialServiceRecord) => string;
	statusTone: (row: SpecialServiceRecord) => AgencyJobPostingStatusTone;
	emptyMessage?: string;
}) {
	// Not a default parameter value: those are evaluated before the hook runs,
	// so they cannot read the dictionary.
	const { t } = usePortalLocale();
	const sorted = useMemo(
		() =>
			[...rows].sort((a, b) => {
				const dateCmp = b.dateIso.localeCompare(a.dateIso);
				if (dateCmp !== 0) return dateCmp;
				return b.time.localeCompare(a.time);
			}),
		[rows],
	);

	if (sorted.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-8 text-center">
				<p className="text-xs text-[var(--iz-muted)]">
					{emptyMessage ?? t.ssPortal.noJobPostingsMatch}
				</p>
			</div>
		);
	}

	return (
		<JobPostingTable>
			<JobTableHead />
			<tbody>
				{sorted.map((row, index) => (
					<tr key={row.id} className={index % 2 === 1 ? "is-alt" : undefined}>
						<td className="iz-job-posting-col-date whitespace-nowrap">
							{row.date}
						</td>
						<td className="iz-job-posting-col-type whitespace-nowrap">
							{specialServiceOfferLabel(
								t,
								row.serviceType,
								row.customServiceName,
							)}
						</td>
						<td className="text-right whitespace-nowrap">
							<JobBudgetCell amount={row.amountIn} />
						</td>
						<td className="iz-job-posting-col-time whitespace-nowrap tabular-nums">
							{row.time}
						</td>
						<td>
							<JobStatusBadge tone={statusTone(row)} label={statusLabel(row)} />
						</td>
						<td className="iz-job-posting-col-remark max-w-[180px]">
							<span className="line-clamp-2" title={row.description}>
								{row.description}
							</span>
						</td>
						<td className="iz-job-posting-col-cost text-right whitespace-nowrap font-semibold tabular-nums">
							{formatPostedJobCost(row.amountOut)}
						</td>
					</tr>
				))}
			</tbody>
		</JobPostingTable>
	);
}
