import { Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { PortalGateLoading } from "@/components/layout/portal-gate-loading";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalLoadingShadow } from "@/components/ui/loading-shadow";
import { SidebarInset } from "@/components/ui/sidebar";
import { guardPortalClient } from "@/lib/auth/guards";

export function AdminLayout() {
	// sessionStorage tokens are invisible during SSR, so beforeLoad cannot
	// authorize on the server. Hold a loading shell until the client confirms
	// the canonical `admin` role — otherwise outlet/agency sessions would
	// render the admin tree on a hard navigation to /admin.
	const [allowed, setAllowed] = useState(false);

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
		<div className="flex h-svh max-h-svh w-full overflow-hidden">
			<Sidebar />
			<SidebarInset className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
				<Header />
				<main className="min-h-0 flex-1 overflow-y-auto">
					<Outlet />
					<div className="mt-10 p-5" />
				</main>
				<GlobalLoadingShadow />
			</SidebarInset>
		</div>
	);
}
