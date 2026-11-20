import { describe, expect, it } from "vitest";
import { inviteReturnPath, isInviteReturnPath } from "./invite-return-path";

const TOKEN =
	"e49b206b630ff9c7f23b5239830df990687454fb4888c30bb26c481b3bbdb316";

describe("invite return path — the invitation survives the sign-in, for every role", () => {
	it("builds the exact path the invite page needs back", () => {
		expect(inviteReturnPath(TOKEN)).toBe(`/invite/org-member?token=${TOKEN}`);
		expect(isInviteReturnPath(inviteReturnPath(TOKEN))).toBe(true);
	});

	it("is not a redirect to anywhere else", () => {
		for (const bad of [
			null,
			undefined,
			"",
			`//evil.example/invite/org-member?token=${TOKEN}`,
			`https://evil.example/invite/org-member?token=${TOKEN}`,
			`/invite/org-member?token=${TOKEN}&next=//evil.example`,
			`/invite/org-member?token=${TOKEN}#x`,
			"/invite/org-member?token=short",
			"/invite/org-member",
			"/admin/dashboard",
			"javascript:alert(1)",
			`/en/invite/org-member?token=${TOKEN}`,
		]) {
			expect(isInviteReturnPath(bad), String(bad)).toBe(false);
		}
	});
});
