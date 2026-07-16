import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/outlet/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(outlet)/dashboard"!</div>
}
