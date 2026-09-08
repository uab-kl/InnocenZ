#!/usr/bin/env node
/**
 * ENFORCE THE TYPE LADDER. One font, eight sizes, and no exception that is not
 * written down in this file with its reason.
 *
 * Standing rule (owner, 8 Sep 2026): the font, the font styling and the font
 * size are enforced for every new thing added to the code. CLAUDE.md states the
 * rule; this script is the rule made executable, because a rule nothing checks
 * is a rule that erodes. It is exactly what the 7 Sep audit needed: that pass
 * found 27 different font sizes and a "Sora" that was never loaded in any
 * import, with 243 rules silently rendering Arial beside real Manrope.
 *
 * WHAT IT CHECKS, in the portal surfaces only:
 *   A. font-family must be var(--iz-font).
 *   B. font-size must come from the --iz-fs-* ladder, never a raw px value.
 *   C. no Tailwind class that NAMES a font (font-sora / font-manrope / …).
 *   D. no arbitrary Tailwind text size — text-[13px] and its !text-[13px] twin.
 *
 * WHY D LISTS THE `!` VARIANT SEPARATELY: Tailwind's `!` prefix compiles to a
 * DIFFERENT class, so rules written for `.text-[9px]` never matched
 * `!text-[9px]`, and 163 call sites escaped the ladder unnoticed until they
 * were measured in a live browser.
 *
 * Usage:  node tools/scripts/check-portal-typography.mjs [--json]
 * Exits 1 when anything is found, 0 when clean.
 */
import fs from 'node:fs';
import path from 'node:path';

/*
 * The repo root, derived from THIS FILE, never from the working directory.
 *
 * `process.cwd()` looked right and was silently wrong: run from `apps/web` the
 * scan paths resolved to nothing, the script found nothing, and it reported
 * "no NEW violations" — a green light meaning only that it had looked nowhere.
 * A check that passes when it is pointed at an empty directory is worse than no
 * check, because it is trusted.
 */
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');

/** The portal surfaces the ladder governs. */
const SCAN = [
	'apps/web/src/agency-portal',
	'apps/web/src/routes/agency',
	'apps/web/src/routes/outlet',
];

/**
 * The ONLY documented exceptions, each carrying the reason it is allowed.
 *
 * Add to this list rather than silencing the check — an exception with a reason
 * beside it is a decision; a disabled check is an accident waiting to spread.
 */
const EXCEPT = [
	{
		// The printed voucher deliberately keeps Segoe UI + Georgia so the screen
		// matches the PDF and the Excel it is exported to.
		test: (file, line) => /iz-pv-doc/.test(line) || /iz-pv-doc/.test(file),
		why: 'printed voucher matches its PDF/Excel export',
	},
	{
		// Container-query sizes are the sanctioned way to be responsive: every
		// value they can produce is still a ladder step. `clamp()` is NOT here —
		// it interpolates BETWEEN steps, which is why CLAUDE.md bans it.
		test: (_file, line) => /cqw|cqi|container-type/.test(line),
		why: 'container-query size — still lands on ladder steps',
	},
	{
		// The ladder's own definition, and the token that names the font.
		test: (_file, line) => /--iz-fs-|--iz-font\s*:/.test(line),
		why: 'the ladder definition itself',
	},
];

const RULES = [
	{
		id: 'A-font-family',
		files: /\.css$/,
		re: /font-family\s*:\s*([^;]+);/gi,
		ok: (m) => /var\(--iz-font\)/.test(m[1]),
		msg: (m) =>
			`font-family must be var(--iz-font), found: ${m[1].trim().slice(0, 60)}`,
	},
	{
		id: 'B-font-size',
		files: /\.css$/,
		re: /font-size\s*:\s*([^;]+);/gi,
		// `0` HIDES text (a layout trick); it does not choose a size for it.
		ok: (m) =>
			/var\(--iz-fs-/.test(m[1]) || /inherit|100%|1em|^\s*0\s*$/.test(m[1]),
		msg: (m) =>
			`font-size must come from the --iz-fs-* ladder, found: ${m[1].trim().slice(0, 40)}`,
	},
	{
		id: 'C-font-class',
		files: /\.tsx?$/,
		re: /\bfont-(sora|manrope|display|mono)\b/g,
		ok: () => false,
		msg: (m) =>
			`\`font-${m[1]}\` names a font the portals do not load — use iz-heading / iz-nums`,
	},
	{
		id: 'D-arbitrary-size',
		files: /\.tsx?$/,
		re: /!?text-\[[0-9.]+(px|rem|em)\]/g,
		ok: () => false,
		msg: (m) => `${m[0]} is off the ladder — use a step (text-xs … text-3xl)`,
	},
];

function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

const findings = [];
for (const base of SCAN) {
	const abs = path.join(ROOT, base);
	// REFUSE rather than skip. A missing scan root means this check is measuring
	// nothing, and "nothing found" would read as "nothing wrong".
	if (!fs.existsSync(abs)) {
		console.error(`check-portal-typography: scan root missing — ${base}`);
		console.error('Refusing to report a pass on a directory that is not there.');
		process.exit(2);
	}
	for (const file of walk(abs)) {
		const rel = path.relative(ROOT, file).split(path.sep).join('/');
		let text;
		try {
			text = fs.readFileSync(file, 'utf8');
		} catch {
			continue;
		}
		const lines = text.split(/\r?\n/);
		for (const rule of RULES) {
			if (!rule.files.test(file)) continue;
			lines.forEach((line, i) => {
				// Comment-only lines are skipped: prose ABOUT a rule is not a breach
				// of it, and this file's own doc block would otherwise fail it.
				const bare = line.trim();
				if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) {
					return;
				}
				rule.re.lastIndex = 0;
				let m = rule.re.exec(line);
				while (m) {
					if (!rule.ok(m) && !EXCEPT.some((e) => e.test(rel, line))) {
						findings.push({
							file: rel,
							line: i + 1,
							rule: rule.id,
							msg: rule.msg(m),
						});
					}
					m = rule.re.exec(line);
				}
			});
		}
	}
}

