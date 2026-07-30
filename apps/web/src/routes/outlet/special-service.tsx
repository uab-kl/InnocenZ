import { IzCard } from "@agency-portal/components/iz/ui";
import { outletCan } from "@agency-portal/lib/outlet-rbac";
import { OUTLET_SERVICES_ENABLED } from "@agency-portal/lib/phase-flags";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/outlet/special-service")({
	component: OutletSpecialServiceRedirect,
});

/**
 * Entry point for outlet service ordering.
 *
 * It has no UI of its own — when the feature is on it hands off to Post Job's
 * Services tab. While the feature is OFF it must say so here, because the tab it
 * would redirect to cannot render: Post Job would answer "Access restricted",
 * which reads as a permissions problem to a role that holds the permission.
 */
function OutletSpecialServiceRedirect() {
	const outletSubRole = useStore((s) => s.outletSubRole);

	// Phase check BEFORE the role check. Telling someone their role is wrong is
	// only honest once the feature exists to be denied.
	if (!OUTLET_SERVICES_ENABLED) {
		return (
			<div className="iz-screen">
				<header>
					<h2 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
						Not available yet
					</h2>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						Ordering agency services is coming in a later release. Nothing needs
						changing on your account.
					</p>
				</IzCard>
			</div>
		);
	}

	if (
		!outletCan(outletSubRole, "orderSpecialService") &&
		!outletCan(outletSubRole, "postJob")
	) {
		return (
			<div className="iz-screen">
				<header>
					<h2 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
						Access restricted
					</h2>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						Your outlet role cannot access job postings.
					</p>
				</IzCard>
			</div>
		);
	}

	return (
		<Navigate to="/outlet/bookings" search={{ tab: "services" }} replace />
	);
}
