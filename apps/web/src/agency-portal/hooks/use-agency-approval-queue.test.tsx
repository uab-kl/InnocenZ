import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgencyApprovalQueue } from "./use-agency-approval-queue";

const { members } = vi.hoisted(() => ({
	members: [
		{
			id: "waiting",
			userId: "user-1",
			username: "Waiting member",
			subRole: "director",
			status: "pending",
		},
		{ id: "active", userId: "user-2", subRole: "finance", status: "active" },
		{
			id: "declined",
			userId: "user-3",
			subRole: "finance",
			status: "rejected",
		},
		{
			id: "inactive",
			userId: "user-4",
			subRole: "finance",
			status: "inactive",
		},
	],
}));
vi.mock("@agency-portal/hooks/use-org-members", () => ({
	useOrgMembersQuery: () => ({ data: members }),
}));
vi.mock("@agency-portal/hooks/use-agency-pending-prs", () => ({
	useAgencyPendingPrs: () => ({ backed: true, signups: [] }),
}));
vi.mock("@agency-portal/hooks/use-agency-outlet-links", () => ({
	useAgencyOutletLinks: () => ({ links: [] }),
}));
vi.mock("@agency-portal/hooks/use-cutlost-requests", () => ({
	useCutlostRequests: () => ({ backed: true, requests: [], isLoading: false }),
}));
vi.mock("@agency-portal/lib/agency-identity", () => ({
	getAgencyIdentity: () => ({ agencyId: "agency-test" }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({ data: { data: [] }, isLoading: false }),
}));
vi.mock("@agency-portal/lib/store", () => ({
	useStore: (selector: (state: unknown) => unknown) =>
		selector({
			pendingPRs: [],
			pendingAgencyLinks: [],
			pendingCutlostRequests: [],
			activeAgencyId: "agency-test",
		}),
}));
afterEach(cleanup);
describe("Agency Today member approvals", () => {
	it("returns the waiting member behind the badge, excluding decided memberships", () => {
		const { result } = renderHook(() => useAgencyApprovalQueue());
		expect(result.current.total).toBe(1);
		expect(result.current.pendingMembers).toBe(1);
		expect(result.current.pendingMemberRows).toEqual([members[0]]);
	});
});
