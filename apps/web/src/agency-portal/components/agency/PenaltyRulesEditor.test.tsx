import {
	type AgencyPenaltyRules,
	DEFAULT_PENALTY_RULES,
} from "@agency-portal/lib/pr-penalties";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * THE EDITOR NEVER SENDS WHAT THE SERVER WOULD REFUSE, AND A REFUSAL IS SEEN.
 *
 * Every change here is a save of all four rules, replaced as one. The server
 * now refuses an enabled rule out of range (a 0 late limit fines every PR; a
 * charge over 100% takes more than the day's wage) — so a box that let those
 * through would make one bad keystroke a silently dead save of the whole set.
 *
 * Rendered with the REAL English dictionary.
 */

vi.mock("@/lib/portal-i18n/context", async () => {
	const { translations } = await import("@/lib/portal-i18n/translations");
	return { usePortalLocale: () => ({ t: translations.en, locale: "en" }) };
});

import { translations } from "@/lib/portal-i18n/translations";
import {
	cancellationBandsInverted,
	clampEnabledPenaltyRules,
	PenaltyRulesEditor,
} from "./PenaltyRulesEditor";

const en = translations.en;

/** Box order as rendered: min shifts, fine · MC cap, per-excess · late limit, grace, fine · free, short, short %, late %. */
const BOX = {
	minShifts: 0,
	lateLimit: 4,
	grace: 5,
	freeHours: 7,
	shortHours: 8,
	shortPct: 9,
	latePct: 10,
} as const;

function rulesWith(
	patch: Partial<{
		[K in keyof AgencyPenaltyRules]: Partial<AgencyPenaltyRules[K]>;
	}>,
): AgencyPenaltyRules {
	const d = structuredClone(DEFAULT_PENALTY_RULES);
	return {
		minShiftsPerWeek: { ...d.minShiftsPerWeek, ...patch.minShiftsPerWeek },
		maxMcPerMonth: { ...d.maxMcPerMonth, ...patch.maxMcPerMonth },
		latePerWeek: { ...d.latePerWeek, ...patch.latePerWeek },
		cancellation: { ...d.cancellation, ...patch.cancellation },
	};
}

function renderEditor(
	rules: AgencyPenaltyRules = rulesWith({}),
	onChange: (next: AgencyPenaltyRules) => void | Promise<unknown> = vi.fn(),
) {
	render(<PenaltyRulesEditor rules={rules} onChange={onChange} />);
	return { boxes: screen.getAllByRole("textbox"), onChange };
}

describe("clampEnabledPenaltyRules — the server's ranges, on enabled rules only", () => {
	it("lifts an enabled late limit of 0 to 1 and caps an enabled charge at 100%", () => {
		const out = clampEnabledPenaltyRules(
			rulesWith({
				latePerWeek: { maxLatePerWeek: 0 },
				cancellation: { shortNoticePct: 150, lateCancelPct: 101 },
			}),
		);
		expect(out.latePerWeek.maxLatePerWeek).toBe(1);
		expect(out.cancellation.shortNoticePct).toBe(100);
		expect(out.cancellation.lateCancelPct).toBe(100);
	});

	it("leaves a DISABLED rule exactly as it is, as the server does", () => {
		const out = clampEnabledPenaltyRules(
			rulesWith({
				latePerWeek: { enabled: false, maxLatePerWeek: 0 },
				cancellation: { enabled: false, lateCancelPct: 150 },
			}),
		);
		expect(out.latePerWeek.maxLatePerWeek).toBe(0);
		expect(out.cancellation.lateCancelPct).toBe(150);
	});

	it("changes nothing in a set that is already in range", () => {
		expect(clampEnabledPenaltyRules(rulesWith({}))).toEqual(rulesWith({}));
	});

	it("never rounds a fine that carries sen", () => {
		const out = clampEnabledPenaltyRules(
			rulesWith({ minShiftsPerWeek: { fineRm: 50.5 } }),
		);
		expect(out.minShiftsPerWeek.fineRm).toBe(50.5);
	});
});

describe("cancellationBandsInverted — the one refusal a clamp cannot settle", () => {
	it("is true only for an ENABLED rule whose short notice is LONGER than free cancel", () => {
		expect(
			cancellationBandsInverted(
				rulesWith({
					cancellation: { shortNoticeHours: 30, freeCancelHours: 24 },
				}),
			),
		).toBe(true);
		// Equal is allowed by the server (an empty short band; the editor warns).
		expect(
			cancellationBandsInverted(
				rulesWith({
					cancellation: { shortNoticeHours: 24, freeCancelHours: 24 },
				}),
			),
		).toBe(false);
		expect(
			cancellationBandsInverted(
				rulesWith({
					cancellation: {
						enabled: false,
						shortNoticeHours: 30,
						freeCancelHours: 24,
					},
				}),
			),
		).toBe(false);
	});
});

describe("PenaltyRulesEditor — what leaves the box", () => {
	it("sends a typed 0 late limit as 1", () => {
		const { boxes, onChange } = renderEditor();
		fireEvent.change(boxes[BOX.lateLimit], { target: { value: "0" } });
		expect(onChange).toHaveBeenCalledTimes(1);
		const sent = (onChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(sent.latePerWeek.maxLatePerWeek).toBe(1);
	});

	it("caps a typed charge at 100%", () => {
		const { boxes, onChange } = renderEditor();
		fireEvent.change(boxes[BOX.latePct], { target: { value: "150" } });
		const sent = (onChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(sent.cancellation.lateCancelPct).toBe(100);
		expect((boxes[BOX.latePct] as HTMLInputElement).value).toBe("100");
	});

	it("does not save an emptied box mid-edit; leaving it empty settles to the minimum", () => {
		const { boxes, onChange } = renderEditor();
		fireEvent.change(boxes[BOX.lateLimit], { target: { value: "" } });
		expect(onChange).not.toHaveBeenCalled();
		expect((boxes[BOX.lateLimit] as HTMLInputElement).value).toBe("");
		fireEvent.blur(boxes[BOX.lateLimit]);
		expect(onChange).toHaveBeenCalledTimes(1);
		const sent = (onChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(sent.latePerWeek.maxLatePerWeek).toBe(1);
	});

	it("an emptied fine box still settles to 0, as it always did", () => {
		const { boxes, onChange } = renderEditor();
		fireEvent.change(boxes[BOX.minShifts + 1], { target: { value: "" } });
		fireEvent.blur(boxes[BOX.minShifts + 1]);
		const sent = (onChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(sent.minShiftsPerWeek.fineRm).toBe(0);
	});

	it("keeps a disabled late rule's 0 when another rule is edited — the save is not refused for it", () => {
		const { boxes, onChange } = renderEditor(
			rulesWith({ latePerWeek: { enabled: false, maxLatePerWeek: 0 } }),
		);
		fireEvent.change(boxes[BOX.grace], { target: { value: "10" } });
		const sent = (onChange as ReturnType<typeof vi.fn>).mock.calls[0][0];
		expect(sent.latePerWeek).toMatchObject({
			enabled: false,
			maxLatePerWeek: 0,
			graceMinutes: 10,
		});
	});

	it("holds back short notice longer than free cancel, and says why", () => {
		const { boxes, onChange } = renderEditor();
		fireEvent.change(boxes[BOX.shortHours], { target: { value: "30" } });
		expect(onChange).not.toHaveBeenCalled();
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain(en.managePr.couldNotSavePenaltyRules);
		expect(alert.textContent).toContain("25% band never applies");
		// The next valid change clears it.
		fireEvent.change(boxes[BOX.shortHours], { target: { value: "3" } });
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("shows the SERVER's sentence when a returned save is refused", async () => {
		const refused = {
			response: {
				data: {
					message: "Lateness per week: the late limit must be at least 1.",
				},
			},
		};
		const onChange = vi.fn(() => Promise.reject(refused));
		const { boxes } = renderEditor(rulesWith({}), onChange);
		fireEvent.change(boxes[BOX.grace], { target: { value: "20" } });
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toBe(
				"Lateness per week: the late limit must be at least 1.",
			),
		);
	});

	it("a void onChange (today's caller) still saves and shows nothing", () => {
		const onChange = vi.fn(() => undefined);
		const { boxes } = renderEditor(rulesWith({}), onChange);
		fireEvent.change(boxes[BOX.freeHours], { target: { value: "48" } });
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
