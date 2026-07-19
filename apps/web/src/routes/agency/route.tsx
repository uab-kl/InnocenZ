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
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { ensureAuthenticated } from "@/lib/auth/guards";
import "@agency-portal/prototype-theme.css";
import "@agency-portal/agency-app-overrides.css";

export const Route = createFileRoute("/agency")({
	beforeLoad: () => ensureAuthenticated(),
	component: AgencyLayout,
});

function AgencyLayout() {
	// The portal is a client-only demo island (zustand persist + window /
	// matchMedia usage), so defer all portal rendering to the client to keep
	// SSR hydration clean.
	const [mounted, setMounted] = useState(false);

	// Real backend accounts see the same pages with no data; demo accounts keep
	// their seeded data. Blank before the first portal render so real accounts
	// never flash the demo seed. The persist merge re-seeds empty slices on
	// reload, so this must run on every mount (not just at login).
	useEffect(() => {
		if (getPortalSessionKind() === "real") {
			useStore.setState(buildBlankPortalReset());
			// buildBlankPortalReset resets agencyOwner to the demo default, so re-apply
			// the operator's real identity (resolved at sign-in) on every mount.
			const identity = getAgencyIdentity();
			if (identity) {
				useStore.setState((st) => ({
					activeAgencyId: identity.agencyId,
					agencySubRole: identity.subRole,
					agencyOwner: { ...st.agencyOwner, orgName: identity.orgName },
				}));
			}
		}
		setMounted(true);
	}, []);

	const navigate = useNavigate();
	const { pathname } = useLocation();
	const agencySubRole = useStore((s) => s.agencySubRole);
	const navItems = getAgencyNavItems(agencySubRole);

	useEffect(() => {
		if (!mounted) return;
		if (!canAccessAgencyPath(agencySubRole, pathname)) {
			navigate({ to: getAgencyDefaultRoute(agencySubRole), replace: true });
		}
	}, [mounted, pathname, agencySubRole, navigate]);

	if (!mounted) {
		return <div style={{ minHeight: "100svh", background: "#0e0a1a" }} />;
	}

	return (
		<PortalShell portal="agency" navItems={navItems} overlay={<Toasts />}>
			<Outlet />
		</PortalShell>
	);
}
