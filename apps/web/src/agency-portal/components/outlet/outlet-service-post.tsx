import { SpecialServiceFilters } from "@agency-portal/components/agency/SpecialServiceFilters";
import { IzCard } from "@agency-portal/components/iz/ui";
import {
	daysInJobDraft,
	JobPostingComposer,
	type JobPostingDraft,
	JobPostingMicroLabel,
	JobPostingsTable,
	JobQueueTable,
	newJobPostingDraft,
	newQueuedJobPosting,
	parseJobPostingDraft,
	type QueuedJobPosting,
} from "@agency-portal/components/special-service/job-posting-ui";
import { SpecialServiceOrderCard } from "@agency-portal/components/special-service/SpecialServiceOrderCard";
import {
	type OutletJobPost,
	useOutletSpecialServices,
} from "@agency-portal/hooks/use-outlet-special-services";
import {
	pendingSpecialServicesForOutlet,
	specialServicesForOutlet,
} from "@agency-portal/lib/special-service-actions";
import {
	agencyJobPostingInzLabel,
	agencyJobPostingStatusTone,
	bookableServiceOffers,
	collectSpecialServiceDateIsos,
	EMPTY_SPECIAL_SERVICE_FILTERS,
	filterSpecialServiceRecords,
	isOthersService,
	specialServiceOffer,
} from "@agency-portal/lib/special-service-demo";
import { useStore } from "@agency-portal/lib/store";
import { ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";

export function OutletServicePostSection() {
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const records = useStore((s) => s.specialServiceOrders);
	const submitOrder = useStore((s) => s.submitSpecialServiceOrder);
	const acceptByOutlet = useStore((s) => s.acceptSpecialServiceByOutlet);
	const declineByOutlet = useStore((s) => s.declineSpecialServiceByOutlet);
	const toast = useStore((s) => s.toast);
	// Real login → backend service orders; demo store otherwise (see the hook).
	const backend = useOutletSpecialServices();

	const outletName = outletWorkspace.outletName;
	const serviceOffers = useMemo(() => bookableServiceOffers("outlet"), []);

	const [composer, setComposer] = useState<JobPostingDraft>(() =>
		newJobPostingDraft(serviceOffers),
	);
	const [queuedJobs, setQueuedJobs] = useState<QueuedJobPosting[]>([]);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [bookingFilters, setBookingFilters] = useState(
		EMPTY_SPECIAL_SERVICE_FILTERS,
	);

	const demoScoped = useMemo(
		() => specialServicesForOutlet(records, outletName),
		[records, outletName],
	);
	const scopedRecords = backend.backed ? backend.records : demoScoped;
	const pendingAction = useMemo(
		() => pendingSpecialServicesForOutlet(records, outletName),
		[records, outletName],
	);
	const bookingDateIsos = useMemo(
		() => collectSpecialServiceDateIsos(scopedRecords),
		[scopedRecords],
	);
	const filtered = useMemo(
		() => filterSpecialServiceRecords(scopedRecords, bookingFilters),
		[scopedRecords, bookingFilters],
	);

	const queuedOrderCount = useMemo(
		() => queuedJobs.reduce((sum, job) => sum + daysInJobDraft(job), 0),
		[queuedJobs],
	);

	const addToQueue = () => {
		if (
			!parseJobPostingDraft(composer) ||
			composer.selectedDateIsos.length === 0
		)
			return;
		setQueuedJobs((cur) => [...cur, newQueuedJobPosting(composer)]);
		setComposer(newJobPostingDraft(serviceOffers));
		setEditingId(null);
	};

	const removeFromQueue = (id: string) => {
		setQueuedJobs((cur) => cur.filter((j) => j.id !== id));
		if (editingId === id) setEditingId(null);
	};

	const startEdit = (id: string) => setEditingId(id);

	const submitAll = () => {
		if (queuedJobs.length === 0) return;

		// Real login — post each queued job (× its dates) to the backend for admin
		// review. Attribution rides on the outlet identity (outletId + name).
		if (backend.backed) {
			const jobs = queuedJobs
				.map((job): OutletJobPost | null => {
					const parsed = parseJobPostingDraft(job);
					if (!parsed) return null;
					return {
						serviceType: job.serviceType,
						customServiceName: job.customServiceName,
						budget: parsed.budget,
						remark: job.remark,
						time: job.time,
						dateIsos: job.selectedDateIsos,
					};
				})
				.filter((job): job is OutletJobPost => job !== null);
			if (jobs.length > 0) {
				backend
					.postJobs(jobs)
					.then(() =>
						toast("Service order submitted for admin review", "success"),
					)
					.catch(() =>
						toast("Could not submit service order — try again", "warn"),
					);
			}
			setQueuedJobs([]);
			setComposer(newJobPostingDraft(serviceOffers));
			setEditingId(null);
			return;
		}

		for (const job of queuedJobs) {
			const parsed = parseJobPostingDraft(job);
			if (!parsed) continue;

			for (const dateIso of job.selectedDateIsos) {
				submitOrder({
					initiatedBy: "outlet",
					raisedBy: outletName,
					prId: "",
					prName: "PR to be assigned",
					outlet: outletName,
					serviceType: job.serviceType,
					customServiceName: isOthersService(job.serviceType)
						? job.customServiceName.trim()
						: undefined,
					description: job.remark.trim() || parsed.offer.summary,
					amountIn: parsed.budget,
					amountOut: 0, // admin sets service cost on review
					time: job.time,
					dateIso,
				});
			}
		}

		setQueuedJobs([]);
		setComposer(newJobPostingDraft(serviceOffers));
		setEditingId(null);
	};

	const canAdd =
		Boolean(parseJobPostingDraft(composer)) &&
		composer.selectedDateIsos.length > 0;

	const queueCostEstimate = (row: QueuedJobPosting) =>
		specialServiceOffer(row.serviceType)?.defaultRate;

	return (
		<div className="iz-agency-job-posting mt-2">
			{!backend.backed && pendingAction.length > 0 && (
				<IzCard
					flat
					className="mb-3 border-[rgba(159,122,234,.35)] bg-[linear-gradient(180deg,rgba(159,122,234,.08),transparent)]"
				>
					<p className="iz-tiny font-semibold text-[var(--iz-violet-l)]">
						{pendingAction.length} booking
						{pendingAction.length !== 1 ? "s" : ""} need your response
					</p>
					<div className="mt-2 space-y-2">
						{pendingAction.map((row) => (
							<SpecialServiceOrderCard
								key={row.id}
								row={row}
								role="outlet"
								onAccept={acceptByOutlet}
								onDecline={declineByOutlet}
							/>
						))}
					</div>
				</IzCard>
			)}

			<section className="iz-job-posting-form-section">
				<div className="iz-job-posting-form-card">
					<JobPostingMicroLabel className="mb-3 block">
						New job
					</JobPostingMicroLabel>
					{editingId ? (
						<JobPostingComposer
							draft={queuedJobs.find((j) => j.id === editingId) ?? composer}
							onChange={(patch) =>
								setQueuedJobs((cur) =>
									cur.map((j) => (j.id === editingId ? { ...j, ...patch } : j)),
								)
							}
							offers={serviceOffers}
							title={`Edit job ${queuedJobs.findIndex((j) => j.id === editingId) + 1}`}
							onRemove={() => removeFromQueue(editingId)}
							showRemove
							onDone={() => setEditingId(null)}
						/>
					) : (
						<JobPostingComposer
							draft={composer}
							onChange={(patch) => setComposer((c) => ({ ...c, ...patch }))}
							offers={serviceOffers}
						/>
					)}

					{!editingId && (
						<button
							type="button"
							onClick={addToQueue}
							disabled={!canAdd}
							className="iz-btn iz-btn-soft iz-job-posting-add-btn mt-3 w-full disabled:opacity-40"
						>
							<Plus className="h-4 w-4" />
							{queuedJobs.length === 0 ? "Add job" : "Add another job"}
						</button>
					)}
				</div>

				{queuedJobs.length > 0 && !editingId && (
					<div className="mt-3">
						<div className="mb-2 flex items-center justify-between gap-2">
							<JobPostingMicroLabel>Queued jobs</JobPostingMicroLabel>
							<span className="iz-job-posting-count-pill">
								{queuedJobs.length} job{queuedJobs.length !== 1 ? "s" : ""}
							</span>
						</div>
						<JobQueueTable
							rows={queuedJobs}
							onEdit={startEdit}
							onRemove={removeFromQueue}
							queueCostEstimate={queueCostEstimate}
						/>
					</div>
				)}

				<button
					type="button"
					onClick={submitAll}
					disabled={queuedJobs.length === 0}
					className="iz-btn iz-btn-primary iz-job-posting-submit-btn mt-3 w-full disabled:opacity-40"
				>
					Post{queuedJobs.length > 0 ? ` ${queuedOrderCount}` : ""} job
					{queuedOrderCount !== 1 ? "s" : ""} for admin review
					<ChevronRight className="h-4 w-4" />
				</button>
			</section>

			<section className="iz-job-posting-list-section">
				<div className="iz-job-posting-list-head">
					<JobPostingMicroLabel>Your job postings</JobPostingMicroLabel>
					<span className="iz-job-posting-count-pill">
						{filtered.length} of {scopedRecords.length}
					</span>
				</div>

				<SpecialServiceFilters
					filters={bookingFilters}
					onChange={(patch) =>
						setBookingFilters((prev) => ({ ...prev, ...patch }))
					}
					bookingDateIsos={bookingDateIsos}
					resultCount={filtered.length}
					totalCount={scopedRecords.length}
					serviceOffers={serviceOffers}
					agencyStatuses
					jobPostingLayout
				/>

				<div className="mt-2.5">
					<JobPostingsTable
						rows={filtered}
						statusLabel={agencyJobPostingInzLabel}
						statusTone={agencyJobPostingStatusTone}
						emptyMessage="No service orders match this filter"
					/>
				</div>
			</section>
		</div>
	);
}
