import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import type { Shift, ShiftEventDrinkMenuItem } from "@/services/shift";
import { outletShiftRequestFromBackend } from "./agency-outlet-shift-map";
import {
	createShiftInputFromPost,
	eventDrinkMenuFromShift,
	historyEventFields,
	type OutletShiftPostItem,
	shiftRequestFromBackendShift,
} from "./backend-shift-map";
import { type OutletDrinkPrice, specialEventPillLabel } from "./outlet-demo";
import { shiftPriceGroups } from "./outlet-shift-price-groups";

/**
 * POST JOB DROPPED THE EVENT TYPE (29 Sep 2026 audit).
 *
 * A VIP night posted from an event card came back as a bare "Special" with an
 * empty label. A shift posted from a card is posted with the card's type
 * LOCKED, so the server joins the card's type onto the read (as it already did
 * the cover picture), and the mapper hands it to every outlet screen.
 *
 * A BLANK post had no card to read through — and its composer's event price
 * list was dropped too. 0167 gave both a home on the shift itself
 * (`special_event_type` / `custom_special_event_name` + `shift_drink_menu`):
 * the mapper now prefers the shift's OWN pair, keeps the card as the fallback
 * for shifts posted before, and carries the event's prices both ways.
 */

function shift(partial: Partial<Shift>): Shift {
	return {
		id: "s-1",
		agencyId: "a-1",
		outletId: "o-1",
		shiftDate: "2026-10-03",
		slot: "22:00 - 04:00",
		eventName: "Launch night",
		eventKind: "special",
		languages: null,
		quantity: 2,
		filled: 0,
		preferredRating: null,
		payPerHour: "0",
		estimatedCost: "0",
		liveSales: "0",
		status: "confirmed",
		createdAt: "",
		updatedAt: "",
		createdBy: "",
		updatedBy: "",
		...partial,
	};
}

const map = (s: Shift) =>
	shiftRequestFromBackendShift({
		shift: s,
		assignments: [],
		outletName: "UAB Emhub",
		todayIso: "2026-09-29",
	});

describe("the special sub-type rides in from the event card", () => {
	it("a card-posted special shift keeps its type and custom name", () => {
		const request = map(
			shift({
				templateId: "t-1",
				templateSpecialEventType: "other",
				templateCustomEventName: "Whisky tasting",
			}),
		);
		expect(request.specialEventType).toBe("other");
		expect(request.customSpecialEventName).toBe("Whisky tasting");
	});

	it("a normal shift never inherits a sub-type", () => {
		const request = map(
			shift({ eventKind: "normal", templateSpecialEventType: "vip" }),
		);
		expect(request.specialEventType).toBeUndefined();
	});

	it("a blank special post posted before 0167 still has nothing to read", () => {
		expect(map(shift({})).specialEventType).toBeUndefined();
	});
});

describe("the shift's OWN sub-type wins over the card's (0167)", () => {
	it("a blank special post reads the type and name stored on the shift", () => {
		const request = map(
			shift({ specialEventType: "other", customSpecialEventName: "Gin night" }),
		);
		expect(request.specialEventType).toBe("other");
		expect(request.customSpecialEventName).toBe("Gin night");
	});

	it("the shift's pair beats the card's, and the two are never mixed", () => {
		// Posted as a VIP night from a card that has since become "Other · Whisky".
		const request = map(
			shift({
				templateId: "t-1",
				specialEventType: "vip",
				customSpecialEventName: null,
				templateSpecialEventType: "other",
				templateCustomEventName: "Whisky tasting",
			}),
		);
		expect(request.specialEventType).toBe("vip");
		// The card's "Other" name belongs to the card's type, not to this VIP night.
		expect(request.customSpecialEventName).toBeUndefined();
	});

	it("a normal shift shows no sub-type from either source", () => {
		const request = map(
			shift({
				eventKind: "normal",
				specialEventType: "vip",
				templateSpecialEventType: "vip",
			}),
		);
		expect(request.specialEventType).toBeUndefined();
		expect(request.customSpecialEventName).toBeUndefined();
	});

	it("the agency's outlet view carries the same answer", () => {
		// /agency/outlets used its own mapper and never carried a sub-type at all.
		const request = outletShiftRequestFromBackend(
			shift({ specialEventType: "launch" }),
			"UAB Emhub",
		);
		expect(request.specialEventType).toBe("launch");
		expect(
			outletShiftRequestFromBackend(
				shift({ templateSpecialEventType: "corporate" }),
				"UAB Emhub",
			).specialEventType,
		).toBe("corporate");
	});
});

