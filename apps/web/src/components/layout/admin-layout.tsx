import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminBackToTop } from "@/components/admin/admin-design-chrome";
import "@/components/admin/admin-design.css";
import { Header } from "@/components/layout/header";
import { PortalGateLoading } from "@/components/layout/portal-gate-loading";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalLoadingShadow } from "@/components/ui/loading-shadow";
import { SidebarInset } from "@/components/ui/sidebar";
import { guardPortalClient } from "@/lib/auth/guards";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { PortalLocaleProvider } from "@/lib/portal-i18n/context";

export function AdminLayout() {
	// sessionStorage tokens are invisible during SSR, so beforeLoad cannot
	// authorize on the server. Hold a loading shell until the client confirms
	// the canonical `admin` role — otherwise outlet/agency sessions would
	// render the admin tree on a hard navigation to /admin.
	const [allowed, setAllowed] = useState(false);
	const { user } = useCurrentUser();
	useEffect(() => {
		document.body.dataset.adminDesign = "approved";
		return () => {
			delete document.body.dataset.adminDesign;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		void guardPortalClient("admin").then((ok) => {
			if (!cancelled && ok) setAllowed(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!allowed) {
		return <PortalGateLoading variant="admin" />;
	}

	return (
		// Wraps the whole admin tree so the header's switcher and every page
		// below it read one locale.
		<PortalLocaleProvider accountLocale={user?.preferredLocale}>
			<div className="iz-admin-portal flex h-dvh max-h-dvh w-full overflow-hidden">
				<Sidebar />
				<SidebarInset className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<Header />
					<main className="iz-admin-viewport min-h-0 min-w-0 flex-1 overflow-y-auto">
						<Outlet />
						<div className="mt-10 p-5" />
					</main>
					<AdminBackToTop />
					<GlobalLoadingShadow />
				</SidebarInset>
			</div>
		</PortalLocaleProvider>
	);
}
