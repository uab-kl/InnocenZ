import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { portalScrollBehavior } from "./motion-scroll";

/*
 * MOTION GUARDS for the agency and outlet portals (DESIGN.md §8): motion
 * follows a user action or a mount, nothing plays on its own, there is one
 * loop, nothing overshoots, and reduced motion sees none of it.
 *
 * Every check proves its instrument first — a planted breach must fail it, or
 * a known hit must be found — because a guard that cannot fail reports
 * "clean" for a renamed file as happily as for a correct one.
 */

// Found from either the web app or the repo root, as NavAlertBadge.test.tsx does.
const SRC =
	[resolve("src"), resolve("apps/web/src")].find((p) =>
		existsSync(join(p, "agency-portal/portal-motion.css")),
	) ?? "src (not found)";
const MOTION_CSS = join(SRC, "agency-portal/portal-motion.css");
const SCAN_DIRS = ["agency-portal", "routes/agency", "routes/outlet"];
const SELF = "portal-motion-guards.test.ts";

/* ── a small CSS reader: every block with its prelude, its own declarations
   and the preludes of the blocks around it (@media, @keyframes …) ───────── */
type Rule = { prelude: string; decls: string[]; parents: string[] };

function parseCss(source: string): Rule[] {
	const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
	const rules: Rule[] = [];
	const stack: { prelude: string; decls: string[] }[] = [];
	let buf = "";
	let quote = "";
	for (const ch of css) {
		// A brace or semicolon inside a string (a data: URL, `content`) is text.
		if (quote) {
			buf += ch;
			if (ch === quote) quote = "";
		} else if (ch === '"' || ch === "'") {
			quote = ch;
			buf += ch;
		} else if (ch === "{") {
			stack.push({ prelude: buf.replace(/\s+/g, " ").trim(), decls: [] });
			buf = "";
		} else if (ch === "}") {
			const top = stack.pop();
			if (!top) throw new Error("unbalanced }");
			if (buf.trim()) top.decls.push(buf.trim());
			buf = "";
			rules.push({ ...top, parents: stack.map((s) => s.prelude) });
		} else if (ch === ";") {
			stack.at(-1)?.decls.push(buf.trim());
			buf = "";
		} else buf += ch;
	}
	if (stack.length) throw new Error("unbalanced {");
	return rules;
}

const decl = (d: string) => {
	const i = d.indexOf(":");
	return {
		prop: d.slice(0, i).trim().toLowerCase(),
		value: d
			.slice(i + 1)
			.replace(/\s+/g, " ")
			.trim(),
	};
};
const bare = (value: string) => value.replace(/!important/i, "").trim();
/** Commas at the top level only: `color-mix(in srgb, a, b)` stays one layer. */
function splitTop(value: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = "";
	for (const c of value) {
		if (c === "(") depth++;
		if (c === ")") depth--;
		if (c === "," && depth === 0) {
			out.push(cur.trim());
			cur = "";
		} else cur += c;
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}
const NO_PREFERENCE = /prefers-reduced-motion\s*:\s*no-preference/;
const REDUCE = /prefers-reduced-motion\s*:\s*reduce/;
const under = (r: Rule, re: RegExp) => r.parents.some((p) => re.test(p));
const stopsOf = (rules: Rule[], name: string) =>
	rules.filter((r) => r.parents.at(-1) === `@keyframes ${name}`);
const isStop = (r: Rule) => r.parents.at(-1)?.startsWith("@keyframes") ?? false;

/* ── the checks, each returning what breaks it ──────────────────────────── */

/** M4 pops in, it never overshoots: no mid stop, no scale past 1. */
function popBreaches(css: string): string[] {
	const stops = stopsOf(parseCss(css), "iz-m-pop");
	if (stops.length === 0) return ["@keyframes iz-m-pop not found"];
	const out: string[] = [];
	for (const s of stops) {
		if (s.prelude.includes("%")) out.push(`a ${s.prelude} stop`);
		for (const d of s.decls.map(decl)) {
			const values =
				d.prop === "scale"
					? bare(d.value).split(/\s+/)
					: d.prop === "transform"
						? [...d.value.matchAll(/scale[XYZ3d]*\(([^)]*)\)/g)].flatMap((m) =>
								m[1].split(/[\s,]+/),
							)
						: [];
			for (const v of values) {
				const n = v.endsWith("%")
					? Number.parseFloat(v) / 100
					: Number.parseFloat(v);
				if (n > 1) out.push(`${s.prelude} ${d.prop}: ${d.value}`);
			}
		}
	}
	return out;
}

