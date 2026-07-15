import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {},

  clientPrefix: 'VITE_',

  client: {
    VITE_API_URL: z.url(),
    VITE_GRAPHQL_ENDPOINT: z.url().optional(),
    /** Outlet role UUID for public signup (no /rbac/role lookup). */
    VITE_OUTLET_ROLE_ID: z.string().min(1).optional(),
    /** Agency role UUID for public signup (no /rbac/role lookup). */
    VITE_AGENCY_ROLE_ID: z.string().min(1).optional(),
  },

  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})
