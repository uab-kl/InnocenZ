import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /:id/invite-roles` is OWNER-ONLY on both portals — the same
 * owner-of-param gate as the invite itself (`agencyOwnerOfParam` /
 * `outletOwnerOfParam`, a guarantor folding in). The Team panel asked for it on
 * every Settings visit regardless of lane, so a Director, Finance or Ops head
 * collected a 403 "requires role: owner" plus react-query's retries.
 *
 * The panel already receives `canManage` (= `editSettings`, `settings:update`,
 * held by exactly owner and guarantor). These pin that the request follows it,
 * and that a read-only lane still sees its team with plain role labels.
 */

const fetchAgencyInviteRoles = vi.fn();
const fetchOutletInviteRoles = vi.fn();

vi.mock("@/services/agency", () => ({
	fetchAgencyInviteRoles: (...args: unknown[]) =>
		fetchAgencyInviteRoles(...args),
}));
vi.mock("@/services/outlet", () => ({
	fetchOutletInviteRoles: (...args: unknown[]) =>
		fetchOutletInviteRoles(...args),
}));

vi.mock("@/lib/auth/guards", () => ({ kickToLogin: vi.fn() }));
vi.mock("@/lib/auth/use-profile", () => ({
	useProfile: () => ({ data: { id: "me" } }),
}));

vi.mock("@agency-portal/lib/store", () => ({
	useStore: (selector: (s: { toast: () => void }) => unknown) =>
		selector({ toast: vi.fn() }),
}));

const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
vi.mock("@agency-portal/hooks/use-org-members", () => ({
	serverMessage: (_e: unknown, fallback: string) => fallback,
	useOrgMembers: () => ({
		members: [
			{
				id: "m1",
				userId: "u-director",
				username: "Dana Director",
				email: "dana@example.com",
				subRole: "director",
				status: "active",
			},
		],
		isLoading: false,
		addMember: mutation(),
		changeMember: mutation(),
		removeMember: mutation(),
	}),
}));

vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({
		locale: "en",
		// Echo the key back so an assertion cannot pass on a missing string.
		t: new Proxy(
			{},
			{
				get: (_t, section: string) =>
					new Proxy({}, { get: (_s, key: string) => `${section}.${key}` }),
			},
		),
	}),
}));

import { OrgMembersPanel } from "./OrgMembersPanel";

function renderPanel(kind: "agency" | "outlet", canManage: boolean) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<OrgMembersPanel kind={kind} orgId="org-1" canManage={canManage} />
		</QueryClientProvider>,
	);
}

const ROLES = { success: true, message: "", data: [] };

describe("OrgMembersPanel invite-roles request", () => {
	beforeEach(() => {
		fetchAgencyInviteRoles.mockReset().mockResolvedValue(ROLES);
		fetchOutletInviteRoles.mockReset().mockResolvedValue(ROLES);
	});

	it("asks for the invite roles when the lane may manage the team", async () => {
		renderPanel("agency", true);
		await waitFor(() =>
			expect(fetchAgencyInviteRoles).toHaveBeenCalledWith(
				"org-1",
				expect.any(Function),
			),
		);
		expect(screen.getByText("profile.inviteTeamMember")).toBeTruthy();
	});

	it.each([
		"agency",
		"outlet",
	] as const)("never asks a read-only %s lane, and still lists its team", async (kind) => {
		renderPanel(kind, false);
		expect(screen.getByText(/Dana Director/)).toBeTruthy();
		// The row's role reads from the fallback lanes, not a blank.
		expect(screen.getByText("profile.roleDirector")).toBeTruthy();
		expect(screen.queryByText("profile.inviteTeamMember")).toBeNull();
		// Give react-query a tick to fire anything it was going to.
		await new Promise((r) => setTimeout(r, 0));
		expect(fetchAgencyInviteRoles).not.toHaveBeenCalled();
		expect(fetchOutletInviteRoles).not.toHaveBeenCalled();
	});
});
