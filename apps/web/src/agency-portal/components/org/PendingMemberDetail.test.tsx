import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE APPROVALS PANE'S MEMBER DECISIONS CONFIRM, AND REACTIVATION NEVER WRITES
 * A ROLE THE OWNER DID NOT SEE (28 Sep 2026 audit: "member reactivate and
 * deactivate show no confirmation, and reactivating overwrites the role").
 *
 * The data hook, the store, the profile, the permission check and the locale
 * are mocked — this is about what the pane WRITES and SAYS.
 */

const toast = vi.fn();
const changeMutate = vi.fn();
const removeMutate = vi.fn();
let members: Record<string, unknown>[] = [];

vi.mock("@agency-portal/hooks/use-org-members", () => ({
	useOrgMembers: () => ({
		members,
		changeMember: { mutate: changeMutate, isPending: false },
		removeMember: { mutate: removeMutate, isPending: false },
	}),
	serverMessage: (_e: unknown, fallback: string) => fallback,
}));

vi.mock("@agency-portal/lib/store", () => ({
	useStore: (selector: (s: { toast: typeof toast }) => unknown) =>
		selector({ toast }),
}));

vi.mock("@/lib/auth/use-profile", () => ({
	useProfile: () => ({ data: { id: "owner-user", modulePermissions: [] } }),
}));

// Flipped per test: `settings:update` (owner / guarantor) is what decides.
let canDecide = true;

vi.mock("@/lib/auth/module-permissions", () => ({
	canModule: () => canDecide,
	grantsForPortal: () => [],
}));

vi.mock("@/components/organization/details-sheet-parts", () => ({
	apiAssetUrl: () => undefined,
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

import { isLastActiveOwner, PendingMemberDetail } from "./PendingMemberDetail";

const deactivated = (subRole: string) => ({
	id: "mem-1",
	userId: "member-user",
	subRole,
	status: "inactive",
	username: "Probe Member",
	email: "probe@example.com",
});

function renderPane() {
	render(
		<PendingMemberDetail
			kind="agency"
			orgId="agency-1"
			memberId="mem-1"
			onDecided={vi.fn()}
		/>,
	);
}

beforeEach(() => {
	canDecide = true;
	toast.mockClear();
	changeMutate.mockReset();
	removeMutate.mockReset();
});

describe("PendingMemberDetail — reactivate", () => {
	it("restores the role the row remembers, and says so in the server's words", () => {
		members = [deactivated("director")];
		changeMutate.mockImplementation((_input, opts) =>
			opts.onSuccess({ message: "Member reactivated as Director." }),
		);
		renderPane();

		fireEvent.click(screen.getByText("portalUi.reactivateButton"));

		expect(changeMutate).toHaveBeenCalledWith(
			{ memberId: "mem-1", status: "active", subRole: "director" },
			expect.anything(),
		);
		expect(toast).toHaveBeenCalledWith(
			"Member reactivated as Director.",
			"success",
		);
	});

	it("waits for a pick instead of writing Finance over a former Guarantor", () => {
		members = [deactivated("guarantor")];
		renderPane();

		const button = screen
			.getByText("portalUi.reactivateButton")
			.closest("button") as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		fireEvent.click(button);
		expect(changeMutate).not.toHaveBeenCalled();

		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "finance" },
		});
		expect(button.disabled).toBe(false);
		fireEvent.click(button);
		expect(changeMutate).toHaveBeenCalledWith(
			{ memberId: "mem-1", status: "active", subRole: "finance" },
			expect.anything(),
		);
	});
});

describe("PendingMemberDetail — deactivate", () => {
	it("confirms the removal in the server's words", () => {
		members = [{ ...deactivated("finance"), status: "active" }];
		removeMutate.mockImplementation((_id, opts) =>
			opts.onSuccess({
				success: true,
				message: "Member deactivated — they no longer have access.",
			}),
		);
		renderPane();

		// Arm, then confirm — removal is two steps.
		fireEvent.click(screen.getByText("portalUi.deactivateMember"));
		const confirm = screen
			.getAllByText("portalUi.deactivateMember")
			.map((el) => el.closest("button") as HTMLButtonElement)
			.find((b) => b.className.includes("bg-red-600"));
		expect(confirm).toBeDefined();
		fireEvent.click(confirm as HTMLButtonElement);

		expect(removeMutate).toHaveBeenCalledWith("mem-1", expect.anything());
		expect(toast).toHaveBeenCalledWith(
			"Member deactivated — they no longer have access.",
			"success",
		);
	});
});

/*
 * AN OWNER ROW IS NOT A PICKER, AND THE LAST OWNER IS NOT OFFERED FOR REMOVAL
 * (22 Oct 2026: Frank Lee, the venue's owner, read "Change their role:
 * Financial Head", and Deactivate was offered on him though the server answers
 * 409 "Cannot remove the last active owner").
 */
const activeAs = (id: string, subRole: string) => ({
	...deactivated(subRole),
	id,
	userId: `${id}-user`,
	status: "active",
});

describe("PendingMemberDetail — owner and guarantor rows", () => {
	it("shows the only active owner's title read-only, with no picker and no Deactivate", () => {
		members = [activeAs("mem-1", "owner"), activeAs("mem-2", "finance")];
		renderPane();

		expect(screen.queryByRole("combobox")).toBeNull();
		expect(screen.getByText("portalUi.currentRole")).toBeTruthy();
		// The badge AND the read-only line both name the owner lane.
		expect(screen.getAllByText("profile.roleOwner").length).toBeGreaterThan(1);
		expect(screen.queryByText("portalUi.deactivateMember")).toBeNull();
		expect(screen.getByText("portalUi.lastOwnerStays")).toBeTruthy();
	});

	it("offers Deactivate on an owner once another active owner exists — as the server allows", () => {
		members = [activeAs("mem-1", "owner"), activeAs("mem-2", "owner")];
		renderPane();

		expect(screen.queryByRole("combobox")).toBeNull();
		expect(screen.getByText("portalUi.deactivateMember")).toBeTruthy();
		expect(screen.queryByText("portalUi.lastOwnerStays")).toBeNull();
	});

	it("never shows a Guarantor as the first approvable title", () => {
		members = [activeAs("mem-1", "guarantor"), activeAs("mem-2", "owner")];
		renderPane();

		expect(screen.queryByRole("combobox")).toBeNull();
		expect(screen.getAllByText("profile.roleGuarantor").length).toBeGreaterThan(
			1,
		);
		expect(screen.queryByText("profile.roleFinance")).toBeNull();
		// Only an OWNER is protected; removing a guarantor is the server's to allow.
		expect(screen.getByText("portalUi.deactivateMember")).toBeTruthy();
	});

	it("keeps the picker for a lane the queue can grant", () => {
		members = [activeAs("mem-1", "director"), activeAs("mem-2", "owner")];
		renderPane();

		expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
			"director",
		);
		expect(screen.queryByText("portalUi.currentRole")).toBeNull();
	});
});

