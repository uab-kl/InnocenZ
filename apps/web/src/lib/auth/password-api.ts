/**
 * Password endpoints for the OUTLET and AGENCY web portals.
 *
 * Three lanes, two clients:
 *  - `changeMyPassword`       — signed in, needs the bearer token.
 *  - `requestPasswordReset`   — signed OUT, must not carry a token.
 *  - `resetPasswordWithToken` — signed OUT, proof is the emailed token.
 *
 * The signed-out pair uses `getPublicClient()` deliberately. The authenticated
 * client's response interceptor signs the user out on any 401, which is wrong
 * for a login-page flow where nobody is signed in to begin with.
 *
 * PRs on mobile do not come through here — they reset by WhatsApp OTP
 * (`POST /auth/password/reset-otp`).
 */
import axios from "axios";
import { kickToLogin } from "@/lib/auth/guards";
import { getClient, getPublicClient } from "@/lib/axios-v1";

interface ApiResponse<T> {
	success: boolean;
	message: string;
	data: T;
}

/** Server message when there is one — these are written to be shown as-is. */
function serverMessage(error: unknown, fallback: string): Error {
	if (axios.isAxiosError(error)) {
		const message = (error.response?.data as { message?: string } | undefined)
			?.message;
		if (message) return new Error(message);
	}
	if (error instanceof Error && error.message) return error;
	return new Error(fallback);
}

/**
 * Signed-in change password. The backend proves identity with
 * `currentPassword` and answers 400 (not 401) when it is wrong, so a typo
 * surfaces as an error in the sheet instead of ejecting the session.
 */
export async function changeMyPassword(input: {
	currentPassword: string;
	newPassword: string;
}): Promise<void> {
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<ApiResponse<null>>(
			"/auth/password/change",
			{
				currentPassword: input.currentPassword,
				newPassword: input.newPassword,
			},
		);
		if (!response.data.success) {
			throw new Error(response.data.message || "Could not update password");
		}
	} catch (error) {
		throw serverMessage(error, "Could not update password");
	}
}

/**
 * Ask for a reset link. Always resolves for a well-formed email — the server
 * answers the same way whether or not the address is registered, so the caller
 * can never use this to discover which emails have accounts.
 */
export async function requestPasswordReset(email: string): Promise<string> {
	const client = getPublicClient();
	try {
		const response = await client.post<ApiResponse<null>>(
			"/auth/forgot-password",
			{ email: email.trim() },
		);
		return (
			response.data.message ||
			"If that email is registered, a reset link is on its way."
		);
	} catch (error) {
		throw serverMessage(error, "Could not send the reset link");
	}
}

/** Finish the reset with the token from the emailed link. */
export async function resetPasswordWithToken(input: {
	token: string;
	password: string;
}): Promise<void> {
	const client = getPublicClient();
	try {
		const response = await client.post<ApiResponse<null>>(
			"/auth/reset-password",
			{ token: input.token, password: input.password },
		);
		if (!response.data.success) {
			throw new Error(response.data.message || "Could not reset password");
		}
	} catch (error) {
		throw serverMessage(error, "Could not reset password");
	}
}