/** M5's take settles INTO the pill: every shadow layer is inset, no halo. */
function takeBreaches(css: string): string[] {
	const layers = stopsOf(parseCss(css), "iz-m-take").flatMap((s) =>
		s.decls
			.map(decl)
			.filter((d) => d.prop === "box-shadow")
			.flatMap((d) => splitTop(bare(d.value))),
	);
	if (layers.length === 0) return ["no box-shadow in @keyframes iz-m-take"];
	return layers.filter((l) => !l.startsWith("inset"));
}

/** Under reduce, the forced transition list never names a moving property. */
function reduceTransitionBreaches(css: string): string[] {
	const lists = parseCss(css)
		.filter((r) => under(r, REDUCE))
		.flatMap((r) => r.decls.map(decl))
		.filter(
			(d) => d.prop === "transition-property" && /!important/i.test(d.value),
		)
		.map((d) => splitTop(bare(d.value)).map((p) => p.toLowerCase()));
	if (lists.length === 0)
		return ["no transition-property !important under reduced motion"];
	const moving = ["transform", "translate", "scale", "rotate", "all"];
	return lists.flat().filter((p) => moving.includes(p));
}

/** A closing Radix popper never animates on its way out. */
function radixClosedStill(css: string): boolean {
	return parseCss(css).some(
		(r) =>
			r.prelude.includes("[data-radix-popper-content-wrapper]") &&
			/\[data-state=(?:"closed"|'closed'|closed)\]/.test(r.prelude) &&
			r.decls
				.map(decl)
				.some((d) => d.prop === "animation" && bare(d.value) === "none"),
	);
}

const KPI_ARROW = /a\.iz-portal-kpi:hover\s*>\s*\.l\s*>\s*svg/;
function kpiArrowNudges(css: string): boolean {
	return parseCss(css).some(
		(r) =>
			KPI_ARROW.test(r.prelude) &&
			r.decls
				.map(decl)
				.some((d) => d.prop === "translate" && bare(d.value) === "4px 0"),
	);
}

