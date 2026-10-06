/**
 * The landing chat's SYSTEM sections — built from the code on every
 * `pnpm chat:facts`, so the chat follows the product without anyone rewriting
 * the guide (owner, 5 Oct 2026: "the chatbot need read from my system flow,
 * database structure, data, and md files").
 *
 *   the database ...... every Drizzle table in apps/backend/src/**\/*.model.ts
 *   who can do what ... the permission snapshot rbac:sync writes from role_permission
 *   the pages ......... the portal menus (ALL_NAV + the shell's extras) and the
 *                       phone app's bottom tabs, named the way each screen names them
 *   what's new ........ TEST_SCRIPT.md §11, the public half of the changelog
 *
 * Public words come from landing-chat-system.ts. Anything the code has and that
 * file does not — a new table, a newly checked permission, a menu label with no
 * translation — STOPS the build with what to add, and CI's `chat:facts:check`
 * fails a pull request while the facts are stale. Live ROWS are never read: the
 * facts go to an outside model and to anonymous visitors, so they carry the
 * system's shape, never its data.
 *
 * ⚠️ What this does NOT follow (independent trace, 5 Oct 2026): column changes,
 * how a page works inside (steps, buttons, money rules — those live only in the
 * hand-written guide), a team lane that sync-rbac-matrix.mjs does not list, a
 * permission changed in the database without `pnpm rbac:sync` (the snapshot is
 * read from the TEST database), and a lane gate tightened on the server only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AGENCY_ROLE_GRANTS, OUTLET_ROLE_GRANTS } from "../../apps/web/src/agency-portal/lib/rbac-grants.generated.ts";
import type { ReferenceSection } from "../../apps/web/src/components/landing/handoff/landing-chat-reference.ts";
import {
	GRANT_PHRASES,
	LANE_ROLE_KEY,
	MATRIX_PHRASES,
	type PublicSide,
	TABLE_SENTENCES,
	TEAM_NOTES,
	type TableSentence,
} from "../../apps/web/src/components/landing/handoff/landing-chat-system.ts";
import { translations as portalText } from "../../apps/web/src/lib/portal-i18n/translations.ts";
import { translations as appText } from "../../apps/mobile/src/i18n/translations.ts";

type Locale = "en" | "zh";
type Text = Record<Locale, { title: string; lines: string[] }>;

const LOCALES: Locale[] = ["en", "zh"];

/** Everything the code has that landing-chat-system.ts does not — reported together. */
class Gaps {
	readonly list: string[] = [];
	add(line: string) {
		this.list.push(line);
	}
}

const quote = (locale: Locale, label: string) => (locale === "en" ? `“${label}”` : `「${label}」`);

function list(locale: Locale, items: string[]): string {
	if (locale === "zh") return items.join("、");
	if (items.length < 2) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Strips comments so a commented-out table or menu item is not mistaken for a live one. */
function withoutComments(code: string): string {
	return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name === "dist") continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path, out);
		else out.push(path);
	}
	return out;
}

/* ------------------------------------------------------------- database -- */

