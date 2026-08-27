import { env } from "@/env";
import { apiErrorCopy } from "@/lib/auth/api-error-copy";
import { getAccessToken } from "@/lib/auth/auth-storage";
import { kickToLogin } from "@/lib/auth/guards";
import { getClient } from "@/lib/axios-v1";

interface ApiResponse<T> {
	success: boolean;
	message: string;
	data: T;
}

interface UpdatedUser {
	id: string;
	username: string;
	profileImage: string | null;
	email: string | null;
	phoneNum: string | null;
	status: string;
}

export async function updateMyDisplayName(
	userId: string,
	username: string,
): Promise<UpdatedUser> {
	const client = getClient(kickToLogin);
	const response = await client.patch<ApiResponse<UpdatedUser>>(
		`/user/${userId}`,
		{ username },
	);
	if (!response.data.success || !response.data.data) {
		throw new Error(
			response.data.message || apiErrorCopy().webLib.displayNameUpdateFailed,
		);
	}
	return response.data.data;
}

export async function uploadMyProfileImage(
	userId: string,
	file: File,
): Promise<UpdatedUser> {
	const token = getAccessToken();
	if (!token) {
		kickToLogin();
		throw new Error(apiErrorCopy().webLib.notSignedIn);
	}

	const form = new FormData();
	form.append("profileImage", file);

	// Use fetch so the browser sets multipart boundary (axios defaults to JSON).
	const response = await fetch(
		`${env.VITE_API_URL}/v1/user/${userId}/profile-image`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${token}` },
			body: form,
		},
	);

	if (response.status === 401) {
		kickToLogin();
		throw new Error(apiErrorCopy().webLib.sessionExpired);
	}

	const payload = (await response.json()) as ApiResponse<UpdatedUser>;
	if (!response.ok || !payload.success || !payload.data) {
		// Reuses the sentence the avatar card already shows for this failure —
		// a second wording would be two answers to one question.
		throw new Error(
			payload.message || apiErrorCopy().profile.couldNotUploadPhoto,
		);
	}
	return payload.data;
}
