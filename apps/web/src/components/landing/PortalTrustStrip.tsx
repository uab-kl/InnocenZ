import { MaterialIcon } from "@/components/landing/MaterialIcon";

const portals = [
	{ icon: "storefront", label: "Outlet" },
	{ icon: "groups", label: "PR Agency" },
	{ icon: "star", label: "PR" },
] as const;

export function PortalTrustStrip({ className = "" }: { className?: string }) {
	return (
		<div
			className={`relative z-10 flex flex-col gap-4 rounded-xl border border-foreground/8 bg-background/75 p-5 backdrop-blur-md ${className}`}
		>
			<div className="flex flex-wrap gap-2.5">
				{portals.map((p) => (
					<span
						key={p.label}
						className="inline-flex items-center gap-2 rounded-full border border-royal-gold/30 bg-royal-gold-soft px-4 py-2.5 text-lg font-bold uppercase tracking-[0.1em] text-foreground/85 sm:text-xl"
					>
						<MaterialIcon name={p.icon} className="!text-xl text-royal-gold" />
						{p.label}
					</span>
				))}
			</div>
			<p className="text-lg font-semibold text-foreground/65 sm:text-xl">
				Synced in real time — roster to signed payout
			</p>
		</div>
	);
}
