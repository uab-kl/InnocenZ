import { SpecialServiceFilters } from "@agency-portal/components/agency/SpecialServiceFilters";
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
import { useAgencyOutlets } from "@agency-portal/hooks/use-agency-outlets";
import {
	type AgencyJobPost,
	useAgencySpecialServices,
} from "@agency-portal/hooks/use-agency-special-services";
import { OUTLET_NAMES } from "@agency-portal/lib/agency-demo";
import { agencySubRoleLabel } from "@agency-portal/lib/agency-rbac";
import { agencyPostedSpecialServices } from "@agency-portal/lib/special-service-actions";
import {
	agencyJobPostingInzLabel,
	agencyJobPostingStatusTone,
	bookableServiceOffers,
	collectSpecialServiceDateIsos,
	EMPTY_SPECIAL_SERVICE_FILTERS,
	filterSpecialServiceRecords,
	isOthersService,
} from "@agency-portal/lib/special-service-demo";
import { useStore } from "@agency-portal/lib/store";
import { ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

const DEFAULT_OUTLET = OUTLET_NAMES[0] ?? "Velvet 23";

export function SpecialServiceSection({ canBook }: { canBook: boolean }) {
	const { t } = usePortalLocale();
	const agencyPRs = useStore((s) => s.agencyPRs);
	const agencySubRole = useStore((s) => s.agencySubRole);
	const records = useStore((s) => s.specialServiceOrders);
	const submitOrder = useStore((s) => s.submitSpecialServiceOrder);
	const toast = useStore((s) => s.toast);
	// Real login → backend job postings; demo store otherwise (see the hook).
	const backend = useAgencySpecialServices();
	/**
	 * The agency's OWN venues, for the composer's outlet picker.
	 *
	 * Empty on a demo session (`backed: false`), which is why the picker is only
	 * rendered on the real branch — a demo composer keeps using the demo store's
	 * venue and nothing about that path changes.
	 */
	const {
		outlets: agencyOutlets,
		isLoading: outletsLoading,
		isError: outletsError,
	} = useAgencyOutlets();

	const serviceOffers = useMemo(() => bookableServiceOffers("agency"), []);
	const prOptions = useMemo(
		() =>
			agencyPRs
				.filter((p) => !p.detached)
				.map((p) => ({ id: p.id, name: p.name })),
		[agencyPRs],
	);

	const [composer, setComposer] = useState<JobPostingDraft>(() =>
		newJobPostingDraft(serviceOffers),
	);
	const [queuedJobs, setQueuedJobs] = useState<QueuedJobPosting[]>([]);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [bookingFilters, setBookingFilters] = useState(
		EMPTY_SPECIAL_SERVICE_FILTERS,
	);

	const demoAgencyPosted = useMemo(
		() => agencyPostedSpecialServices(records),
		[records],
	);
	const agencyPosted = backend.backed ? backend.records : demoAgencyPosted;
	const bookingDateIsos = useMemo(
		() => collectSpecialServiceDateIsos(agencyPosted),
		[agencyPosted],
	);
	const filtered = useMemo(
		() => filterSpecialServiceRecords(agencyPosted, bookingFilters),
		[agencyPosted, bookingFilters],
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

	const resetComposer = () => {
		setQueuedJobs([]);
		setComposer(newJobPostingDraft(serviceOffers));
		setEditingId(null);
	};

	const submitAll = () => {
		if (queuedJobs.length === 0) return;

		// Real login — post each queued job (× its dates) to the backend for admin
		// review. No PR is attached: agency job postings are outlet + service.
		if (backend.backed) {
			/*
			 * ⚠️ THE VENUE USED TO BE `DEFAULT_OUTLET` — `OUTLET_NAMES[0] ??
			 * "Velvet 23"`, read from `agency-demo.ts` — on THIS, the real-login
			 * branch. Two faults in one line: a demo venue's name inside a real
			 * payload, against the standing no-demo-data-on-real-sessions rule;
			 * and a NAME where the server wants an id, so the create handler,
			 * which reads `outletId` and ignores `outletName`, filed every real
			 * posting against no venue at all.
			 *
			 * The agency now picks from its own approved venues, and a job with no
			 * venue is refused rather than silently filed. `useAgencyOutlets` is
			 * the portal's visibility rule here: `agency_outlet`-approved only,
			 * enforced server-side.
			 */
			const unassigned = queuedJobs.filter((job) => !job.outletId);
			if (unassigned.length > 0) {
				toast(t.agencySpecial.chooseVenueForEveryJob, "warn");
				return;
			}
			const jobs = queuedJobs
				.map((job): AgencyJobPost | null => {
					const parsed = parseJobPostingDraft(job);
					if (!parsed) return null;
					return {
						serviceType: job.serviceType,
						customServiceName: job.customServiceName,
						budget: parsed.budget,
						remark: job.remark,
						time: job.time,
						dateIsos: job.selectedDateIsos,
						outletId: job.outletId,
						outletName:
							agencyOutlets.find((o) => o.id === job.outletId)?.name ?? "",
					};
				})
				.filter((job): job is AgencyJobPost => job !== null);
			if (jobs.length > 0) {
				backend
					.postJobs(jobs)
					.then(() => toast(t.agencySpecial.jobPostingSubmitted, "success"))
					.catch(() => toast(t.agencySpecial.jobPostingSubmitFailed, "warn"));
			}
			resetComposer();
			return;
		}

		// Demo store fallback.
		const pr = prOptions[0];
		if (!pr) return;

		const raisedBy = agencySubRoleLabel(agencySubRole, t);

		for (const job of queuedJobs) {
			const parsed = parseJobPostingDraft(job);
			if (!parsed) continue;

			for (const dateIso of job.selectedDateIsos) {
				submitOrder({
					initiatedBy: "agency",
					raisedBy,
					prId: pr.id,
					prName: pr.name,
					outlet: DEFAULT_OUTLET,
					serviceType: job.serviceType,
					customServiceName: isOthersService(job.serviceType)
						? job.customServiceName.trim()
						: undefined,
					description: job.remark.trim() || parsed.offer.summary,
					amountIn: parsed.budget,
					amountOut: 0,
					time: job.time,
					dateIso,
				});
			}
		}

		resetComposer();
	};

	const canAdd =
		Boolean(parseJobPostingDraft(composer)) &&
		composer.selectedDateIsos.length > 0;

	/*
	 * One whole sentence per case instead of "Post" + count + "job"/"jobs" +
	 * "for admin review". Chinese has no plural and puts the measure word after
	 * the number, so glued fragments cannot be reordered into it.
	 */
	const submitLabel =
		queuedJobs.length === 0
			? t.agencySpecial.postJobsForReview
			: fill(
					queuedOrderCount === 1
						? t.agencySpecial.postJobCountOneForReview
						: t.agencySpecial.postJobCountManyForReview,
					{ n: queuedOrderCount },
				);

	return (
		<div className="iz-agency-job-posting mt-2">
			{canBook && (
				<section className="iz-job-posting-form-section">
					<div className="iz-job-posting-form-card">
						<JobPostingMicroLabel className="mb-3 block">
							{t.agencySpecial.newJob}
						</JobPostingMicroLabel>
						{editingId ? (
							<JobPostingComposer
								draft={queuedJobs.find((j) => j.id === editingId) ?? composer}
								onChange={(patch) =>
									setQueuedJobs((cur) =>
										cur.map((j) =>
											j.id === editingId ? { ...j, ...patch } : j,
										),
									)
								}
								offers={serviceOffers}
								title={fill(t.agencySpecial.editJobN, {
									n: queuedJobs.findIndex((j) => j.id === editingId) + 1,
								})}
								onRemove={() => removeFromQueue(editingId)}
								showRemove
								onDone={() => setEditingId(null)}
								{...(backend.backed
									? {
											outlets: agencyOutlets,
											outletsLoading: outletsLoading,
											outletsError: outletsError,
										}
									: {})}
							/>
						) : (
							<JobPostingComposer
								draft={composer}
								onChange={(patch) => setComposer((c) => ({ ...c, ...patch }))}
								offers={serviceOffers}
								{...(backend.backed
									? {
											outlets: agencyOutlets,
											outletsLoading: outletsLoading,
											outletsError: outletsError,
										}
									: {})}
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
								{queuedJobs.length === 0
									? t.agencySpecial.addJob
									: t.agencySpecial.addAnotherJob}
							</button>
						)}
					</div>

					{queuedJobs.length > 0 && !editingId && (
						<div className="mt-3">
							<div className="mb-2 flex items-center justify-between gap-2">
								<JobPostingMicroLabel>
									{t.agencySpecial.queuedJobs}
								</JobPostingMicroLabel>
								<span className="iz-job-posting-count-pill">
									{fill(
										queuedJobs.length === 1
											? t.agencySpecial.jobCountOne
											: t.agencySpecial.jobCountMany,
										{ n: queuedJobs.length },
									)}
								</span>
							</div>
							<JobQueueTable
								rows={queuedJobs}
								onEdit={startEdit}
								onRemove={removeFromQueue}
							/>
						</div>
					)}

					<button
						type="button"
						onClick={submitAll}
						disabled={queuedJobs.length === 0}
						className="iz-btn iz-btn-primary iz-job-posting-submit-btn mt-3 w-full disabled:opacity-40"
					>
						{submitLabel}
						<ChevronRight className="h-4 w-4" />
					</button>
				</section>
			)}

			<section className="iz-job-posting-list-section">
				<div className="iz-job-posting-list-head">
					<JobPostingMicroLabel>
						{t.agencySpecial.yourJobPostings}
					</JobPostingMicroLabel>
					<span className="iz-job-posting-count-pill">
						{fill(t.agencySpecial.countOfTotal, {
							n: filtered.length,
							total: agencyPosted.length,
						})}
					</span>
				</div>

				<SpecialServiceFilters
					filters={bookingFilters}
					onChange={(patch) =>
						setBookingFilters((prev) => ({ ...prev, ...patch }))
					}
					bookingDateIsos={bookingDateIsos}
					resultCount={filtered.length}
					totalCount={agencyPosted.length}
					serviceOffers={serviceOffers}
					agencyStatuses
					jobPostingLayout
				/>

				<div className="mt-2.5">
					<JobPostingsTable
						rows={filtered}
						statusLabel={(row) => agencyJobPostingInzLabel(row, t)}
						statusTone={agencyJobPostingStatusTone}
					/>
				</div>
			</section>
		</div>
	);
}
