import { z } from "zod";
import type { SignupTranslations } from "@/lib/landing-i18n/signup-translations";

function imageFileSchema(messages: SignupTranslations["validation"]) {
	return z
		.instanceof(File, {
			message: messages.logoRequired,
		})
		.refine((file) => file.size <= 2 * 1024 * 1024, messages.logoMaxSize)
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
				.min(1, messages.companyRegistrationOldRequired)
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
				.min(8, messages.phoneRequired)
				.max(20, messages.phoneMax),
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
			packageId: z.string().min(1, messages.packageRequired),
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
		});
}

export type SignupInput = z.infer<ReturnType<typeof createSignupSchema>>;

/** @deprecated Use createSignupSchema with locale-specific messages */
export const SignupSchema = createSignupSchema({
	companyNameRequired: "Company name is required",
	companyNameMax: "Company name must be 150 characters or fewer",
	companyRegistrationOldRequired: "Old company registration number is required",
	companyRegistrationNewRequired: "New company registration number is required",
	registrationNumberMax: "Registration number is too long",
	personInChargeRequired: "Person in charge is required",
	personInChargeMax: "Name must be 100 characters or fewer",
	phoneRequired: "Please enter a valid contact number",
	phoneMax: "Contact number is too long",
	emailRequired: "Email is required",
	emailInvalid: "Please enter a valid email address",
	loginEmailRequired: "Email login ID is required",
	loginEmailInvalid: "Please enter a valid email login ID",
	passwordRequired: "Password is required",
	passwordMin: "Password must be at least 8 characters",
	confirmPasswordRequired: "Please confirm your password",
	passwordsMismatch: "Passwords do not match",
	packageRequired: "Please select a package",
	logoRequired: "Outlet / agency image or logo is required",
	logoMaxSize: "Logo must be 2 MB or smaller",
	logoImageType: "Logo must be an image file",
	ackPersonalInfo: "Please acknowledge the Personal Information Disclaimer",
	ackDeclarationOfTruth: "Please acknowledge the Declaration of Truth",
	ackInformationSharing:
		"Please acknowledge Outlet & Agency Information Sharing",
	acceptTerms: "You must accept the Terms & Conditions",
});
