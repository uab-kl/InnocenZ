import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	localiseMemberChangeMessage,
	MEMBER_CHANGE_RULES,
	memberChangeText,
} from "./member-change-copy";

/**
 * Copied from apps/backend/src/features/rbac/member-change-message.ts and its
 * test (29 Sep 2026) — every sentence that producer can emit, with each role
 * name `portalRoleName` holds. Written out rather than read from the rules, so
 * a rule that stops matching fails here.
 */
const ROLES = ["Owner", "Finance", "Ops Head", "Director", "Guarantor"];
const SERVER_SENTENCES = [
	...ROLES.map((role) => `Member reactivated as ${role}.`),
	...ROLES.map((role) => `Request approved — they join as ${role}.`),
	...ROLES.map((role) => `Role changed to ${role}.`),
	"Member deactivated — they no longer have access.",
	"Member updated",
	"Request declined — they were not added to the team.",
];

const HAS_CJK = /[㐀-鿿]/;

describe("localiseMemberChangeMessage", () => {
	it.each(SERVER_SENTENCES)("translates %s", (sentence) => {
		const zh = localiseMemberChangeMessage(sentence, translations.zh);
		expect(zh).not.toBe(sentence);
		expect(zh).toMatch(HAS_CJK);
		// No English role name survives into the Chinese sentence.
		for (const role of ROLES) expect(zh).not.toContain(role);
	});

	it("names the role in the reader's words", () => {
		expect(
			localiseMemberChangeMessage(
				"Member reactivated as Director.",
				translations.zh,
			),
		).toBe(
			translations.zh.portalUi.serverMemberReactivatedAs.replace(
				"{role}",
				translations.zh.profile.roleDirector,
			),
		);
		expect(
			localiseMemberChangeMessage(
				"Request approved — they join as Ops Head.",
				translations.en,
			),
		).toBe("Request approved — they join as Ops Head.");
	});

	it("reads the same in English as the server wrote it", () => {
		for (const sentence of [
			"Member reactivated as Director.",
			"Member deactivated — they no longer have access.",
			"Request declined — they were not added to the team.",
		]) {
			expect(localiseMemberChangeMessage(sentence, translations.en)).toBe(
				sentence,
			);
		}
	});

	it("an unknown sentence is shown as the server wrote it", () => {
		const unknown = "The last owner cannot be removed";
		expect(localiseMemberChangeMessage(unknown, translations.zh)).toBe(unknown);
	});

	it("an unknown ROLE passes through inside a known sentence", () => {
		expect(
			localiseMemberChangeMessage(
				"Role changed to Night Captain.",
				translations.zh,
			),
		).toContain("Night Captain");
	});

	it("every rule is exercised by a server sentence", () => {
		for (const rule of MEMBER_CHANGE_RULES) {
			expect(
				SERVER_SENTENCES.some((s) =>
					rule.pattern.test(s.trim().replace(/\.$/, "")),
				),
			).toBe(true);
		}
	});
});

describe("memberChangeText", () => {
	it("falls back to the caller's sentence when the server sent none", () => {
		const fallback = translations.zh.portalUi.memberApproved;
		expect(memberChangeText(undefined, translations.zh, fallback)).toBe(
			fallback,
		);
		expect(memberChangeText("  ", translations.zh, fallback)).toBe(fallback);
	});
});
