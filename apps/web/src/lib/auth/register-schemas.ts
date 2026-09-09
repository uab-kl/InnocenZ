import { z } from "zod";
import { genderFromNric, isNricShaped } from "@/lib/ic-identity";
import type { SignupTranslations } from "@/lib/landing-i18n/signup-translations";

function imageFileSchema(messages: SignupTranslations["validation"]) {
	return z
		.instanceof(File, {
			message: messages.logoRequired,
		})
		.refine((file) => file.size <= 5 * 1024 * 1024, messages.logoMaxSize)
		.refine((file) => file.type.startsWith("image/"), messages.logoImageType);
}

/** Optional free-text: empty string stays valid and is fine to submit as "". */
function optionalText(max: number) {
	return z.string().max(max);
}

export function createSignupSchema(messages: SignupTranslations["validation"]) {
	return z
		.object({
			accountType: z.enum(["outlet", "agency"]),
			companyName: z
				.string()
				.min(1, messages.companyNameRequired)
				.max(150, messages.companyNameMax),
			/* Optional, and only checked WHEN GIVEN: the pre-2019 number is digits
			   and a check letter (1456789-W). */
			companyRegistrationOld: z
				.string()
				.max(50, messages.registrationNumberMax)
				.refine(
					(value): boolean =>
						value.trim() === "" || /^d{6,9}-[A-Z]$/i.test(value.trim()),
					messages.companyRegistrationOldFormat,
				),
			/* SSM has issued ONE format since 2019: twelve digits, no letters and no
			   separators — year of incorporation, entity code, running number. The
			   old style with its check letter goes in the field above, which is why
			   this one can be strict. */
			companyRegistrationNew: z
				.string()
				.min(1, messages.companyRegistrationNewRequired)
				.max(50, messages.registrationNumberMax)
				.refine(
					(value): boolean => /^d{12}$/.test(value.trim()),
					messages.companyRegistrationNewFormat,
				),
			/** The licence to trade — a different document from either registration
			    number, and required of agencies and venues alike. */
			businessLicense: z
				.string()
				.trim()
				.min(1, messages.businessLicenseRequired)
				.max(100, messages.businessLicenseMax),
			/*
			 * Required, all four — the venue's check-in geofence is found by
			 * geocoding exactly these columns (`addressQueryFromOutlet`), so an
			 * outlet that skipped them lands in Settings with nothing to look
			 * up. Stored identically on the agency branch of `register`, so the
			 * rule is not split by account type.
			 * Line 2 stays optional: "floor, suite, landmark" is genuinely not
			 * always there, and the geocoder does not need it.
			 */
			addressLine1: z
				.string()
				.min(1, messages.addressLine1Required)
				.max(255, messages.addressLine1Max),
			addressLine2: optionalText(255),
			city: z.string().min(1, messages.cityRequired).max(100, messages.cityMax),
			postcode: z
				.string()
				.min(1, messages.postcodeRequired)
				.max(20, messages.postcodeMax),
			/** ISO state code for cascading select; empty = unset. */
			stateCode: z.string().min(1, messages.stateRequired).max(10),
			/** ISO country code for cascading select; empty = unset. */
			countryCode: optionalText(10),
			/** The name AS PRINTED ON THE IC — relabelled, not renamed: it is still
			    `personInCharge` on the wire and still becomes `user_profile.fullName`. */
			personInCharge: z
				.string()
				.min(1, messages.personInChargeRequired)
				.max(100, messages.personInChargeMax),
			/** Kept as a plain string, not an enum: the field defaults to NRIC and a
			    zod enum message here would read as a type error rather than a prompt. */
			idType: z.string().min(1, messages.idTypeRequired),
			idNo: z
				.string()
				.trim()
				.min(1, messages.idNoRequired)
				.max(32, messages.idNoMax),
			/**
			 * Asked even when the NRIC already encodes it. The superRefine below
			 * refuses a disagreement rather than letting either side win quietly —
			 * the owner’s double confirmation.
			 */
			gender: z.string().refine(
				// The annotation is load-bearing: without it TypeScript infers a
				// TYPE PREDICATE from the comparison, narrowing this field to the
				// union and leaving the form’s plain string unable to satisfy it.
				(value): boolean => value === "male" || value === "female",
				messages.genderRequired,
			),
			/** Passport only — an NRIC carries the date, so the field is hidden and
			    the derived value is shown instead. */
			dob: optionalText(10),
			/** Passport only. NRIC implies Malaysian, which the API also enforces. */
			nationality: optionalText(100),
			phoneNum: z
				.string()
				.trim()
				.min(1, messages.phoneRequired)
				.refine((value) => {
					const digits = value.replace(/\D/g, "").replace(/^0+/, "");
					return digits.length >= 9;
				}, messages.phoneMin)
				.refine((value) => {
					const digits = value.replace(/\D/g, "").replace(/^0+/, "");
					return digits.length <= 10;
				}, messages.phoneMax),
			email: z
				.string()
				.min(1, messages.emailRequired)
				.email(messages.emailInvalid),
			loginEmail: z
				.string()
				.min(1, messages.loginEmailRequired)
				.email(messages.loginEmailInvalid),
			password: z
				.string()
				.min(1, messages.passwordRequired)
				.min(8, messages.passwordMin),
			confirmPassword: z.string().min(1, messages.confirmPasswordRequired),
			packageId: z
				.string()
				.min(1, messages.packageRequired)
				.uuid(messages.packageRequired),
			/**
			 * Outlet only — `outlet.onboarded_by_agency_id`. Left empty by an
			 * agency signup, required for an outlet (enforced in the superRefine
			 * below so agencies are not blocked by a field they never see).
			 */
			logoFile: imageFileSchema(messages),
			ackPersonalInfo: z.boolean().refine((value) => value, {
				message: messages.ackPersonalInfo,
			}),
			ackDeclarationOfTruth: z.boolean().refine((value) => value, {
				message: messages.ackDeclarationOfTruth,
			}),
			ackInformationSharing: z.boolean().refine((value) => value, {
				message: messages.ackInformationSharing,
			}),
			acceptTerms: z.boolean().refine((value) => value, {
				message: messages.acceptTerms,
			}),
		})
		.refine((data) => data.password === data.confirmPassword, {
			message: messages.passwordsMismatch,
			path: ["confirmPassword"],
		})
		.superRefine((data, ctx) => {
			if (data.idType === "NRIC") {
				// A 12-digit number whose first six digits are a real date. Checked
				// here because everything downstream — birth date, age, gender — is
				// read OUT of these digits, so a malformed one is not a cosmetic
				// problem: it is an account with no birth date.
				if (!isNricShaped(data.idNo)) {
					ctx.addIssue({
						code: "custom",
						message: messages.nricInvalid,
						path: ["idNo"],
					});
					return;
				}
				const fromIc = genderFromNric(data.idNo);
				if (fromIc && fromIc !== data.gender) {
					ctx.addIssue({
						code: "custom",
						message: messages.genderMismatch,
						path: ["gender"],
					});
				}
				return;
			}
			// A passport encodes neither, so both are asked for outright.
			if (!/^d{4}-d{2}-d{2}$/.test(data.dob)) {
				ctx.addIssue({
					code: "custom",
					message: messages.dobRequired,
					path: ["dob"],
				});
			}
			if (!data.nationality.trim()) {
				ctx.addIssue({
					code: "custom",
					message: messages.nationalityRequired,
					path: ["nationality"],
				});
			}
		});
	// The outlet-must-name-an-agency rule was removed with the multi-agency
	// cutover: a venue links its agencies in Settings and each one approves.
}

