import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, MailWarning } from "lucide-react";
import { useMemo, useState } from "react";
import { getPublicClient } from "@/lib/axios-v1";

export const Route = createFileRoute("/invite/org-member")({
	validateSearch: (search: Record<string, unknown>): { token?: string } => ({
		token: typeof search.token === "string" ? search.token : undefined,
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
};

function OrgMemberInvitePage() {
	const { token } = Route.useSearch();
	const [done, setDone] = useState<{
		orgName: string | null;
		kind: string;
	} | null>(null);

	const previewQuery = useQuery({
		queryKey: ["org-member-invite", token ?? ""],
		enabled: Boolean(token),
		queryFn: async (): Promise<Preview> => {
			const client = getPublicClient();
			const response = await client.get<{
				success: boolean;
				message: string;
				data: Preview | null;
			}>(`/auth/org-member-invite?token=${encodeURIComponent(token as string)}`);
			if (!response.data.success || !response.data.data) {
				throw new Error(response.data.message || "Invitation not found");
			}
			return response.data.data;
		},
		retry: false,
	});

	const acceptMutation = useMutation({
		mutationFn: async () => {
			const client = getPublicClient();
			const response = await client.post<{
				success: boolean;
				message: string;
				data: { kind: string; orgName: string | null } | null;
			}>("/auth/org-member-invite/accept", { token });
			if (!response.data.success) {
				throw new Error(response.data.message || "Could not accept invitation");
			}
			return response.data.data;
		},
		onSuccess: (data) => {
			setDone({
				orgName: data?.orgName ?? null,
				kind: data?.kind ?? "organisation",
			});
		},
	});

	const preview = previewQuery.data;
	const roleLabel = useMemo(() => {
		if (!preview) return "";
		if (preview.subRole === "finance") return "Finance Head";
		if (preview.subRole === "operations_head") return "Ops Head";
		if (preview.subRole === "owner") return "Owner";
		return preview.subRole;
	}, [preview]);

	const loginHref = "/login" as const;

	return (
		<main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
			<div>
				<p className="text-sm font-semibold tracking-wide text-amber-700/80 uppercase">
					InnocenZ
				</p>
				<h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
					Team invitation
				</h1>
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
						Sign in to open the {done.kind} portal.
					</p>
					<Link
						to={loginHref}
						className="mt-4 inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
					>
						Go to sign in
					</Link>
				</div>
			)}

			{token && preview && !done && (
				<div className="space-y-4 rounded-xl border border-border bg-card p-5">
					<p className="text-sm leading-relaxed">
						You are invited to join{" "}
						<strong>{preview.orgName}</strong> as{" "}
						<strong>{roleLabel}</strong>
						{preview.email ? (
							<>
								{" "}
								(<span className="text-muted-foreground">{preview.email}</span>)
							</>
						) : null}
						.
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
						<button
							type="button"
							className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-50"
							disabled={acceptMutation.isPending}
							onClick={() => acceptMutation.mutate()}
						>
							{acceptMutation.isPending ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin" />
									Accepting…
								</>
							) : (
								"Accept invitation"
							)}
						</button>
					)}

					{acceptMutation.isError && (
						<p className="text-sm text-red-600">
							{(acceptMutation.error as Error).message}
						</p>
					)}

					{!preview.pending && !preview.expired && (
						<Link to={loginHref} className="text-sm font-medium underline">
							Go to sign in
						</Link>
					)}
				</div>
			)}
		</main>
	);
}
