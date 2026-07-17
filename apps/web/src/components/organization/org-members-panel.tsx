import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { formatDate, getErrorMessage } from "@/lib/utils";
import { fetchAgencyMembers } from "@/services/agency";

export function OrgMembersPanel({ orgId }: { orgId: string }) {
	const { logout } = useAuth();
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedSearch(searchInput.trim());
		}, 300);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	const membersQuery = useQuery({
		queryKey: ["agency-prs", orgId, debouncedSearch],
		queryFn: () =>
			fetchAgencyMembers(
				orgId,
				{
					subRole: "pr",
					status: "active",
					search: debouncedSearch || undefined,
				},
				logout,
			),
		staleTime: 30_000,
	});

	if (membersQuery.isLoading) {
		return (
			<div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" />
				Loading PRs…
			</div>
		);
	}

	if (membersQuery.isError) {
		return (
			<p className="py-2 text-sm text-destructive">
				{getErrorMessage(membersQuery.error)}
			</p>
		);
	}

	const members = membersQuery.data?.data ?? [];

	return (
		<div className="space-y-3 py-1">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					PRs ({members.length}
					{debouncedSearch ? " matching" : ""})
				</p>
				<div className="relative sm:w-56">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						placeholder="Search PRs…"
						className="h-8 pl-8 text-sm"
						aria-label="Search PRs under this agency"
					/>
				</div>
			</div>

			{members.length === 0 ? (
				<p className="py-2 text-sm text-muted-foreground">
					{debouncedSearch
						? "No PRs match this search."
						: "No PRs linked to this agency yet."}
				</p>
			) : (
				<ul className="space-y-1.5">
					{members.map((member) => (
						<li
							key={member.id}
							className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-3 py-2.5 text-base"
						>
							<div className="min-w-0 flex-1">
								<div className="font-medium">
									{member.username || member.userId.slice(0, 8)}
								</div>
								<div className="text-sm text-muted-foreground">
									{[member.email, member.phoneNum]
										.filter(Boolean)
										.join(" · ") || "—"}
								</div>
							</div>
							<span className="text-sm text-muted-foreground">
								Joined {formatDate(member.createdAt)}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
