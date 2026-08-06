import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type PortalGateLoadingProps = {
	/** Admin uses the light app background; agency/outlet use the dark portal shell. */
	variant?: "admin" | "portal";
	className?: string;
};

/** Full-viewport spinner while client portal auth is resolving. */
export function PortalGateLoading({
	variant = "admin",
	className,
}: PortalGateLoadingProps) {
	const isPortal = variant === "portal";
	return (
		<div
			className={cn(
				"flex min-h-svh w-full flex-col items-center justify-center gap-3",
				isPortal ? "bg-[#0e0a1a] text-white/70" : "bg-background text-muted-foreground",
				className,
			)}
			role="status"
			aria-live="polite"
			aria-label="Loading"
		>
			<Loader2
				className={cn(
					"h-8 w-8 animate-spin",
					isPortal ? "text-white/80" : "text-primary",
				)}
			/>
			<p className="text-sm font-medium tracking-wide">Loading…</p>
		</div>
	);
}
