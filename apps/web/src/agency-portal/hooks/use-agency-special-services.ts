import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	type SpecialServiceRecord,
	specialServiceTypeLabel,
} from "@agency-portal/lib/special-service-demo";
import { specialServiceRecordFromBackend } from "@agency-portal/lib/special-service-map";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type CreateSpecialServiceInput,
	createSpecialService,
	fetchSpecialServices,
	type SpecialServiceCategory,
} from "@/services/special-service";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One agency job the operator wants to post (one row → N dates). */
export interface AgencyJobPost {
	serviceType: string;
	customServiceName?: string;
	budget: number;
	remark: string;
	time: string;
	dateIsos: string[];
	/**
	 * THE VENUE, by its uuid — the field the server actually reads.
	 *
	 * `outletName` below is display only. `special_service` dropped its
	 * denormalised `outlet_name` column and joins the venue's name through the
	 * FK, and the create handler stores `outletId ?? null` — so a posting sent
	 * with only a name was filed against no venue at all. That is what happened
	 * to every real agency job posting while this carried the demo constant
	 * "Velvet 23".
	 */
	outletId: string;
	outletName: string;
}

function toCreateInput(
	job: AgencyJobPost,
	dateIso: string,
	identity: { agencyId: string; orgName: string },
): CreateSpecialServiceInput {
	return {
		initiatedBy: "agency",
		postingAgencyName: identity.orgName,
		// The backend requires a real uuid; a demo id would 400, so omit it and
		// let postingAgencyName carry attribution.
		postingAgencyId: UUID_RE.test(identity.agencyId)
			? identity.agencyId
			: undefined,
		// The id is what persists (FK); the name rides along for the optimistic
		// render only. Sending the name alone is what filed every real posting
		// against no venue.
		outletId: job.outletId,
		outletName: job.outletName,
		title: specialServiceTypeLabel(job.serviceType, job.customServiceName),
		category: job.serviceType as SpecialServiceCategory,
		description: job.remark.trim() || undefined,
		budget: job.budget,
		scheduledFor: `${dateIso}T${job.time || "00:00"}:00`,
	};
}

/**
 * Backend-driven Job Posting (special-service) data for the agency portal.
 *
 * Gated on a real session: `getAgencyIdentity()` returns the operator's real
 * agency (uuid + org name) only for a real login, `null` for the demo store.
 * The backend list is NOT token-scoped, so `backed` rows are filtered to this
 * agency's own postings client-side (by `postingAgencyId`). When not backed the
 * screen keeps its demo store source — same real-vs-demo split as the identity
 * wire. Exposes the backend writes: create (post jobs for admin review).
 */
export function useAgencySpecialServices() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyId = identity?.agencyId ?? null;

	const query = useQuery({
		queryKey: ["special-service", "agency", agencyId ?? "none"],
		queryFn: () =>
			fetchSpecialServices(
				{ initiatedBy: "agency", pageSize: 200, order: "desc" },
				logout,
			),
		enabled: backed,
		staleTime: 60_000,
	});

	const records = useMemo<SpecialServiceRecord[]>(() => {
		if (!agencyId) return [];
		return (query.data?.data ?? [])
			.filter((row) => row.postingAgencyId === agencyId)
			.map(specialServiceRecordFromBackend);
	}, [agencyId, query.data]);

	const createMut = useMutation({
		mutationFn: (input: CreateSpecialServiceInput) =>
			createSpecialService(input, logout),
	});

	const postJobs = async (jobs: AgencyJobPost[]) => {
		if (!identity) return;
		const inputs = jobs.flatMap((job) =>
			job.dateIsos.map((dateIso) => toCreateInput(job, dateIso, identity)),
		);
		await Promise.all(inputs.map((input) => createMut.mutateAsync(input)));
		queryClient.invalidateQueries({ queryKey: ["special-service"] });
	};

	return {
		backed,
		records,
		isLoading: query.isLoading,
		isPosting: createMut.isPending,
		postJobs,
	};
}