export type SignupInput = z.infer<ReturnType<typeof createSignupSchema>>;

/** @deprecated Use createSignupSchema with locale-specific messages */
export const SignupSchema = createSignupSchema({
	companyNameRequired: "Company name is required",
	companyRegistrationNewFormat: "SSM numbers are 12 digits (e.g. 202601024567)",
	companyRegistrationOldFormat:
		"The old format is digits and a letter, e.g. 1456789-W",
	businessLicenseRequired: "Business license is required",
	businessLicenseMax: "Business license is too long",
	idTypeRequired: "Choose an ID type",
	genderRequired: "Gender is required",
	idNoRequired: "ID number is required",
	idNoMax: "ID number must be 32 characters or fewer",
	nricInvalid: "That is not a valid NRIC",
	genderMismatch: "This does not match your IC number",
	dobRequired: "Date of birth is required (YYYY-MM-DD)",
	nationalityRequired: "Nationality is required",
	addressLine1Required: "Street address is required",
	addressLine1Max: "Address is too long",
	cityRequired: "City is required",
	cityMax: "City name is too long",
	postcodeRequired: "Postcode is required",
	postcodeMax: "Postcode is too long",
	stateRequired: "State is required",
	companyNameMax: "Company name must be 150 characters or fewer",
	companyRegistrationNewRequired: "New company registration number is required",
	registrationNumberMax: "Registration number is too long",
	personInChargeRequired: "Person in charge is required",
	personInChargeMax: "Name must be 100 characters or fewer",
	phoneRequired: "Please enter a valid mobile number",
	phoneMax: "Mobile number is too long",
	phoneMin: "That mobile number looks too short",
	emailRequired: "Email is required",
	emailInvalid: "Please enter a valid email address",
	loginEmailRequired: "Email login ID is required",
	loginEmailInvalid: "Please enter a valid email login ID",
	passwordRequired: "Password is required",
	passwordMin: "Password must be at least 8 characters",
	confirmPasswordRequired: "Please confirm your password",
	passwordsMismatch: "Passwords do not match",
	packageRequired: "Please select a package",
	onboardingAgencyRequired: "Please select the agency that onboarded you",
	logoRequired: "Logo is required",
	logoMaxSize: "Logo must be 5 MB or smaller",
	logoImageType: "Logo must be an image file",
	ackPersonalInfo: "Please acknowledge the Personal Information Disclaimer",
	ackDeclarationOfTruth: "Please acknowledge the Declaration of Truth",
	ackInformationSharing:
		"Please acknowledge Outlet & Agency Information Sharing",
	acceptTerms: "You must accept the Terms & Conditions",
});