/** Spaces at the top level only: `calc(var(--a) * 2)` stays one token. */
function splitSpaces(value: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = "";
	for (const c of value) {
		if (c === "(") depth++;
		if (c === ")") depth--;
		if (/\s/.test(c) && depth === 0) {
			if (cur) out.push(cur);
			cur = "";
		} else cur += c;
	}
	if (cur) out.push(cur);
	return out;
}
const TIME = /^(?:calc\(|var\(--iz-motion-|-?[\d.]+m?s$)/;
/** The delays a declaration sets: `animation-delay`, or the SECOND <time> of
 *  each `animation` layer (the first is its duration). */
function delaysOf({ prop, value }: { prop: string; value: string }): string[] {
	if (prop === "animation-delay") return splitTop(bare(value));
	if (prop !== "animation") return [];
	return splitTop(bare(value)).flatMap(
		(layer) => splitSpaces(layer).filter((t) => TIME.test(t))[1] ?? [],
	);
}
const POSITIONAL = /:nth-(?:last-)?(?:child|of-type)\(/;
const animates = ({ prop, value }: { prop: string; value: string }) =>
	(prop === "animation" || prop === "animation-name") && bare(value) !== "none";

/** NOTHING STAGGERS: no entrance differs by its place in a list, and no delay
 *  is a multiple (`calc(var(--step) * n)`, or `* var(--i)` set inline). */
function staggerBreaches(css: string): string[] {
	const out: string[] = [];
	for (const r of parseCss(css)) {
		if (r.prelude.startsWith("@") || isStop(r)) continue;
		for (const d of r.decls.map(decl)) {
			if (
				POSITIONAL.test(r.prelude) &&
				(d.prop === "animation-delay" || animates(d))
			)
				out.push(`by position: ${r.prelude} { ${d.prop}: ${d.value} }`);
			for (const v of delaysOf(d))
				if (v.includes("*")) out.push(`multiplied delay: ${v}`);
		}
	}
	return out;
}
const delaysIn = (css: string) =>
	[
		...new Set(
			parseCss(css)
				.filter((r) => !r.prelude.startsWith("@") && !isStop(r))
				.flatMap((r) => r.decls.map(decl).flatMap(delaysOf)),
		),
	].sort();

/** §8: every motion sits inside `prefers-reduced-motion: no-preference`. */
function ungatedAnimations(css: string): string[] {
	return parseCss(css)
		.filter((r) => !r.prelude.startsWith("@") && !isStop(r))
		.filter((r) =>
			r.decls
				.map(decl)
				.some(
					(d) =>
						(d.prop === "animation" || d.prop === "animation-name") &&
						bare(d.value) !== "none",
				),
		)
		.filter((r) => !under(r, NO_PREFERENCE))
		.map((r) => r.prelude);
}

/** Admin must never match: every selector names the agency or outlet portal. */
function unscopedSelectors(css: string): string[] {
	return parseCss(css)
		.filter((r) => !r.prelude.startsWith("@") && !isStop(r))
		.flatMap((r) => splitTop(r.prelude))
		.filter((sel) => !/data-portal=|data-(?:agency|outlet)-design/.test(sel));
}

/* ── files ──────────────────────────────────────────────────────────────── */
function walk(dir: string, keep: (name: string) => boolean): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		if (e.isDirectory()) return walk(p, keep);
		return keep(e.name) ? [p] : [];
	});
}
const rel = (p: string) => relative(SRC, p).replace(/\\/g, "/");

describe("portalScrollBehavior — a scroll the user asked for", () => {
	const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
	const queries: string[] = [];
	const stubMatchMedia = (value: unknown) =>
		Object.defineProperty(window, "matchMedia", {
			configurable: true,
			writable: true,
			value,
		});
	afterEach(() => {
		if (original) Object.defineProperty(window, "matchMedia", original);
		else Reflect.deleteProperty(window, "matchMedia");
		queries.length = 0;
	});
	const answering = (matches: boolean) => (query: string) => {
		queries.push(query);
		return { matches, media: query } as MediaQueryList;
	};

	it("jumps at once when the reader asked for reduced motion", () => {
		stubMatchMedia(answering(true));
		expect(portalScrollBehavior()).toBe("instant");
		expect(queries).toEqual(["(prefers-reduced-motion: reduce)"]);
	});

	it("glides when the reader set no preference", () => {
		stubMatchMedia(answering(false));
		expect(portalScrollBehavior()).toBe("smooth");
		expect(queries).toEqual(["(prefers-reduced-motion: reduce)"]);
	});

	it("glides where there is no matchMedia at all (jsdom, server render)", () => {
		stubMatchMedia(undefined);
		expect(window.matchMedia).toBeUndefined();
		expect(portalScrollBehavior()).toBe("smooth");
	});
});

