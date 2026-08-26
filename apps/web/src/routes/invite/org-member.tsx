import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import axios from "axios";
import { Check, Loader2, MailWarning } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/landing/BrandLogo";
import { getPublicClient } from "@/lib/axios-v1";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";
import { portalCodeLabel } from "@/lib/portal-i18n/rbac-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export const Route = createFileRoute("/invite/org-member")({
	validateSearch: (search: Record<string, unknown>): { token?: string } => ({
		token:
			typeof search.token === "string"
				? search.token.trim() || undefined
				: undefined,
	}),
	component: OrgMemberInviteRoute,
});

type Preview = {
	kind: "outlet" | "agency";
	orgName: string;
	subRole: string;
	email: string | null;
	expired: boolean;
	pending: boolean;
	needsAccountSetup?: boolean;
};

/**
 * A PUBLIC route — the invitee arrives from an email, signed in to nothing,
 * with no portal shell above them — so the page mounts the locale provider
 * itself and consumes it one level down.
 *
 * The wrapper is not ceremony: a component cannot read a context it mounts,
 * and `usePortalLocale` falls back to English silently instead of throwing, so
 * a single-component version would have rendered English in a Chinese session
 * and looked wired the whole time.
 */
function OrgMemberInviteRoute() {
	return (
		<PortalLocaleProvider>
			<OrgMemberInvitePage />
		</PortalLocaleProvider>
	);
}

/**
 * Rendered label for the org KIND the acceptance response carries.
 *
 * `outlet` and `agency` are the two real values and resolve through the same
 * portal resolver the RBAC screens use. The third possibility is the caller's
 * own fallback word "organisation", which is not a portal code and has no
 * entry there. The stored kind is never touched — only what is shown.
 */
function orgKindLabel(kind: string, t: PortalTranslations): string {
	if (kind === "outlet" || kind === "agency") return portalCodeLabel(kind, t);
	return t.invitePages.organisation;
}

