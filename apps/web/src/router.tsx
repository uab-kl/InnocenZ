import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import * as TanstackQuery from '@/integrations/tanstack-query/root-provider'

import {
  routerWithApolloClient,
  ApolloClient,
  InMemoryCache,
} from '@apollo/client-integration-tanstack-start'
import { HttpLink } from '@apollo/client'
import { setContext } from '@apollo/client/link/context'
import { getAccessToken } from '@/lib/auth/auth-storage'
import { env } from '@/env'

import { deLocalizeUrl, localizeUrl } from '@/paraglide/runtime'

import { routeTree } from './routeTree.gen'

const graphqlUri =
  env.VITE_GRAPHQL_ENDPOINT ??
  `${env.VITE_API_URL.replace(/\/$/, '').replace(/\/api$/, '')}/graphql`

const authLink = setContext((_, { headers }) => {
  const token = getAccessToken()
  return {
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }
})

export const getRouter = () => {
  const apolloClient = new ApolloClient({
    cache: new InMemoryCache(),
    link: authLink.concat(
      new HttpLink({
        uri: graphqlUri,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  })

  const rqContext = TanstackQuery.getContext()

  const router = createRouter({
    routeTree,
    context: {
      ...routerWithApolloClient.defaultContext,
      ...rqContext,
    },
    rewrite: {
      input: ({ url }) => deLocalizeUrl(url),
      output: ({ url }) => localizeUrl(url),
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient: rqContext.queryClient,
  })

  return routerWithApolloClient(router, apolloClient)
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