/*
 * THE BASELINE — why this is not simply "zero violations".
 *
 * The 7 Sep pass put every RENDERED element on the ladder, but it did that with
 * override layers that remap the old raw values, not by rewriting 774 CSS
 * declarations and 230 call sites. So the source still carries raw sizes that
 * the cascade normalises, and a check demanding zero here would fail on day one
 * and be switched off by day two.
 *
 * The owner's rule is about "every NEW thing added into the code", so that is
 * what is enforced: today's counts are frozen per file+rule, and the check fails
 * when a count GROWS or a new file starts breaking the ladder. Fixing legacy is
 * always allowed — run with --update to bank the improvement, which also makes
 * the baseline a ratchet that can only tighten.
 */
const BASELINE_PATH = path.join(ROOT, 'tools/scripts/portal-typography-baseline.json');

function fingerprint(list) {
	const counts = {};
	for (const f of list) {
		const key = f.file + '::' + f.rule;
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

const current = fingerprint(findings);

if (process.argv.includes('--update')) {
	fs.writeFileSync(
		BASELINE_PATH,
		`${JSON.stringify(current, null, 2)}${String.fromCharCode(10)}`,
	);
	const total = Object.values(current).reduce((a, b) => a + b, 0);
	console.log('Baseline written: ' + Object.keys(current).length + ' file/rule pairs, ' + total + ' known violations.');
	process.exit(0);
}

const baseline = fs.existsSync(BASELINE_PATH)
	? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
	: {};

const regressions = [];
for (const [key, count] of Object.entries(current)) {
	const was = baseline[key] ?? 0;
	if (count > was) {
		const [file, rule] = key.split('::');
		regressions.push({ file, rule, was, now: count, added: count - was });
	}
}

const improvements = Object.entries(baseline).filter(
	([key, was]) => (current[key] ?? 0) < was,
).length;

if (process.argv.includes('--json')) {
	console.log(JSON.stringify({ regressions, current }, null, 2));
	process.exit(regressions.length === 0 ? 0 : 1);
}

if (regressions.length === 0) {
	const total = Object.values(current).reduce((a, b) => a + b, 0);
	console.log('Portal typography: no NEW violations. (' + total + ' known, frozen in the baseline.)');
	if (improvements > 0) {
		console.log(improvements + ' file/rule pair(s) IMPROVED — run with --update to bank it.');
	}
	process.exit(0);
}

console.error('Portal typography: ' + regressions.length + ' file(s) added violations.' + String.fromCharCode(10));
for (const r of regressions) {
	console.error('  ' + r.file);
	console.error('    ' + r.rule + ': ' + r.was + ' -> ' + r.now + '  (+' + r.added + ')');
	/*
	 * The LAST few, not the first.
	 *
	 * Counts alone cannot say WHICH line is the new one, and a file's earliest
	 * breaches are its oldest — printing those sends the reader to legacy code
	 * that was already accepted. New code usually lands at the end of a file or
	 * in a freshly appended block, so the tail is the better guess, and the
	 * heading says plainly that it is a guess.
	 */
	const inFile = findings.filter(
		(f) => f.file === r.file && f.rule === r.rule,
	);
	console.error(`      last ${Math.min(6, inFile.length)} of ${inFile.length} in this file (the added one is likely here):`);
	for (const f of inFile.slice(-6)) {
		console.error(`      line ${f.line}  ${f.msg}`);
	}
	console.error('');
}
console.error('The ladder lives in prototype-theme.css :root -- --iz-fs- micro 11 / tiny 12 /');
console.error('caption 14 / label 16 / body 18 / title 22 / head 28 / display 34.');
console.error('One font: var(--iz-font). A genuine exception goes in EXCEPT[] WITH its reason.');
process.exit(1);