export function modelTables(root: string): string[] {
	const names = new Set<string>();
	for (const file of walk(resolve(root, "apps/backend/src"))) {
		if (!file.endsWith(".model.ts")) continue;
		const code = withoutComments(readFileSync(file, "utf8"));
		// `MainSchema.table(` and `pgTable(` — the name may sit on the next line.
		for (const m of code.matchAll(/(?:\.table|pgTable)\(\s*['"]([a-z0-9_]+)['"]/g)) names.add(m[1]);
	}
	// A zero result is evidence about the instrument: the schema has had 50+ tables
	// since August 2026, so a short list means the parse broke, not the database.
	if (names.size < 40) {
		throw new Error(`found only ${names.size} tables in the backend models — the table parse is broken`);
	}
	return [...names].sort();
}

const KEEPS_TITLE: Record<PublicSide, Record<Locale, string>> = {
	pr: { en: "What InnocenZ keeps for PRs", zh: "InnocenZ 为 PR 保存的记录" },
	agency: { en: "What InnocenZ keeps for agencies", zh: "InnocenZ 为经纪公司保存的记录" },
	outlet: { en: "What InnocenZ keeps for outlets", zh: "InnocenZ 为场所保存的记录" },
	any: { en: "What InnocenZ keeps for everyone", zh: "InnocenZ 保存的通用记录" },
};

const KEEPS_LEAD: Record<Locale, string> = {
	en: "The kinds of records InnocenZ keeps, in plain words:",
	zh: "InnocenZ 保存的记录类型：",
};

function dataSections(root: string, gaps: Gaps): ReferenceSection[] {
	const tables = modelTables(root);
	for (const t of tables) {
		if (!TABLE_SENTENCES[t]) {
			gaps.add(`database table "${t}" has no public sentence — add one to TABLE_SENTENCES, or hide it with a reason`);
		}
	}
	for (const t of Object.keys(TABLE_SENTENCES)) {
		if (!tables.includes(t)) {
			gaps.add(`TABLE_SENTENCES describes "${t}", which is no longer a table — remove it`);
		}
	}
	const bySide = new Map<PublicSide, TableSentence[]>();
	for (const t of tables) {
		const entry = TABLE_SENTENCES[t];
		if (!entry || "hidden" in entry) continue;
		const group = bySide.get(entry.side) ?? [];
		if (!group.some((s) => s.en === entry.en)) group.push(entry);
		bySide.set(entry.side, group);
	}
	const sides: PublicSide[] = ["pr", "agency", "outlet", "any"];
	return sides
		.filter((side) => bySide.has(side))
		.map((side) => {
			const rows = bySide.get(side) ?? [];
			const text = Object.fromEntries(
				LOCALES.map((l) => [
					l,
					{ title: KEEPS_TITLE[side][l], lines: [KEEPS_LEAD[l], ...rows.map((r) => `- ${r[l]}`)] },
				]),
			) as Text;
			return { id: `auto-keeps-${side}`, role: side, ...text };
		});
}

/* ---------------------------------------------------------- permissions -- */

type Portal = "outlet" | "agency";

const TEAM_TITLE: Record<Portal, Record<Locale, string>> = {
	outlet: { en: "Who can do what in an outlet team", zh: "场所团队里谁能做什么" },
	agency: { en: "Who can do what in an agency team", zh: "经纪公司团队里谁能做什么" },
};

const TEAM_LEAD: Record<Locale, string> = {
	en: "Each team member's role decides what they can do. This list comes from InnocenZ's own permission settings:",
	zh: "每位团队成员的角色决定了他能做什么。以下内容来自 InnocenZ 的权限设置：",
};

const CAN: Record<Locale, { can: string; cannot: string; sep: string; end: string }> = {
	en: { can: "can", cannot: "Cannot", sep: "; ", end: "." },
	zh: { can: "可以", cannot: "不可以", sep: "；", end: "。" },
};

function roleName(lane: string, locale: Locale, gaps: Gaps): string {
	const key = LANE_ROLE_KEY[lane];
	const profile = portalText[locale].profile as Record<string, unknown>;
	const name = key ? profile[key] : undefined;
	if (typeof name !== "string") {
		gaps.add(`team lane "${lane}" has no role name — map it in LANE_ROLE_KEY to a profile.role… label`);
		return lane;
	}
	return name;
}

/** Lines of a source file that are not comments — a commented-out gate opens nothing. */
function liveCode(code: string): string {
	return code
		.split("\n")
		.filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
		.join("\n");
}

/** A `const NAME … = {` block of a source file, up to its closing `};`. */
function constBlock(root: string, file: string, name: string): string {
	const code = readFileSync(resolve(root, file), "utf8");
	const start = code.search(new RegExp(`const ${name}\\b`));
	const end = start < 0 ? -1 : code.indexOf("\n};", start);
	if (start < 0 || end < 0) throw new Error(`${file} has no ${name} — the permission parse is broken`);
	return withoutComments(code.slice(start, end));
}

/**
 * Every `module:verb` something actually CHECKS: the portals' feature map
 * (module-permissions.ts) and every server `requirePermission(…)`. A row nothing
 * checks unlocks nothing, so it is never described; a row something checks must be.
 */
function usedGrants(root: string): { web: Record<Portal, Set<string>>; server: Set<string> } {
	const file = "apps/web/src/lib/auth/module-permissions.ts";
	const fromWeb = (name: string) =>
		new Set(
			[...constBlock(root, file, name).matchAll(/key:\s*"([a-z_]+)",\s*type:\s*"([a-z]+)"/g)].map(
				(m) => `${m[1]}:${m[2]}`,
			),
		);
	const web = { outlet: fromWeb("OUTLET_FEATURE_MODULE"), agency: fromWeb("AGENCY_FEATURE_MODULE") };
	const server = new Set<string>();
	for (const path of walk(resolve(root, "apps/backend/src"))) {
		if (!path.endsWith(".ts") || /\.(test|spec)\.ts$/.test(path)) continue;
		const code = liveCode(readFileSync(path, "utf8"));
		// All three gate shapes (review, 5 Oct 2026): the plain one, and the two
		// membership-aware helpers — on one line or the formatter's multi-line form
		// with a trailing comma.
		for (const m of code.matchAll(
			/(?:requirePermission|requireOutletPermissionIfMember|requireAgencyPermissionIfNotOutletMember)\(\s*'([a-z_]+)'\s*,\s*'([a-z]+)'\s*,?\s*\)/g,
		)) {
			server.add(`${m[1]}:${m[2]}`);
		}
	}
	if (web.outlet.size < 5 || web.agency.size < 5 || server.size < 5) {
		throw new Error(
			`found only ${web.outlet.size}/${web.agency.size} web and ${server.size} server permission checks — the parse is broken`,
		);
	}
	return { web, server };
}

/** `MATRIX_ONLY` in a portal matrix: permission → the lanes that hold it. */
function matrixOnly(root: string, side: Portal): Map<string, string[]> {
	const block = constBlock(root, `apps/web/src/agency-portal/lib/${side}-rbac.ts`, "MATRIX_ONLY");
	const out = new Map<string, string[]>();
	for (const m of block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
		out.set(m[1], [...m[2].matchAll(/"([a-z_]+)"/g)].map((l) => l[1]));
	}
	if (out.size === 0) throw new Error(`${side}-rbac.ts MATRIX_ONLY has no entries — the parse is broken`);
	return out;
}

/**
 * The one lane rule no matrix carries — subscription pay is the owner's alone —
 * is hand-worded in TEAM_NOTES, so check the gate it describes is still there.
 */
function checkPayRule(root: string, gaps: Gaps) {
	const gate = readFileSync(resolve(root, "apps/backend/src/middlewares/require-sub-role.ts"), "utf8");
	const start = gate.indexOf("export async function resolveOrgOwnerPayer");
	const body = start < 0 ? "" : liveCode(gate.slice(start, gate.indexOf("\nexport ", start + 10)));
	// EVERY owner check in the resolver must keep the guarantor out (`, false`):
	// counting "at least two" let two of the four be loosened unnoticed (review).
	const ownerChecks = body.match(/Lane\([^)]*\['owner'\][^)]*\)/g) ?? [];
	const ownerOnly = ownerChecks.filter((c) => /\['owner'\],\s*false\s*\)$/.test(c)).length;
	const folded = ownerChecks.length === 0 || ownerOnly !== ownerChecks.length;
	const routes = ["payment-method/payment-method.routes.ts", "subscription-payment/subscription-payment.routes.ts"].every(
		(f) => readFileSync(resolve(root, "apps/backend/src/features", f), "utf8").includes("orgOwnerPaysOnly"),
	);
	if (ownerOnly < 1 || folded || !routes) {
		gaps.add("the owner-only subscription-pay gate (resolveOrgOwnerPayer / orgOwnerPaysOnly) changed — re-check TEAM_NOTES");
	}
}

function teamSection(
	root: string,
	side: Portal,
	grants: Record<string, readonly string[]>,
	used: ReturnType<typeof usedGrants>,
	gaps: Gaps,
): ReferenceSection {
	const phrases = GRANT_PHRASES[side];
	const modules = new Set(Object.values(grants).flatMap((held) => held.map((g) => g.split(":")[0])));
	const checked = new Set([...used.web[side], ...[...used.server].filter((g) => modules.has(g.split(":")[0]))]);
	for (const grant of checked) {
		if (!phrases[grant]) gaps.add(`${side} permission "${grant}" is checked by the code but has no GRANT_PHRASES entry`);
	}
	for (const grant of Object.keys(phrases)) {
		if (!checked.has(grant)) gaps.add(`GRANT_PHRASES.${side} describes "${grant}", which nothing checks any more — remove it`);
	}
	const shown = Object.entries(phrases).filter(
		(e): e is [string, { en: string; zh: string }] => checked.has(e[0]) && !("hidden" in e[1]),
	);
	const matrix = matrixOnly(root, side);
	for (const [permission, lanes] of matrix) {
		if (!MATRIX_PHRASES[permission]) gaps.add(`${side} MATRIX_ONLY "${permission}" has no MATRIX_PHRASES entry`);
		for (const lane of lanes) if (!(lane in grants)) gaps.add(`${side} MATRIX_ONLY "${permission}" names unknown lane "${lane}"`);
	}
	const text = Object.fromEntries(
		LOCALES.map((l) => {
			const w = CAN[l];
			const lines = [TEAM_LEAD[l]];
			for (const [lane, held] of Object.entries(grants)) {
				const can: string[] = [];
				const cannot: string[] = [];
				for (const [grant, phrase] of shown) (held.includes(grant) ? can : cannot).push(phrase[l]);
				for (const [permission, lanes] of matrix) {
					const phrase = MATRIX_PHRASES[permission];
					if (phrase) (lanes.includes(lane) ? can : cannot).push(phrase[l]);
				}
				const parts = [`${w.can}: ${can.join(w.sep)}${w.end}`];
				if (cannot.length > 0) parts.push(`${w.cannot}: ${cannot.join(w.sep)}${w.end}`);
				lines.push(`- ${roleName(lane, l, gaps)} — ${parts.join(" ")}`);
			}
			lines.push(...TEAM_NOTES[side][l].map((note) => `- ${note}`));
			return [l, { title: TEAM_TITLE[side][l], lines }];
		}),
	) as Text;
	return { id: `auto-team-${side}`, role: side, ...text };
}

/* ---------------------------------------------------------------- pages -- */

/** The `label:` values of a live (uncommented) menu array, in order. */
function menuLabels(root: string, file: string, name: string, gaps: Gaps): string[] {
	const code = readFileSync(resolve(root, file), "utf8");
	const start = code.indexOf(`const ${name}`);
	const end = start < 0 ? -1 : code.indexOf("\n];", start);
	if (start < 0 || end < 0) {
		gaps.add(`${file} no longer has a "${name}" menu — update landing-chat-system-facts.mts`);
		return [];
	}
	const labels = [...withoutComments(code.slice(start, end)).matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
	if (labels.length === 0) gaps.add(`${file} "${name}" has no labels — the menu parse is broken`);
	return labels;
}

function portalNavKeys(root: string): Map<string, string> {
	const file = "apps/web/src/agency-portal/components/portal/PortalShell.tsx";
	const code = readFileSync(resolve(root, file), "utf8");
	const start = code.indexOf("const NAV_KEY_BY_LABEL");
	const end = code.indexOf("\n};", start);
	const keys = new Map<string, string>();
	if (start >= 0 && end >= 0) {
		for (const m of code.slice(start, end).matchAll(/^\s*(?:"([^"]+)"|(\w+)):\s*"(\w+)"/gm)) {
			keys.set(m[1] ?? m[2], m[3]);
		}
	}
	if (keys.size === 0) throw new Error(`${file} NAV_KEY_BY_LABEL not found — the page-name parse is broken`);
	return keys;
}

const MENU_TITLE: Record<"outlet" | "agency" | "pr", Record<Locale, string>> = {
	agency: { en: "The agency portal's menu", zh: "经纪公司后台的菜单" },
	outlet: { en: "The outlet portal's menu", zh: "场所后台的菜单" },
	pr: { en: "The InnocenZ app's tabs", zh: "InnocenZ 手机应用的分页" },
};

function portalMenu(root: string, side: "outlet" | "agency", keys: Map<string, string>, gaps: Gaps): ReferenceSection {
	const rbac = `apps/web/src/agency-portal/lib/${side}-rbac.ts`;
	const shell = "apps/web/src/agency-portal/components/portal/PortalShell.tsx";
	const main = menuLabels(root, rbac, "ALL_NAV", gaps);
	const extras = menuLabels(root, shell, side === "agency" ? "AGENCY_EXTRAS" : "OUTLET_EXTRAS", gaps);
	const named = (locale: Locale, labels: string[]) =>
		labels.map((label) => {
			const key = keys.get(label);
			const name = key ? (portalText[locale].nav as Record<string, unknown>)[key] : undefined;
			if (typeof name !== "string") {
				if (locale === "en") gaps.add(`${side} menu page "${label}" has no translated name in NAV_KEY_BY_LABEL / portal nav`);
				return quote(locale, label);
			}
			return quote(locale, name);
		});
	const team = TEAM_TITLE[side];
	const text: Text = {
		en: {
			title: MENU_TITLE[side].en,
			lines: [
				`The ${side} portal's menu, top to bottom: ${list("en", named("en", main))}; then ${list("en", named("en", extras))}.`,
				`Each team member sees only the pages their role allows (see “${team.en}”).`,
			],
		},
		zh: {
			title: MENU_TITLE[side].zh,
			lines: [
				`${side === "agency" ? "经纪公司" : "场所"}后台的菜单，从上到下：${list("zh", named("zh", main))}；然后是${list("zh", named("zh", extras))}。`,
				`每位团队成员只会看到自己角色允许的页面（见「${team.zh}」）。`,
			],
		},
	};
	return { id: `auto-menu-${side}`, role: side, ...text };
}

function appMenu(root: string, gaps: Gaps): ReferenceSection {
	const file = "apps/mobile/src/components/BottomNav.tsx";
	const code = withoutComments(readFileSync(resolve(root, file), "utf8"));
	const tabs = [...code.matchAll(/key:\s*'(\w+)',\s*label:\s*t\.nav\.(\w+)/g)];
	const keys = tabs.map((m) => m[2]);
	// Cross-check the parse against the tab TYPE, so a tab written another way is
	// never silently dropped from the list (and from the "N tabs" count).
	const union = code.match(/type PrTab\s*=\s*([^;]+);/)?.[1].match(/'(\w+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
	const parsed = tabs.map((m) => m[1]);
	if (keys.length === 0 || union.length !== parsed.length || union.some((k) => !parsed.includes(k))) {
		gaps.add(`${file}: the tabs read (${parsed.join(", ")}) do not match PrTab (${union.join(", ")}) — update appMenu`);
	}
	const named = (locale: Locale) =>
		keys.map((k) => {
			const name = (appText[locale].nav as Record<string, unknown>)[k];
			if (typeof name !== "string") {
				if (locale === "en") gaps.add(`app tab "${k}" has no name in the app's nav translations`);
				return quote(locale, k);
			}
			return quote(locale, name);
		});
	return {
		id: "auto-menu-pr",
		role: "pr",
		en: {
			title: MENU_TITLE.pr.en,
			lines: [`The InnocenZ phone app has ${keys.length} tabs along the bottom, left to right: ${list("en", named("en"))}.`],
		},
		zh: {
			title: MENU_TITLE.pr.zh,
			lines: [`InnocenZ 手机应用底部有 ${keys.length} 个分页，从左到右：${list("zh", named("zh"))}。`],
		},
	};
}

/* ----------------------------------------------------------- what's new -- */

const NEW_TITLE: Record<Locale, string> = { en: "What's new on InnocenZ", zh: "InnocenZ 最新更新" };
const NEW_PER_SIDE = 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface NewRow {
	date: string;
	side: PublicSide;
	en: string;
	zh: string;
}

/** The rows of TEST_SCRIPT.md "## 11." — `| 2026-10-05 | outlet | English | 中文 |`. */
export function whatsNewRows(root: string): NewRow[] {
	const text = readFileSync(resolve(root, "TEST_SCRIPT.md"), "utf8").replace(/\r\n/g, "\n");
	const start = text.search(/^## 11\. /m);
	if (start < 0) throw new Error("TEST_SCRIPT.md has no “## 11.” What's new section — the chat reads it");
	const after = text.slice(start + 1);
	const stop = after.search(/^(## |---$)/m);
	const body = stop < 0 ? after : after.slice(0, stop);
	const rows: NewRow[] = [];
	for (const line of body.split("\n")) {
		if (!line.startsWith("|")) continue;
		const cells = line.split("|").slice(1, -1).map((c) => c.trim());
		if (/^:?-+:?$/.test(cells[0] ?? "") || /^date$/i.test(cells[0] ?? "")) continue;
		const [date, side, en, zh] = cells;
		const [, month, day] = (date ?? "").split("-").map(Number);
		if (
			cells.length !== 4 ||
			!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			!(month >= 1 && month <= 12 && day >= 1 && day <= 31) ||
			!["pr", "agency", "outlet", "any"].includes(side) ||
			!en ||
			!zh
		) {
			throw new Error(`TEST_SCRIPT.md §11 row is not "| YYYY-MM-DD | pr/agency/outlet/any | English | 中文 |": ${line.slice(0, 80)}`);
		}
		rows.push({ date, side: side as PublicSide, en, zh });
	}
	return rows.sort((a, b) => b.date.localeCompare(a.date));
}

function newSections(root: string): ReferenceSection[] {
	const rows = whatsNewRows(root);
	const sides: PublicSide[] = ["pr", "agency", "outlet", "any"];
	const day = (d: string) => {
		const [y, m, dd] = d.split("-").map(Number);
		return { en: `${dd} ${MONTHS[m - 1]} ${y}`, zh: `${y}年${m}月${dd}日` };
	};
	return sides
		.map((side) => rows.filter((r) => r.side === side).slice(0, NEW_PER_SIDE))
		.filter((picked) => picked.length > 0)
		.map((picked) => ({
			id: `auto-new-${picked[0].side}`,
			role: picked[0].side,
			en: { title: NEW_TITLE.en, lines: picked.map((r) => `- ${day(r.date).en}: ${r.en}`) },
			zh: { title: NEW_TITLE.zh, lines: picked.map((r) => `- ${day(r.date).zh}：${r.zh}`) },
		}));
}

/* ---------------------------------------------------------------- build -- */

/**
 * Every system section, or an Error listing everything the code has that the
 * public wording does not. Bullets only ("- "): a numbered "N) Page:" line would
 * register that page to the section's side in the server's page-side guard.
 */
export function buildSystemSections(root: string): ReferenceSection[] {
	const gaps = new Gaps();
	const keys = portalNavKeys(root);
	const used = usedGrants(root);
	checkPayRule(root, gaps);
	const sections = [
		appMenu(root, gaps),
		portalMenu(root, "agency", keys, gaps),
		portalMenu(root, "outlet", keys, gaps),
		teamSection(root, "agency", AGENCY_ROLE_GRANTS, used, gaps),
		teamSection(root, "outlet", OUTLET_ROLE_GRANTS, used, gaps),
		...dataSections(root, gaps),
		...newSections(root),
	];
	if (gaps.list.length > 0) {
		throw new Error(
			`the chat cannot describe the system yet — fix landing-chat-system.ts:\n  · ${[...new Set(gaps.list)].join("\n  · ")}`,
		);
	}
	return sections;
}
