import { PortalProfile } from "@agency-portal/components/PortalProfile";
import { useOutletProfile } from "@agency-portal/hooks/use-outlet-profile";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { outletProfileCard } from "@agency-portal/lib/outlet-profile-card";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MapPin, Settings, Store } from "lucide-react";
import { useProfile } from "@/lib/auth/use-profile";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export const Route = createFileRoute("/outlet/profile")({
	component: OutletProfile,
});

function OutletProfile() {
	const { t } = usePortalLocale();
	const outletSettings = useStore((s) => s.outletSettings);
	const storeUser = useStore((s) => s.user);
	const { data: me } = useProfile();
	// Real login → the signed-in account and the venue row; demo store otherwise.
	// Never a mix: see `outletProfileCard` for what the mix used to show.
	const profile = useOutletProfile();
	const card = outletProfileCard({
		backed: profile.backed,
		me,
		settings: profile.settings,
		orgStatus: getOutletIdentity()?.outletStatus ?? null,
		demo: {
			user: storeUser,
			venueName: outletSettings.venueName,
			location: outletSettings.location,
			fallbackName: t.today.manager,
		},
	});
	const status =
		card.status === "suspended"
			? { label: t.profile.suspendedProfileOnly, tone: "red" as const }
			: card.status === "pending"
				? { label: t.profile.pendingAdminApproval, tone: "amber" as const }
				: {
						label: t.outletSettings.verifiedOutletActive,
						tone: "green" as const,
					};
	return (
		<>
			<PortalProfile
				subtitle={t.today.innocenzOutlet}
				name={card.name}
				email={card.email}
				initial={card.initial}
				status={status}
				rows={[
					{ icon: Store, label: t.today.venue, value: card.venue },
					{ icon: MapPin, label: t.today.location, value: card.location },
				]}
			/>
			<div className="px-5 pb-6">
				<Link to="/outlet/settings" className="iz-btn iz-btn-soft w-full">
					<Settings className="h-4 w-4" /> {t.today.outletSettingsTitle}
				</Link>
			</div>
		</>
	);
}