function menuRow(
	partial: Partial<ShiftEventDrinkMenuItem>,
): ShiftEventDrinkMenuItem {
	return {
		id: "row",
		shiftId: "s-1",
		slug: "cosmo",
		name: "Cosmo",
		priceRm: "180.00",
		category: "drink",
		sortOrder: 0,
		...partial,
	};
}

describe("the event's own prices come back onto the shift (0167)", () => {
	const stored = [
		menuRow({
			id: "r2",
			slug: "tips",
			name: "Tips",
			priceRm: "60.00",
			category: "tip",
			sortOrder: 2,
		}),
		menuRow({
			id: "r1",
			slug: "cosmo",
			name: "Cosmo",
			priceRm: "180.00",
			category: "drink",
			sortOrder: 0,
		}),
		menuRow({
			id: "r3",
			slug: "havoc",
			name: "Havoc",
			priceRm: "1200.00",
			category: "service",
			sortOrder: 1,
		}),
	];

	it("in the composer's shape and order, the category verbatim", () => {
		expect(map(shift({ eventDrinkMenu: stored })).eventDrinkMenu).toEqual([
			{ id: "cosmo", name: "Cosmo", priceRm: 180, category: "drink" },
			{ id: "havoc", name: "Havoc", priceRm: 1200, category: "service" },
			{ id: "tips", name: "Tips", priceRm: 60, category: "tip" },
		]);
	});

	it("an empty list means the Workspace prices — undefined, never []", () => {
		expect(
			eventDrinkMenuFromShift(shift({ eventDrinkMenu: [] })),
		).toBeUndefined();
		// An older backend sends nothing at all.
		expect(eventDrinkMenuFromShift(shift({}))).toBeUndefined();
	});

	it("a normal shift never carries event prices", () => {
		expect(
			eventDrinkMenuFromShift(
				shift({ eventKind: "normal", eventDrinkMenu: stored }),
			),
		).toBeUndefined();
	});

	it("the shift sheet then prints them as the event's, marking what differs", () => {
		const workspace: OutletDrinkPrice[] = [
			{ id: "cosmo", name: "Cosmo", priceRm: 150, category: "drink" },
			{ id: "havoc", name: "Havoc", priceRm: 1200, category: "service" },
			{ id: "tips", name: "Tips", priceRm: 50, category: "tip" },
		];
		const request = map(shift({ eventDrinkMenu: stored }));
		const { eventSpecific, groups } = shiftPriceGroups(request, workspace, {
			backed: true,
		});
		expect(eventSpecific).toBe(true);
		expect(groups.find((g) => g.category === "drink")?.lines).toEqual([
			{ name: "Cosmo", priceRm: 180, changed: true },
		]);
		expect(groups.find((g) => g.category === "service")?.lines).toEqual([
			{ name: "Tips", priceRm: 60, changed: true },
			{ name: "Havoc", priceRm: 1200, changed: false },
		]);

		// A special night that kept the everyday list is priced as the Workspace.
		expect(
			shiftPriceGroups(map(shift({ eventDrinkMenu: [] })), workspace, {
				backed: true,
			}).eventSpecific,
		).toBe(false);
	});
});

const OUTLET_ID = "11111111-1111-4111-8111-111111111111";

function postItem(partial: Partial<OutletShiftPostItem>): OutletShiftPostItem {
	return {
		dateIso: "2026-10-03",
		shift: "22:00 - 04:00",
		quantity: 2,
		languages: "",
		event: "Launch night",
		eventKind: "special",
		preferredRating: 0,
		estimatedCost: 1000,
		payPerHour: 500,
		...partial,
	};
}

