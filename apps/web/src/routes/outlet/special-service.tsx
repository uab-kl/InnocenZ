import { IzCard } from "@agency-portal/components/iz/ui";
import { OUTLET_SERVICES_ENABLED } from "@agency-portal/lib/phase-flags";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { usePortalLocale } from "@/lib/portal-i18n/context";

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
	const { t } = usePortalLocale();
	const can = useOutletCan();

	// Phase check BEFORE the role check. Telling someone their role is wrong is
	// only honest once the feature exists to be denied.
	if (!OUTLET_SERVICES_ENABLED) {
		return (
			<div className="iz-screen">
				<header>
					<h2 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
						{t.postJob.notAvailableYet}
					</h2>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						{t.outletRoutes.specialServiceComingLater}
					</p>
				</IzCard>
			</div>
		);
	}

	if (!can("orderSpecialService") && !can("postJob")) {
		return (
			<div className="iz-screen">
				<header>
					<h2 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
						{t.postJob.accessRestricted}
					</h2>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						{t.outletRoutes.roleCannotAccessPostings}
					</p>
				</IzCard>
			</div>
		);
	}

	return (
		<Navigate to="/outlet/bookings" search={{ tab: "services" }} replace />
	);
}
