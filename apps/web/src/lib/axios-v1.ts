import axios, {
	type AxiosError,
	type AxiosInstance,
	type InternalAxiosRequestConfig,
} from "axios";
import { env } from "@/env";
import { getActiveOrg } from "@/lib/active-org";
import { getAccessToken } from "@/lib/auth/auth-storage";

let browserClient: AxiosInstance | null = null;

function createClient(onRefreshFail: () => void): AxiosInstance {
	const instance = axios.create({
		baseURL: `${env.VITE_API_URL}/v1`,
		headers: { "Content-Type": "application/json" },
	});

	instance.interceptors.request.use(
		(config: InternalAxiosRequestConfig) => {
			const token = getAccessToken();
			if (token && config.headers) {
				config.headers.Authorization = `Bearer ${token}`;
			}
			/*
			 * The organisation this browser is working in, when the person has
			 * chosen one. Sent on EVERY request rather than threaded through
			 * each call site: the scope is a property of the session, and one
			 * hook forgetting to pass it is how a screen ends up showing another
			 * organisation's data. The server verifies it against the caller's
			 * own active memberships and ignores anything else.
			 */
			const org = getActiveOrg();
			if (org && config.headers) {
				config.headers["x-org-id"] = org.id;
			}
			return config;
		},
		(error) => Promise.reject(error),
	);

	instance.interceptors.response.use(
		(response) => response,
		(error: AxiosError) => {
			if (error.response?.status === 401) {
				onRefreshFail();
			}

			return Promise.reject(error);
		},
	);

	return instance;
}

export function getClient(onRefreshFail: () => void): AxiosInstance {
	if (!browserClient) {
		browserClient = createClient(onRefreshFail);
	}
	return browserClient;
}

let publicClient: AxiosInstance | null = null;

function createPublicClient(): AxiosInstance {
	return axios.create({
		baseURL: `${env.VITE_API_URL}/v1`,
		headers: { "Content-Type": "application/json" },
	});
}

export function getPublicClient(): AxiosInstance {
	if (!publicClient) {
		publicClient = createPublicClient();
	}
	return publicClient;
}