describe("Post Job sends the special night instead of dropping it (0167)", () => {
	it("sends the sub-type, and the event's price list line by line", () => {
		const input = createShiftInputFromPost(
			postItem({
				specialEventType: "vip",
				eventDrinkMenu: [
					{ id: "cosmo", name: "Cosmo", priceRm: 180, category: "drink" },
					// The Workspace's seeded Tips row, copied in as the list opened.
					{ id: "tips", name: "Tips", priceRm: 60, category: "tip" },
					// Added in the editor and never named or priced properly.
					{
						id: "drink-1727600000000",
						name: "  ",
						priceRm: Number.NaN,
						category: "drink",
					},
					// A row from before the Drinks / Services split carries no category.
					{ id: "legacy", name: "Bottle service", priceRm: -5 },
				],
			}),
			OUTLET_ID,
		);
		expect(input.specialEventType).toBe("vip");
		expect(input.customSpecialEventName).toBeUndefined();
		expect(input.eventDrinkMenu).toEqual([
			{
				slug: "cosmo",
				name: "Cosmo",
				priceRm: 180,
				category: "drink",
				sortOrder: 0,
			},
			{
				slug: "tips",
				name: "Tips",
				priceRm: 60,
				category: "tip",
				sortOrder: 1,
			},
			{
				slug: "drink-1727600000000",
				name: "New drink",
				priceRm: 0,
				category: "drink",
				sortOrder: 2,
			},
			{
				slug: "legacy",
				name: "Bottle service",
				priceRm: 0,
				category: "service",
				sortOrder: 3,
			},
		]);
	});

	it('sends the "Other" name trimmed, only for "Other", within the column', () => {
		expect(
			createShiftInputFromPost(
				postItem({
					specialEventType: "other",
					customSpecialEventName: "  Gin night ",
				}),
				OUTLET_ID,
			).customSpecialEventName,
		).toBe("Gin night");
		expect(
			createShiftInputFromPost(
				postItem({
					specialEventType: "other",
					customSpecialEventName: "x".repeat(150),
				}),
				OUTLET_ID,
			).customSpecialEventName,
		).toHaveLength(120);
		expect(
			createShiftInputFromPost(
				postItem({
					specialEventType: "launch",
					customSpecialEventName: "Stale",
				}),
				OUTLET_ID,
			).customSpecialEventName,
		).toBeUndefined();
	});

	it("sends none of it for a normal shift, whatever the composer still holds", () => {
		const input = createShiftInputFromPost(
			postItem({
				eventKind: "normal",
				specialEventType: "vip",
				customSpecialEventName: "Stale",
				eventDrinkMenu: [
					{ id: "cosmo", name: "Cosmo", priceRm: 180, category: "drink" },
				],
			}),
			OUTLET_ID,
		);
		expect(input).not.toHaveProperty("specialEventType");
		expect(input).not.toHaveProperty("customSpecialEventName");
		expect(input).not.toHaveProperty("eventDrinkMenu");
	});

	it("an empty event list is not sent — the night is priced from the Workspace", () => {
		expect(
			createShiftInputFromPost(
				postItem({ specialEventType: "vip", eventDrinkMenu: [] }),
				OUTLET_ID,
			),
		).not.toHaveProperty("eventDrinkMenu");
	});
});

/**
 * OUTLET HISTORY CARRIED NO EVENT TYPE (29 Sep 2026). History is built from
 * assignments, which join only the shift's kind; the sub-type is read off the
 * shift and joined on its id — the same pair every other screen shows.
 */
describe("historyEventFields — a History row's night", () => {
	it("a special night reads its type and 'Other' name off the shift", () => {
		expect(
			historyEventFields(
				"special",
				shift({
					specialEventType: "other",
					customSpecialEventName: "Gin night",
				}),
			),
		).toEqual({
			eventKind: "special",
			specialEventType: "other",
			customSpecialEventName: "Gin night",
		});
	});

	it("falls back to the card's pair, as the Calendar does", () => {
		expect(
			historyEventFields(
				"special",
				shift({ templateId: "t-1", templateSpecialEventType: "vip" }),
			),
		).toEqual({ eventKind: "special", specialEventType: "vip" });
	});

	it("a special night whose shift has not been read yet still says special", () => {
		expect(historyEventFields("special", undefined)).toEqual({
			eventKind: "special",
		});
	});

	it("a normal night carries no sub-type, whatever the shift row holds", () => {
		expect(
			historyEventFields(
				"normal",
				shift({ eventKind: "normal", specialEventType: "vip" }),
			),
		).toEqual({ eventKind: "normal" });
	});

	it("a row from a backend that sent no kind claims nothing", () => {
		expect(historyEventFields(undefined, undefined)).toEqual({});
		expect(historyEventFields(null, shift({}))).toEqual({});
	});
});

describe("specialEventPillLabel — the gold pill", () => {
	it("names the sub-type, the 'Other' name, or plain Special — never blank", () => {
		const t = translations.zh;
		expect(specialEventPillLabel("vip", t)).toBe(t.postJob.evVip);
		expect(specialEventPillLabel("other", t, "Gin night")).toBe("Gin night");
		expect(specialEventPillLabel("other", t, "  ")).toBe(t.postJob.evOther);
		// A blank special post from before 0167 printed an EMPTY pill.
		expect(specialEventPillLabel(undefined, t)).toBe(t.postJob.evSpecial);
		expect(specialEventPillLabel(undefined, translations.en)).toBe(
			translations.en.postJob.evSpecial,
		);
	});
});
