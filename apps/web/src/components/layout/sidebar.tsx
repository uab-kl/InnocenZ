import { useEffect, useState } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { useCurrentUser } from '@/lib/auth/use-current-user'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sidebar as SidebarUi,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  sidebarSections,
  type SidebarNavItem,
  type SidebarSection,
} from '@/constants/links'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const location = useLocation()
  const { user } = useCurrentUser()
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'

  const isActive = (href: string) => {
    const cleanPathname = location.pathname.replace(/^\/en/, '')
    const cleanHref = href.replace(/^\/en/, '')
    const pathnameWithoutQuery = cleanPathname.split('?')[0]
    const hrefWithoutQuery = cleanHref.split('?')[0]

    return (
      pathnameWithoutQuery === hrefWithoutQuery ||
      pathnameWithoutQuery.startsWith(`${hrefWithoutQuery}/`)
    )
  }

  const hasPermission = (permission: string) => {
    if (permission === '*') return true

    const grants = [
      ...(user?.readPermission ?? []),
      ...(user?.createPermission ?? []),
      ...(user?.updatePermission ?? []),
    ]

    return grants.includes('*') || grants.includes(permission)
  }

  const canAccess = (item: SidebarNavItem) => {
    if (!user?.readPermission?.length) {
      return item.allowedPermission.includes('*')
    }

    return item.allowedPermission.some(hasPermission)
  }

  return (
    <SidebarUi
      className="admin-sidebar relative border-r border-sidebar-border"
      collapsible="icon"
    >
      <SidebarHeader className="border-b border-sidebar-border/60 py-4">
        <div className="flex items-center justify-center gap-2 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-light to-gold-deep text-ink text-base font-bold shadow-[0_0_20px_rgba(212,175,55,0.3)]">
            Z
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              Innocen<span className="text-gold">Z</span>
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="relative">
        <ScrollArea className="h-full px-2 py-3">
          <nav aria-label="Admin navigation" className="space-y-4">
            {sidebarSections.map((section) => (
              <SidebarSectionGroup
                key={section.key}
                section={section}
                collapsed={collapsed}
                isActive={isActive}
                canAccess={canAccess}
              />
            ))}
          </nav>
        </ScrollArea>
      </SidebarContent>

      <SidebarCollapseToggle />
    </SidebarUi>
  )
}

function SidebarSectionGroup({
  section,
  collapsed,
  isActive,
  canAccess,
}: {
  section: SidebarSection
  collapsed: boolean
  isActive: (href: string) => boolean
  canAccess: (item: SidebarNavItem) => boolean
}) {
  const visibleItems = section.items.filter(canAccess)
  const sectionActive = visibleItems.some((item) => isActive(item.href))
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (sectionActive) setOpen(true)
  }, [sectionActive])

  if (visibleItems.length === 0) return null

  return (
    <div className="admin-sidebar-section">
      {!collapsed && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="admin-sidebar-section-header"
          aria-expanded={open}
        >
          <span>{section.label}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
      )}

      {open && (
        <ul className={cn('space-y-0.5', collapsed && 'space-y-1')}>
          {visibleItems.map((item) => (
            <li key={item.key}>
              <Link
                to={item.href}
                title={collapsed ? item.title : undefined}
                className={cn(
                  'admin-sidebar-nav-item',
                  isActive(item.href) && 'admin-sidebar-nav-item-active',
                  collapsed && 'justify-center px-2',
                )}
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span className="admin-sidebar-badge">{item.badge}</span>
                    )}
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SidebarCollapseToggle() {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === 'collapsed'

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className="admin-sidebar-collapse-toggle"
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <ChevronLeft
        className={cn(
          'h-3.5 w-3.5 transition-transform duration-200',
          collapsed && 'rotate-180',
        )}
      />
    </button>
  )
}
