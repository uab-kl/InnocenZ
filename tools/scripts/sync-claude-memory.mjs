#!/usr/bin/env node
/**
 * Keep the TWO memory stores identical, in BOTH directions, on ANY device.
 *
 *   A  docs/claude-memory/                     — travels in git, so it is what
 *                                                reaches the other machine
 *   B  ~/.claude/projects/<slug>/memory/        — what Claude actually reads,
 *                                                and it is machine-local
 *
 * ## Why this is a script and not an instruction
 *
 * CLAUDE.md has carried the rule in prose since 13 Aug 2026, and it still went
 * wrong twice:
 *
 * 1. **The slug is derived from the ABSOLUTE PATH.** Claude Code names B after
 *    the repo's own location — `C:\Users\jinkg\Downloads\InnocenZ\InnocenZ`
 *    becomes `C--Users-jinkg-Downloads-InnocenZ-InnocenZ`. A second machine that
 *    clones to `D:\work\InnocenZ` needs `D--work-InnocenZ`, so the copy-paste
 *    instruction naming the FIRST machine's folder writes to a directory nothing
 *    ever reads. Silently: no error, no memories, and the session simply behaves
 *    as if it had never met the project. This script computes the slug from
 *    wherever the repo actually is.
 *
 * 2. **A one-way copy loses work.** The rule was corrected once already, after a
 *    wholesale overwrite drifted the two stores 13 files apart and hid 8 standing
 *    rules from the second device. So: compare first, union second, and REFUSE to
 *    pick a winner when the same file differs on both sides — that is a judgement
 *    about which claims match real code, and it belongs to a person.
 *
 * ## Usage
 *
 *   node tools/scripts/sync-claude-memory.mjs           sync (union, never clobber)
 *   node tools/scripts/sync-claude-memory.mjs --check    report drift, exit 1 if any
 *   node tools/scripts/sync-claude-memory.mjs --prefer-repo    resolve conflicts A->B
 *   node tools/scripts/sync-claude-memory.mjs --prefer-native  resolve conflicts B->A
 *
 * The two --prefer flags exist for when you have ALREADY read the conflicting
 * pair and decided. They are not a default, for a reason.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const MIRROR = path.join(REPO_ROOT, "docs", "claude-memory");
const INDEX = "MEMORY.md";

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has("--check");
const PREFER_REPO = args.has("--prefer-repo");
const PREFER_NATIVE = args.has("--prefer-native");

if (PREFER_REPO && PREFER_NATIVE) {
	console.error("Pick one of --prefer-repo / --prefer-native, not both.");
	process.exit(2);
}

/**
 * Claude Code's project-directory name for a given repo path.
 *
 * Every path separator AND the drive colon collapse to a single "-", which is
 * why a Windows root yields a DOUBLE dash after the drive letter ("C:" -> "C-",
 * then "\Users" -> "-Users"). Verified against this machine's own directory
 * listing rather than assumed — the doubled dash reads like a typo otherwise,
 * and has been "corrected" by hand before.
 */
function projectSlug(absPath) {
	return absPath.replace(/[:\\/]/g, "-");
}

const NATIVE = path.join(
	os.homedir(),
	".claude",
	"projects",
	projectSlug(REPO_ROOT),
	"memory",
);

/** Content identity that ignores line endings and trailing blank lines. */
function hash(file) {
	const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trimEnd();
	return createHash("sha1").update(text).digest("hex");
}

function listMemories(dir) {
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".md") && f !== INDEX)
		.sort();
}

/** `name` / `description` off the frontmatter, for rebuilding the index. */
function frontmatter(file) {
	const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
	const match = text.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return {};
	const out = {};
	for (const line of match[1].split("\n")) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (kv) out[kv[1]] = kv[2].trim();
	}
	return out;
}