function OrgMemberInvitePage() {
	const { t } = usePortalLocale();
	const { token } = Route.useSearch();
	const [done, setDone] = useState<{
		orgName: string | null;
		kind: string;
		email: string | null;
	} | null>(null);

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phoneNum, setPhoneNum] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [formError, setFormError] = useState("");

	const previewQuery = useQuery({
		queryKey: ["org-member-invite", token ?? ""],
		enabled: Boolean(token),
		queryFn: async (): Promise<Preview> => {
			const client = getPublicClient();
			try {
				const response = await client.get<{
					success: boolean;
					message: string;
					data: Preview | null;
				}>(
					`/auth/org-member-invite?token=${encodeURIComponent((token as string).trim())}`,
				);
				if (!response.data.success || !response.data.data) {
					// The server's own message wins when it sent one — it is the
					// specific reason. Only OUR stand-in follows the locale.
					throw new Error(response.data.message || t.invitePages.notFound);
				}
				return response.data.data;
			} catch (err) {
				if (axios.isAxiosError(err)) {
					const msg = (err.response?.data as { message?: string } | undefined)
						?.message;
					if (msg) throw new Error(msg);
					if (err.response?.status === 404) {
						throw new Error(t.invitePages.notFoundAskOwner);
					}
				}
				throw err;
			}
		},
		retry: false,
	});

	useEffect(() => {
		const invited = previewQuery.data?.email?.trim();
		if (invited && !email) setEmail(invited);
	}, [previewQuery.data?.email, email]);

	const acceptMutation = useMutation({
		mutationFn: async () => {
			const client = getPublicClient();
			const response = await client.post<{
				success: boolean;
				message: string;
				data: {
					kind: string;
					orgName: string | null;
					email?: string | null;
				} | null;
			}>("/auth/org-member-invite/accept", {
				token,
				name: name.trim(),
				email: email.trim(),
				phoneNum: phoneNum.trim() || undefined,
				password,
				confirmPassword,
			});
			if (!response.data.success) {
				throw new Error(response.data.message || t.invitePages.couldNotAccept);
			}
			return response.data.data;
		},
		onSuccess: (data) => {
			setDone({
				orgName: data?.orgName ?? null,
				// Stored kind, kept verbatim — `orgKindLabel` resolves the display
				// word at render time so a locale switch moves with it.
				kind: data?.kind ?? "organisation",
				email: data?.email ?? (email.trim() || null),
			});
		},
	});

	const preview = previewQuery.data;
	// `subRole` stays the stored enum; the shared resolver names it, so the
	// invite and the team list cannot call the same role two different things.
	const roleLabel = useMemo(
		() => (preview ? portalRoleLabel(preview.subRole, t) : ""),
		[preview, t],
	);

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setFormError("");
		if (!name.trim()) {
			setFormError(t.invitePages.enterYourName);
			return;
		}
		if (!email.trim()) {
			setFormError(t.invitePages.enterYourEmail);
			return;
		}
		if (password.length < 6) {
			setFormError(t.admin.passwordMinSix);
			return;
		}
		if (password !== confirmPassword) {
			setFormError(t.invitePages.passwordsDoNotMatch);
			return;
		}
		acceptMutation.mutate();
	}

	return (
		<main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
			<div className="flex flex-col items-center gap-5 text-center sm:items-start sm:text-left">
				<BrandLogo variant="horizontal" size="lg" />
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
						{t.invitePages.joinTheTeam}
					</h1>
					<p className="mt-1.5 text-sm text-muted-foreground sm:text-[0.9375rem]">
						{t.invitePages.acceptToGetStarted}
					</p>
				</div>
			</div>

			{!token && (
				<p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
					{t.invitePages.missingToken}
				</p>
			)}

			{token && previewQuery.isLoading && (
				<p className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					{t.invitePages.checkingInvitation}
				</p>
			)}

			{token && previewQuery.isError && (
				<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
					<p className="font-medium">{t.invitePages.inviteUnavailable}</p>
					<p className="mt-1 text-muted-foreground">
						{(previewQuery.error as Error).message ||
							t.invitePages.notFoundOrUsed}
					</p>
				</div>
			)}

			{done && (
				<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
					<p className="flex items-center gap-2 font-medium">
						<Check className="h-4 w-4" />
						{fill(t.invitePages.youJoined, {
							org: done.orgName ?? t.invitePages.theTeam,
						})}
					</p>
					<p className="mt-2 text-muted-foreground">
						{fill(t.invitePages.accountReadySignIn, {
							portal: orgKindLabel(done.kind, t),
						})}
					</p>
					<Link
						to="/login"
						search={done.email ? { email: done.email } : {}}
						className="mt-4 inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
					>
						{t.invitePages.goToSignIn}
					</Link>
				</div>
			)}

			{token && preview && !done && (
				<div className="space-y-4 rounded-xl border border-border bg-card p-5">
					<p className="text-sm font-medium leading-relaxed">
						{fill(t.invitePages.invitedToJoin, {
							org: preview.orgName,
							role: roleLabel,
						})}
					</p>

					{preview.expired ? (
						<p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
							<MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
							{t.invitePages.inviteExpired}
						</p>
					) : !preview.pending ? (
						<p className="text-sm text-muted-foreground">
							{t.invitePages.membershipAlreadyActive}
						</p>
					) : (
						<form className="space-y-3" onSubmit={onSubmit}>
							<p className="text-sm text-muted-foreground">
								{t.invitePages.setUpAccountHint}
							</p>
							<label className="block space-y-1 text-sm">
								<span className="font-medium">{t.invitePages.name}</span>
								<input
									required
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="w-full rounded-lg border border-border bg-background px-3 py-2"
									autoComplete="name"
								/>
							</label>
							<label className="block space-y-1 text-sm">
								<span className="font-medium">{t.invitePages.email}</span>
								<input
									required
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									className="w-full rounded-lg border border-border bg-background px-3 py-2"
									autoComplete="email"
								/>
							</label>
							<label className="block space-y-1 text-sm">
								<span className="font-medium">
									{t.invitePages.phone}{" "}
									<span className="font-normal text-muted-foreground">
										{t.invitePages.optional}
									</span>
								</span>
								<input
									type="tel"
									value={phoneNum}
									onChange={(e) => setPhoneNum(e.target.value)}
									className="w-full rounded-lg border border-border bg-background px-3 py-2"
									autoComplete="tel"
								/>
							</label>
							<label className="block space-y-1 text-sm">
								<span className="font-medium">{t.invitePages.password}</span>
								<input
									required
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									className="w-full rounded-lg border border-border bg-background px-3 py-2"
									autoComplete="new-password"
									minLength={6}
								/>
							</label>
							<label className="block space-y-1 text-sm">
								<span className="font-medium">
									{t.invitePages.confirmPassword}
								</span>
								<input
									required
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									className="w-full rounded-lg border border-border bg-background px-3 py-2"
									autoComplete="new-password"
									minLength={6}
								/>
							</label>

							{(formError || acceptMutation.isError) && (
								<p className="text-sm text-red-600">
									{formError || (acceptMutation.error as Error).message}
								</p>
							)}

							<button
								type="submit"
								className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-50"
								disabled={acceptMutation.isPending}
							>
								{acceptMutation.isPending ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										{t.invitePages.creatingAccount}
									</>
								) : (
									t.invitePages.createAccountAndJoin
								)}
							</button>
						</form>
					)}

					{!preview.pending && !preview.expired && (
						<Link
							to="/login"
							search={preview.email ? { email: preview.email } : {}}
							className="text-sm font-medium underline"
						>
							{t.invitePages.goToSignIn}
						</Link>
					)}
				</div>
			)}
		</main>
	);
}
