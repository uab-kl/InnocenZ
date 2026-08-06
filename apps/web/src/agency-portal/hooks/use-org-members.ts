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
}

/**
 * Member management for one organisation, agency or outlet.
 *
 * Invite creates a `pending` membership + email; the invitee must accept before
 * status becomes `active`. The server owns every other rule (scope, last owner).
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
		void queryClient.invalidateQueries({ queryKey: [kind, "profile"] });
	};

	const addMember = useMutation({
		mutationFn: async (input: {
			email: string;
			subRole: string;
			roleId?: string;
		}): Promise<{ message?: string }> => {
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
			return { message: res.message };
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
