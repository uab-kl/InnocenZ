import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@/lib/auth/use-auth-actions";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export const noAccessTitle = "No Access | Innocenz";

export const noAccessHead = () => ({
	meta: [{ title: noAccessTitle }],
});

const PORTAL_LABEL: Record<string, string> = {
	admin: "Admin",
	agency: "Agency",
	outlet: "Outlet",
};

export function NoAccessPage() {
	const { logout } = useAuthActions();
	const { user } = useCurrentUser();
	const { needs, link } = Route.useSearch();
	const needsLabel = needs ? PORTAL_LABEL[needs] : undefined;

	/*
	 * Two different situations share this page.
	 *
	 * WRONG PORTAL (`needs` present) — the visitor opened a link belonging to a
	 * portal this account does not hold, typically a URL copied from another
	 * browser or from their own other account. This used to redirect silently to
	 * whatever portal they DO hold, which is what read as "the role changed by
	 * itself": a page they never asked for, and nothing saying why. So name the
	 * account they are actually signed in as, name the portal the link needs, and
	 * offer the one action that resolves it.
	 *
	 * NO PORTAL AT ALL — the original case: an account with no web portal.
	 */
	const wrongPortal = Boolean(needsLabel);

	return (
		<div className="fixed inset-0 z-50 flex min-h-svh w-full items-center justify-center bg-background px-6">
			<div className="flex w-full max-w-xl flex-col items-center text-center">
				<div className="mb-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/15">
					<ShieldAlert className="h-9 w-9 text-destructive" strokeWidth={1.5} />
				</div>

				<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					{wrongPortal
						? `This link needs the ${needsLabel} portal`
						: "You cannot access this web portal"}
				</h1>

				{wrongPortal ? (
					<>
						<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
							You are signed in as{" "}
							<span className="font-semibold text-foreground">
								{user?.email ?? "this account"}
							</span>
							, which does not have access to the {needsLabel} portal. Your role
							has not changed — this browser is simply signed in to a different
							account.
						</p>
						{link ? (
							<p className="mt-2 max-w-md break-all text-sm text-muted-foreground">
								Link you opened: <span className="font-mono">{link}</span>
							</p>
						) : null}
						<p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
							Sign out and sign in with the {needsLabel} account to open it. A
							link cannot carry a sign-in between browsers — if it could, anyone
							who received it would be signed in as you.
						</p>
					</>
				) : (
					<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
						Your account role does not have a web portal on InnocenZ yet. Please
						contact support if you believe this is a mistake.
					</p>
				)}

				<Button
					size="lg"
					className="mt-8 h-11 gap-2.5 px-8 text-white dark:text-[#1a1726]"
					onClick={() => logout()}
				>
					{wrongPortal ? "Sign out and switch account" : "Back to login"}
				</Button>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/no-access")({
	validateSearch: (
		search: Record<string, unknown>,
	): { needs?: string; link?: string } => {
		const raw = typeof search.needs === "string" ? search.needs : undefined;
		const needs =
			raw === "admin" || raw === "agency" || raw === "outlet" ? raw : undefined;
		// Displayed, never navigated to — but keep it same-origin anyway so a
		// crafted link cannot render an off-site URL as if the app produced it.
		const rawLink = typeof search.link === "string" ? search.link : undefined;
		const linkOk =
			rawLink?.startsWith("/") && !rawLink.startsWith("//")
				? rawLink
				: undefined;
		return {
			...(needs ? { needs } : {}),
			...(linkOk ? { link: linkOk } : {}),
		};
	},
	head: noAccessHead,
	component: NoAccessPage,
});
