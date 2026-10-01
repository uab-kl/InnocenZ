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

vi.mock("@/lib/auth/module-permissions", () => ({
	canModule: () => true,
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

import { PendingMemberDetail } from "./PendingMemberDetail";

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
