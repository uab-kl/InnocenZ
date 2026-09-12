import { graphqlRequest } from "@/lib/graphql-request";
import type {
	AuditLog,
	AuditLogFiltersApiResponse,
	AuditLogsApiResponse,
	AuditLogsQueryParams,
} from "./types";

const AUDIT_LOGS_QUERY = `
  query AuditLogs(
    $filter: AuditLogFilterInput
    $sort: AuditLogSort
    $pageSize: Int
    $pageNumber: Int
  ) {
    auditLogs(
      filter: $filter
      sort: $sort
      pageSize: $pageSize
      pageNumber: $pageNumber
    ) {
      query {
        auditLogId
        userId
        username
        role
        portal
        action
        entity
        entityId
        oldData
        newData
        ipAddress
        userAgent
        createdAt
      }
      pagination {
        count
        totalCount
        currentPage
        totalPages
        hasNextPage
        hasPrevPage
      }
    }
  }
`;

const AUDIT_LOG_ACTIONS_QUERY = `
  query AuditLogActions {
    auditLogActions
  }
`;

const AUDIT_LOG_ENTITIES_QUERY = `
  query AuditLogEntities {
    auditLogEntities
  }
`;

interface GraphqlAuditLog {
	auditLogId: string;
	userId: string | null;
	username: string | null;
	role: string | null;
	portal: string | null;
	action: string;
	entity: string;
	entityId: string | null;
	oldData: Record<string, unknown> | null;
	newData: Record<string, unknown> | null;
	ipAddress: string;
	userAgent: string;
	createdAt: string;
}

function mapAuditLog(log: GraphqlAuditLog): AuditLog {
	return {
		auditLogId: Number.parseInt(log.auditLogId, 10),
		userId: log.userId,
		username: log.username,
		role: log.role,
		portal: log.portal,
		action: log.action,
		entity: log.entity,
		entityId: log.entityId,
		oldData: log.oldData,
		newData: log.newData,
		ipAddress: log.ipAddress,
		userAgent: log.userAgent,
		createdAt: log.createdAt,
	};
}


export async function fetchAuditLogs(
	params: AuditLogsQueryParams = {},
): Promise<AuditLogsApiResponse> {
	const data = await graphqlRequest<{
		auditLogs: {
			query: GraphqlAuditLog[];
			pagination: AuditLogsApiResponse["pagination"];
		};
	}>(AUDIT_LOGS_QUERY, {
		filter: {
			dateFrom: params.dateFrom,
			dateTo: params.dateTo,
			userId: params.userId,
			entity: params.entity,
			entityId: params.entityId,
			action: params.action,
			/*
			 * ⚠️ THE TAB, ASKED OF THE SERVER.
			 *
			 * This used to be applied in the browser, to the ten rows the server
			 * had already paged — so the Admin tab could show ONE row beneath a
			 * footer reading "1–10 of 2752, Page 1 of 276", because `query` and
			 * `pagination` described different sets. The server filters before it
			 * takes the page, so the count now means what it says.
			 *
			 * The value is the tab key (`admin` | `pr` | `outlet` | `agency`), or
			 * the sentinel `others` for rows with no portal — everything written
			 * before migration 0164, which had nowhere to record one.
			 */
			portal: params.role,
		},
		sort: params.sortField
			? {
					field: params.sortField,
					direction: params.sortDirection ?? "DESC",
				}
			: undefined,
		pageSize: params.pageSize,
		pageNumber: params.page,
	});

	return {
		success: true,
		message: "OK",
		query: data.auditLogs.query.map(mapAuditLog),
		pagination: data.auditLogs.pagination,
	};
}

export async function fetchAuditLogActions(): Promise<AuditLogFiltersApiResponse> {
	const data = await graphqlRequest<{ auditLogActions: string[] }>(
		AUDIT_LOG_ACTIONS_QUERY,
	);

	return {
		success: true,
		message: "OK",
		data: data.auditLogActions,
	};
}

export async function fetchAuditLogEntities(): Promise<AuditLogFiltersApiResponse> {
	const data = await graphqlRequest<{ auditLogEntities: string[] }>(
		AUDIT_LOG_ENTITIES_QUERY,
	);

	return {
		success: true,
		message: "OK",
		data: data.auditLogEntities,
	};
}
