import { describe, expect, it } from "vitest";
import { signupTranslations } from "@/lib/landing-i18n/signup-translations";
import { createSignupSchema } from "./register-schemas";

/**
 * THE ORGANISATION SIGN-UP'S NUMBER FORMATS, AS A PERSON TYPES THEM.
 *
 * Commit 548eaa7c wrote these patterns without their backslashes —
 * `/^d{12}$/` is twelve letter d's, not twelve digits — so every real SSM
 * number was refused as "SSM numbers are 12 digits", every passport birth date
 * as "YYYY-MM-DD", and no outlet or agency could sign up on the web. Nothing
 * ran the schema against a real number; this does.
 */

const v = signupTranslations.en.validation;
const schema = createSignupSchema(v);

function valid(overrides: Record<string, unknown> = {}) {
	return {
		accountType: "outlet",
		companyName: "Velvet Room Sdn Bhd",
		companyRegistrationOld: "",
		companyRegistrationNew: "202601024567",
		businessLicense: "DBKL.BP.2026.01452",
		addressLine1: "12 Jalan Bukit Bintang",
		addressLine2: "",
		city: "Kuala Lumpur",
		postcode: "50450",
		stateCode: "14",
		countryCode: "MY",
		personInCharge: "Tan Mei Ling",
		idType: "NRIC",
		// Ends in an even digit → female, which `gender` must agree with.
		idNo: "950312-14-8822",
		gender: "female",
		dob: "",
		nationality: "",
		phoneNum: "123456789",
		email: "contact@velvet.my",
		loginEmail: "owner@velvet.my",
		password: "correct-horse",
		confirmPassword: "correct-horse",
		packageId: "0b0c8d62-7a64-4d3e-9d8f-3c0b4b1f2a11",
		logoFile: new File(["x"], "logo.png", { type: "image/png" }),
		ackPersonalInfo: true,
		ackDeclarationOfTruth: true,
		ackInformationSharing: true,
		acceptTerms: true,
		...overrides,
	};
}

function messages(overrides: Record<string, unknown>): string[] {
	const result = schema.safeParse(valid(overrides));
	return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("createSignupSchema — number formats", () => {
	it("the instrument: a complete, real sign-up passes", () => {
		expect(schema.safeParse(valid()).success).toBe(true);
	});

	it("takes a real 12-digit SSM number, and refuses the letters the bug wanted", () => {
		expect(messages({ companyRegistrationNew: "202601024567" })).toEqual([]);
		expect(messages({ companyRegistrationNew: "dddddddddddd" })).toContain(
			v.companyRegistrationNewFormat,
		);
		expect(messages({ companyRegistrationNew: "2026-01024567" })).toContain(
			v.companyRegistrationNewFormat,
		);
	});

	it("takes the old digits-and-letter number when given, and nothing when not", () => {
		expect(messages({ companyRegistrationOld: "1456789-W" })).toEqual([]);
		expect(messages({ companyRegistrationOld: "" })).toEqual([]);
		expect(messages({ companyRegistrationOld: "ddddddd-W" })).toContain(
			v.companyRegistrationOldFormat,
		);
	});

	it("a passport sign-up takes a real birth date", () => {
		const passport = {
			idType: "Passport",
			idNo: "A12345678",
			gender: "male",
			nationality: "Singaporean",
		};
		expect(messages({ ...passport, dob: "1990-05-01" })).toEqual([]);
		expect(messages({ ...passport, dob: "dddd-dd-dd" })).toContain(
			v.dobRequired,
		);
		expect(messages({ ...passport, dob: "01/05/1990" })).toContain(
			v.dobRequired,
		);
	});
});
