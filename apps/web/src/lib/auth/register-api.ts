import { getPublicClient } from '@/lib/axios-v1'
import type { SignupInput } from './register-schemas'
import type { ApiResponse } from './auth-api'

export interface RegisterResponse {
	id: string
	email: string
	displayName?: string
	username?: string
	status: string
}

function normalizePhoneNumber(phoneNum: string): string {
	const trimmed = phoneNum.trim()
	if (trimmed.startsWith('+')) return trimmed
	return `+${trimmed.replace(/\D/g, '')}`
}

async function fileToBase64(file: File): Promise<string> {
	const buffer = await file.arrayBuffer()
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (const byte of bytes) {
		binary += String.fromCharCode(byte)
	}
	return btoa(binary)
}

export async function registerUser(
	input: SignupInput,
): Promise<ApiResponse<RegisterResponse>> {
	// No roleId. The server derives the role from `accountType` below — a public
	// caller naming its own role was the escalation hole, and the two VITE_*
	// role ids this used to read were shipped in the bundle anyway.
	const client = getPublicClient()
	const payload: Record<string, unknown> = {
		email: input.loginEmail,
		phoneNum: normalizePhoneNumber(input.phoneNum),
		username: input.companyName,
		password: input.password,
		companyName: input.companyName,
		companyRegistrationOld: input.companyRegistrationOld,
		companyRegistrationNew: input.companyRegistrationNew,
		companyAddress: input.companyAddress,
		personInCharge: input.personInCharge,
		contactEmail: input.email,
		packageId: input.packageId,
		accountType: input.accountType,
		ackPersonalInfo: input.ackPersonalInfo,
		ackDeclarationOfTruth: input.ackDeclarationOfTruth,
		ackInformationSharing: input.ackInformationSharing,
		acceptTerms: input.acceptTerms,
	}

	payload.logoFileName = input.logoFile.name
	payload.logoContentType = input.logoFile.type
	payload.logoBase64 = await fileToBase64(input.logoFile)

	const response = await client.post<ApiResponse<RegisterResponse>>(
		'/auth/register',
		payload,
	)

	return response.data
}
