import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

export interface RatingRecord {
	id: string;
	outletId: string;
	prId: string;
	prName: string;
	stars: number;
	note: string;
	tags: string[];
	createdAt: string;
	updatedAt: string;
}

export interface RatingsApiResponse {
	success: boolean;
	message: string;
	data: RatingRecord[];
}

export interface RatingApiResponse {
	success: boolean;
	message: string;
	data: RatingRecord;
}

export interface SubmitRatingInput {
	outletId: string;
	prId: string;
	prName?: string;
	stars: number;
	note?: string;
	tags?: string[];
}

export async function fetchRatings(
	params: { outletId?: string; prId?: string },
	onRefreshFail: () => void,
): Promise<RatingsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		outletId: params.outletId,
		prId: params.prId,
	});
	const response = await client.get<RatingsApiResponse>(
		`/rating${queryString}`,
	);
	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
	};
}

// Upserts the outlet's current rating for a PR (unique on outlet + PR).
export async function submitRating(
	input: SubmitRatingInput,
	onRefreshFail: () => void,
): Promise<RatingApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.post<RatingApiResponse>("/rating", input);
	return response.data;
}
