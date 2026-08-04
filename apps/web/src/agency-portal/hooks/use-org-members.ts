import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { getClient } from "@/lib/axios-v1";
import {
	addAgencyMember,
	fetchAgencyMembers,
	removeAgencyMember,
	updateAgencyMember,
} from "@/services/agency";
import {
	addOutletMember,
	fetchOutletMembers,
	removeOutletMember,
	updateOutletMember,
} from "@/services/outlet";

export type OrgKind = "agency" | "outlet";

/** The shape both member tables happen to share. */
export interface OrgMember {
	id: string;
	userId: string;
	subRole: string;
	status: string;
	username?: string;
	email?: string | null;
	phoneNum?: string | null;
}

/**
 * Resolves an email to a user id for the "add member" flow.
 *
 * ⚠️ EXACT match only, and the result is never rendered as a list. `GET /user`
 * takes an `email` filter and is already open to agency and outlet callers, so
 * this introduces no new read — but showing whatever it returns would turn a
 * lookup into a people-browser for every org owner, which is the open privacy
 * question this project has recorded ("what may a venue read about a person?").
 * A lookup answers "does this address have an account?" and nothing else.
 */
async function resolveUserIdByEmail(
	email: string,
	onRefreshFail: () => void,
): Promise<{ userId: string; username?: string } | null> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		data: Array<{
			id: string;
			email?: string | null;
			username?: string;
		}> | null;
	}>(`/user?email=${encodeURIComponent(email)}&pageSize=10`);
	const wanted = email.trim().toLowerCase();
	const hit = (response.data.data ?? []).find(
		(u) => (u.email ?? "").trim().toLowerCase() === wanted,
	);
	return hit ? { userId: hit.id, username: hit.username } : null;
}

/**
 * Member management for one organisation, agency or outlet.
 *
 * The server owns every rule — a member id from another org 404s, and anything
 * that would leave the org with no active owner 409s. This hook deliberately
 * does NOT re-implement those checks client-side: a duplicated rule drifts, and
 * the copy that drifts is always the one the user sees. It surfaces the
 * server's message instead.
 */
export function useOrgMembers(kind: OrgKind, orgId: string | null) {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const enabled = Boolean(orgId);
	const key = [kind, "members", orgId ?? "none"];

	const membersQuery = useQuery({
		queryKey: key,
		queryFn: async (): Promise<OrgMember[]> => {
			const id = orgId as string;
			const res =
				kind === "agency"
					? await fetchAgencyMembers(id, {}, logout)
					: await fetchOutletMembers(id, logout);
			return (res.data ?? []) as OrgMember[];
		},
		enabled,
		staleTime: 30_000,
	});

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: key });
		// The profile overlay reads the same rows for the owner/finance names.
		void queryClient.invalidateQueries({ queryKey: [kind, "profile"] });
	};

	const addMember = useMutation({
		mutationFn: async (input: {
			email: string;
			subRole: string;
		}): Promise<void> => {
			const id = orgId as string;
			const found = await resolveUserIdByEmail(input.email, logout);
			if (!found) {
				throw new Error(
					"No account with that email — they must sign up before they can be added",
				);
			}
			const payload = { userId: found.userId, subRole: input.subRole };
			if (kind === "agency") {
				await addAgencyMember(id, payload, logout);
				return;
			}
			await addOutletMember(id, payload, logout);
		},
		onSuccess: invalidate,
	});

	// Returns void rather than the response: the two services answer with
	// different (structurally identical) types, and a union return buys nothing
	// here because every caller discards it and re-reads the invalidated query.
	const changeMember = useMutation({
		mutationFn: async (input: {
			memberId: string;
			subRole?: string;
			status?: string;
		}): Promise<void> => {
			const id = orgId as string;
			const { memberId, ...payload } = input;
			if (kind === "agency") {
				await updateAgencyMember(id, memberId, payload, logout);
				return;
			}
			await updateOutletMember(id, memberId, payload, logout);
		},
		onSuccess: invalidate,
	});

	const removeMember = useMutation({
		mutationFn: (memberId: string) => {
			const id = orgId as string;
			return kind === "agency"
				? removeAgencyMember(id, memberId, logout)
				: removeOutletMember(id, memberId, logout);
		},
		onSuccess: invalidate,
	});

	return {
		members: membersQuery.data ?? [],
		isLoading: membersQuery.isLoading,
		addMember,
		changeMember,
		removeMember,
	};
}

/**
 * Pulls the server's refusal out of an axios error.
 *
 * The 409s carry the ONLY explanation of why a change was refused ("Cannot
 * remove the last active owner…"). Swallowing it for a generic "Something went
 * wrong" would leave the owner unable to tell a rule from an outage.
 */
export function serverMessage(error: unknown, fallback: string): string {
	if (error && typeof error === "object") {
		const response = (error as { response?: { data?: { message?: string } } })
			.response;
		if (response?.data?.message) return response.data.message;
		const message = (error as { message?: string }).message;
		if (message) return message;
	}
	return fallback;
}
