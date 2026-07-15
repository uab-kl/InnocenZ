import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/components/landing/HomePage'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'InnocenZ — The Operating Platform for Nightlife' },
      {
        name: 'description',
        content:
          'AI-powered operating platform connecting Outlet, PR Agency, and PR — from roster to receipt to signed payout.',
      },
      {
        property: 'og:title',
        content: 'InnocenZ — The Operating Platform for Nightlife',
      },
      {
        property: 'og:description',
        content:
          'Connect Outlet, PR Agency, and PR in one intelligent ecosystem — from the first check-in to the final signed payout.',
      },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: HomePage,
})