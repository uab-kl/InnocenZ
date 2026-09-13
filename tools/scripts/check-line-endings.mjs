#!/usr/bin/env node
/**
 * Fail on a tracked file whose line endings are MIXED.
 *
 * ⚠️ MIXED, not CRLF. 1905 of this repo's 2113 tracked files are CRLF in the
 * blob, and that is fine: a file that is CONSISTENTLY one thing merges cleanly,
 * because git can align every line. Normalising all of them would rewrite 90% of
 * the tree in one commit and make the next merge from a teammate's branch
 * conflict in almost every file — the exact failure this exists to prevent,
 * amplified.
 *
 * What actually bites is a file carrying both, or carrying a bare CR in the
 * middle of CRLF text. `apps/backend/src/features/outlet/outlet.controller.ts`
 * reached that state and then conflicted in its ENTIRETY for a 48-line change,
 * because git could align nothing (TEST_SCRIPT section 9, 9 Sep 2026).
 *
 * It is cheap to reach that state by accident: an edit script that inserts a
 * newline next to an existing one leaves a doubled CR, which renders
 * identically and shows up in no diff. That is precisely how TEST_SCRIPT.md
 * acquired one during the session that wrote this check.
 *
 *   node tools/scripts/check-line-endings.mjs
 *
 * Exits 1 and names every offender. Binary files are skipped by the same NUL
 * test git uses.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function git(args, encoding) {
	return execFileSync("git", args, {
		cwd: REPO_ROOT,
		encoding,
		maxBuffer: 64 * 1024 * 1024,
	});
}

const files = git(["ls-files", "-z"], "utf8").split("\0").filter(Boolean);

const offenders = [];
for (const file of files) {
	let blob;
	try {
		// The WORKING TREE, not the index. Reading `git show :file` would keep
		// failing after somebody fixed the file and before they staged it, which
		// reads as the fix not working. This catches the problem where it is made.
		blob = readFileSync(join(REPO_ROOT, file));
	} catch {
		// Tracked but not on disk (deleted, or a submodule path).
		continue;
	}
	// Same binary test git applies: a NUL in the first 8000 bytes.
	if (blob.subarray(0, 8000).includes(0)) continue;

	let crlf = 0;
	let lf = 0;
	let loneCr = 0;
	for (let i = 0; i < blob.length; i += 1) {
		const byte = blob[i];
		if (byte === 0x0d) {
			if (blob[i + 1] === 0x0a) {
				crlf += 1;
				i += 1;
			} else {
				loneCr += 1;
			}
		} else if (byte === 0x0a) {
			lf += 1;
		}
	}

	if (loneCr > 0 || (crlf > 0 && lf > 0)) {
		offenders.push({ file, crlf, lf, loneCr });
	}
}

if (offenders.length === 0) {
	console.log(
		`Line endings: no mixed files. (${files.length} tracked; consistent CRLF is fine.)`,
	);
	process.exit(0);
}

console.error(
	`Line endings: ${offenders.length} file(s) carry MIXED endings — these conflict whole-file on the next merge.\n`,
);
for (const o of offenders) {
	console.error(
		`  ${o.file}\n    crlf=${o.crlf} lf=${o.lf} lone-cr=${o.loneCr}`,
	);
}
console.error(
	"\nFix: rewrite the file with one consistent ending. A lone CR is usually an\n" +
		"edit script inserting a newline beside an existing one, leaving a doubled CR.",
);
process.exit(1);
