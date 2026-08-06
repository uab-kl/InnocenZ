import { PortalShell } from "@agency-portal/components/portal/PortalShell";
import { Toasts } from "@agency-portal/components/Toasts";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	canAccessAgencyPath,
	getAgencyDefaultRoute,
	getAgencyNavItems,
} from "@agency-portal/lib/agency-rbac";
import { buildBlankPortalReset } from "@agency-portal/lib/demo-seed";
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

export const Route = createFileRoute("/agency")({
	// Agency-only tree: admin/outlet sessions are sent to their own portal.
	beforeLoad: () => ensurePortal("agency"),
	component: AgencyLayout,
});

function AgencyLayout() {
	// The portal is a client-only demo island (zustand persist + window /
	// matchMedia usage), so defer all portal rendering to the client to keep
	// SSR hydration clean.
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
			const ok = await guardPortalClient("agency");
			if (cancelled || !ok) return;
			if (getPortalSessionKind() === "real") {
				useStore.setState(buildBlankPortalReset());
				// buildBlankPortalReset resets agencyOwner to the demo default, so re-apply
				// the operator's real identity (resolved at sign-in) on every mount.
				const identity = getAgencyIdentity();
				if (identity) {
					setOrgStatus(identity.agencyStatus);
					void import("@agency-portal/lib/agency-demo").then(
						({ BLANK_AGENCY_OWNER }) => {
							useStore.setState((st) => ({
								activeAgencyId: identity.agencyId,
								agencySubRole: identity.subRole,
								agencyOwner: {
									...BLANK_AGENCY_OWNER,
									orgName: identity.orgName,
									email: st.agencyOwner.email,
									ownerName: st.agencyOwner.ownerName,
									accountActivated: identity.agencyStatus === "active",
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
	const agencySubRole = useStore((s) => s.agencySubRole);
	const navItems = getAgencyNavItems(
		agencySubRole,
		orgStatus,
		modulePermissions,
	);

	useEffect(() => {
		if (!mounted) return;
		if (
			canAccessAgencyPath(
				agencySubRole,
				pathname,
				orgStatus,
				modulePermissions,
			)
		) {
			return;
		}
		const dest = getAgencyDefaultRoute(
			agencySubRole,
			orgStatus,
			modulePermissions,
		);
		// Avoid replace-loop when default is also blocked (keeps shell visible).
		if (dest === pathname || dest === pathname.replace(/\/$/, "")) return;
		navigate({ to: dest, replace: true });
	}, [
		mounted,
		pathname,
		agencySubRole,
		orgStatus,
		modulePermissions,
		navigate,
	]);

	if (!mounted) {
		return <PortalGateLoading variant="portal" />;
	}

	return (
		<PortalShell portal="agency" navItems={navItems} overlay={<Toasts />}>
			<Outlet />
		</PortalShell>
	);
}
