import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/agency')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(agency)"!</div>
}
