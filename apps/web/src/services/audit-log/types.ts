import type { Pagination } from "@/lib/pagination/pagination";

export interface AuditLog {
	auditLogId: number;
	userId: string | null;
	username: string | null;
	role: string | null;
	/**
	 * WHICH SURFACE the action came from — what the tabs group by.
	 *
	 * Null on every row written before migration 0164, which had nowhere to
	 * record it; those land under "Others" and cannot be classified after the
	 * fact, because `Owner`, `Finance`, `Director` and `Guarantor` each exist on
	 * both portals.
	 */
	portal: string | null;
	action: string;
	entity: string;
	entityId: string | null;
	batchId?: string | null;
	oldData: Record<string, unknown> | null;
	newData: Record<string, unknown> | null;
	ipAddress: string;
	userAgent: string;
	createdAt: string;
}

export interface AuditLogsApiResponse {
	success: boolean;
	message: string;
	query: AuditLog[];
	pagination: Pagination;
}

export interface AuditLogApiResponse {
	success: boolean;
	message: string;
	data: AuditLog;
}

export interface AuditLogFiltersApiResponse {
	success: boolean;
	message: string;
	data: string[];
}

export type AuditLogSortField =
	| "CREATED_AT"
	| "ACTION"
	| "ENTITY"
	| "USER_NAME";

export interface AuditLogsQueryParams {
	dateFrom?: string;
	dateTo?: string;
	userId?: string;
	role?: string;
	entity?: string;
	entityId?: string;
	action?: string;
	page?: number;
	pageSize?: number;
	sortField?: AuditLogSortField;
	sortDirection?: "ASC" | "DESC";
}
