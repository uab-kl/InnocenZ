import { createFileRoute } from '@tanstack/react-router';
import { AdminLayout } from '@/components/layout/admin-layout';
import { AdminNotFoundPage } from '@/components/layout/admin-not-found';
import { ensureAdminPortal } from '@/lib/auth/guards';
import { notFoundHead } from '@/routes/not-found';

export const Route = createFileRoute('/admin')({
  // Admin-only tree: non-admin sessions are redirected to their own portal
  // (or /no-access) instead of browsing the admin shell against 403s.
  beforeLoad: () => ensureAdminPortal(),
  notFoundComponent: AdminNotFoundPage,
  head: ({ matches }) => {
    const isNotFound = matches.some((match) => match.status === 'notFound');
    return isNotFound ? notFoundHead() : {};
  },
  component: AdminRoot,
});

function AdminRoot() {
  return <AdminLayout />;
}
