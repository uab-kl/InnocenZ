import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {},

	clientPrefix: "VITE_",

	client: {
		VITE_API_URL: z.url(),
		VITE_GRAPHQL_ENDPOINT: z.url().optional(),
		/** Outlet role UUID for public signup (no /rbac/role lookup). */
		VITE_OUTLET_ROLE_ID: z.string().min(1).optional(),
		/** Agency role UUID for public signup (no /rbac/role lookup). */
		VITE_AGENCY_ROLE_ID: z.string().min(1).optional(),
		/** Cloudflare R2 public base (no trailing slash). Join with stored object keys. */
		VITE_R2_PUBLIC_URL: z.url().optional(),
	},

	runtimeEnv: import.meta.env,
	emptyStringAsUndefined: true,
});
