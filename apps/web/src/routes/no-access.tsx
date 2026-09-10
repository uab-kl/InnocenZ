import { createFileRoute } from "@tanstack/react-router";
import { Clock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@/lib/auth/use-auth-actions";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";
import { portalCodeLabel } from "@/lib/portal-i18n/rbac-label";

export const noAccessTitle = "No Access | Innocenz";

export const noAccessHead = () => ({
	meta: [{ title: noAccessTitle }],
});

/**
 * `/no-access` is a bare route with no portal shell above it, so it carries
 * the locale provider itself — and it must be a WRAPPER, because a component
 * cannot consume a context it mounts. `usePortalLocale` renders English
 * silently rather than throwing when un-provided, which is exactly the failure
 * that would have gone unnoticed here.
 */
export function NoAccessPage() {
	return (
		<PortalLocaleProvider>
			<NoAccessBody />
		</PortalLocaleProvider>
	);
}

function NoAccessBody() {
	const { t } = usePortalLocale();
	const { logout } = useAuthActions();
	const { user } = useCurrentUser();
	const { needs, link } = Route.useSearch();
	// `needs` stays the stored portal code — it is what `validateSearch`
	// narrows and what the URL carries. Only the LABEL follows the locale, via
	// the same resolver the RBAC screens use, so "Agency" cannot mean one thing
	// here and another there.
	const needsLabel = needs ? portalCodeLabel(needs, t) : undefined;

	/*
	 * ⚠️ THE THIRD SITUATION — asked to join, nobody has answered yet.
	 *
	 * A pending membership grants nothing, so such an account holds no portal
	 * role and reaches this page by the same route as a genuinely portal-less
	 * one. The two are NOT the same thing to the person reading the screen:
	 * rendering the red refusal for both contradicted, word for word, the
	 * sign-up confirmation they had seen seconds earlier ("you can sign in
	 * now, and the team opens once they approve you").
	 *
	 * Only when there is no `needs` — a wrong-portal link is a different
	 * problem, and a pending request is not the answer to it.
	 */
	const waiting = needs
		? undefined
		: user?.organisations?.find((o) => o.membershipStatus === "pending");

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
	return (
		<div className="fixed inset-0 z-50 flex min-h-svh w-full items-center justify-center bg-background px-6">
			<div className="flex w-full max-w-xl flex-col items-center text-center">
				{/* Amber for waiting, red only for a real refusal — the standing status
				    colour code, which every receipt surface already follows. */}
				{waiting ? (
					<div className="mb-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/15">
						<Clock className="h-9 w-9 text-amber-400" strokeWidth={1.5} />
					</div>
				) : (
					<div className="mb-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/15">
						<ShieldAlert
							className="h-9 w-9 text-destructive"
							strokeWidth={1.5}
						/>
					</div>
				)}

				<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					{waiting
						? t.invitePages.waitingTitle
						: needsLabel
							? fill(t.invitePages.linkNeedsPortal, { portal: needsLabel })
							: t.invitePages.noPortalTitle}
				</h1>

				{waiting ? (
					<>
						<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
							{fill(t.invitePages.waitingBody, {
								org: waiting.name,
								role: portalRoleLabel(waiting.subRole, t),
							})}
						</p>
						<p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
							{t.invitePages.waitingHint}
						</p>
					</>
				) : needsLabel ? (
					<>
						<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
							{t.invitePages.signedInAs}{" "}
							<span className="font-semibold text-foreground">
								{user?.email ?? t.invitePages.thisAccount}
							</span>
						</p>
						<p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
							{fill(t.invitePages.wrongPortalBody, { portal: needsLabel })}
						</p>
						{link ? (
							<p className="mt-2 max-w-md break-all text-sm text-muted-foreground">
								{t.invitePages.linkYouOpened}{" "}
								<span className="font-mono">{link}</span>
							</p>
						) : null}
						<p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
							{fill(t.invitePages.wrongPortalHint, { portal: needsLabel })}
						</p>
					</>
				) : (
					<p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
						{t.invitePages.noPortalBody}
					</p>
				)}

				<Button
					size="lg"
					className="mt-8 h-11 gap-2.5 px-8 text-white dark:text-[#1a1726]"
					onClick={() => logout()}
				>
					{needsLabel
						? t.invitePages.signOutSwitchAccount
						: t.invitePages.backToLogin}
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
