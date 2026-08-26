#!/usr/bin/env node
/**
 * Find user-visible English strings that are not yet wired to the portal
 * dictionary. READ-ONLY — it never edits a file.
 *
 * usage:
 *   node .claude/skills/portal-i18n/scan.mjs <path...> [--summary] [--json]
 *
 *   <path>      file or directory (recurses into .ts/.tsx)
 *   --summary   ranked counts only, no per-string detail
 *   --json      machine-readable, for piping
 *
 * Every hit is a CANDIDATE, not a verdict. The scanner cannot tell a button
 * label from an API enum, so read SKILL.md before acting on the output — a
 * string that is stored, compared or POSTed must stay English.
 *
 * Known blind spots, each of which cost a re-do at some point:
 *  - JSX text broken across a nested element (`<b>Save</b> changes`) is seen
 *    as two fragments.
 *  - Strings assembled from variables at runtime are invisible.
 *  - A `.ts` config module that feeds labels into a component is only found
 *    if you point the scanner at it; check the component's imports too.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const SUMMARY = args.includes("--summary");
const JSON_OUT = args.includes("--json");
const TARGETS = args.filter((a) => !a.startsWith("--"));

if (TARGETS.length === 0) {
	console.error(
		"usage: node scan.mjs <file-or-dir>... [--summary] [--json]\n" +
			"  e.g. node .claude/skills/portal-i18n/scan.mjs apps/web/src/routes/admin",
	);
	process.exit(2);
}

/** Directories that never hold user-facing copy. */
const SKIP_DIR =
	/(^|[\\/])(node_modules|dist|build|\.output|\.git|coverage)([\\/]|$)/;
/**
 * Generated code, and the dictionaries themselves — a dictionary is SUPPOSED
 * to be full of English, so scanning one reports its whole EN half as work.
 * `src/i18n/` is the PR mobile app's dictionary; it does not sit under `lib/`
 * like the web one, so it needs its own arm or a mobile scan opens with ~700
 * phantom hits in the two files that are already finished.
 */
const SKIP_FILE =
	/routeTree\.gen\.|[\\/]lib[\\/](portal-i18n|landing-i18n)[\\/]|[\\/]src[\\/]i18n[\\/]/;

/**
 * Values that LOOK like prose but are class names, format strings, enum
 * members or module paths.
 */
const NOISE =
	/^(iz-|min-|max-|text-|flex|h-|w-|mt-|mb-|ml-|mr-|p-|px-|py-|gap|absolute|relative|grid|border|inline|justify|items|overflow|shrink|truncate|rounded|font-|leading|whitespace|space-|hidden|block|uppercase|lowercase|capitalize|tracking|bg-|top-|left-|right-|bottom-|z-|col-|row-|sm:|md:|lg:|xl:|number|button|checkbox|radio|submit|div|span|@|\.\/|\.\.\/|react|lucide|date-fns|sonner|zod|en-|decimal|currency|2-digit|yyyy|MMM|HH:mm|application\/|image\/|multipart\/|utf-8|POST|GET|PATCH|PUT|DELETE)/;

/**
 * Looks like code that happened to sit between a `>` and a `<`. The last two
 * arms catch fragments sliced out of a ternary — `) : null`, `) : logoUri ? (`,
 * `missedIds.has(a.id)) ? …` — which a `>…<` match produces constantly in
 * React Native, where conditional rendering is the norm.
 */
