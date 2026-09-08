import { AppHeader } from "@agency-portal/components/Nav";
import { signOutToWelcome } from "@agency-portal/lib/go-welcome";
import { useStore } from "@agency-portal/lib/store";
import { LogOut, type LucideIcon, Shield } from "lucide-react";

export function PortalProfile({
	subtitle,
	defaultName,
	rows,
}: {
	subtitle: string;
	defaultName: string;
	rows: { icon: LucideIcon; label: string; value: string }[];
}) {
	const { user } = useStore();

	return (
		<div>
			<AppHeader subtitle={subtitle} title="Profile" />
			<div className="px-5 pt-5">
				<div className="flex flex-col items-center rounded-3xl bg-gradient-surface p-6 shadow-card">
					<div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-primary text-3xl shadow-glow">
						{(user?.name ?? defaultName[0]).toUpperCase()}
					</div>
					<div className="mt-3 text-lg iz-heading font-semibold">
						{user?.name ?? defaultName}
					</div>
					<div className="text-[11px] text-muted-foreground">
						{user?.email ?? "guest@innocenz.app"}
					</div>
					<div className="mt-3 flex items-center gap-1 text-[11px] text-success">
						<Shield className="h-3 w-3" /> Verified
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
					<LogOut className="h-4 w-4" /> Sign out
				</button>
			</div>
		</div>
	);
}