/** "innocenz-dispute-rule" -> "Innocenz dispute rule", the index's own style. */
function titleFrom(slug) {
	const words = slug.replace(/-/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

function copy(from, to, file) {
	fs.mkdirSync(to, { recursive: true });
	fs.copyFileSync(path.join(from, file), path.join(to, file));
}

// -- compare -----------------------------------------------------------------

const inMirror = new Map(
	listMemories(MIRROR).map((f) => [f, hash(path.join(MIRROR, f))]),
);
const inNative = new Map(
	listMemories(NATIVE).map((f) => [f, hash(path.join(NATIVE, f))]),
);

const every = [...new Set([...inMirror.keys(), ...inNative.keys()])].sort();
const onlyMirror = [];
const onlyNative = [];
const conflicts = [];
let identical = 0;

for (const file of every) {
	const a = inMirror.get(file);
	const b = inNative.get(file);
	if (a && !b) onlyMirror.push(file);
	else if (b && !a) onlyNative.push(file);
	else if (a === b) identical += 1;
	else conflicts.push(file);
}

console.log(`repo mirror   ${MIRROR}`);
console.log(`native memory ${NATIVE}`);
if (!fs.existsSync(NATIVE)) {
	console.log("              (does not exist yet - this looks like a new device)");
}
console.log("");
console.log(`identical            ${identical}`);
console.log(
	`only in repo mirror  ${onlyMirror.length}${onlyMirror.length ? `  ${onlyMirror.join(", ")}` : ""}`,
);
console.log(
	`only in native       ${onlyNative.length}${onlyNative.length ? `  ${onlyNative.join(", ")}` : ""}`,
);
console.log(
	`CONFLICTING          ${conflicts.length}${conflicts.length ? `  ${conflicts.join(", ")}` : ""}`,
);

// -- act ---------------------------------------------------------------------

if (CHECK_ONLY) {
	const drift = onlyMirror.length + onlyNative.length + conflicts.length;
	if (drift === 0) {
		console.log("\nIn sync.");
		process.exit(0);
	}
	console.log(`\n${drift} file(s) out of sync. Run without --check to union them.`);
	process.exit(1);
}

for (const file of onlyMirror) copy(MIRROR, NATIVE, file);
for (const file of onlyNative) copy(NATIVE, MIRROR, file);
if (onlyMirror.length || onlyNative.length) {
	console.log(
		`\ncopied ${onlyMirror.length} -> native, ${onlyNative.length} -> repo mirror`,
	);
}

if (conflicts.length) {
	if (PREFER_REPO) {
		for (const file of conflicts) copy(MIRROR, NATIVE, file);
		console.log(`resolved ${conflicts.length} conflict(s) repo -> native, as asked`);
	} else if (PREFER_NATIVE) {
		for (const file of conflicts) copy(NATIVE, MIRROR, file);
		console.log(`resolved ${conflicts.length} conflict(s) native -> repo, as asked`);
	} else {
		/*
		 * STOP. Both sides changed the same memory, and the right answer is
		 * whichever one matches the code — which this script cannot read. Guessing
		 * here is exactly the wholesale overwrite the two-way rule was written
		 * against, and it would look like success.
		 */
		console.log("\nNOT resolved - the same memory differs on both sides:");
		for (const file of conflicts) {
			console.log(
				`  diff "${path.join(MIRROR, file)}" "${path.join(NATIVE, file)}"`,
			);
		}
		console.log(
			"\nRead both, keep whichever matches the real code, then re-run with\n" +
				"--prefer-repo or --prefer-native. Everything else has been synced.",
		);
		process.exit(1);
	}
}

// -- rebuild the index -------------------------------------------------------

/**
 * MEMORY.md is REGENERATED from the union, never copied — but its grouping is
 * editorial ("The money rules", "Access, scope and identity") and no script can
 * re-derive which bucket a new memory belongs in. So: keep every heading and
 * every line whose file still exists, drop lines whose file is gone, and park
 * genuinely new memories under a heading a person can then file properly.
 */
function rebuildIndex() {
	const files = new Set(listMemories(MIRROR));
	const indexPath = path.join(MIRROR, INDEX);
	if (!fs.existsSync(indexPath)) {
		console.log("\nNo MEMORY.md to rebuild - skipping.");
		return;
	}
	const original = fs.readFileSync(indexPath, "utf8");
	/*
	 * Write back in the line ending the file already uses.
	 *
	 * Everything above compares CRLF-normalised, which is right for deciding
	 * whether two memories SAY the same thing. Writing normalised is not: on
	 * Windows this file is CRLF on disk, so a bare "\n" rewrite makes git report
	 * MEMORY.md modified on every single run with an empty diff. Harmless once,
	 * but this script is about to run from a Stop hook, and a file that dirties
	 * itself every turn is one nobody can read `git status` around.
	 */
	const eol = original.includes("\r\n") ? "\r\n" : "\n";
	const lines = original.replace(/\r\n/g, "\n").split("\n");

	const listed = new Set();
	const kept = [];
	let dropped = 0;
	for (const line of lines) {
		const link = line.match(/^-\s*\[[^\]]*\]\(([^)]+\.md)\)/);
		if (!link) {
			kept.push(line);
			continue;
		}
		if (files.has(link[1])) {
			listed.add(link[1]);
			kept.push(line);
		} else {
			dropped += 1;
		}
	}

	const missing = [...files].filter((f) => !listed.has(f)).sort();
	if (missing.length) {
		while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
		kept.push("", "### Newly added - file these into a section above", "");
		for (const file of missing) {
			const fm = frontmatter(path.join(MIRROR, file));
			const title = titleFrom(fm.name ?? file.replace(/\.md$/, ""));
			const hook = (fm.description ?? "").replace(/\s+/g, " ").trim();
			kept.push(`- [${title}](${file})${hook ? ` — ${hook}` : ""}`);
		}
	}

	const total = files.size;
	const withCount = kept.map((line) =>
		line.replace(/^All \d+ memories,/, `All ${total} memories,`),
	);

	const body = withCount.join("\n").replace(/\n+$/, "");
	const text = `${body}\n`.split("\n").join(eol);
	if (text !== original) fs.writeFileSync(indexPath, text);
	fs.mkdirSync(NATIVE, { recursive: true });
	fs.copyFileSync(indexPath, path.join(NATIVE, INDEX));

	console.log(
		`\nMEMORY.md: ${total} memories listed` +
			(missing.length ? `, ${missing.length} newly added (file them)` : "") +
			(dropped ? `, ${dropped} stale line(s) removed` : ""),
	);
}

rebuildIndex();
console.log(
	"\nBoth stores are in sync. Commit docs/claude-memory/ so the other device gets it.",
);
