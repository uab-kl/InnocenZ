import { JobPostingMicroLabel } from "@agency-portal/components/special-service/job-posting-ui";
import { cn } from "@agency-portal/lib/utils";
import { Calendar, ChevronRight, Info, Lock, Pencil, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function PostJobFormLegend() {
	const { t } = usePortalLocale();
	return (
		<details className="iz-post-job-legend" open>
			<summary className="iz-post-job-legend__title cursor-pointer select-none">
				{t.postJob.howToReadThisForm}
			</summary>
			<ul className="iz-post-job-legend__list">
				<li>
					<span className="iz-post-job-legend__swatch iz-post-job-legend__swatch--violet" />
					{t.postJob.legendViolet}
				</li>
				<li>
					<span className="iz-post-job-legend__swatch iz-post-job-legend__swatch--gold" />
					{t.postJob.legendGold}
				</li>
				<li>
					<Lock className="iz-post-job-legend__lock" aria-hidden />
					{t.postJob.legendLocked}
				</li>
			</ul>
		</details>
	);
}

/**
 * Touch-safe help. The old guidance lived in `title=` tooltips, which only
 * exist for a mouse — on the phones outlets actually use, every one of those
 * hints was invisible. An (i) button with a tap-to-toggle panel works on
 * touch, mouse and screen readers alike.
 */
export function PostJobInfoTip({ text }: { text: string }) {
	const { t } = usePortalLocale();
	const [open, setOpen] = useState(false);
	return (
		<span className="iz-post-job-info-tip">
			<button
				type="button"
				className="iz-post-job-info-tip__btn"
				aria-expanded={open}
				aria-label={t.postJob.infoTipLabel}
				onClick={(e) => {
					// The whole field is wrapped in a <label>; an unhandled click here
					// would focus/activate the field control instead of the tip.
					e.preventDefault();
					e.stopPropagation();
					setOpen((v) => !v);
				}}
			>
				<Info className="h-3 w-3" aria-hidden />
			</button>
			{open && <span className="iz-post-job-info-tip__panel">{text}</span>}
		</span>
	);
}

/**
 * One of the three labelled blocks the form is grouped into — The night /
 * Who works it / What it pays. A heading, not a card: the fields under it
 * stay exactly the flat siblings they always were.
 */
export function PostJobGroupHeader({ label }: { label: string }) {
	return (
		<p className="iz-post-job-group-header" aria-hidden={false}>
			{label}
		</p>
	);
}

export function PostJobShiftField({
	label,
	info,
	children,
	className,
	layout = "row",
}: {
	label: string;
	/** Optional touch-safe help — rendered as an (i) beside the label. */
	info?: ReactNode;
	children: ReactNode;
	className?: string;
	layout?: "row" | "stack";
}) {
	return (
		<label
			className={cn(
				"iz-post-job-field",
				layout === "row"
					? "iz-post-job-field--row"
					: "iz-post-job-field--stack",
				className,
			)}
		>
			<JobPostingMicroLabel className="iz-post-job-field__label">
				{label}
				{info}
			</JobPostingMicroLabel>
			<div className="iz-post-job-field__control">{children}</div>
		</label>
	);
}

export function PostJobShiftCardHeader({
	title,
	shiftIndex,
	shiftTotal,
	trailing,
}: {
	title: string;
	shiftIndex?: number;
	shiftTotal?: number;
	trailing?: ReactNode;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-post-job-shift-head">
			<div className="flex min-w-0 items-center gap-2">
				<span className="iz-post-job-shift-head__icon" aria-hidden>
					<Calendar className="h-4 w-4" />
				</span>
				<span className="font-sora text-sm font-extrabold text-[var(--iz-txt)]">
					{title}
				</span>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{shiftIndex != null && shiftTotal != null && (
					<span className="iz-post-job-shift-head__badge">
						{fill(t.postJob.shiftNofM, { n: shiftIndex, m: shiftTotal })}
					</span>
				)}
				{trailing}
			</div>
		</div>
	);
}

export function PostJobLockedValue({
	children,
	locked = true,
}: {
	children: ReactNode;
	locked?: boolean;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-post-job-locked-row">
			<span className="min-w-0 flex-1 text-sm font-semibold text-[var(--iz-txt)]">
				{children}
			</span>
			{locked && (
				<span className="iz-post-job-locked-badge">
					<Lock className="h-3 w-3" aria-hidden />
					{t.postJob.locked}
				</span>
			)}
		</div>
	);
}

export function PostJobEditableInputShell({
	children,
	icon: Icon = Pencil,
}: {
	children: ReactNode;
	icon?: typeof Pencil;
}) {
	return (
		<div className="iz-job-posting-control iz-post-job-editable-shell">
			<div className="min-w-0 flex-1">{children}</div>
			<Icon
				className="h-3.5 w-3.5 shrink-0 text-[var(--iz-violet)]"
				aria-hidden
			/>
		</div>
	);
}

export function PostJobTierSectionHeader() {
	const { t } = usePortalLocale();
	return (
		<div className="iz-post-job-tier-head">
			<span
				className="iz-post-job-tier-head__icon iz-post-job-tier-head__icon--info"
				aria-hidden
			>
				<Info className="h-3.5 w-3.5" />
			</span>
			<div className="min-w-0">
				<p className="font-sora text-sm font-extrabold text-[var(--iz-txt)]">
					{t.postJob.payByPrTier}
				</p>
				<p className="mt-0.5 text-xs leading-snug text-[var(--iz-muted2)]">
					{t.postJob.payByPrTierHint}
				</p>
			</div>
		</div>
	);
}

export function PostJobSummaryCard({
	headcount,
	cost,
	compact,
}: {
	headcount: number;
	cost: number;
	compact?: boolean;
}) {
	const { t } = usePortalLocale();
	if (compact) {
		return (
			<div className="iz-post-job-dock-stats">
				<div className="iz-post-job-dock-stats__item">
					<span className="iz-post-job-dock-stats__label">
						{t.postJob.headcount}
					</span>
					<span className="iz-post-job-dock-stats__value">{headcount}</span>
				</div>
				<div className="iz-post-job-dock-stats__divider" aria-hidden />
				<div className="iz-post-job-dock-stats__item">
					<span className="iz-post-job-dock-stats__label">
						{t.postJob.estCost}
					</span>
					<span className="iz-post-job-dock-stats__value iz-post-job-dock-stats__value--gold">
						RM&nbsp;{cost.toLocaleString("en-MY")}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className="iz-post-job-summary-card">
			<p className="iz-post-job-summary-card__title">{t.postJob.summary}</p>
			<div className="iz-post-job-summary-card__row">
				<span className="iz-post-job-summary-card__label">
					{t.postJob.totalHeadcount}
				</span>
				<span className="iz-post-job-summary-card__value iz-post-job-summary-card__value--headcount">
					{headcount}
				</span>
			</div>
			<div className="iz-post-job-summary-card__cost-box">
				<span className="iz-post-job-summary-card__label">
					{t.postJob.estimatedCost}
				</span>
				<span className="iz-post-job-summary-card__value iz-post-job-summary-card__value--gold">
					RM&nbsp;{cost.toLocaleString("en-MY")}
				</span>
			</div>
		</div>
	);
}

export function PostJobActionPanel({
	headcount,
	cost,
	shiftCount,
	onAddShift,
	onSubmit,
	submitDisabled,
	compact = false,
}: {
	headcount: number;
	cost: number;
	shiftCount: number;
	onAddShift: () => void;
	onSubmit: () => void;
	submitDisabled?: boolean;
	compact?: boolean;
}) {
	const { t } = usePortalLocale();
	const shiftLabel = fill(
		shiftCount === 1 ? t.postJob.postShiftOne : t.postJob.postShiftMany,
		{ n: shiftCount },
	);

	if (compact) {
		return (
			<div className="iz-post-job-action-panel iz-post-job-action-panel--compact">
				<PostJobSummaryCard headcount={headcount} cost={cost} compact />
				<div className="iz-post-job-dock-actions">
					<button
						type="button"
						onClick={onAddShift}
						className="iz-post-job-dock-add"
						aria-label={t.postJob.addAnotherShift}
						title={t.postJob.addAnotherShift}
					>
						<Plus className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={onSubmit}
						disabled={submitDisabled}
						className="iz-post-job-submit-btn iz-post-job-dock-submit flex-1 disabled:opacity-40"
					>
						{shiftLabel}
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="iz-post-job-action-panel">
			<PostJobSummaryCard headcount={headcount} cost={cost} />
			<button
				type="button"
				onClick={onAddShift}
				className="iz-post-job-aside-btn mt-3 w-full"
			>
				<Plus className="h-4 w-4" />
				{t.postJob.addAnotherShift}
			</button>
			<button
				type="button"
				onClick={onSubmit}
				disabled={submitDisabled}
				className="iz-post-job-submit-btn mt-2 w-full disabled:opacity-40"
			>
				{shiftLabel}
				<ChevronRight className="h-4 w-4" />
			</button>
			<p className="iz-post-job-submit-hint">
				<span className="iz-post-job-submit-hint__green">
					{t.postJob.greenWord}
				</span>
				{t.postJob.greenExplains}
			</p>
		</div>
	);
}
