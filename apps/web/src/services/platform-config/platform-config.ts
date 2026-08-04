import { getClient } from "@/lib/axios-v1";
import type { UpdatePlatformConfigInput } from "./schemas";
import type { PlatformConfigApiResponse } from "./types";

export async function fetchPlatformConfig(
	onRefreshFail: () => void,
): Promise<PlatformConfigApiResponse> {
	const client = getClient(onRefreshFail);
	const response =
		await client.get<PlatformConfigApiResponse>("/platform-config");
	return response.data;
}

export async function updatePlatformConfig(
	input: UpdatePlatformConfigInput,
	onRefreshFail: () => void,
): Promise<PlatformConfigApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<PlatformConfigApiResponse>(
		"/platform-config",
		input,
	);
	return response.data;
}
