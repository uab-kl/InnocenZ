import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AdminNotFoundPage } from '@/components/layout/admin-not-found';

export const Route = createFileRoute('/admin/user-management')({
  beforeLoad: ({ location }) => {
    // De-localized by the router before matching, so this sees
    // '/admin/user-management'. The '/admin' segment was missing, so the
    // section index never redirected and rendered an empty outlet.
    const pathname = location.pathname.replace(/\/$/, '');
    if (pathname === '/admin/user-management') {
      throw redirect({ to: '/admin/user-management/admin' });
    }
  },
  notFoundComponent: AdminNotFoundPage,
  component: UserManagementLayout,
});

function UserManagementLayout() {
  return <Outlet />;
}
