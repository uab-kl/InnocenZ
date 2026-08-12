import { PortalShell } from "@agency-portal/components/portal/PortalShell";
import { Toasts } from "@agency-portal/components/Toasts";
import { buildBlankPortalReset } from "@agency-portal/lib/demo-seed";
import {
	getOutletIdentity,
	saveOutletIdentity,
} from "@agency-portal/lib/outlet-identity";
import {
	canAccessOutletPath,
	getOutletDefaultRoute,
	getOutletNavItems,
} from "@agency-portal/lib/outlet-rbac";
import { resolveOutletIdentityForUser } from "@agency-portal/lib/resolve-session-identity";
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
				// mount; re-apply the real identity so it survives reloads.
				//
				// The stored value is only a CACHE. When this tab has none — a fresh
				// tab, or one whose cache a sign-out elsewhere cleared — re-derive from
				// the signed-in account's own memberships. That ties the identity to
				// the token rather than to whatever another tab last wrote, and it
				// self-heals a stale value with no re-login.
				let identity = getOutletIdentity();
				if (!identity && profile?.id) {
					identity = await resolveOutletIdentityForUser(profile.id);
					if (cancelled) return;
					if (identity) saveOutletIdentity(identity);
				}
				if (identity) {
					const resolved = identity;
					setOrgStatus(resolved.outletStatus);
					useStore.getState().setOutletSubRole(resolved.subRole);
					// AWAITED, not fire-and-forget — `setMounted(true)` below opens the
					// gate, so anything applied after it renders one frame late.
					const { BLANK_OUTLET_OWNER } = await import(
						"@agency-portal/lib/outlet-demo"
					);
					if (cancelled) return;
					useStore.setState((st) => ({
						outletOwner: {
							...BLANK_OUTLET_OWNER,
							orgName: resolved.outletName,
							email: st.outletOwner.email,
							ownerName: st.outletOwner.ownerName,
							accountActivated: resolved.outletStatus === "active",
						},
						outletWorkspace: {
							...st.outletWorkspace,
							outletName: resolved.outletName,
						},
					}));
				} else {
					// An unresolvable identity is not permission to keep the last one.
					setOrgStatus(null);
					useStore.setState({ outletSubRole: null });
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
		// never fire — the tab would sit on a missing identity and fall through to
		// demo data. The re-run is safe: every step is idempotent.
	}, [profile?.id]);

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
			canAccessOutletPath(outletSubRole, pathname, orgStatus, modulePermissions)
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
