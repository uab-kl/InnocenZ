import { SpecialServiceSection } from "@agency-portal/components/agency/SpecialServiceSection";
import { IzCard, IzPageTitle } from "@agency-portal/components/iz/ui";
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
