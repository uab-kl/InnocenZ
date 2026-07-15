import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'

import { AuthProvider } from '@/lib/auth-context'
import { getLocale } from '@/paraglide/runtime'
import appCss from '../styles.css?url'
import type { ApolloClientIntegration } from '@apollo/client-integration-tanstack-start'
import type { QueryClient } from '@tanstack/react-query'
import { SidebarProvider } from '@/components/ui/sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WhatsAppContactButton } from '@/components/whatsapp-contact-button'
import { NotFoundPage, notFoundHead } from './not-found'

interface MyRouterContext extends ApolloClientIntegration.RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', getLocale())
    }
  },

  notFoundComponent: NotFoundPage,

  head: ({ matches }) => {
    const isNotFound = matches.some(
      (match) => match.status === 'notFound' || match.globalNotFound,
    )

    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        ...(isNotFound
          ? (notFoundHead().meta ?? [])
          : [{ title: 'Innocenz' }]),
      ],
      links: [{ rel: 'stylesheet', href: appCss }],
    }
  },

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <body>
        <HeadContent />
        <ThemeProvider>
          <TooltipProvider>
            <AuthProvider>
              <SidebarProvider defaultOpen={true}>{children}</SidebarProvider>
            </AuthProvider>
          </TooltipProvider>
          <WhatsAppContactButton />
          <Toaster />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
