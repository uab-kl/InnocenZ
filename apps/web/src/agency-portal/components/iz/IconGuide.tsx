import {
	ChevronDown,
	CircleHelp,
	iconForNav,
} from "@agency-portal/lib/lucide-label-icons";
import { cn } from "@agency-portal/lib/utils";

/**
 * User-facing legend that teaches what each Lucide icon means.
 * Icons are pulled from the shared label→icon map (lucide-label-icons),
 * so this guide always matches the icons shown across every role/page.
 * Presentation only — a native <details> disclosure, no app state.
 */
const GUIDE_ENTRIES: { label: string; meaning: string }[] = [
	{ label: "Today", meaning: "Home — tonight's live shift and overview" },
	{ label: "Post Job", meaning: "Create a new job / special-service posting" },
	{ label: "Roster", meaning: "Schedule & calendar of shifts" },
	{ label: "Shifts", meaning: "Your booked shifts" },
	{ label: "Check-In", meaning: "GPS check-in at the venue" },
	{ label: "Payment", meaning: "Wallet, payouts & vouchers" },
	{ label: "Reports", meaning: "Sales dashboard & analytics" },
	{ label: "History", meaning: "Past shifts & activity log" },
	{ label: "Manage PR", meaning: "Staff & manage PR personnel" },
	{ label: "Manage Outlet", meaning: "Manage linked outlets" },
	{ label: "Subscription", meaning: "Billing plan & subscription" },
	{ label: "Workspace", meaning: "Operations controls" },
	{ label: "Settings", meaning: "Preferences & account settings" },
	{ label: "Profile", meaning: "Your account & persona" },
	{ label: "Notifications", meaning: "Alerts & updates" },
	{ label: "Earned", meaning: "Shift payout — wages + drink commission" },
	{ label: "Drinks", meaning: "Drinks sold & logged on the shift" },
	{ label: "Tips", meaning: "Guest tips collected on the shift" },
	{ label: "Owner", meaning: "Owner role" },
	{ label: "Finance", meaning: "Finance role" },
	{ label: "Sign out", meaning: "Log out of the app" },
];

export function IconGuide({ className }: { className?: string }) {
	return (
		<details className={cn("iz-icon-guide", className)}>
			<summary className="iz-icon-guide__summary">
				<span className="iz-icon-guide__summary-label">
					<CircleHelp
						className="iz-icon-guide__summary-icon"
						strokeWidth={2}
						aria-hidden
					/>
					Icon guide
				</span>
				<ChevronDown
					className="iz-icon-guide__chevron"
					strokeWidth={2.4}
					aria-hidden
				/>
			</summary>
			<p className="iz-icon-guide__hint">
				What each icon means — same icon, same meaning everywhere.
			</p>
			<ul className="iz-icon-guide__list">
				{GUIDE_ENTRIES.map(({ label, meaning }) => {
					const Icon = iconForNav(label);
					return (
						<li key={label} className="iz-icon-guide__row">
							<span className="iz-icon-guide__badge">
								<Icon
									className="iz-icon-guide__icon"
									strokeWidth={2}
									aria-hidden
								/>
							</span>
							<span className="iz-icon-guide__text">
								<b className="iz-icon-guide__label">{label}</b>
								<span className="iz-icon-guide__meaning">{meaning}</span>
							</span>
						</li>
					);
				})}
			</ul>
		</details>
	);
}
