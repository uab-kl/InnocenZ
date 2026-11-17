import type { ComponentType, ReactNode } from "react";
import { useAdminSection } from "@/components/admin/admin-trail";

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
			className={`iz-admin-page flex min-w-0 flex-col gap-6 p-6 md:p-8${className ? ` ${className}` : ""}`}
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
	/*
	 * WHERE THE READER IS, said on the page itself.
	 *
	 * The section a page belongs to was on screen exactly once — the 14px
	 * breadcrumb in the top bar, which folds away to the leaf below 640px. So
	 * on a phone nothing anywhere said "you are in Operation", and on a desktop
	 * it said so in the quietest text on the page. Users reported not knowing
	 * where they were; this is the gap they were describing.
	 *
	 * An explicit `kicker` still wins — a page with something more urgent to
	 * say above its title (a live count, a warning) keeps saying it.
	 */
	const section = useAdminSection();
	const eyebrow = kicker ?? section;
	return (
		<div className="iz-admin-page-heading flex flex-wrap items-end justify-between gap-5">
			<div className="flex min-w-0 items-start gap-3.5">
				{Icon && (
					<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color:var(--lavender-soft)] text-lavender">
						<Icon className="h-6 w-6" />
					</span>
				)}
				<div className="min-w-0">
					{eyebrow && (
						<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[color:var(--royal-gold-line)] bg-[color:var(--royal-gold-soft)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--royal-gold)]">
							<span
								className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]"
								aria-hidden
							/>
							{eyebrow}
						</div>
					)}
					<h1 className="iz-admin-page-title font-semibold tracking-tight">
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
				<div className="iz-admin-page-actions flex min-w-0 flex-wrap items-center gap-3">
					{actions}
				</div>
			)}
		</div>
	);
}