describe("portal-motion.css — the guards hold", () => {
	const css = () => {
		expect(existsSync(MOTION_CSS), MOTION_CSS).toBe(true);
		return readFileSync(MOTION_CSS, "utf8");
	};

	it("reads the file into rules (the reader itself works)", () => {
		const rules = parseCss(css());
		expect(rules.length).toBeGreaterThan(50);
		expect(stopsOf(rules, "iz-m-pop").length).toBeGreaterThan(0);
		expect(() => parseCss(".a { color: red; ")).toThrow();
	});

	it("M4: the badge pop never grows past its size", () => {
		// Planted: Linear's 0.9 → 1.03 → 1, the overshoot this rule removed.
		expect(
			popBreaches(
				"@keyframes iz-m-pop { from { opacity: 0; scale: 0.88; } 60% { opacity: 1; scale: 1.03; } }",
			),
		).toEqual(["a 60% stop", "60% scale: 1.03"]);
		expect(
			popBreaches("@keyframes iz-m-pop { from { scale: 1.03; } }"),
		).toHaveLength(1);
		expect(
			popBreaches("@keyframes iz-m-pop { from { transform: scale(104%); } }"),
		).toHaveLength(1);
		expect(popBreaches("@keyframes other { from { scale: 2; } }")).toEqual([
			"@keyframes iz-m-pop not found",
		]);
		expect(popBreaches(css())).toEqual([]);
	});

	it("M5: the picked tab's take is inset only — no halo outside the pill", () => {
		expect(
			takeBreaches(
				"@keyframes iz-m-take { from { box-shadow: 0 0 0 4px color-mix(in srgb, #e8c874 45%, transparent), inset 0 0 0 999px rgb(255 255 255 / 0.22); } }",
			),
		).toEqual(["0 0 0 4px color-mix(in srgb, #e8c874 45%, transparent)"]);
		expect(
			takeBreaches("@keyframes iz-m-take { from { opacity: 0; } }"),
		).toEqual(["no box-shadow in @keyframes iz-m-take"]);
		expect(takeBreaches(css())).toEqual([]);
	});

	it("reduced motion: the forced transition list moves nothing", () => {
		expect(
			reduceTransitionBreaches(
				"@media (prefers-reduced-motion: reduce) { .a { transition-property: color, transform !important; } }",
			),
		).toEqual(["transform"]);
		expect(
			reduceTransitionBreaches(
				"@media (prefers-reduced-motion: no-preference) { .a { transition-property: color !important; } }",
			),
		).toEqual(["no transition-property !important under reduced motion"]);
		expect(reduceTransitionBreaches(css())).toEqual([]);
	});

	it("a closing Radix popper (popover, menu, select) leaves without motion", () => {
		expect(
			radixClosedStill(
				"[data-radix-popper-content-wrapper] > [data-state=closed] { opacity: 0; }",
			),
		).toBe(false);
		expect(
			radixClosedStill(
				"[data-radix-popper-content-wrapper] > [data-state=closed] { animation: none; }",
			),
		).toBe(true);
		expect(radixClosedStill(css())).toBe(true);
	});

	it("the Today KPI link tile's arrow nudges 4px toward where it goes", () => {
		expect(
			kpiArrowNudges("a.iz-portal-kpi:hover > .l > svg { translate: 2px 0; }"),
		).toBe(false);
		expect(
			kpiArrowNudges(
				".x\n\ta.iz-portal-kpi:hover\n\t> .l\n\t> svg { translate: 4px 0; }",
			),
		).toBe(true);
		expect(kpiArrowNudges(css())).toBe(true);
	});

	it("M8: a centred dialog grows in place — it never travels", () => {
		// Its `from` stop keeps the resting centre, translate(-50%, -50%), and
		// adds only a scale. Planted: the legacy pop's drop from below.
		const travels = (source: string) => {
			const stops = stopsOf(parseCss(source), "iz-m-dialog");
			if (stops.length === 0) return ["@keyframes iz-m-dialog not found"];
			return stops.flatMap((s) =>
				s.decls
					.map(decl)
					.filter(
						(d) =>
							["translate", "top", "left", "inset"].includes(d.prop) ||
							(d.prop === "transform" &&
								!/^translate\(\s*-50%\s*,\s*-50%\s*\)(\s+scale\([^)]*\))?$/.test(
									bare(d.value),
								)),
					)
					.map((d) => `${s.prelude} ${d.prop}: ${d.value}`),
			);
		};
		expect(
			travels(
				"@keyframes iz-m-dialog { from { transform: translate(-50%, -46%) scale(0.97); } }",
			),
		).toHaveLength(1);
		expect(
			travels("@keyframes iz-m-dialog { from { translate: 0 8px; } }"),
		).toHaveLength(1);
		expect(travels(".a { color: red; }")).toEqual([
			"@keyframes iz-m-dialog not found",
		]);
		expect(travels(css())).toEqual([]);
	});

	it("M7: a Roster check-in row that opens nothing has no pointer and no hover", () => {
		// The plain <div> rows share `.iz-roster-gps-row` with the <button> rows,
		// whose pointer and violet hover made them look pickable.
		const still = (source: string) => {
			const rules = parseCss(source);
			const rest = rules.find((r) => /div\.iz-roster-gps-row$/.test(r.prelude));
			const hover = rules.find((r) =>
				/div\.iz-roster-gps-row:hover$/.test(r.prelude),
			);
			const props = (r?: Rule) => (r?.decls ?? []).map(decl);
			return (
				props(rest).some((d) => d.prop === "cursor" && d.value === "default") &&
				["border-color", "background"].every((p) =>
					props(hover).some((d) => d.prop === p),
				)
			);
		};
		expect(still(".x div.iz-roster-gps-row { cursor: pointer; }")).toBe(false);
		expect(
			still(
				".x div.iz-roster-gps-row { cursor: default; } .x div.iz-roster-gps-row:hover { border-color: red; background: blue; }",
			),
		).toBe(true);
		expect(still(css())).toBe(true);
	});

	it("nothing staggers: rows and tiles that mount together arrive together", () => {
		// Planted: the ladder this rule removed (M1/M3/M6 before 18 Nov 2026).
		expect(
			staggerBreaches(
				".l > * { animation: iz-m-rise var(--iz-motion-enter) var(--iz-ease-out) var(--iz-motion-step) backwards; } .l > :nth-child(2) { animation-delay: calc(var(--iz-motion-step) * 2); }",
			),
		).toEqual([
			"by position: .l > :nth-child(2) { animation-delay: calc(var(--iz-motion-step) * 2) }",
			"multiplied delay: calc(var(--iz-motion-step) * 2)",
		]);
		// Planted: a ladder driven by an index set inline, and one in a shorthand.
		expect(
			staggerBreaches(".row { animation-delay: calc(var(--i) * 45ms); }"),
		).toEqual(["multiplied delay: calc(var(--i) * 45ms)"]);
		expect(
			staggerBreaches(
				".row { animation: a 360ms ease calc(var(--i) * 45ms) backwards, b 1s; }",
			),
		).toEqual(["multiplied delay: calc(var(--i) * 45ms)"]);
		expect(
			staggerBreaches(".l > :nth-of-type(3) { animation: iz-m-rise 1s; }"),
		).toHaveLength(1);
		// Not a stagger: a multiplied DURATION (M9's shape), a positional reset.
		expect(
			staggerBreaches(
				".c { animation: iz-m-breathe calc(var(--iz-motion-slow) * 4) var(--iz-ease-in-out) infinite; } .l > :nth-child(2) { animation: none; }",
			),
		).toEqual([]);
		expect(staggerBreaches(css())).toEqual([]);
	});

	it("only two lead-ins wait at all: the rail bar's, and the ring after its rise", () => {
		// A new delay changes this list on purpose, so a reviewer sees it arrive.
		expect(
			delaysIn(
				".a { animation: x 1s ease 2s; } .b { animation-delay: 1s, 3s; } .c { animation: y 1s; }",
			),
		).toEqual(["1s", "2s", "3s"]);
		expect(delaysIn(css())).toEqual([
			"var(--iz-motion-enter)",
			"var(--iz-motion-step)",
		]);
	});

	it("every animation sits behind prefers-reduced-motion: no-preference", () => {
		expect(
			ungatedAnimations(
				".a { animation: none; } .b { animation: x 1s; } @media screen and (prefers-reduced-motion: no-preference) { .c { animation: y 1s; } }",
			),
		).toEqual([".b"]);
		expect(ungatedAnimations(css())).toEqual([]);
	});

	it("every selector names the agency or outlet portal, so admin never matches", () => {
		expect(
			unscopedSelectors(
				'.iz-portal:is([data-portal="agency"]) .a, .iz-btn { color: red; } body:is([data-outlet-design]) .b { color: red; }',
			),
		).toEqual([".iz-btn"]);
		expect(unscopedSelectors(css())).toEqual([]);
	});
});

