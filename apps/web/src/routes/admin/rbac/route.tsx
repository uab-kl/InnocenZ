import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { Clock } from 'lucide-react';
import { AdminNotFoundPage } from '@/components/layout/admin-not-found';
import { rbacSections } from '@/constants/rbac-sections';
import { useSidebarBadges } from '@/hooks/use-sidebar-badges';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/admin/rbac')({
  beforeLoad: ({ location }) => {
    const pathname = location.pathname.replace(/\/$/, '');
    if (pathname === '/rbac') {
      throw redirect({ to: '/rbac/role' });
    }
  },
  notFoundComponent: AdminNotFoundPage,
  component: RbacLayout,
});

const TAB_BASE =
  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-muted-foreground no-underline transition-colors hover:text-foreground';
const TAB_ACTIVE = 'bg-[color:var(--lavender-soft)] !text-lavender';

function RbacLayout() {
  const badges = useSidebarBadges();
  const pendingTotal =
    (badges['sidebar-user-agency'] ?? 0) +
    (badges['sidebar-user-outlet'] ?? 0) +
    (badges['sidebar-service-requests'] ?? 0) +
    (badges['sidebar-service-other'] ?? 0);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b px-6 pt-6 md:px-8">
        {rbacSections.map((section) => (
          <Link
            key={section.key}
            to={section.href}
            activeOptions={{ exact: true }}
            className={TAB_BASE}
            activeProps={{ className: cn(TAB_BASE, TAB_ACTIVE) }}
          >
            <section.icon className="h-4 w-4" />
            {section.title}
          </Link>
        ))}
        <Link
          to="/admin/rbac/pending"
          activeOptions={{ exact: true }}
          className={TAB_BASE}
          activeProps={{ className: cn(TAB_BASE, TAB_ACTIVE) }}
        >
          <Clock className="h-4 w-4" />
          Pending
          {pendingTotal > 0 && (
            <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[color:var(--signal-warn-soft)] px-1.5 text-[11px] font-bold text-[color:var(--signal-warn)]">
              {pendingTotal}
            </span>
          )}
        </Link>
      </div>
      <Outlet />
    </div>
  );
}
