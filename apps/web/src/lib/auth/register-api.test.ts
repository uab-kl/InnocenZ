import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it } from "vitest";
import { getPublicClient } from "@/lib/axios-v1";
import { registerUser } from "./register-api";
import type { SignupInput } from "./register-schemas";

/**
 * THE ORGANISATION SIGN-UP CARRIES ITS EMAIL CODE (owner, 30 Sep 2026).
 *
 * `POST /auth/register` creates nothing until the code sent to `email` comes
 * back beside it. `email` is the LOGIN email — the address the code was sent
 * to — never the company contact one. The real public axios client, transport
 * replaced: nothing is sent anywhere.
 */

let seen: Array<{ url: string | undefined; body: Record<string, unknown> }> =
	[];

function fakeAdapter(config: InternalAxiosRequestConfig) {
	seen.push({
		url: config.url,
		body: JSON.parse(String(config.data)) as Record<string, unknown>,
	});
	const response: AxiosResponse = {
		data: { success: true, message: "Registered", data: null },
		status: 201,
		statusText: "201",
		headers: {},
		config,
		request: {},
	};
	return Promise.resolve(response);
}

const INPUT = {
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
	logoFile: new File(["logo"], "logo.png", { type: "image/png" }),
	ackPersonalInfo: true,
	ackDeclarationOfTruth: true,
	ackInformationSharing: true,
	acceptTerms: true,
} as SignupInput;

beforeEach(() => {
	seen = [];
	getPublicClient().defaults.adapter = fakeAdapter;
});

describe("registerUser", () => {
	it("sends the code's id and digits beside the LOGIN email it proves", async () => {
		await registerUser(INPUT, {
			emailCodeId: "5f3c1d20-1b6e-4c52-9a0e-7d9e2b8c4f33",
			emailCode: "123456",
		});

		expect(seen).toHaveLength(1);
		expect(seen[0].url).toBe("/auth/register");
		expect(seen[0].body).toMatchObject({
			email: "owner@velvet.my",
			contactEmail: "contact@velvet.my",
			emailCodeId: "5f3c1d20-1b6e-4c52-9a0e-7d9e2b8c4f33",
			emailCode: "123456",
		});
	});
});