describe("one loop — nothing in the agency or outlet CSS repeats forever", () => {
	// M9 is the one loading loop. The two legacy loops are not loading, so
	// portal-motion.css stops them after three beats.
	const KNOWN = [
		{ file: "portal-motion.css", selector: ".iz-todo__checking" },
		{ file: "prototype-theme.css", selector: ".iz-profile-edit-banner__dot" },
		{
			file: "prototype-theme.css",
			selector: ".iz-outlet-report-range-legend-item.is-end",
		},
	];

	it("finds only the three known loops (the scan reads prototype-theme.css)", () => {
		const files = SCAN_DIRS.flatMap((d) =>
			walk(join(SRC, d), (n) => n.endsWith(".css")),
		);
		expect(files.map((f) => basename(f))).toContain("prototype-theme.css");
		const loops = files.flatMap((f) =>
			parseCss(readFileSync(f, "utf8"))
				.filter((r) => r.decls.some((d) => /\binfinite\b/.test(d)))
				.map((r) => ({ file: basename(f), rule: r })),
		);
		// An unknown loop shows up here under its own selector.
		const found = loops.map(({ file, rule }) => {
			const known = KNOWN.find(
				(k) => k.file === file && rule.prelude.includes(k.selector),
			);
			return `${file} ${known?.selector ?? rule.prelude}`;
		});
		expect(found.sort()).toEqual(
			KNOWN.map(({ file, selector }) => `${file} ${selector}`).sort(),
		);
		const m9 = loops.find(({ file }) => file === "portal-motion.css");
		expect(m9 && under(m9.rule, NO_PREFERENCE)).toBe(true);
	});

	it("no agency or outlet stylesheet staggers by position (the scan reads them all)", () => {
		const files = SCAN_DIRS.flatMap((d) =>
			walk(join(SRC, d), (n) => n.endsWith(".css")),
		);
		expect(files.map((f) => basename(f))).toContain("prototype-theme.css");
		expect(files.map((f) => basename(f))).toContain("portal-motion.css");
		const found = files.flatMap((f) =>
			staggerBreaches(readFileSync(f, "utf8")).map(
				(b) => `${basename(f)} ${b}`,
			),
		);
		expect(found).toEqual([]);
	});

	it("stops both legacy loops after three beats", () => {
		const cap = parseCss(readFileSync(MOTION_CSS, "utf8")).find(
			(r) =>
				under(r, NO_PREFERENCE) &&
				r.decls
					.map(decl)
					.some(
						(d) => d.prop === "animation-iteration-count" && d.value === "3",
					),
		);
		expect(cap?.prelude).toContain(KNOWN[1].selector);
		expect(cap?.prelude).toContain(KNOWN[2].selector);
	});
});

