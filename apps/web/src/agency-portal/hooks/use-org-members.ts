import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
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
	/**
	 * Everything below was ALREADY on the wire — the repository selected it and
	 * the endpoint returned it. Only this type stopped it reaching the screen,
	 * which is why the review pane had a name and an email and nothing else to
	 * decide on. `profileImage` is the one genuinely new column (0161-era).
	 */
	profileImage?: string | null;
	/** This membership's own id — INNATAGY0001. Null until one is issued. */
	memberCode?: string | null;
	/** When they ASKED — an ISO string off the wire, never a Date. */
	createdAt?: string | null;
	/** When the decision was made — same shape, same rule. */
	updatedAt?: string | null;
	/**
	 * WHO decided, by name — joined on the server from `updated_by`, never
	 * stored on the row. Null when the actor was `'system'` or their account is
	 * gone; the screen renders its own fallback rather than inventing a name.
	 * The same rule, and the same join, the admin archive screen already uses.
	 */
	updatedByName?: string | null;
	updatedBy?: string | null;
}

/** The one cache key holding an organisation's member list. */
export const orgMembersKey = (kind: OrgKind, orgId: string | null) =>
	[kind, "members", orgId ?? "none"] as const;

/**
 * One organisation's members — the ONE query behind that key.
 *
 * Split out because `useAgencyProfile` held a SECOND `useQuery` on the identical
 * key with a different queryFn: it asked the server for `{ status: "active" }`
 * while this one asked for everything, and both mount together on Settings.
 * React Query stores one value per key, so whichever resolved first decided what
 * the other read — the Team count and the owner's details on that page changed
 * with mount order, and neither hook was wrong on its own.
 *
 * Fetches EVERY member and lets each caller narrow. A filter applied in the
 * request is a filter baked into the shared cache; a filter applied at the
 * reader is not.
 *
 * 60s, matching what the profile side used — the panel that writes here
 * invalidates this key on every mutation, so staleness never outlives an edit.
 */
export function useOrgMembersQuery(kind: OrgKind, orgId: string | null) {
	const { logout } = useAuth();
	return useQuery({
		queryKey: orgMembersKey(kind, orgId),
		queryFn: async (): Promise<OrgMember[]> => {
			const id = orgId as string;
			const res =
				kind === "agency"
					? await fetchAgencyMembers(id, {}, logout)
					: await fetchOutletMembers(id, logout);
			return (res.data ?? []) as OrgMember[];
		},
		enabled: Boolean(orgId),
		staleTime: 60_000,
	});
}

/**
 * Member management for one organisation, agency or outlet.
 *
 * Invite creates a pending invite + email; the invitee sets up their account
 * (name / email / password) on the accept link before membership becomes active.
 * The server owns every other rule (scope, last owner).
 */
export function useOrgMembers(kind: OrgKind, orgId: string | null) {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const key = orgMembersKey(kind, orgId);
	const membersQuery = useOrgMembersQuery(kind, orgId);

	const invalidate = () => {
		void queryClient.invalidateQueries({ queryKey: key });
		void queryClient.invalidateQueries({ queryKey: [kind, "profile"] });
	};

	const addMember = useMutation({
		mutationFn: async (input: {
			email: string;
			subRole: string;
			roleId?: string;
		}): Promise<{
			message?: string;
			acceptUrl?: string;
			emailed?: boolean;
		}> => {
			const id = orgId as string;
			const payload = {
				email: input.email.trim(),
				subRole: input.subRole,
				...(input.roleId ? { roleId: input.roleId } : {}),
			};
			const res =
				kind === "agency"
					? await addAgencyMember(id, payload, logout)
					: await addOutletMember(id, payload, logout);
			const data = res.data as
				| { acceptUrl?: string; emailed?: boolean }
				| null
				| undefined;
			return {
				message: res.message,
				acceptUrl: data?.acceptUrl,
				emailed: data?.emailed,
			};
		},
		onSuccess: invalidate,
	});

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
		members: Array.isArray(membersQuery.data) ? membersQuery.data : [],
		isLoading: membersQuery.isLoading,
		addMember,
		changeMember,
		removeMember,
	};
}

/**
 * Pulls the server's refusal out of an axios error.
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
