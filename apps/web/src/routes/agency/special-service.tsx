import { SpecialServiceSection } from "@agency-portal/components/agency/SpecialServiceSection";
import { IzCard, IzPageTitle } from "@agency-portal/components/iz/ui";
import { agencyCan } from "@agency-portal/lib/agency-rbac";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/agency/special-service")({
	component: AgencySpecialService,
});

function AgencySpecialService() {
	const agencySubRole = useStore((s) => s.agencySubRole);
	const agencyOwner = useStore((s) => s.agencyOwner);

	if (!agencyCan(agencySubRole, "viewPv")) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>Access restricted</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						You do not have access to job postings.
					</p>
				</IzCard>
			</div>
		);
	}

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>Job posting</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">
					{agencyOwner.orgName} · book services for PRs & outlets
				</p>
			</header>

			<SpecialServiceSection canBook={agencyCan(agencySubRole, "raisePv")} />
		</div>
	);
}
