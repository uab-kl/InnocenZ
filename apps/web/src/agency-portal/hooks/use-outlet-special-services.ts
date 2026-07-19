import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
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

/** One service order the outlet wants to post (one row → N dates). */
export interface OutletJobPost {
	serviceType: string;
	customServiceName?: string;
	budget: number;
	remark: string;
	time: string;
	dateIsos: string[];
}

function toCreateInput(
	job: OutletJobPost,
	dateIso: string,
	identity: { outletId: string; outletName: string },
): CreateSpecialServiceInput {
	return {
		initiatedBy: "outlet",
		outletName: identity.outletName,
		// The backend requires a real uuid; a demo id would 400, so omit it and
		// let outletName carry attribution.
		outletId: UUID_RE.test(identity.outletId) ? identity.outletId : undefined,
		title: specialServiceTypeLabel(job.serviceType, job.customServiceName),
		category: job.serviceType as SpecialServiceCategory,
		description: job.remark.trim() || undefined,
		budget: job.budget,
		scheduledFor: `${dateIso}T${job.time || "00:00"}:00`,
	};
}

/**
 * Backend-driven service ordering (special-service) for the outlet portal.
 *
 * Gated on a real session: `getOutletIdentity()` returns the operator's real
 * outlet (uuid + name) only for a real login, `null` for the demo store. The
 * backend list is NOT token-scoped, so `backed` rows are filtered to this
 * outlet's own postings client-side (by `outletId`). When not backed the screen
 * keeps its demo store source — same real-vs-demo split as the identity wire.
 * Exposes the backend write: create (post service orders for admin review).
 */
export function useOutletSpecialServices() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletId = identity?.outletId ?? null;

	const query = useQuery({
		queryKey: ["special-service", "outlet", outletId ?? "none"],
		queryFn: () =>
			fetchSpecialServices(
				{
					initiatedBy: "outlet",
					outletId: outletId ?? undefined,
					pageSize: 200,
					order: "desc",
				},
				logout,
			),
		enabled: backed,
		staleTime: 60_000,
	});

	const records = useMemo<SpecialServiceRecord[]>(() => {
		if (!outletId) return [];
		return (query.data?.data ?? [])
			.filter((row) => row.outletId === outletId)
			.map(specialServiceRecordFromBackend);
	}, [outletId, query.data]);

	const createMut = useMutation({
		mutationFn: (input: CreateSpecialServiceInput) =>
			createSpecialService(input, logout),
	});

	const postJobs = async (jobs: OutletJobPost[]) => {
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
