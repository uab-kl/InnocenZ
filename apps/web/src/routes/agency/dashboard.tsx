import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/agency/dashboard')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(agency)/dashboard"!</div>
}
