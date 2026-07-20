import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type { BackendUser } from "@/services/admin/mappers";
import { fetchAgencyMembershipsByUsers } from "@/services/agency";
import { getRoleIdByName } from "@/services/rbac/roles";
import type {
	PrAgencyRef,
	PrUser,
	PrUsersApiResponse,
	PrUsersQueryParams,
} from "./types";

function mapPrUser(user: BackendUser, agencies: PrAgencyRef[] = []): PrUser {
	return {
		id: user.id,
		email: user.email ?? "",
		phoneNum: user.phoneNum ?? "",
		profileImage: user.profileImage ?? null,
		displayName: user.username,
		legalName: user.profile?.fullName?.trim() ?? "",
		idType: user.profile?.idType ?? null,
		idNo: user.profile?.idNo ?? null,
		gender: user.profile?.gender ?? null,
		race: user.profile?.race ?? null,
		dob: user.profile?.dob ?? null,
		nationality: user.profile?.nationality ?? null,
		portfolioPhotos: user.profile?.portfolioPhotos ?? [],
		comcardHeightCm: user.profile?.comcardHeightCm ?? null,
		comcardWeightKg: user.profile?.comcardWeightKg ?? null,
		status: user.status,
		agencies,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
		createdBy: user.createdBy,
		updatedBy: user.updatedBy,
	};
}

function matchesSearch(user: PrUser, search: string): boolean {
	const q = search.toLowerCase();
	return (
		user.displayName.toLowerCase().includes(q) ||
		user.legalName.toLowerCase().includes(q) ||
		(user.idNo?.toLowerCase().includes(q) ?? false) ||
		user.email.toLowerCase().includes(q) ||
		user.phoneNum.toLowerCase().includes(q) ||
		user.agencies.some(
			(agency) =>
				agency.name.toLowerCase().includes(q) ||
				agency.code.toLowerCase().includes(q),
		)
	);
}

export async function fetchPrUsers(
	params: PrUsersQueryParams = {},
	onRefreshFail: () => void,
): Promise<PrUsersApiResponse> {
	const prRoleId = await getRoleIdByName("pr", onRefreshFail);
	if (!prRoleId) {
		return {
			success: true,
			message: "OK",
			data: [],
			pagination: {
				page: 1,
				pageSize: params.pageSize ?? 10,
				totalCount: 0,
				totalPages: 1,
				hasNextPage: false,
				hasPrevPage: false,
			},
		};
	}

	const page = params.page ?? 1;
	const pageSize = params.pageSize ?? 10;
	const needsClientFilter = Boolean(params.agencyId || params.search);

	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		status: params.status,
		roleId: prRoleId,
		// When agency/search filters apply, load a larger page then filter client-side.
		page: needsClientFilter ? 1 : page,
		pageSize: needsClientFilter ? 200 : pageSize,
	});

	const response = await client.get<{
		success: boolean;
		message: string;
		data: BackendUser[];
		pagination: PrUsersApiResponse["pagination"];
	}>(`/user${queryString}`);

	const users = response.data.data ?? [];
	const memberships = await fetchAgencyMembershipsByUsers(
		users.map((user) => user.id),
		onRefreshFail,
	);

	const agenciesByUser = new Map<string, PrAgencyRef[]>();
	for (const membership of memberships.data) {
		const list = agenciesByUser.get(membership.userId) ?? [];
		list.push({
			id: membership.agencyId,
			name: membership.agencyName,
			code: membership.agencyCode,
		});
		agenciesByUser.set(membership.userId, list);
	}

	let mapped = users.map((user) =>
		mapPrUser(user, agenciesByUser.get(user.id) ?? []),
	);

	if (params.agencyId) {
		mapped = mapped.filter((user) =>
			user.agencies.some((agency) => agency.id === params.agencyId),
		);
	}
	if (params.search?.trim()) {
		mapped = mapped.filter((user) =>
			matchesSearch(user, params.search!.trim()),
		);
	}

	if (!needsClientFilter) {
		return {
			success: response.data.success,
			message: response.data.message,
			data: mapped,
			pagination: response.data.pagination,
		};
	}

	const totalCount = mapped.length;
	const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
	const start = (page - 1) * pageSize;
	const pageRows = mapped.slice(start, start + pageSize);

	return {
		success: response.data.success,
		message: response.data.message,
		data: pageRows,
		pagination: {
			page,
			pageSize,
			totalCount,
			totalPages,
			hasNextPage: page < totalPages,
			hasPrevPage: page > 1,
		},
	};
}
