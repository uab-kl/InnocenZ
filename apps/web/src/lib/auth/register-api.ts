import { getPublicClient } from "@/lib/axios-v1";
import {
	countryName,
	DEFAULT_COUNTRY_CODE,
	stateName,
} from "@/lib/geo/country-state-city";
import type { ApiResponse } from "./auth-api";
import type { SignupInput } from "./register-schemas";

export interface RegisterResponse {
	id: string;
	email: string;
	displayName?: string;
	username?: string;
	status: string;
}

/**
 * The signup logo upload fails open on the server (the account is still
 * created), so `logoUploadFailed` rides beside `data` to say the org was made
 * without its logo. Optional: PR signups have no org and omit it entirely.
 */
export type RegisterApiResponse = ApiResponse<RegisterResponse> & {
	logoUploadFailed?: boolean;
};

/** Malaysia only — same dial composition as mobile PR signup. */
export const SIGNUP_PHONE_DIAL = "+60";

/** Local MY digits → E.164 (`+60123456789`). Strips leading 0s like mobile. */
export function toSignupPhoneE164(localPhone: string): string {
	const localDigits = localPhone
		.replace(/\D/g, "")
		.replace(/^0+/, "")
		.slice(0, 10);
	return `${SIGNUP_PHONE_DIAL}${localDigits}`;
}

function optionalField(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

async function fileToBase64(file: File): Promise<string> {
	const buffer = await file.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export async function registerUser(
	input: SignupInput,
): Promise<RegisterApiResponse> {
	// No roleId. The server derives the role from `accountType` below — a public
	// caller naming its own role was the escalation hole, and the two VITE_*
	// role ids this used to read were shipped in the bundle anyway.
	const client = getPublicClient();
	const countryCode = input.countryCode || DEFAULT_COUNTRY_CODE;
	const resolvedCountry = countryName(countryCode);
	const resolvedState = optionalField(stateName(countryCode, input.stateCode));

	const payload: Record<string, unknown> = {
		email: input.loginEmail,
		phoneNum: toSignupPhoneE164(input.phoneNum),
		// Account display name = PIC; company name lives on agency/outlet only.
		username: input.personInCharge,
		password: input.password,
		companyName: input.companyName,
		companyRegistrationOld: optionalField(input.companyRegistrationOld),
		companyRegistrationNew: input.companyRegistrationNew,
		personInCharge: input.personInCharge,
		contactEmail: input.email,
		packageId: input.packageId,
		accountType: input.accountType,
		ackPersonalInfo: input.ackPersonalInfo,
		ackDeclarationOfTruth: input.ackDeclarationOfTruth,
		ackInformationSharing: input.ackInformationSharing,
		acceptTerms: input.acceptTerms,
		// Company address → agency/outlet columns (not user_profile).
		addressLine1: optionalField(input.addressLine1),
		addressLine2: optionalField(input.addressLine2),
		city: optionalField(input.city),
		postcode: optionalField(input.postcode),
		state: resolvedState,
		country: resolvedCountry,
	};

	// Outlet only → `outlet.onboarded_by_agency_id`. An agency has no onboarding
	// agency of its own, and the server rejects an id that is not an ACTIVE one.
	if (input.accountType === "outlet") {
	}

	payload.logoFileName = input.logoFile.name;
	payload.logoContentType = input.logoFile.type;
	payload.logoBase64 = await fileToBase64(input.logoFile);

	const response = await client.post<RegisterApiResponse>(
		"/auth/register",
		payload,
	);

	return response.data;
}
