import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type { BackendModule } from "./mappers";
import { mapModule } from "./mappers";
import { fetchPortals } from "./portals";
import type { CreateModuleInput, UpdateModuleInput } from "./schemas";
import type {
	ModuleApiResponse,
	ModulesApiResponse,
	ModulesQueryParams,
} from "./types";

export async function fetchModules(
	params: ModulesQueryParams = {},
	onRefreshFail: () => void,
): Promise<ModulesApiResponse> {
	const client = getClient(onRefreshFail);

	/*
	 * The portals are awaited FIRST, not in parallel, whenever a portal filter
	 * is set: the API filters on `portalId` and the console holds a code, so
	 * the id has to exist before the query string is built. Without a filter
	 * nothing waits on anything — the two calls still go together.
	 */
	const portalsPromise = fetchPortals(onRefreshFail).catch(() => []);
	const portalId = params.portalCode
		? (await portalsPromise).find((p) => p.code === params.portalCode)?.id
		: undefined;

	const queryString = buildQueryParams({
		moduleName: params.moduleName,
		status: params.status,
		/*
		 * ⚠️ A filter the portal list could not resolve must NOT fall through to
		 * "no filter": that would quietly answer a narrowed question with every
		 * row. `__none__` matches no module, so a portal we cannot name shows an
		 * empty list — visibly wrong, rather than invisibly wrong.
		 */
		portalId: params.portalCode ? (portalId ?? "__none__") : undefined,
		page: params.page,
		pageSize: params.pageSize,
	});

	const [response, portals] = await Promise.all([
		client.get<{
			success: boolean;
			message: string;
			data: BackendModule[];
			pagination: ModulesApiResponse["pagination"];
		}>(`/rbac/module${queryString}`),
		portalsPromise,
	]);

	const portalCodeById = new Map(portals.map((p) => [p.id, p.code] as const));

	return {
		success: response.data.success,
		message: response.data.message,
		pagination: response.data.pagination,
		data: (response.data.data ?? []).map((m) => mapModule(m, portalCodeById)),
	};
}

export async function fetchModuleById(
	moduleId: string,
	onRefreshFail: () => void,
): Promise<ModuleApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.get<{
		success: boolean;
		message: string;
		data: BackendModule;
	}>(`/rbac/module/${moduleId}`);

	return {
		success: response.data.success,
		message: response.data.message,
		data: mapModule(response.data.data),
	};
}

export async function createModule(
	input: CreateModuleInput,
	onRefreshFail: () => void,
): Promise<ModuleApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: BackendModule;
	}>("/rbac/module", input);

	return {
		success: response.data.success,
		message: response.data.message,
		data: mapModule(response.data.data),
	};
}

export async function updateModule(
	moduleId: string,
	input: UpdateModuleInput,
	onRefreshFail: () => void,
): Promise<ModuleApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.put<{
		success: boolean;
		message: string;
		data: BackendModule;
	}>(`/rbac/module/${moduleId}`, input);

	return {
		success: response.data.success,
		message: response.data.message,
		data: mapModule(response.data.data),
	};
}

export async function deactivateModule(
	moduleId: string,
	onRefreshFail: () => void,
): Promise<ModuleApiResponse> {
	const client = getClient(onRefreshFail);
	const response = await client.delete<{
		success: boolean;
		message: string;
		data: BackendModule;
	}>(`/rbac/module/${moduleId}`);

	return {
		success: response.data.success,
		message: response.data.message,
		data: mapModule(response.data.data),
	};
}
