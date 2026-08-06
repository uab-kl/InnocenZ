import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Check, Loader2, MailWarning } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/landing/BrandLogo";
import { getPublicClient } from "@/lib/axios-v1";

export const Route = createFileRoute("/invite/org-member")({
	validateSearch: (search: Record<string, unknown>): { token?: string } => ({
		token:
			typeof search.token === "string" ? search.token.trim() || undefined : undefined,
	}),
	component: OrgMemberInvitePage,
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

function OrgMemberInvitePage() {
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
					throw new Error(response.data.message || "Invitation not found");
				}
				return response.data.data;
			} catch (err) {
				if (axios.isAxiosError(err)) {
					const msg = (err.response?.data as { message?: string } | undefined)
						?.message;
					if (msg) throw new Error(msg);
					if (err.response?.status === 404) {
						throw new Error(
							"Invitation not found or already used — ask the owner to send a new invite",
						);
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
				throw new Error(response.data.message || "Could not accept invitation");
			}
			return response.data.data;
		},
		onSuccess: (data) => {
			setDone({
				orgName: data?.orgName ?? null,
				kind: data?.kind ?? "organisation",
				email: data?.email ?? (email.trim() || null),
			});
		},
	});

	const preview = previewQuery.data;
	const roleLabel = useMemo(() => {
		if (!preview) return "";
		if (preview.subRole === "finance") return "Finance";
		if (preview.subRole === "operations_head") return "Ops Head";
		if (preview.subRole === "owner") return "Owner";
		return preview.subRole;
	}, [preview]);

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setFormError("");
		if (!name.trim()) {
			setFormError("Enter your name");
			return;
		}
		if (!email.trim()) {
			setFormError("Enter your email");
			return;
		}
		if (password.length < 6) {
			setFormError("Password must be at least 6 characters");
			return;
		}
		if (password !== confirmPassword) {
			setFormError("Passwords do not match");
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
						Join the team
					</h1>
					<p className="mt-1.5 text-sm text-muted-foreground sm:text-[0.9375rem]">
						Accept your invitation to get started.
					</p>
				</div>
			</div>

			{!token && (
				<p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
					This invite link is missing a token. Open the link from your email.
				</p>
			)}

			{token && previewQuery.isLoading && (
				<p className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					Checking invitation…
				</p>
			)}

			{token && previewQuery.isError && (
				<div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
					<p className="font-medium">Invitation unavailable</p>
					<p className="mt-1 text-muted-foreground">
						{(previewQuery.error as Error).message ||
							"This invitation was not found or was already used."}
					</p>
				</div>
			)}

			{done && (
				<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
					<p className="flex items-center gap-2 font-medium">
						<Check className="h-4 w-4" />
						You joined {done.orgName ?? "the team"}
					</p>
					<p className="mt-2 text-muted-foreground">
						Your account is ready. Sign in to open the {done.kind} portal.
					</p>
					<Link
						to="/login"
						search={done.email ? { email: done.email } : {}}
						className="mt-4 inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
					>
						Go to sign in
					</Link>
				</div>
			)}

			{token && preview && !done && (
				<div className="space-y-4 rounded-xl border border-border bg-card p-5">
					<p className="text-sm leading-relaxed">
						You are invited to join <strong>{preview.orgName}</strong> as{" "}
						<strong>{roleLabel}</strong>.
					</p>

					{preview.expired ? (
						<p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
							<MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
							This invitation has expired. Ask the owner to send a new invite.
						</p>
					) : !preview.pending ? (
						<p className="text-sm text-muted-foreground">
							This membership is already active. You can sign in now.
						</p>
					) : (
						<form className="space-y-3" onSubmit={onSubmit}>
							<p className="text-sm text-muted-foreground">
								Set up your account to accept. You can change the email if needed.
							</p>
							<label className="block space-y-1 text-sm">
								<span className="font-medium">Name</span>
								<input
									required
									value={name}
									onChange={(e) => setName(e.target.value)}
									className="w-full rounded-lg border border-border bg-background px-3 py-2"
									autoComplete="name"
								/>
							</label>
							<label className="block space-y-1 text-sm">
								<span className="font-medium">Email</span>
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
									Phone <span className="font-normal text-muted-foreground">(optional)</span>
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
								<span className="font-medium">Password</span>
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
								<span className="font-medium">Confirm password</span>
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
										Creating account…
									</>
								) : (
									"Create account & join"
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
							Go to sign in
						</Link>
					)}
				</div>
			)}
		</main>
	);
}
