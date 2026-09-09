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

/** The un-cropped original behind an avatar, plus where the frame was left. */
export type ProfileImageSource = {
	dataUrl: string;
	fileName: string;
	contentType: string;
	state: { zoom: number; fx: number; fy: number } | null;
	/** True when no original was stored: this is the already-cropped image. */
	fallback: boolean;
};

/**
 * The stored original, so "Adjust crop" works on an avatar uploaded in an
 * earlier session.
 *
 * Read through the API rather than the R2 public host, which sends no CORS
 * header — the browser cannot fetch those bytes, and an image loaded from there
 * taints the canvas the crop sheet exports from. `null` means no stored source
 * (every avatar predating this), and the card then hides Adjust as before.
 */
export async function fetchMyProfileImageSource(
	userId: string,
): Promise<ProfileImageSource | null> {
	try {
		const token = getAccessToken();
		if (!token) return null;
		const response = await fetch(
			`${env.VITE_API_URL}/v1/user/${userId}/profile-image-source`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		if (!response.ok) return null;
		const payload = (await response.json()) as ApiResponse<ProfileImageSource>;
		return payload.data ?? null;
	} catch {
		// Never breaks the card: no source simply means no Adjust button.
		return null;
	}
}

export async function uploadMyProfileImage(
	userId: string,
	file: File,
	/**
	 * The ORIGINAL as picked, and its framing — stored beside the avatar so
	 * Adjust survives a reload. Optional, so any caller that only has the
	 * cropped file keeps working.
	 */
	cropSource?: {
		sourceDataUrl?: string | null;
		state?: { zoom: number; fx: number; fy: number } | null;
	},
): Promise<UpdatedUser> {
	const token = getAccessToken();
	if (!token) {
		kickToLogin();
		throw new Error(apiErrorCopy().webLib.notSignedIn);
	}

	const form = new FormData();
	form.append("profileImage", file);
	// Ordinary text parts, not a second file: the crop sheet already holds the
	// original as a data URL, and multer puts non-file fields on `req.body`.
	if (cropSource?.sourceDataUrl?.startsWith("data:")) {
		form.append("sourceDataUrl", cropSource.sourceDataUrl);
	}
	if (cropSource?.state) {
		form.append("cropState", JSON.stringify(cropSource.state));
	}

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
