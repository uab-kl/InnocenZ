import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PR_SIGNUP_DOCUMENTS, type SignupDocumentId } from "./pr-signup-terms";

/**
 * /legal shows what a PR agreed to in the app, so its copy must match the
 * app's sign-up strings exactly. The app is read as TEXT — importing it would
 * pull mobile-only modules into the web build.
 */
const MOBILE_COPY_FILE = "mobile/src/i18n/signup-copy.ts";

/** Each /legal document and the app key pair it was copied from. */
const MOBILE_KEY: Record<SignupDocumentId, string> = {
	terms: "disclaimerTerms",
	truth: "disclaimerTruth",
	personal: "disclaimerPersonal",
	sharing: "disclaimerSharing",
};

/** The app's per-locale object literals, in file order. */
const LOCALE_BLOCKS = {
	en: ["const en: SignupFieldCopy = {", "const zh: SignupFieldCopy = {"],
	zh: ["const zh: SignupFieldCopy = {", "const zhHant: SignupFieldCopy = {"],
} as const;

function localeBlock(source: string, locale: "en" | "zh"): string {
	const [start, end] = LOCALE_BLOCKS[locale];
	const from = source.indexOf(start);
	const to = source.indexOf(end);
	if (from < 0 || to <= from) {
		throw new Error(`signup-copy.ts no longer has the ${locale} block`);
	}
	return source.slice(from, to);
}

/** Reads one single-quoted string property and undoes its JS escapes. */
function readString(block: string, key: string): string {
	const match = new RegExp(`\\b${key}:\\s*'((?:\\\\.|[^'\\\\])*)'`).exec(block);
	if (!match) throw new Error(`signup-copy.ts has no ${key}`);
	return match[1].replace(/\\(.)/g, (_, ch: string) =>
		ch === "n" ? "\n" : ch,
	);
}

describe("PR sign-up documents on /legal", () => {
	// From apps/web (npx vitest) or the repo root (nx) — never a silent skip.
	const path = [
		resolve(process.cwd(), "..", MOBILE_COPY_FILE),
		resolve(process.cwd(), "apps", MOBILE_COPY_FILE),
	].find((candidate) => existsSync(candidate));
	if (!path) throw new Error(`cannot find apps/${MOBILE_COPY_FILE}`);
	const source = readFileSync(path, "utf8");

	for (const locale of ["en", "zh"] as const) {
		const block = localeBlock(source, locale);

		it.each(PR_SIGNUP_DOCUMENTS[locale])(
			`$id (${locale}) matches the PR app word for word`,
			(doc) => {
				const prefix = MOBILE_KEY[doc.id];
				expect(doc.title).toBe(readString(block, `${prefix}Title`));
				expect(doc.body).toBe(readString(block, `${prefix}Body`));
			},
		);
	}

	it("carries every document the app asks a PR to accept", () => {
		for (const locale of ["en", "zh"] as const) {
			expect(PR_SIGNUP_DOCUMENTS[locale].map((d) => d.id).sort()).toEqual(
				Object.keys(MOBILE_KEY).sort(),
			);
		}
	});
});
