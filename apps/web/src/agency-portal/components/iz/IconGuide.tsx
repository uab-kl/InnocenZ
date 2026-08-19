import {
	ChevronDown,
	CircleHelp,
	iconForNav,
} from "@agency-portal/lib/lucide-label-icons";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * User-facing legend that teaches what each Lucide icon means.
 * Icons are pulled from the shared label→icon map (lucide-label-icons),
 * so this guide always matches the icons shown across every role/page.
 * Presentation only — a native <details> disclosure, no app state.
 *
 * `iconKey` is the ENGLISH word and must stay that way: `iconForNav` resolves
 * its icon by exactly that string. Passing a translated label would miss every
 * entry in the map and fall through to the default icon — twenty-one identical
 * glyphs, and not a single error to say why.
 *
 * Labels and meanings are resolved against the dictionary at render, so a word
 * like "Roster" reads the same here as it does in the sidebar this legend is
 * explaining.
 */
const GUIDE_ENTRIES: {
	iconKey: string;
	label: (t: PortalTranslations) => string;
	meaning: (t: PortalTranslations) => string;
}[] = [
	{
		iconKey: "Today",
		label: (t) => t.nav.today,
		meaning: (t) => t.iconGuide.todayMeaning,
	},
	{
		iconKey: "Post Job",
		label: (t) => t.nav.postJob,
		meaning: (t) => t.iconGuide.postJobMeaning,
	},
	{
		iconKey: "Roster",
		label: (t) => t.nav.roster,
		meaning: (t) => t.iconGuide.rosterMeaning,
	},
	{
		iconKey: "Shifts",
		label: (t) => t.iconGuide.shifts,
		meaning: (t) => t.iconGuide.shiftsMeaning,
	},
	{
		iconKey: "Check-In",
		label: (t) => t.iconGuide.checkIn,
		meaning: (t) => t.iconGuide.checkInMeaning,
	},
	{
		iconKey: "Payment",
		label: (t) => t.iconGuide.payment,
		meaning: (t) => t.iconGuide.paymentMeaning,
	},
	{
		iconKey: "Reports",
		label: (t) => t.nav.reports,
		meaning: (t) => t.iconGuide.reportsMeaning,
	},
	{
		iconKey: "History",
		label: (t) => t.nav.history,
		meaning: (t) => t.iconGuide.historyMeaning,
	},
	{
		iconKey: "Manage PR",
		label: (t) => t.nav.managePr,
		meaning: (t) => t.iconGuide.managePrMeaning,
	},
	{
		iconKey: "Manage Outlet",
		label: (t) => t.nav.manageOutlet,
		meaning: (t) => t.iconGuide.manageOutletMeaning,
	},
	{
		iconKey: "Subscription",
		label: (t) => t.nav.subscription,
		meaning: (t) => t.iconGuide.subscriptionMeaning,
	},
	{
		iconKey: "Workspace",
		label: (t) => t.nav.workspace,
		meaning: (t) => t.iconGuide.workspaceMeaning,
	},
	{
		iconKey: "Settings",
		label: (t) => t.nav.settings,
		meaning: (t) => t.iconGuide.settingsMeaning,
	},
	{
		iconKey: "Profile",
		label: (t) => t.shell.profile,
		meaning: (t) => t.iconGuide.profileMeaning,
	},
	{
		iconKey: "Notifications",
		label: (t) => t.shell.notifications,
		meaning: (t) => t.iconGuide.notificationsMeaning,
	},
	{
		iconKey: "Earned",
		label: (t) => t.iconGuide.earned,
		meaning: (t) => t.iconGuide.earnedMeaning,
	},
	{
		iconKey: "Drinks",
		label: (t) => t.money.drinks,
		meaning: (t) => t.iconGuide.drinksMeaning,
	},
	{
		iconKey: "Tips",
		label: (t) => t.money.tips,
		meaning: (t) => t.iconGuide.tipsMeaning,
	},
	{
		iconKey: "Owner",
		label: (t) => t.iconGuide.owner,
		meaning: (t) => t.iconGuide.ownerMeaning,
	},
	{
		iconKey: "Finance",
		label: (t) => t.iconGuide.finance,
		meaning: (t) => t.iconGuide.financeMeaning,
	},
	{
		iconKey: "Sign out",
		label: (t) => t.shell.signOut,
		meaning: (t) => t.iconGuide.signOutMeaning,
	},
];

export function IconGuide({ className }: { className?: string }) {
	const { t } = usePortalLocale();
	return (
		<details className={cn("iz-icon-guide", className)}>
			<summary className="iz-icon-guide__summary">
				<span className="iz-icon-guide__summary-label">
					<CircleHelp
						className="iz-icon-guide__summary-icon"
						strokeWidth={2}
						aria-hidden
					/>
					{t.common.iconGuide}
				</span>
				<ChevronDown
					className="iz-icon-guide__chevron"
					strokeWidth={2.4}
					aria-hidden
				/>
			</summary>
			<p className="iz-icon-guide__hint">{t.iconGuide.hint}</p>
			<ul className="iz-icon-guide__list">
				{GUIDE_ENTRIES.map(({ iconKey, label, meaning }) => {
					const Icon = iconForNav(iconKey);
					return (
						<li key={iconKey} className="iz-icon-guide__row">
							<span className="iz-icon-guide__badge">
								<Icon
									className="iz-icon-guide__icon"
									strokeWidth={2}
									aria-hidden
								/>
							</span>
							<span className="iz-icon-guide__text">
								<b className="iz-icon-guide__label">{label(t)}</b>
								<span className="iz-icon-guide__meaning">{meaning(t)}</span>
							</span>
						</li>
					);
				})}
			</ul>
		</details>
	);
}
