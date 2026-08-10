import { z } from "zod";
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
			companyRegistrationOld: z
				.string()
				.max(50, messages.registrationNumberMax),
			companyRegistrationNew: z
				.string()
				.min(1, messages.companyRegistrationNewRequired)
				.max(50, messages.registrationNumberMax),
			addressLine1: optionalText(255),
			addressLine2: optionalText(255),
			city: optionalText(100),
			postcode: optionalText(20),
			/** ISO state code for cascading select; empty = unset. */
			stateCode: optionalText(10),
			/** ISO country code for cascading select; empty = unset. */
			countryCode: optionalText(10),
			personInCharge: z
				.string()
				.min(1, messages.personInChargeRequired)
				.max(100, messages.personInChargeMax),
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
			onboardedByAgencyId: optionalText(64),
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
			// A venue with no onboarding agency cannot post a single shift, so the
			// picker is required — but only for outlets; an agency has none.
			if (data.accountType !== "outlet") return;
			if (!data.onboardedByAgencyId.trim()) {
				ctx.addIssue({
					code: "custom",
					message: messages.onboardingAgencyRequired,
					path: ["onboardedByAgencyId"],
				});
			}
		});
}

export type SignupInput = z.infer<ReturnType<typeof createSignupSchema>>;

/** @deprecated Use createSignupSchema with locale-specific messages */
export const SignupSchema = createSignupSchema({
	companyNameRequired: "Company name is required",
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
