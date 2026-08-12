import { PortalShell } from "@agency-portal/components/portal/PortalShell";
import { Toasts } from "@agency-portal/components/Toasts";
import {
	getAgencyIdentity,
	saveAgencyIdentity,
} from "@agency-portal/lib/agency-identity";
import {
	canAccessAgencyPath,
	getAgencyDefaultRoute,
	getAgencyNavItems,
} from "@agency-portal/lib/agency-rbac";
import { buildBlankPortalReset } from "@agency-portal/lib/demo-seed";
import { resolveAgencyIdentityForUser } from "@agency-portal/lib/resolve-session-identity";
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
				// buildBlankPortalReset resets agencyOwner to the demo default, so
				// re-apply the operator's real identity on every mount.
				//
				// The stored value is only a CACHE. When this tab has none — a fresh
				// tab, or one whose cache a sign-out elsewhere cleared — re-derive from
				// the signed-in account's own memberships, so the identity is tied to
				// the token instead of to whatever another tab last wrote.
				let identity = getAgencyIdentity();
				if (!identity && profile?.id) {
					identity = await resolveAgencyIdentityForUser(profile.id);
					if (cancelled) return;
					if (identity) saveAgencyIdentity(identity);
				}
				if (identity) {
					const resolved = identity;
					setOrgStatus(resolved.agencyStatus);
					// AWAITED, not fire-and-forget: `setMounted(true)` below opens the
					// gate, and a sub-role applied after that first paint means the
					// screen renders once against whatever was in memory. That window
					// is how an owner saw the finance "Access restricted" card.
					const { BLANK_AGENCY_OWNER } = await import(
						"@agency-portal/lib/agency-demo"
					);
					if (cancelled) return;
					useStore.setState((st) => ({
						activeAgencyId: resolved.agencyId,
						agencySubRole: resolved.subRole,
						agencyOwner: {
							...BLANK_AGENCY_OWNER,
							orgName: resolved.orgName,
							email: st.agencyOwner.email,
							ownerName: st.agencyOwner.ownerName,
							accountActivated: resolved.agencyStatus === "active",
						},
					}));
				} else {
					// An unresolvable identity is not permission to keep the last one.
					// Clearing drops the console to the default lane instead of leaving
					// a sub-role that outlived the session it was derived from.
					setOrgStatus(null);
					useStore.setState({ agencySubRole: null });
				}
			} else {
				setOrgStatus(null);
			}
			setMounted(true);
		})();
		return () => {
			cancelled = true;
		};
		// `profile.id` is fetched, so it arrives AFTER the first mount. Without it
		// here the effect would run once with no id and the re-derive above could
		// never fire. The re-run is safe: every step is idempotent.
	}, [profile?.id]);

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
			canAccessAgencyPath(agencySubRole, pathname, orgStatus, modulePermissions)
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
