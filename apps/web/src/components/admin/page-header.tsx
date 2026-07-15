import type { ComponentType, ReactNode } from "react";

/**
 * PageShell — standard admin page padding + vertical rhythm.
 * Matches the redesigned dashboard shell (flex-col gap-6 p-6 md:p-8).
 */
export function PageShell({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`flex flex-col gap-6 p-6 md:p-8${className ? ` ${className}` : ""}`}
		>
			{children}
		</div>
	);
}

export type PageHeaderProps = {
	title: ReactNode;
	description?: ReactNode;
	/** Optional lucide icon rendered in a lavender tile to the left of the title. */
	icon?: ComponentType<{ className?: string }>;
	/** Optional gold kicker pill (with a live dot) above the title. */
	kicker?: ReactNode;
	/** Right-aligned actions (buttons, filters). */
	actions?: ReactNode;
};

/**
 * PageHeader — the shared admin page head.
 * Big display title, muted description, optional icon tile + gold kicker pill,
 * and a right-aligned actions slot. Mirrors the dashboard page head.
 */
export function PageHeader({
	title,
	description,
	icon: Icon,
	kicker,
	actions,
}: PageHeaderProps) {
	return (
		<div className="flex flex-wrap items-end justify-between gap-5">
			<div className="flex items-start gap-3.5">
				{Icon && (
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color:var(--lavender-soft)] text-lavender">
						<Icon className="h-6 w-6" />
					</span>
				)}
				<div>
					{kicker && (
						<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[color:var(--royal-gold-line)] bg-[color:var(--royal-gold-soft)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--royal-gold)]">
							<span
								className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]"
								aria-hidden
							/>
							{kicker}
						</div>
					)}
					<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
						{title}
					</h1>
					{description && (
						<p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">
							{description}
						</p>
					)}
				</div>
			</div>
			{actions && (
				<div className="flex flex-wrap items-center gap-3">{actions}</div>
			)}
		</div>
	);
}
