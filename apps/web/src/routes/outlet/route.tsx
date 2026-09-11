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
import { PortalLocaleProvider } from "@/lib/portal-i18n/context";
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
				// The stored value is only a CACHE, and it is only this account's cache
				// when it SAYS SO. A new tab seeds itself from localStorage, so the
				// venue and lane sitting there may belong to whoever last signed in on
				// this machine — an Owner inheriting a Director cache kept every
				// module-granted screen (Post Job, Workspace) and silently lost the
				// matrix-only ones, Reduce cutlost among them. So the cache is accepted
				// only for the signed-in user, and only once we KNOW who that is:
				// before the profile arrives there is nothing to check against, and a
				// moment of least privilege is recoverable where a moment of someone
				// else's lane is not. The effect re-runs on `profile.id`.
				//
				// A refused cache is not a dead end: re-derive from the account's own
				// memberships and write it back, so a stale lane self-heals with no
				// re-login.
				//
				// ⚠️ AND THE CACHE IS RE-CHECKED EVERY LOAD, not only when it is missing.
				//
				// Owner, 11 Sep 2026: "the owner have change to financial head, but the
				// person log in havent update again when refreshed the page?"
				//
				// This used to re-derive ONLY when there was no cache, so a lane changed
				// by somebody else never arrived: the sidebar kept saying Ops Head after
				// a refresh, a sign-out and back in being the only cure. The person's
				// job title is not theirs to hold a copy of — the organisation decides
				// it, and the server is the only place that knows.
				//
				// The cached value is still used for the FIRST paint so nothing waits on
				// a request; the re-derive then corrects it in the same effect, before
				// the gate below opens.
				let identity = profile?.id ? getOutletIdentity(profile.id) : null;
				if (profile?.id) {
					const fresh = await resolveOutletIdentityForUser(profile.id);
					if (cancelled) return;
					if (fresh) {
						identity = fresh;
						saveOutletIdentity(fresh);
					}
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
		// Outside PortalShell so the shell's own chrome — sidebar, greeting, and
		// the switcher in the sidebar foot — reads the same locale as the pages
		// rendered inside it.
		<PortalLocaleProvider accountLocale={profile?.preferredLocale}>
			<PortalShell portal="outlet" navItems={navItems} overlay={<Toasts />}>
				<Outlet />
			</PortalShell>
		</PortalLocaleProvider>
	);
}
