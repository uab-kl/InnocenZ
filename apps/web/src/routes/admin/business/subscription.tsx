import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/business/subscription')({
  beforeLoad: () => {
    throw redirect({ to: '/business/plan' });
  },
});
