import { formatRM } from "@agency-portal/components/iz/ui";
import {
	ChevronDown,
	CircleHelp,
	SHIFT_METRIC_DEFS,
	type ShiftMetricKind,
} from "@agency-portal/lib/lucide-label-icons";
import { shiftHistoryTotalReceived } from "@agency-portal/lib/shift-history-amounts";
import { cn } from "@agency-portal/lib/utils";
import { type ReactNode, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

const METRIC_BY_ID = Object.fromEntries(
	SHIFT_METRIC_DEFS.map((m) => [m.id, m]),
) as Record<ShiftMetricKind, (typeof SHIFT_METRIC_DEFS)[number]>;

export type { ShiftMetricKind };
export { SHIFT_METRIC_DEFS };

export function shiftMetricLabelText(
	kind: ShiftMetricKind,
	t: PortalTranslations,
	total?: boolean,
): string {
	const def = METRIC_BY_ID[kind];
	return total ? def.totalLabel(t) : def.label(t);
}

/** Icon + word label — e.g. wine glass + “Received”. */
export function ShiftMetricIconLabel({
	kind,
	total,
	className,
	size = "md",
}: {
	kind: ShiftMetricKind;
	total?: boolean;
	className?: string;
	size?: "md" | "lg";
}) {
	const { t } = usePortalLocale();
	const def = METRIC_BY_ID[kind];
	const { Icon } = def;
	const text = total ? def.totalLabel(t) : def.label(t);

	return (
		<span
			className={cn(
				"iz-shift-metric-label",
				`iz-shift-metric-label--${kind}`,
				size === "lg" && "iz-shift-metric-label--lg",
				className,
			)}
		>
			<Icon
				className="iz-shift-metric-label__icon"
				strokeWidth={2.1}
				aria-hidden
			/>
			<span className="iz-shift-metric-label__text">{text}</span>
		</span>
	);
}

/** Metric tile used in shift history cards and sheets (all roles). */
export function ShiftTxnMetric({
	kind,
	value,
	total,
}: {
	kind: ShiftMetricKind;
	value: ReactNode;
	total?: boolean;
}) {
	return (
		<div
			className={kind === "payout" ? "iz-txn-metric earned" : "iz-txn-metric"}
		>
			<div className="label">
				<ShiftMetricIconLabel kind={kind} total={total} size="lg" />
			</div>
			<div className="value iz-ledger">{value}</div>
		</div>
	);
}

/** Two metric tiles — Total Received (outlet sales) + Total Payout (PR take-home). */
export function ShiftTxnMetricsRow({
	totalPayout,
	totalDrinks,
	totalTips,
	drinkSalesRm,
	totalReceived,
	total,
	className,
}: {
	totalPayout: number;
	/** @deprecated Prefer totalReceived / drinkSalesRm — kept for call-site compatibility. */
	totalDrinks?: number;
	totalTips?: number;
	drinkSalesRm?: number;
	totalReceived?: number;
	total?: boolean;
	className?: string;
}) {
	const received =
		totalReceived ??
		shiftHistoryTotalReceived({
			drinkSalesRm,
			totalDrinks: totalDrinks ?? 0,
			totalTips: totalTips ?? 0,
		});

	return (
		<div
			className={cn("iz-txn-card-metrics iz-txn-card-metrics--pair", className)}
		>
			<ShiftTxnMetric
				kind="received"
				total={total}
				value={formatRM(received)}
			/>
			<ShiftTxnMetric
				kind="payout"
				total={total}
				value={formatRM(totalPayout)}
			/>
		</div>
	);
}

/** Collapsible dropdown — explains each icon + label (all roles). */
export function MetricIconGuide({ className }: { className?: string }) {
	const { t } = usePortalLocale();
	const [open, setOpen] = useState(false);

	return (
		<div
			className={cn(
				"iz-outlet-hist-metrics-guide",
				open && "is-open",
				className,
			)}
		>
			<button
				type="button"
				className="iz-outlet-hist-metrics-guide__trigger"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				aria-controls="outlet-hist-metrics-guide-panel"
			>
				<CircleHelp
					className="iz-outlet-hist-metrics-guide__trigger-icon"
					strokeWidth={2}
					aria-hidden
				/>
				<span className="iz-outlet-hist-metrics-guide__trigger-text">
					{t.common.iconGuide}
				</span>
				<ChevronDown
					className={cn(
						"iz-outlet-hist-metrics-guide__chev",
						open && "is-open",
					)}
					strokeWidth={2.2}
					aria-hidden
				/>
			</button>

			<div
				id="outlet-hist-metrics-guide-panel"
				className="iz-outlet-hist-metrics-guide__panel"
				hidden={!open}
			>
				<p className="iz-outlet-hist-metrics-guide__title">
					{t.history.whatTheseIconsMean}
				</p>
				<ul className="iz-outlet-hist-metrics-guide__list">
					{SHIFT_METRIC_DEFS.map(({ id, Icon, label, hint }) => (
						<li key={id} className="iz-outlet-hist-metrics-guide__item">
							<span
								className={cn(
									"iz-shift-metric-label iz-shift-metric-label--lg",
									`iz-shift-metric-label--${id}`,
								)}
							>
								<Icon
									className="iz-shift-metric-label__icon"
									strokeWidth={2.1}
									aria-hidden
								/>
								<span className="iz-shift-metric-label__text">{label(t)}</span>
							</span>
							<p className="iz-outlet-hist-metrics-guide__hint">{hint(t)}</p>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

/** @deprecated Use MetricIconGuide */
export const OutletHistoryMetricsGuide = MetricIconGuide;
