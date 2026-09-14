import { createFileRoute } from "@tanstack/react-router";
import {
	Ban,
	Building2,
	ChevronRight,
	Loader2,
	ShieldCheck,
	Store,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { PortalLanguageSwitcher } from "@/components/portal-language-switcher";
import { Button } from "@/components/ui/button";
import type { User, UserOrganisation } from "@/lib/auth";
import { hasValidTokens } from "@/lib/auth/auth-storage";
import {
	countPortalChoices,
	defaultLandingPath,
	enterOrganisation,
	holdsAdminConsole,
} from "@/lib/auth/enter-organisation";
import { kickToLogin } from "@/lib/auth/guards";
import { nextForPortal, portalOfPath } from "@/lib/auth/portal-of-path";
import { useAuthActions } from "@/lib/auth/use-auth-actions";
import { fetchProfile } from "@/lib/auth/use-profile";
import { hardNavigate } from "@/lib/hard-navigate";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export const chooseOrganisationTitle = "Choose organisation | Innocenz";

export const chooseOrganisationHead = () => ({
	meta: [{ title: chooseOrganisationTitle }],
});

/**
 * The step between signing in and the portal, for anyone who works in two or
 * more organisations (owner, 10 Sep 2026).
 *
 * ⚠️ It must never become a step for people with ONE organisation, which is why
 * the skip below happens before anything renders: a screen offering a single
 * button is a click that decides nothing, and it would land in front of every
 * operator on the platform.
 *
 * Like `/no-access`, this sits outside both portal shells, so it carries the
 * locale provider itself — and as a WRAPPER, because a component cannot consume
 * a context it mounts.
 */
export function ChooseOrganisationPage() {
	return (
		<PortalLocaleProvider>
			<ChooseOrganisationBody />
		</PortalLocaleProvider>
	);
}

type Phase =
	| { kind: "loading" }
	| { kind: "failed" }
	| { kind: "ready"; profile: User }
	| { kind: "entering"; profile: User; orgId: string };

function ChooseOrganisationBody() {
	const { t } = usePortalLocale();
	const { logout } = useAuthActions();
	const { next } = Route.useSearch();
	const [phase, setPhase] = useState<Phase>({ kind: "loading" });
	/**
	 * Asking who this account is, and acting on the answer.
	 *
	 * A callback rather than an inline effect body so the retry button can run
	 * exactly the same thing — a second copy of this logic beside the button is
	 * how a retry ends up behaving differently from the first attempt.
	 *
	 * `isLive` is the mount test, passed in rather than captured: the effect
	 * owns the flag, and this only asks.
	 */
	const load = useCallback(
		async (isLive: () => boolean) => {
			/*
			 * No session at all — someone opened this URL directly, or their
			 * tokens expired while it sat in a tab. `fetchProfile` throws before
			 * it reaches the network in that case, so nothing else would send them
			 * to /login; they would sit on a retry button that can never succeed.
			 */
			if (!hasValidTokens()) {
				kickToLogin();
				return;
			}

			let profile: User;
			try {
				profile = await fetchProfile();
			} catch {
				/*
				 * NOT "this account has no organisations" — we simply could not
				 * ask. Rendering an empty list would be inventing that answer, so
				 * say what happened and offer the retry. An expired token has
				 * already been sent to /login by the client interceptor.
				 */
				if (isLive()) setPhase({ kind: "failed" });
				return;
			}
			if (!isLive()) return;

			/*
			 * ⚠️ ROUTE ON WHAT CAN BE ENTERED, RENDER EVERYTHING.
			 *
			 * `profile.organisations` now carries deactivated memberships too, so
			 * that they can be SHOWN. Counting the raw list here would decide two
			 * things wrongly, and the first is the dangerous one:
			 *
			 *  * somebody whose ONLY membership is deactivated used to arrive with
			 *    an empty list and land on the default path — with the wider list
			 *    they arrive with exactly one, and a `length === 1` test would
			 *    silently auto-enter the organisation they were removed from;
			 *  * somebody with one live and one dead membership would be offered a
			 *    "choice" between one real card and one greyed one.
			 *
			 * The list below stays whole — the greyed cards are the point of the
			 * screen — but only enterable ones are counted, entered, or skipped on.
			 */
			const orgs = profile.organisations;
			const enterable = orgs.filter((o) => o.enterable);
			/*
			 * ⚠️ ONE ORGANISATION IS NOT A CHOICE — BUT ONE ORGANISATION PLUS THE
			 * ADMIN CONSOLE IS.
			 *
			 * This counted organisations only, so an admin who is also on one team
			 * was skipped straight into that team's portal: the owner signed in
			 * expecting to be asked and landed in the agency, with the console
			 * unreachable from any screen. `shouldChooseOrganisation` had already
			 * been taught to count the console, so the login sent them HERE — and
			 * this line quietly sent them on again. Two places counting the same
			 * thing differently is how a screen ends up being routed to and then
			 * refusing to render.
			 *
			 * `countPortalChoices` is now the one answer both use.
			 */
			if (enterable.length === 1 && countPortalChoices(profile) === 1) {
				const only = enterable[0];
				setPhase({ kind: "entering", profile, orgId: only.id });
				await enterOrganisation(profile, only, only.kind, next ?? null);
				return;
			}
			/*
			 * ⚠️ NOTHING TO ENTER IS NOT THE SAME AS BELONGING NOWHERE.
			 *
			 * Owner, 11 Sep 2026: a person "can see the status can login or not —
			 * deactivate or active".
			 *
			 * NO MEMBERSHIPS AT ALL means an admin, a PR (neither holds a membership
			 * row) or a list that could not be read, and the landing rule is the
			 * honest answer for all three.
			 *
			 * But an account that HOLDS memberships and can enter none of them was
			 * being sent to the same place, which is how somebody deactivated at
			 * their only organisation met a bare "no access" page and could not tell
			 * being removed from never having been there. They have something to be
			 * shown, so show it: the cards render greyed, each naming its own reason.
			 *
			 * A DECLINED request is deliberately not among them — the server drops
			 * `rejected` from this list entirely, because somebody turned down was
			 * never a member and has no standing to be told about.
			 */
			if (enterable.length === 0 && orgs.length === 0) {
				/*
				 * The deep link is honoured only where it leads somewhere this
				 * landing actually opens — same rule as `enterOrganisation`, and
				 * for the same reason: a `next` into a portal this account is not
				 * entering is a refusal it cannot escape.
				 */
				const landing = defaultLandingPath(profile);
				const home = portalOfPath(landing);
				hardNavigate((home && nextForPortal(next, home)) || landing);
				return;
			}
			setPhase({ kind: "ready", profile });
		},
		[next],
	);

	/**
	 * TAKE THE DESTINATION OUT OF THE ADDRESS BAR, and leave the choice alone.
	 *
	 * Owner, 14 Sep 2026: *"clear is clear the url back for user to enter the
	 * orgs they want"*. The `next` that carried them here stayed in the query
	 * string for as long as this screen was open, so the URL read
	 * `/choose-organisation?next=/admin/...` — a destination already decided,
	 * printed over a page whose whole job is to let them decide. Reloading or
	 * coming back re-armed it, and it looked like the screen was stuck.
	 *
	 * This is COSMETIC AND DELIBERATELY SO: `replaceState` rewrites what is
	 * displayed without touching the router's own search state, so the deep
	 * link is still honoured for the portal it belongs to — see
	 * `nextForPortal`. Nothing is signed out and nothing stored is cleared;
	 * the only thing removed is the instruction sitting in the URL.
	 */
	useEffect(() => {
		if (typeof window === "undefined" || !window.location.search) return;
		const url = new URL(window.location.href);
		if (!url.searchParams.has("next")) return;
		url.searchParams.delete("next");
		window.history.replaceState(
			window.history.state,
			"",
			`${url.pathname}${url.search}${url.hash}`,
		);
	}, []);

	useEffect(() => {
		let live = true;
		void load(() => live);
		return () => {
			live = false;
		};
	}, [load]);

	if (phase.kind === "loading" || phase.kind === "entering") {
		return (
			<Shell>
				<div className="flex flex-col items-center gap-4 text-muted-foreground">
					<Loader2 className="h-7 w-7 animate-spin" />
					<p className="text-base">{t.chooseOrg.loading}</p>
				</div>
			</Shell>
		);
	}

	if (phase.kind === "failed") {
		return (
			<Shell>
				<div className="flex w-full max-w-md flex-col items-center text-center">
					<h1 className="text-2xl font-bold tracking-tight text-foreground">
						{t.chooseOrg.failed}
					</h1>
					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						<Button
							size="lg"
							className="h-11 px-8 text-white dark:text-[#1a1726]"
							onClick={() => {
								setPhase({ kind: "loading" });
								void load(() => true);
							}}
						>
							{t.chooseOrg.retry}
						</Button>
						<Button
							size="lg"
							variant="outline"
							className="h-11 px-8"
							onClick={() => logout()}
						>
							{t.invitePages.backToLogin}
						</Button>
					</div>
				</div>
			</Shell>
		);
	}

	const { profile } = phase;
	const agencies = profile.organisations.filter((o) => o.kind === "agency");
	const outlets = profile.organisations.filter((o) => o.kind === "outlet");

	const choose = (org: UserOrganisation) => {
		// Moving to "entering" is what stops a second click starting a second
		// session while the first is still being written.
		setPhase({ kind: "entering", profile, orgId: org.id });
		void enterOrganisation(profile, org, org.kind, next ?? null);
	};

	return (
		<Shell>
			<div className="flex w-full max-w-2xl flex-col">
				<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					{t.chooseOrg.title}
				</h1>
				<p className="mt-3 text-base leading-relaxed text-muted-foreground">
					{t.chooseOrg.body}
				</p>
				<p className="mt-2 text-sm text-muted-foreground">
					{t.invitePages.signedInAs}{" "}
					<span className="font-semibold text-foreground">
						{profile.email || profile.username}
					</span>
				</p>

				{/*
				 * ⚠️ THE CONSOLE IS A CHOICE, NOT A FALLBACK — and it comes FIRST.
				 *
				 * An admin who accepts a team invite holds TWO places to be, and
				 * `pickHomePortal` was picking one for them: the owner signed in
				 * expecting to be asked and landed on the dashboard, with the other
				 * side unreachable from any screen.
				 *
				 * First because it is what an admin came for; the memberships are the
				 * second job, and both are one click either way.
				 */}
				{holdsAdminConsole(profile) ? (
					<section className="mt-8">
						<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
							{t.chooseOrg.adminConsoleGroup}
						</h2>
						<ul className="mt-3 flex flex-col gap-3">
							<li>
								<button
									type="button"
									onClick={() =>
										/*
										 * ⚠️ THE CONSOLE HONOURS THE DEEP LINK TOO.
										 *
										 * This was hardcoded to the dashboard, so the ONE
										 * pick an `/admin` link is valid for was the one
										 * that discarded it: somebody who opened
										 * `/admin/user-management/legacy-member` signed
										 * in, chose the console, and landed on the
										 * dashboard with no trace of where they had been
										 * heading.
										 */
										hardNavigate(
											nextForPortal(next, "admin") ?? "/admin/dashboard",
										)
									}
									className="flex w-full items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-royal-gold/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
										<ShieldCheck
											className="h-5 w-5 text-foreground"
											strokeWidth={1.5}
										/>
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-semibold text-base text-foreground">
											{t.chooseOrg.adminConsoleName}
										</span>
										<span className="mt-0.5 truncate text-muted-foreground text-sm">
											{t.chooseOrg.adminConsoleHint}
										</span>
									</span>
									<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
								</button>
							</li>
						</ul>
					</section>
				) : null}

				<OrgGroup
					heading={t.chooseOrg.agencies}
					orgs={agencies}
					onChoose={choose}
					t={t}
				/>
				<OrgGroup
					heading={t.chooseOrg.outlets}
					orgs={outlets}
					onChoose={choose}
					t={t}
				/>

				<p className="mt-8 text-sm text-muted-foreground">
					{t.chooseOrg.switchHint}
				</p>
			</div>
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="fixed inset-0 z-50 flex min-h-svh w-full flex-col overflow-y-auto bg-background">
			<header className="flex shrink-0 items-center justify-end px-6 py-5">
				<PortalLanguageSwitcher variant="header" />
			</header>
			<div className="flex flex-1 items-center justify-center px-6 pb-12">
				{children}
			</div>
		</div>
	);
}

function OrgGroup({
	heading,
	orgs,
	onChoose,
	t,
}: {
	heading: string;
	orgs: UserOrganisation[];
	onChoose: (org: UserOrganisation) => void;
	t: PortalTranslations;
}) {
	// A heading over nothing reads as a group this account has been shut out of.
	if (orgs.length === 0) return null;
	const Icon = orgs[0].kind === "agency" ? Building2 : Store;
	return (
		<section className="mt-8">
			<h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
				{heading}
			</h2>
			<ul className="mt-3 flex flex-col gap-3">
				{orgs.map((org) => {
					/*
					 * WHY this card cannot be opened — the membership, or the whole
					 * organisation. Checked in that order because the membership is the
					 * more specific answer: when somebody has been removed AND the
					 * organisation is switched off, "you were removed" is the one they
					 * can actually act on.
					 */
					const blockedReason = org.enterable
						? null
						: org.membershipStatus === "pending"
							? t.chooseOrg.membershipPending
							: org.membershipStatus !== "active"
								? t.chooseOrg.membershipInactive
								: t.chooseOrg.orgInactive;
					const logo = apiAssetUrl(org.logoImage ?? undefined);
					return (
						<li key={`${org.kind}:${org.id}`}>
							<button
								type="button"
								disabled={!org.enterable}
								onClick={() => onChoose(org)}
								className={
									org.enterable
										? "flex w-full items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-royal-gold/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										: "flex w-full cursor-not-allowed items-center gap-4 rounded-xl border border-dashed border-border bg-muted/40 px-5 py-4 text-left opacity-70"
								}
							>
								{/*
								 * THE ORGANISATION'S OWN LOGO (owner, 11 Sep 2026: "need show
								 * UI to let user know that which agency/outlet orgs logo").
								 *
								 * Somebody who works in three places is picking between
								 * BRANDS, not reading a list of names — and every card
								 * carried the same building or shop glyph, so the one thing
								 * that makes the choice instant was the one thing missing.
								 *
								 * ⚠️ Three states, in this order. A BLOCKED card keeps the
								 * Ban mark whatever logo the organisation has: its job there
								 * is to say "not this one", and a familiar logo argues the
								 * opposite. Then the real logo. Then the kind glyph, for an
								 * organisation that never uploaded one — a null logo is
								 * normal, not an error, so it falls back rather than
								 * rendering a broken image.
								 */}
								<span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
									{!org.enterable ? (
										<Ban
											className="h-5 w-5 text-muted-foreground"
											strokeWidth={1.5}
										/>
									) : logo ? (
										/* `object-cover` with matched h/w: `rounded-full` alone
										   clips a non-square logo to a circle of its own WIDTH,
										   so a tall one spills past the border. */
										<img
											src={logo}
											alt=""
											className="h-full w-full object-cover"
										/>
									) : (
										<Icon
											className="h-5 w-5 text-foreground"
											strokeWidth={1.5}
										/>
									)}
								</span>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-base font-semibold text-foreground">
										{org.name}
									</span>
									<span className="mt-0.5 truncate text-sm text-muted-foreground">
										{portalRoleLabel(org.subRole, t)}
										{org.memberCode ? (
											<>
												{" · "}
												{t.chooseOrg.memberId}{" "}
												<span className="font-mono">{org.memberCode}</span>
											</>
										) : null}
									</span>
									{blockedReason ? (
										<span className="mt-1 truncate text-sm text-rose-600 dark:text-rose-400">
											{blockedReason}
										</span>
									) : null}
								</span>
								{org.enterable ? (
									<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
								) : (
									<span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
										{t.chooseOrg.unavailable}
									</span>
								)}
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

export const Route = createFileRoute("/choose-organisation")({
	validateSearch: (search: Record<string, unknown>): { next?: string } => {
		const raw =
			typeof search.next === "string" ? search.next.trim() : undefined;
		// Same-origin app paths only. "//host" is a full URL to a browser, so
		// without the second test this is an open redirect wearing a path.
		const ok = raw?.startsWith("/") && !raw.startsWith("//") ? raw : undefined;
		return ok ? { next: ok } : {};
	},
	head: chooseOrganisationHead,
	component: ChooseOrganisationPage,
});