describe("isLastActiveOwner", () => {
	const row = (id: string, subRole: string, status = "active") => ({
		id,
		subRole,
		status,
	});

	it("is true only for the one active owner left", () => {
		const owner = row("a", "owner");
		expect(isLastActiveOwner([owner, row("b", "finance")], owner)).toBe(true);
	});

	it("is false while another ACTIVE owner exists", () => {
		const owner = row("a", "owner");
		expect(isLastActiveOwner([owner, row("b", "owner")], owner)).toBe(false);
	});

	it("does not count an inactive owner as the other one", () => {
		const owner = row("a", "owner");
		expect(
			isLastActiveOwner([owner, row("b", "owner", "inactive")], owner),
		).toBe(true);
	});

	it("is false for anyone who is not an active owner", () => {
		expect(isLastActiveOwner([], row("a", "guarantor"))).toBe(false);
		expect(isLastActiveOwner([], row("a", "owner", "inactive"))).toBe(false);
	});
});

describe("PendingMemberDetail — a lane that may only look", () => {
	// 22 Oct 2026: an Ops Head opening Finance's row saw "Change their role"
	// greyed out with no reason.
	it("says why the role picker is greyed out", () => {
		canDecide = false;
		members = [activeAs("mem-1", "finance"), activeAs("mem-2", "owner")];
		renderPane();

		expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(
			true,
		);
		expect(screen.getByText("portalUi.onlyOwnerDecides")).toBeTruthy();
	});

	it("says why Approve is greyed out on a waiting request", () => {
		canDecide = false;
		members = [{ ...activeAs("mem-1", "finance"), status: "pending" }];
		renderPane();

		expect(screen.getByText("portalUi.onlyOwnerDecides")).toBeTruthy();
	});

	it("shows no reason line to an owner who can decide", () => {
		members = [activeAs("mem-1", "finance"), activeAs("mem-2", "owner")];
		renderPane();

		expect(screen.queryByText("portalUi.onlyOwnerDecides")).toBeNull();
	});
});
