import { PortalShell } from "@agency-portal/components/portal/PortalShell";
import { Toasts } from "@agency-portal/components/Toasts";
import { buildBlankPortalReset } from "@agency-portal/lib/demo-seed";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import {
	canAccessOutletPath,
	getOutletDefaultRoute,
	getOutletNavItems,
} from "@agency-portal/lib/outlet-rbac";
import { useStore } from "@agency-portal/lib/store";
import {
	createFileRoute,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PortalGateLoading } from "@/components/layout/portal-gate-loading";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { ensurePortal, guardPortalClient } from "@/lib/auth/guards";
import { useProfile } from "@/lib/auth/use-profile";
import "@agency-portal/prototype-theme.css";
import "@agency-portal/agency-app-overrides.css";

export const Route = createFileRoute("/outlet")({
	// Outlet-only tree: admin/agency sessions are sent to their own portal.
	beforeLoad: () => ensurePortal("outlet"),
	component: OutletLayout,
});

function OutletLayout() {
	// Client-only demo island (zustand + window/matchMedia); defer to the client
	// to keep SSR hydration clean.
	const [mounted, setMounted] = useState(false);
	const [orgStatus, setOrgStatus] = useState<string | null>(null);
	const { data: profile } = useProfile();
	const modulePermissions =
		getPortalSessionKind() === "real" ? profile?.modulePermissions : undefined;

	// Real backend accounts see the same pages with no data; demo accounts keep
	// their seeded data. Blank before the first portal render so real accounts
	// never flash the demo seed. The persist merge re-seeds empty slices on
	// reload, so this must run on every mount (not just at login).
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const ok = await guardPortalClient("outlet");
			if (cancelled || !ok) return;
			if (getPortalSessionKind() === "real") {
				useStore.setState(buildBlankPortalReset());
				// The blank reset wipes outletOwner / sub-role to demo defaults every
				// mount; re-apply the persisted real identity so it survives reloads.
				const identity = getOutletIdentity();
				if (identity) {
					setOrgStatus(identity.outletStatus);
					useStore.getState().setOutletSubRole(identity.subRole);
					void import("@agency-portal/lib/outlet-demo").then(
						({ BLANK_OUTLET_OWNER }) => {
							useStore.setState((st) => ({
								outletOwner: {
									...BLANK_OUTLET_OWNER,
									orgName: identity.outletName,
									email: st.outletOwner.email,
									ownerName: st.outletOwner.ownerName,
									accountActivated: identity.outletStatus === "active",
								},
								outletWorkspace: {
									...st.outletWorkspace,
									outletName: identity.outletName,
								},
							}));
						},
					);
				} else {
					setOrgStatus(null);
				}
			} else {
				setOrgStatus(null);
			}
			setMounted(true);
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const navigate = useNavigate();
	const { pathname } = useLocation();
	const outletSubRole = useStore((s) => s.outletSubRole);
	const navItems = getOutletNavItems(
		outletSubRole,
		orgStatus,
		modulePermissions,
	);

	useEffect(() => {
		if (!mounted) return;
		if (
			canAccessOutletPath(
				outletSubRole,
				pathname,
				orgStatus,
				modulePermissions,
			)
		) {
			return;
		}
		const dest = getOutletDefaultRoute(
			outletSubRole,
			orgStatus,
			modulePermissions,
		);
		if (dest === pathname || dest === pathname.replace(/\/$/, "")) return;
		navigate({ to: dest, replace: true });
	}, [
		mounted,
		pathname,
		outletSubRole,
		orgStatus,
		modulePermissions,
		navigate,
	]);

	if (!mounted) {
		return <PortalGateLoading variant="portal" />;
	}

	return (
		<PortalShell portal="outlet" navItems={navItems} overlay={<Toasts />}>
			<Outlet />
		</PortalShell>
	);
}
