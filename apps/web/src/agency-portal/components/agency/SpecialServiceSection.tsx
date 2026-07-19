import { SpecialServiceFilters } from '@agency-portal/components/agency/SpecialServiceFilters';
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
} from '@agency-portal/components/special-service/job-posting-ui';
import {
  type AgencyJobPost,
  useAgencySpecialServices,
} from '@agency-portal/hooks/use-agency-special-services';
import { OUTLET_NAMES } from '@agency-portal/lib/agency-demo';
import { AGENCY_SUB_ROLE_LABELS } from '@agency-portal/lib/agency-rbac';
import { agencyPostedSpecialServices } from '@agency-portal/lib/special-service-actions';
import {
  agencyJobPostingInzLabel,
  agencyJobPostingStatusTone,
  bookableServiceOffers,
  collectSpecialServiceDateIsos,
  EMPTY_SPECIAL_SERVICE_FILTERS,
  filterSpecialServiceRecords,
  isOthersService,
} from '@agency-portal/lib/special-service-demo';
import { useStore } from '@agency-portal/lib/store';
import { ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

const DEFAULT_OUTLET = OUTLET_NAMES[0] ?? 'Velvet 23';

export function SpecialServiceSection({ canBook }: { canBook: boolean }) {
  const agencyPRs = useStore((s) => s.agencyPRs);
  const agencySubRole = useStore((s) => s.agencySubRole);
  const records = useStore((s) => s.specialServiceOrders);
  const submitOrder = useStore((s) => s.submitSpecialServiceOrder);
  const toast = useStore((s) => s.toast);
  // Real login → backend job postings; demo store otherwise (see the hook).
  const backend = useAgencySpecialServices();

  const serviceOffers = useMemo(() => bookableServiceOffers('agency'), []);
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
            outletName: DEFAULT_OUTLET,
          };
        })
        .filter((job): job is AgencyJobPost => job !== null);
      if (jobs.length > 0) {
        backend
          .postJobs(jobs)
          .then(() =>
            toast('Job posting submitted for admin review', 'success'),
          )
          .catch(() => toast('Could not submit job posting — try again', 'warn'));
      }
      resetComposer();
      return;
    }

    // Demo store fallback.
    const pr = prOptions[0];
    if (!pr) return;

    const raisedBy = AGENCY_SUB_ROLE_LABELS[agencySubRole ?? 'agency_owner'];

    for (const job of queuedJobs) {
      const parsed = parseJobPostingDraft(job);
      if (!parsed) continue;

      for (const dateIso of job.selectedDateIsos) {
        submitOrder({
          initiatedBy: 'agency',
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

  return (
    <div className="iz-agency-job-posting mt-2">
      {canBook && (
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
                    cur.map((j) =>
                      j.id === editingId ? { ...j, ...patch } : j,
                    ),
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
                {queuedJobs.length === 0 ? 'Add job' : 'Add another job'}
              </button>
            )}
          </div>

          {queuedJobs.length > 0 && !editingId && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <JobPostingMicroLabel>Queued jobs</JobPostingMicroLabel>
                <span className="iz-job-posting-count-pill">
                  {queuedJobs.length} job{queuedJobs.length !== 1 ? 's' : ''}
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
            Post{queuedJobs.length > 0 ? ` ${queuedOrderCount}` : ''} job
            {queuedOrderCount !== 1 ? 's' : ''} for admin review
            <ChevronRight className="h-4 w-4" />
          </button>
        </section>
      )}

      <section className="iz-job-posting-list-section">
        <div className="iz-job-posting-list-head">
          <JobPostingMicroLabel>Your job postings</JobPostingMicroLabel>
          <span className="iz-job-posting-count-pill">
            {filtered.length} of {agencyPosted.length}
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
            statusLabel={agencyJobPostingInzLabel}
            statusTone={agencyJobPostingStatusTone}
          />
        </div>
      </section>
    </div>
  );
}
