import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AdminNotFoundPage } from '@/components/layout/admin-not-found';

export const Route = createFileRoute('/admin/user-management')({
  beforeLoad: ({ location }) => {
    const pathname = location.pathname.replace(/\/$/, '');
    if (pathname === '/user-management') {
      throw redirect({ to: '/user-management/admin' });
    }
  },
  notFoundComponent: AdminNotFoundPage,
  component: UserManagementLayout,
});

function UserManagementLayout() {
  return <Outlet />;
}