const CODE_ISH =
	/=>|&&|\|\||===|!==|\?\.|\.\.\.|\breturn\b|\bconst\b|\btypeof\b|\)\s*[?:]|\w\.\w+\(/;

/** TS type noise the JSX matcher picks up from generics. */
const TYPE_ISH =
	/^(void|null|undefined|string|number|boolean|unknown|any|Partial|Required|Record|Set|Map|Array|Promise|ReactNode|React\.|typeof)\b/;

function walk(target, acc) {
	const st = fs.statSync(target);
	if (st.isDirectory()) {
		if (SKIP_DIR.test(target)) return acc;
		for (const e of fs.readdirSync(target)) walk(path.join(target, e), acc);
		return acc;
	}
	if (!/\.(tsx?|jsx?)$/.test(target)) return acc;
	if (SKIP_DIR.test(target) || SKIP_FILE.test(target)) return acc;
	acc.push(target);
	return acc;
}

/** Strip `{...}` expression containers, keeping the literal text around them. */
function stripExpressions(s) {
	let out = "";
	let depth = 0;
	for (const ch of s) {
		if (ch === "{") depth++;
		else if (ch === "}") depth = Math.max(0, depth - 1);
		else if (depth === 0) out += ch;
	}
	return out;
}

/**
 * A run of utility classes reads as several words but is styling. Judged on
 * the shape of the TOKENS, not a prefix list, because the class set keeps
 * growing (`!text-[#1a1726]`, `md:grid-cols-[2fr_96px]`, `bg-card/50`).
 */
function looksLikeClassNames(v) {
	const tokens = v.split(/\s+/).filter(Boolean);
	if (tokens.length < 2) return false;
	const styley = tokens.filter((tk) => /[-:[\]/]|^!/.test(tk)).length;
	return styley / tokens.length >= 0.6;
}

function isProse(v) {
	if (!v) return false;
	if (NOISE.test(v)) return false;
	if (looksLikeClassNames(v)) return false;
	if (TYPE_ISH.test(v)) return false;
	if (!/[A-Za-z]{2}/.test(v)) return false;
	// A short all-caps token is an enum or an abbreviation, not copy.
	if (/^[A-Z0-9_]+$/.test(v) && v.length < 6) return false;
	// A single token with a camelCase hump is an identifier — a field name, a
	// query key, an element id. Real copy that is one word ("Cancel", "Next")
	// has no hump, so this does not swallow it.
	if (!/\s/.test(v) && /[a-z][A-Z]/.test(v)) return false;
	// Begins on a closing bracket or ends on an opening one: a fragment sliced
	// out of the middle of an expression, never a whole sentence.
	if (/^[)\]}]|[([{]$/.test(v)) return false;
	return true;
}

/**
 * Blank out comments, preserving line count. Without this, prose QUOTED inside
 * a block comment — `owner: "dont hide the address"` — is reported as shippable
 * copy. The per-line `^\*` filter never caught those: a wrapped comment line
 * does not start with `*`.
 *
 * Heuristic, not a parser: a `/*` inside a string literal would over-strip. No
 * such case exists in this repo, and the failure mode is a MISSED candidate in
 * one file rather than a wrong edit.
 */
function stripComments(src) {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
		// `//` only when not part of a URL scheme (`https://`).
		.replace(/(^|[^:"'`\w])\/\/[^\n]*/g, (_m, lead) => lead);
}

function scanFile(file) {
	const raw = fs.readFileSync(file, "utf8");
	const src = stripComments(raw);
	const hits = new Map(); // text -> kind

	/*
	 * JSX text. Deliberately allows `{...}` INSIDE the run and strips it
	 * afterwards, so a sentence interleaved with expressions —
	 * `Showing {n} of {total} items` — is found. Matching on `[^<>{}]` (the
	 * obvious first attempt) skips exactly those sentences without saying so,
	 * which is how several of them shipped in English.
	 */
	for (const m of src.matchAll(/>([^<>]*)</g)) {
		const raw = m[1];
		if (CODE_ISH.test(raw)) continue;
		const v = stripExpressions(raw).trim().replace(/\s+/g, " ");
		if (!isProse(v)) continue;
		hits.set(v.slice(0, 100), raw.includes("{") ? "JSX+expr" : "JSX");
	}

	for (const line of src.split(/\r?\n/)) {
		const t = line.trim();
		if (/^(\/\/|\*|\/\*)/.test(t)) continue; // comments
		if (/^import\b|^export .*\bfrom\b/.test(t)) continue; // module paths

		/*
		 * Quoted values: props, object values, ternary arms, DEFAULT PARAMS.
		 *
		 * BOTH quote styles. `apps/web` is biome (double quotes) but the PR
		 * mobile app is prettier (single), and mobile carries 7509 single-quoted
		 * literals against 607 double. Matching only `"…"` there hides ~92% of
		 * the copy and reports finished-looking zeroes for files that are
		 * visibly English on screen — `Section.tsx` scored 0 while rendering
		 * `{open ? 'Tap to collapse' : 'Tap to expand'}`.
		 *
		 * Double is tried first so an apostrophe inside a double-quoted string
		 * cannot open a bogus single-quoted run.
		 */
		for (const m of line.matchAll(/"([^"\n]{2,120})"|'([^'\n]{2,120})'/g)) {
			const v = m[1] ?? m[2];
			if (!isProse(v)) continue;
			// Require a capital or a space: `"active"` is almost always an enum,
			// `"Active"` or `"no rows"` is almost always copy.
			if (!/[A-Z]/.test(v) && !/\s/.test(v)) continue;
			hits.set(v.slice(0, 100), "LITERAL");
		}

		// Template literals with real words between the interpolations.
		for (const m of line.matchAll(/`([^`\n]*)`/g)) {
			const v = m[1];
			if (NOISE.test(v)) continue;
			const bare = v.replace(/\$\{[^}]*\}/g, " ").trim();
			if (!isProse(bare) || !/[A-Za-z]{3}/.test(bare)) continue;
			// `agency-${id}` and `${id}-error` are React keys and element ids, not
			// sentences: one short word, no spaces, glued to the interpolation by a
			// separator. Real copy has a space somewhere (`Code ${code}`).
			if (!/\s/.test(bare) && bare.length < 12 && /[-_/]/.test(bare)) continue;
			hits.set(v.slice(0, 100), "TEMPLATE");
		}
	}

	/*
	 * Both idioms. Web reads `usePortalLocale` out of `lib/portal-i18n`; the PR
	 * mobile app reads `useLocale` out of `src/i18n`. Testing only for the web
	 * one marks every mobile file `[UNWIRED]`, which reads as "nothing here is
	 * done" for an app that is in fact half translated.
	 */
	const WIRED = /portal-i18n|usePortalLocale|\buseLocale\b|["']\.{1,2}\/.*i18n["']/;

	return {
		file,
		wired: WIRED.test(src),
		hits: [...hits].map(([text, kind]) => ({ kind, text })),
	};
}

const files = [];
for (const target of TARGETS) {
	if (!fs.existsSync(target)) {
		console.error(`no such path: ${target}`);
		process.exit(2);
	}
	walk(target, files);
}

const results = files
	.map(scanFile)
	.filter((r) => r.hits.length > 0)
	.sort((a, b) => b.hits.length - a.hits.length);

if (JSON_OUT) {
	console.log(JSON.stringify({ scanned: files.length, results }, null, 2));
	process.exit(0);
}

const total = results.reduce((n, r) => n + r.hits.length, 0);
console.log(
	`scanned ${files.length} file(s) — ${total} candidate(s) in ${results.length} file(s)\n`,
);

for (const r of results) {
	const flag = r.wired ? "partial" : "UNWIRED";
	console.log(`${String(r.hits.length).padStart(4)}  [${flag}]  ${r.file}`);
	if (SUMMARY) continue;
	for (const h of r.hits) console.log(`        ${h.kind.padEnd(9)} ${h.text}`);
	console.log();
}

if (results.length === 0) console.log("nothing to translate.");
