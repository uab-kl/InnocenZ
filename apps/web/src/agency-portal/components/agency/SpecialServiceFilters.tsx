import { RosterPlanningDatePicker } from "@agency-portal/components/agency/RosterPlanningDatePicker";
import { IzSelect } from "@agency-portal/components/iz/ui";
import {
	type AgencySpecialServiceOffer,
	EMPTY_SPECIAL_SERVICE_FILTERS,
	type SpecialServiceFilterState,
	specialServiceFiltersActive,
} from "@agency-portal/lib/special-service-demo";
import { cn } from "@agency-portal/lib/utils";
import { RotateCcw } from "lucide-react";
import { useId } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Rendered labels for the status filter — the LABEL only.
 *
 * The record KEY is the stored `SpecialServiceStatus`. That is what the
 * `<option value>` carries, what `filterSpecialServiceRecords` compares each
 * row against, and what the job-posting queries send, so it never changes with
 * the locale. Values are resolver FUNCTIONS rather than dictionary keys: a bare
 * key is itself a `string`, so rendering it directly would type-check and put
 * "agencySpecial.statusPaid" on screen.
 */
const STATUS_OPTION_LABELS: Record<string, (t: PortalTranslations) => string> = {
	pending_admin: (t) => t.agencySpecial.statusPendingAdmin,
	accepted: (t) => t.agencySpecial.statusAccepted,
	rejected: (t) => t.agencySpecial.statusRejected,
	pending_agency: (t) => t.agencySpecial.statusPendingAgency,
	pending_pr: (t) => t.agencySpecial.statusPendingPr,
	pending_outlet: (t) => t.agencySpecial.statusPendingOutlet,
	pending_both: (t) => t.agencySpecial.statusPendingBoth,
	confirmed: (t) => t.agencySpecial.statusConfirmed,
	declined: (t) => t.agencySpecial.statusDeclined,
	paid: (t) => t.agencySpecial.statusPaid,
};

/**
 * Falls through to the stored value when it is not one we know, so a status
 * added server-side keeps rendering instead of blanking the option.
 */
function statusOptionLabel(value: string, t: PortalTranslations): string {
	return STATUS_OPTION_LABELS[value]?.(t) ?? value;
}

/** Agency / outlet job postings — admin review outcomes only. */
const AGENCY_STATUS_VALUES = ["pending_admin", "accepted", "rejected"];

/** The whole order lifecycle — PR host portal. */
const ALL_STATUS_VALUES = [
	...AGENCY_STATUS_VALUES,
	"pending_agency",
	"pending_pr",
	"pending_outlet",
	"pending_both",
	"confirmed",
	"declined",
	"paid",
];

export function SpecialServiceFilters({
	filters,
	onChange,
	bookingDateIsos,
	resultCount,
	totalCount,
	serviceOffers,
	compact = false,
	agencyStatuses = false,
	jobPostingLayout = false,
}: {
	filters: SpecialServiceFilterState;
	onChange: (patch: Partial<SpecialServiceFilterState>) => void;
	bookingDateIsos: string[];
	resultCount: number;
	totalCount: number;
	serviceOffers: AgencySpecialServiceOffer[];
	/** Narrow phone layout (PR host portal) */
	compact?: boolean;
	/** Agency/outlet job postings — admin review statuses only */
	agencyStatuses?: boolean;
	/** Inline filters under job postings list (no filter card header) */
	jobPostingLayout?: boolean;
}) {
	const { t } = usePortalLocale();
	const active = specialServiceFiltersActive(filters);
	const serviceTypeId = useId();
	const statusId = useId();
	const statusValues = agencyStatuses
		? AGENCY_STATUS_VALUES
		: ALL_STATUS_VALUES;

	return (
		<div
			className={cn(
				"iz-special-service-filters",
				compact && "iz-special-service-filters--compact",
				jobPostingLayout && "iz-special-service-filters--job-posting",
			)}
		>
			{!jobPostingLayout && (
				<div className="iz-special-service-filters-head">
					<span className="iz-tiny font-semibold uppercase tracking-wider text-[var(--iz-muted)]">
						{t.agencySpecial.filterBookings}
					</span>
					<span className="iz-tiny iz-muted">
						{fill(t.agencySpecial.countOfTotal, {
							n: resultCount,
							total: totalCount,
						})}
					</span>
				</div>
			)}

			<div className="iz-special-service-filters-grid">
				{/* Not a <label>: the picker below renders a popover trigger button,
				    which is not a labelable control, so the caption is a caption. */}
				<div
					className={cn(
						"iz-special-service-filter-field",
						jobPostingLayout && "iz-special-service-filter-field--bare",
					)}
				>
					{!jobPostingLayout && (
						<span className="iz-roster-filter-label">{t.filters.date}</span>
					)}
					<RosterPlanningDatePicker
						value={filters.date}
						onChange={(date) => onChange({ date })}
						rosterDates={bookingDateIsos}
						placeholder={t.filters.allDates}
						allowClear
						hint={t.agencySpecial.dotsMarkBookingDays}
						className="iz-special-service-filter-date"
					/>
				</div>

				<label
					htmlFor={serviceTypeId}
					className={cn(
						"iz-special-service-filter-field",
						jobPostingLayout && "iz-special-service-filter-field--bare",
					)}
				>
					{!jobPostingLayout && (
						<span className="iz-roster-filter-label">
							{compact ? t.agencySpecial.service : t.agencySpecial.serviceType}
						</span>
					)}
					<IzSelect
						id={serviceTypeId}
						block
						className="iz-special-service-filter-control"
						value={filters.serviceType}
						onChange={(e) => onChange({ serviceType: e.target.value })}
					>
						<option value="">
							{compact ? t.common.all : t.agencySpecial.allServices}
						</option>
						{/* Offer labels are service CONTENT, named by whoever created the
						    offer — rendered as stored, never translated here. */}
						{serviceOffers.map((offer) => (
							<option key={offer.id} value={offer.id}>
								{offer.label}
							</option>
						))}
					</IzSelect>
				</label>

				<label
					htmlFor={statusId}
					className={cn(
						"iz-special-service-filter-field",
						jobPostingLayout && "iz-special-service-filter-field--bare",
					)}
				>
					{!jobPostingLayout && (
						<span className="iz-roster-filter-label">{t.filters.status}</span>
					)}
					<IzSelect
						id={statusId}
						block
						className="iz-special-service-filter-control"
						value={filters.status}
						onChange={(e) =>
							onChange({
								status: e.target.value as SpecialServiceFilterState["status"],
							})
						}
					>
						<option value="all">
							{compact ? t.common.all : t.agencySpecial.allStatuses}
						</option>
						{statusValues.map((value) => (
							<option key={value} value={value}>
								{statusOptionLabel(value, t)}
							</option>
						))}
					</IzSelect>
				</label>
			</div>

			{active && (
				<button
					type="button"
					className="iz-roster-filter-clear"
					onClick={() => onChange(EMPTY_SPECIAL_SERVICE_FILTERS)}
				>
					<RotateCcw className="h-3 w-3" />
					{t.rosterGrid.clearFilters}
				</button>
			)}
		</div>
	);
}
