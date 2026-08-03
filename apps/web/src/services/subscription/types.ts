export type SubscriptionStatus = "active" | "inactive";
export type SubscriptionType = "agency" | "outlet";

export type BillingCycle = "weekly" | "monthly" | "annually";

/**
 * A plan is held one at a time (Essential..Premier); an add-on is held
 * alongside a plan (POS Integration). Backend migration 0081.
 */
export type SubscriptionKind = "plan" | "addon";

export interface SubscriptionPagination {
	page: number;
	pageSize: number;
	totalCount: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

export interface Subscription {
	id: string;
	name: string;
	price: string;
	billingCycle: BillingCycle;
	subscriptionType: SubscriptionType;
	kind: SubscriptionKind;
	roleId: string | null;
	status: SubscriptionStatus;
	coverage: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	updatedBy: string;
}

export interface SubscriptionsApiResponse {
	success: boolean;
	message: string;
	pagination: SubscriptionPagination;
	data: Subscription[];
}

export interface SubscriptionApiResponse {
	success: boolean;
	message: string;
	data: Subscription;
}

export interface SubscriptionsQueryParams {
	name?: string;
	status?: SubscriptionStatus;
	billingCycle?: BillingCycle;
	subscriptionType?: SubscriptionType;
	page?: number;
	pageSize?: number;
}
