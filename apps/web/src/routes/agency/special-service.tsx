import { SpecialServiceSection } from "@agency-portal/components/agency/SpecialServiceSection";
import { IzCard, IzPageTitle } from "@agency-portal/components/iz/ui";
import { AGENCY_SERVICES_ENABLED } from "@agency-portal/lib/phase-flags";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export const Route = createFileRoute("/agency/special-service")({
	component: AgencySpecialService,
});

function AgencySpecialService() {
	const { t } = usePortalLocale();
	const can = useAgencyCan();
	const agencyOwner = useStore((s) => s.agencyOwner);

	/*
	 * Phase check BEFORE the role check — the same order `/outlet/special-service`
	 * uses, and for the same reason: telling somebody their role is wrong is only
	 * honest once the feature exists to be denied.
	 *
	 * This page had no phase check at all and no nav item either, so it was
	 * reachable only by typing the URL and then rendered a full working screen
	 * for a flow the product does not offer — venues cannot order the services
	 * it prices (`OUTLET_SERVICES_ENABLED` is off).
	 */
	if (!AGENCY_SERVICES_ENABLED) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>{t.postJob.notAvailableYet}</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						{t.agencyMisc.specialServiceComingLater}
					</p>
				</IzCard>
			</div>
		);
	}

	if (!can("viewPv")) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>{t.managePr.accessRestricted}</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">{t.agencyMisc.noAccessJobPostings}</p>
				</IzCard>
			</div>
		);
	}

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>{t.agencyMisc.jobPosting}</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">
					{fill(t.agencyMisc.bookServicesSubtitle, {
						org: agencyOwner.orgName,
					})}
				</p>
			</header>

			<SpecialServiceSection canBook={can("raisePv")} />
		</div>
	);
}