describe("agency and outlet markup — loops are guarded, nothing leaves with motion", () => {
	const files = SCAN_DIRS.flatMap((d) =>
		walk(
			join(SRC, d),
			(n) => /\.(ts|tsx)$/.test(n) && n !== SELF && !n.endsWith(".d.ts"),
		),
	).map((path) => ({ path: rel(path), text: readFileSync(path, "utf8") }));
	const hits = (needle: string) =>
		files.flatMap(({ path, text }) =>
			text.split(needle).length > 1
				? Array.from({ length: text.split(needle).length - 1 }, () => path)
				: [],
		);

	it("scans the three portal trees", () => {
		const paths = files.map((f) => f.path);
		expect(paths.some((p) => p.startsWith("agency-portal/"))).toBe(true);
		expect(paths.some((p) => p.startsWith("routes/agency/"))).toBe(true);
		expect(paths.some((p) => p.startsWith("routes/outlet/"))).toBe(true);
	});

	it("has no ping or bounce loop, and pulse only in the unwired skeleton copy", () => {
		expect(hits("animate-ping")).toEqual([]);
		expect(hits("animate-bounce")).toEqual([]);
		expect(hits("animate-pulse")).toEqual([
			"agency-portal/components/ui/skeleton.tsx",
		]);
	});

	it("paints no act button with the old gradient or a gold glow", () => {
		// The approved act colour is flat violet with no glow; these two forms
		// were the last glowing gradient buttons (UnchargedFeesPanel, Payroll's
		// bulk chip, before 18 Nov 2026). Planted: HEAD's class string.
		const planted =
			'className="rounded-lg [background:var(--iz-grad-accent)] shadow-[0_10px_22px_-12px_rgba(201,155,78,0.6)]"';
		expect(planted.split("iz-grad-accent").length - 1).toBe(1);
		expect(/shadow-\[[^\]]*rgba\(201,\s*155,\s*78/.test(planted)).toBe(true);
		expect(hits("iz-grad-accent")).toEqual([]);
		expect(
			files
				.filter(({ text }) =>
					/shadow-\[[^\]]*rgba\(201,\s*155,\s*78/.test(text),
				)
				.map((f) => f.path),
		).toEqual([]);
	});

	it("sets no per-item animation delay in markup either", () => {
		// The needle is the React prop a stagger uses (planted: one that has it).
		const planted = "style={{ animationDelay: i * 45 }}";
		expect(planted.split("animationDelay").length - 1).toBe(1);
		expect(hits("animationDelay")).toEqual([]);
		expect(hits("animation-delay")).toEqual([]);
		// framer-motion's form (the parked landing page uses it; no portal does).
		expect(hits("staggerChildren")).toEqual([]);
	});

	it("spins a loader only when the reader allows motion", () => {
		// A new spinner changes this count on purpose: it is a loop, so a
		// reviewer should see it arrive.
		const spins = hits("animate-spin");
		expect(spins.sort()).toEqual([
			"agency-portal/components/agency/CutlostDetailPanel.tsx",
			"agency-portal/components/auth/AccountAvatarCard.tsx",
			"agency-portal/components/org/PendingMembersPanel.tsx",
		]);
		expect(hits("motion-safe:animate-spin")).toEqual(hits("animate-spin"));
	});

	it("lets a dialog, confirm dialog and popover close without an exit animation", () => {
		const UI = [
			"agency-portal/components/ui/dialog.tsx",
			"agency-portal/components/ui/alert-dialog.tsx",
			"agency-portal/components/ui/popover.tsx",
		];
		for (const path of UI) {
			const file = files.find((f) => f.path === path);
			expect(file, path).toBeDefined();
			expect(file?.text).toContain("motion-safe:data-[state=open]:animate-in");
			expect(file?.text).not.toContain("data-[state=closed]:animate-out");
		}
	});

	it("glides a scroll only through portalScrollBehavior()", () => {
		const helper = files.find(
			(f) => f.path === "agency-portal/lib/motion-scroll.ts",
		);
		expect(helper?.text).toContain('"smooth"');
		expect(
			hits('behavior: "smooth"').filter(
				(p) => p !== "agency-portal/lib/motion-scroll.ts",
			),
		).toEqual([]);
		expect(hits("behavior: portalScrollBehavior()").length).toBeGreaterThan(0);
	});
});
