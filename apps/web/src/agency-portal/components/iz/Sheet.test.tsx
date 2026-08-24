import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { IzSheet } from "./Sheet";

/**
 * TWO SHEETS CAN BE OPEN AT ONCE, AND THAT USED TO LOCK THE PAGE FOR GOOD.
 *
 * The roster holds `demandDay` and `assignTarget` in separate state, so the day
 * sheet and the assign sheet coexist. Each sheet used to save whatever
 * `document.body.style.overflow` it found and restore that on close — correct
 * for one sheet, wrong for two: the second to mount saved "hidden", the value
 * the first had just written. Close the OUTER one first and the inner sheet
 * then "restores" hidden onto a page with no sheet on it. Nothing on screen
 * explains it and only a reload clears it.
 *
 * The order in the second test is the one that broke; the first is the order
 * that always happened to work, kept so a fix that trades one for the other
 * cannot pass.
 */
afterEach(() => {
	cleanup();
	document.body.style.overflow = "";
});

function TwoSheets({ a, b }: { a: boolean; b: boolean }) {
	return (
		<>
			{a && (
				<IzSheet open onClose={() => {}}>
					<p>day sheet</p>
				</IzSheet>
			)}
			{b && (
				<IzSheet open onClose={() => {}}>
					<p>assign sheet</p>
				</IzSheet>
			)}
		</>
	);
}

describe("IzSheet scroll lock", () => {
	it("locks the page while a sheet is open and frees it on close", () => {
		const view = render(<TwoSheets a b={false} />);
		expect(document.body.style.overflow).toBe("hidden");
		act(() => view.rerender(<TwoSheets a={false} b={false} />));
		expect(document.body.style.overflow).toBe("");
	});

	it("frees the page when the INNER sheet closes last", () => {
		const view = render(<TwoSheets a b />);
		expect(document.body.style.overflow).toBe("hidden");
		// Outer first, inner second — still locked in between.
		act(() => view.rerender(<TwoSheets a={false} b />));
		expect(document.body.style.overflow).toBe("hidden");
		act(() => view.rerender(<TwoSheets a={false} b={false} />));
		expect(document.body.style.overflow).toBe("");
	});

	it("frees the page when the OUTER sheet closes last", () => {
		const view = render(<TwoSheets a b />);
		act(() => view.rerender(<TwoSheets a b={false} />));
		expect(document.body.style.overflow).toBe("hidden");
		act(() => view.rerender(<TwoSheets a={false} b={false} />));
		expect(document.body.style.overflow).toBe("");
	});

	it("survives a sheet opening while another is already open, repeatedly", () => {
		// The real sequence: open a day sheet, assign from inside it, close both,
		// then do it again. A leak shows up on the second pass even if the first
		// looked clean.
		function Harness() {
			const [n, setN] = useState(0);
			return (
				<>
					<button type="button" onClick={() => setN(n + 1)}>
						step
					</button>
					<TwoSheets a={n === 1 || n === 2} b={n === 2 || n === 3} />
				</>
			);
		}
		const view = render(<Harness />);
		const step = view.getByText("step");
		for (let pass = 0; pass < 2; pass++) {
			for (let i = 0; i < 4; i++) act(() => step.click());
			expect(document.body.style.overflow).toBe("");
		}
	});
});
