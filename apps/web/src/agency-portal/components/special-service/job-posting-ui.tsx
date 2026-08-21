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

const JOB_TABLE_HEADERS = [
	"Date",
	"Type",
	"Budget",
	"Time",
	"Status",
	"Remark",
	"Cost",
] as const;

function JobTableHead() {
	return (
		<thead>
			<tr>
				{JOB_TABLE_HEADERS.map((label, i) => (
					<th
						key={label}
						className={i === 2 || i === 6 ? "text-right" : undefined}
					>
						{label}
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
	return (
		<label
			className={cn(
				"iz-job-posting-field flex w-full min-w-0 flex-col gap-1",
				className,
			)}
		>
			<JobPostingMicroLabel>{label}</JobPostingMicroLabel>
			{children}
		</label>
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
								Done
							</button>
						)}
						{showRemove && onRemove && (
							<button
								type="button"
								onClick={onRemove}
								className="iz-chip flex h-6 w-6 items-center justify-center !p-0 text-[var(--iz-muted)]"
								aria-label="Remove job"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>
			)}

			<div className="iz-job-posting-field-grid">
				<ComposerField label="Date">
					<div className="iz-job-posting-control">
						<JobMultiDatePicker
							embedded
							selectedDateIsos={draft.selectedDateIsos}
							onChange={(selectedDateIsos) => onChange({ selectedDateIsos })}
						/>
					</div>
				</ComposerField>
				<ComposerField label="Budget (RM)">
					<input
						type="number"
						min={0}
						step={5}
						className="iz-job-posting-control iz-job-posting-input block w-full min-w-0"
						placeholder="Enter amount"
						aria-label="Budget"
						value={draft.budget}
						onChange={(e) => onChange({ budget: e.target.value })}
					/>
				</ComposerField>
				<ComposerField label="Start time">
					<div className="iz-job-posting-control">
						<IzTimeInput
							value={draft.time}
							onChange={(time) => onChange({ time })}
							className="iz-job-composer-slot w-full min-w-0"
							aria-label="Start time"
						/>
					</div>
				</ComposerField>
			</div>

			{outlets && (
				<ComposerField label="Outlet" className="mt-3">
					<select
						className="iz-job-posting-control iz-job-posting-input block w-full min-w-0"
						aria-label="Outlet"
						value={draft.outletId}
						onChange={(e) => onChange({ outletId: e.target.value })}
					>
						<option value="">Select a venue…</option>
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
								? "Loading your venues…"
								: outletsError
									? "Could not load your venues — reload the page and try again."
									: "No linked venues yet — link an outlet before posting a job."}
						</p>
					)}
				</ComposerField>
			)}

			<ComposerField label="Service type" className="mt-3">
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
							{option.label}
						</button>
					))}
				</div>
				{offer && (
					<p className="iz-job-posting-type-summary">{offer.summary}</p>
				)}
				{isOthersService(draft.serviceType) && (
					<input
						type="text"
						className="iz-job-posting-control iz-job-posting-input mt-2 block w-full min-w-0"
						placeholder="Name your service"
						aria-label="Custom service name"
						value={draft.customServiceName}
						onChange={(e) => onChange({ customServiceName: e.target.value })}
					/>
				)}
			</ComposerField>

			<ComposerField label="Remark" className="mt-3">
				<textarea
					className="iz-job-posting-textarea w-full"
					placeholder={specialServiceRemarkHint(draft.serviceType)}
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
											aria-label="Edit job"
										>
											<Pencil className="h-3 w-3" />
										</button>
										<button
											type="button"
											onClick={() => onRemove(row.id)}
											className="iz-chip flex h-6 w-6 items-center justify-center !p-0 text-[var(--iz-muted)]"
											aria-label="Remove job"
										>
											<X className="h-3 w-3" />
										</button>
									</div>
								</div>
							</td>
							<td className="iz-job-posting-col-type whitespace-nowrap">
								{specialServiceTypeLabel(
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
								<JobStatusBadge tone="queued" label="Queued" />
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
	emptyMessage = "No job postings match this filter",
}: {
	rows: SpecialServiceRecord[];
	statusLabel: (row: SpecialServiceRecord) => string;
	statusTone: (row: SpecialServiceRecord) => AgencyJobPostingStatusTone;
	emptyMessage?: string;
}) {
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
				<p className="text-xs text-[var(--iz-muted)]">{emptyMessage}</p>
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
							{specialServiceTypeLabel(row.serviceType, row.customServiceName)}
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
