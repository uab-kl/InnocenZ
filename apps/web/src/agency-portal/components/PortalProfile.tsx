import { AppHeader } from "@agency-portal/components/Nav";
import { signOutToWelcome } from "@agency-portal/lib/go-welcome";
import { LogOut, type LucideIcon, Shield } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/** The shield line's colour, per the standing code: green settled, amber waiting, red stopped. */
const STATUS_TONE: Record<"green" | "amber" | "red", string> = {
	green: "text-success",
	amber: "text-[var(--iz-amber)]",
	red: "text-[var(--iz-red)]",
};

/**
 * The profile card. It no longer reads the demo store's `user` itself: that
 * slice is not persisted, so after a reload every real operator was shown
 * "Manager · guest@innocenz.app" under a constant "Verified". The caller now
 * says who is signed in and what the shield may truthfully claim.
 */
export function PortalProfile({
	subtitle,
	name,
	email,
	initial,
	status,
	rows,
}: {
	subtitle: string;
	name: string;
	email: string;
	initial: string;
	status: { label: string; tone: "green" | "amber" | "red" };
	rows: { icon: LucideIcon; label: string; value: string }[];
}) {
	const { t } = usePortalLocale();

	return (
		<div>
			<AppHeader subtitle={subtitle} title={t.shell.profile} />
			<div className="px-5 pt-5">
				<div className="flex flex-col items-center rounded-3xl bg-gradient-surface p-6 shadow-card">
					<div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-primary text-3xl shadow-glow">
						{initial}
					</div>
					<div className="mt-3 text-lg iz-heading font-semibold">{name}</div>
					<div className="text-[11px] text-muted-foreground">{email}</div>
					<div
						className={`mt-3 flex items-center gap-1 text-[11px] ${STATUS_TONE[status.tone]}`}
					>
						<Shield className="h-3 w-3" /> {status.label}
					</div>
				</div>

				<div className="mt-4 rounded-2xl bg-gradient-surface p-4 shadow-card">
					{rows.map((row) => (
						<div
							key={row.label}
							className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
						>
							<span className="text-muted-foreground">
								<row.icon className="h-4 w-4" />
							</span>
							<span className="text-sm">{row.label}</span>
							<span className="ml-auto text-xs text-muted-foreground">
								{row.value}
							</span>
						</div>
					))}
				</div>

				<button
					type="button"
					onClick={signOutToWelcome}
					className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-destructive/40 py-3 text-sm text-destructive"
				>
					<LogOut className="h-4 w-4" /> {t.shell.signOut}
				</button>
			</div>
		</div>
	);
}
