import { getClient } from "@/lib/axios-v1";

export interface PlatformConfig {
	id: string;
	platformFeePercent: string;
	geofenceRadiusMeters: number;
	subscriptionMonthlyFee: string;
	duplicatePaymentWindowHours: number;
	currency: string;
	status: string;
	createdAt: string;
	updatedAt: string;
}

export interface UpdatePlatformConfigInput {
	platformFeePercent?: number;
	geofenceRadiusMeters?: number;
	subscriptionMonthlyFee?: number;
	duplicatePaymentWindowHours?: number;
	currency?: string;
}

export interface PlatformConfigResponse {
	success: boolean;
	message: string;
	data: PlatformConfig;
}

export async function fetchPlatformConfig(
	onRefreshFail: () => void,
): Promise<PlatformConfigResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<PlatformConfigResponse>("/platform-config");
	return response.data;
}

export async function updatePlatformConfig(
	input: UpdatePlatformConfigInput,
	onRefreshFail: () => void,
): Promise<PlatformConfigResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<PlatformConfigResponse>(
		"/platform-config",
		input,
	);
	return response.data;
}
