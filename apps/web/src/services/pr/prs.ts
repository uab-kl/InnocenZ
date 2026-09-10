import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import { orgMemberIdStem } from "@/lib/member-code";
import type { BackendUser } from "@/services/admin/mappers";
import { fetchPrAgencyLinks } from "@/services/agency";
import { getRoleIdByName } from "@/services/rbac/roles";
import type {
	PrAgencyRef,
	PrUser,
	PrUsersApiResponse,
	PrUsersQueryParams,
} from "./types";

function mapPrUser(user: BackendUser, agencies: PrAgencyRef[] = []): PrUser {
	return {
		memberCode: user.memberCode ?? null,
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
		comcardBustCm: user.profile?.comcardBustCm ?? null,
		comcardWaistCm: user.profile?.comcardWaistCm ?? null,
		comcardHipCm: user.profile?.comcardHipCm ?? null,
		// Age comes from the API, which derives it from the IC before falling back
		// to `dob` — the owner's rule that age follows the IC. Recomputing it here
		// from `dob` alone would quietly disagree with every other surface.
		age: user.profile?.age ?? null,
		languages: user.profile?.languages ?? [],
		// Both ID scans, the address and the bank pair have been in this response
		// all along (withUserProfiles → toUserProfileResponse); admin and agency are
		// exempt from the outlet redaction. They were absent from the admin PR sheet
		// because THIS mapper never copied them, not because the API withheld them.
		idPhotoFront: user.profile?.idPhotoFront ?? null,
		idPhotoBack: user.profile?.idPhotoBack ?? null,
		addressLine1: user.profile?.addressLine1 ?? null,
		addressLine2: user.profile?.addressLine2 ?? null,
		city: user.profile?.city ?? null,
		postcode: user.profile?.postcode ?? null,
		state: user.profile?.state ?? null,
		country: user.profile?.country ?? null,
		bankName: user.profile?.bankName ?? null,
		bankAccountNo: user.profile?.bankAccountNo ?? null,
		// Presence only — the ink itself is a data-URL and never leaves this line.
		hasSignature: Boolean(user.profile?.signatureInk),
		verificationStatus: user.profile?.verificationStatus ?? null,
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
		(user.memberCode?.toLowerCase().includes(q) ?? false) ||
		user.displayName.toLowerCase().includes(q) ||
		user.legalName.toLowerCase().includes(q) ||
		(user.idNo?.toLowerCase().includes(q) ?? false) ||
		user.email.toLowerCase().includes(q) ||
		user.phoneNum.toLowerCase().includes(q) ||
		user.agencies.some(
			(agency) =>
				agency.name.toLowerCase().includes(q) ||
				(agency.code?.toLowerCase().includes(q) ?? false),
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
	const links = await fetchPrAgencyLinks(
		users.map((user) => user.id),
		onRefreshFail,
	);

	const agenciesByUser = new Map<string, PrAgencyRef[]>();
	for (const link of links.data) {
		const list = agenciesByUser.get(link.userId) ?? [];
		list.push({
			id: link.agencyId,
			name: link.agencyName,
			code: orgMemberIdStem("agency", link.memberCodePrefix),
			status: link.agencyStatus ?? null,
		});
		agenciesByUser.set(link.userId, list);
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
