import axios, { type AxiosResponse } from "axios";
import { env } from "@/env";
import { getAccessToken } from "@/lib/auth/auth-storage";
import {
	accessTokenForRetry,
	isSessionRefusal,
} from "@/lib/auth/token-refresh";

export function getGraphqlUri(): string {
	return (
		env.VITE_GRAPHQL_ENDPOINT ??
		`${env.VITE_API_URL.replace(/\/$/, "").replace(/\/api$/, "")}/graphql`
	);
}

interface GraphqlEnvelope<TData> {
	data?: TData;
	errors?: Array<{ message: string }>;
}

function postGraphql<TData>(
	body: { query: string; variables?: Record<string, unknown> },
	token: string | null,
): Promise<AxiosResponse<GraphqlEnvelope<TData>>> {
	return axios.post<GraphqlEnvelope<TData>>(getGraphqlUri(), body, {
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	});
}

export async function graphqlRequest<TData>(
	query: string,
	variables?: Record<string, unknown>,
): Promise<TData> {
	const body = { query, variables };
	const sentToken = getAccessToken();
	let response: AxiosResponse<GraphqlEnvelope<TData>>;
	try {
		response = await postGraphql<TData>(body, sentToken);
	} catch (error) {
		/*
		 * `@auth` answers a missing or expired session with HTTP 401
		 * UNAUTHENTICATED — the only 401 this endpoint sends — so past the access
		 * token's 15 minutes every audit-log read failed. Refresh once and replay,
		 * as the REST client does.
		 *
		 * A refused or undecidable refresh rethrows the ORIGINAL error: this path
		 * has never signed anybody out, and it still does not — the REST client
		 * beside it ends a session that is really over.
		 */
		if (
			!axios.isAxiosError(error) ||
			!isSessionRefusal(error.response?.status, getGraphqlUri())
		) {
			throw error;
		}
		const token = await accessTokenForRetry(sentToken).catch(() => null);
		if (!token) throw error;
		response = await postGraphql<TData>(body, token);
	}

	if (response.data.errors?.length) {
		throw new Error(
			response.data.errors[0]?.message ?? "GraphQL request failed",
		);
	}

	if (!response.data.data) {
		throw new Error("GraphQL request returned no data");
	}

	return response.data.data;
}
