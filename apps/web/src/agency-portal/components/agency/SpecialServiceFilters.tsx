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
	const active = specialServiceFiltersActive(filters);
	const serviceTypeId = useId();
	const statusId = useId();

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
						Filter bookings
					</span>
					<span className="iz-tiny iz-muted">
						{resultCount} of {totalCount}
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
						<span className="iz-roster-filter-label">Date</span>
					)}
					<RosterPlanningDatePicker
						value={filters.date}
						onChange={(date) => onChange({ date })}
						rosterDates={bookingDateIsos}
						placeholder="All dates"
						allowClear
						hint="Dots mark days with bookings."
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
							{compact ? "Service" : "Service type"}
						</span>
					)}
					<IzSelect
						id={serviceTypeId}
						block
						className="iz-special-service-filter-control"
						value={filters.serviceType}
						onChange={(e) => onChange({ serviceType: e.target.value })}
					>
						<option value="">{compact ? "All" : "All services"}</option>
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
						<span className="iz-roster-filter-label">Status</span>
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
						<option value="all">{compact ? "All" : "All statuses"}</option>
						{agencyStatuses ? (
							<>
								<option value="pending_admin">Pending review</option>
								<option value="accepted">Accepted</option>
								<option value="rejected">Rejected</option>
							</>
						) : (
							<>
								<option value="pending_admin">Pending review</option>
								<option value="accepted">Accepted</option>
								<option value="rejected">Rejected</option>
								<option value="pending_agency">Pending agency</option>
								<option value="pending_pr">Awaiting PR</option>
								<option value="pending_outlet">Awaiting outlet</option>
								<option value="pending_both">Awaiting PR & outlet</option>
								<option value="confirmed">Confirmed</option>
								<option value="declined">Declined</option>
								<option value="paid">Paid</option>
							</>
						)}
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
					Clear filters
				</button>
			)}
		</div>
	);
}
