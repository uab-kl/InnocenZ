import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { GpsRoadMap } from "./GpsRoadMap";

/**
 * The app is dark only (theme-provider.tsx). The GPS map used to default to
 * light "voyager" tiles and white Google-style controls, which no caller
 * overrode — a bright map in the middle of the dark roster.
 */
describe("GpsRoadMap is dark only", () => {
	beforeAll(() => {
		// jsdom has no ResizeObserver; the map only uses it to track its width.
		globalThis.ResizeObserver ??= class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver;
	});

	function renderMap() {
		return render(
			<GpsRoadMap
				rows={[]}
				bounds={{ minLat: 3.14, maxLat: 3.16, minLng: 101.69, maxLng: 101.71 }}
				outletPins={[]}
				selectedId={null}
				onSelect={() => {}}
			/>,
		);
	}

	it("paints the dark frame, so the controls and info window are dark", () => {
		const { container } = renderMap();
		const frame = container.querySelector(".iz-gmaps-frame");
		expect(frame?.classList.contains("iz-gmaps-frame--dark")).toBe(true);
	});

	it("loads only dark map tiles", () => {
		const { container } = renderMap();
		const tiles = [...container.querySelectorAll("img.iz-gmaps-tile")];
		expect(tiles.length).toBeGreaterThan(0);
		for (const tile of tiles) {
			expect(tile.getAttribute("src")).toContain("/dark_all/");
			expect(tile.getAttribute("src")).not.toContain("voyager");
		}
	});
});
