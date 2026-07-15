import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { GlobalLoadingShadow } from '@/components/ui/loading-shadow'
import { SidebarInset } from '@/components/ui/sidebar'
import { Outlet } from '@tanstack/react-router'

export function AdminLayout() {
  return (
    <div className="flex min-h-svh w-full">
      <Sidebar />
      <SidebarInset className="flex min-h-svh flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
          <div className="mt-10 p-5" />
        </main>
        <GlobalLoadingShadow />
      </SidebarInset>
    </div>
  )
}
