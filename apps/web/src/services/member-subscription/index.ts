import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

export type SubscriberType = "outlet" | "agency";
export type MemberSubscriptionStatus =
	| "active"
	| "cancelled"
	| "expired"
	| "past_due";
export type MemberBillingCycle = "weekly" | "monthly" | "annually";

export interface MemberSubscriptionPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface MemberSubscription {
	id: string;
	subscriberType: SubscriberType;
	subscriberId: string;
	subscriberName: string;
	subscriptionId: string | null;
	planName: string;
	amount: string;
	billingCycle: MemberBillingCycle;
	currency: string;
	status: MemberSubscriptionStatus;
	startedAt: string;
	endedAt: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface MemberSubscriptionsQueryParams {
	subscriberType?: SubscriberType;
	subscriberId?: string;
	subscriptionId?: string;
	status?: MemberSubscriptionStatus;
	from?: string;
	to?: string;
	/** Comma-separated YYYY-MM-DD days to match exactly. */
	dates?: string;
	/** Case-insensitive partial match on the subscriber (outlet/agency) name. */
	search?: string;
	page?: number;
	pageSize?: number;
}

export interface MemberSubscriptionsApiResponse {
	success: boolean;
	message: string;
	pagination: MemberSubscriptionPagination;
	data: MemberSubscription[];
}

// "Who subscribed & when" ledger — powers the admin Business > History page.
export async function fetchMemberSubscriptions(
	params: MemberSubscriptionsQueryParams = {},
	onRefreshFail: () => void,
): Promise<MemberSubscriptionsApiResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		subscriberType: params.subscriberType,
		subscriberId: params.subscriberId,
		subscriptionId: params.subscriptionId,
		status: params.status,
		from: params.from,
		to: params.to,
		dates: params.dates,
		search: params.search,
		page: params.page,
		pageSize: params.pageSize,
	});

	const response = await client.get<{
		success: boolean;
		message: string;
		data: MemberSubscription[];
		pagination: MemberSubscriptionPagination;
	}>(`/member-subscription${queryString}`);

	return {
		success: response.data.success,
		message: response.data.message,
		data: response.data.data ?? [],
		pagination: response.data.pagination,
	};
}

export interface MemberSubscriptionSummaryPoint {
	period: string;
	outletRevenue: number;
	agencyRevenue: number;
	totalRevenue: number;
	outletCount: number;
	agencyCount: number;
}

export interface MemberSubscriptionSummaryResponse {
	success: boolean;
	message: string;
	granularity: string;
	data: MemberSubscriptionSummaryPoint[];
	totals: {
		outletRevenue: number;
		agencyRevenue: number;
		totalRevenue: number;
	};
}

// Revenue/counts split by outlet vs agency — powers the History pie chart.
export async function fetchMemberSubscriptionSummary(
	params: MemberSubscriptionsQueryParams = {},
	onRefreshFail: () => void,
): Promise<MemberSubscriptionSummaryResponse> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		subscriberType: params.subscriberType,
		status: params.status,
		from: params.from,
		to: params.to,
	});

	const response = await client.get<MemberSubscriptionSummaryResponse>(
		`/member-subscription/summary${queryString}`,
	);
	return response.data;
}
