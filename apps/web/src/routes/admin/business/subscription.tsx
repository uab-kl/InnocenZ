import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/business/subscription')({
  beforeLoad: () => {
    // Unconditional, so the missing '/admin' made this route a guaranteed 404.
    throw redirect({ to: '/admin/business/plan' });
  },
});
