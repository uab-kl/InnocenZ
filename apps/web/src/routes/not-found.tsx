import { createFileRoute, Link } from "@tanstack/react-router";
import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";

export const notFoundTitle = "Not Found | Innocenz";

export const notFoundHead = () => ({
	meta: [{ title: notFoundTitle }],
});

/**
 * The root route's `notFoundComponent`, so nothing above this carries the
 * locale — the page mounts the provider itself and consumes it one level
 * down, the same shape `/policy` and `/delete-account` use.
 *
 * It has to be a wrapper: a component cannot read a context it mounts, and
 * `usePortalLocale` does NOT throw when un-provided — it silently renders
 * English. A consumer up here would have looked wired and never been.
 *
 * The copy itself is `webShell.notFound*`, shared with the admin shell's own
 * 404 (`components/layout/admin-not-found`) so the two cannot drift.
 */
export function NotFoundPage() {
	return (
		<PortalLocaleProvider>
			<NotFoundBody />
		</PortalLocaleProvider>
	);
}

function NotFoundBody() {
	const { t } = usePortalLocale();

	return (
		<div className="fixed inset-0 z-50 flex min-h-svh w-full items-center justify-center bg-background px-6">
			<div className="flex w-full max-w-xl flex-col items-center text-center">
				<div className="mb-10 flex items-center justify-center gap-6">
					<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-white dark:text-[#1a1726] shadow-[0_0_24px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
						Z
					</div>

					<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
						<FileQuestion className="h-9 w-9 text-primary" strokeWidth={1.5} />
					</div>
				</div>

				<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					{t.webShell.notFoundTitle}
				</h1>

				<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
					{t.webShell.notFoundBody}
				</p>

				<Button
					asChild
					size="lg"
					className="mt-8 h-11 gap-2.5 px-8 text-white dark:text-[#1a1726]"
				>
					<Link to="/" className="text-inherit [&_svg]:text-inherit">
						<Home className="h-4 w-4" />
						{t.webShell.backToHome}
					</Link>
				</Button>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/not-found")({
	head: notFoundHead,
	component: NotFoundPage,
});
