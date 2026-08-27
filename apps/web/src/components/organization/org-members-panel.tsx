import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { getErrorMessage } from "@/lib/utils";
import type { AgencyPrApproveStatus } from "@/services/agency";
import { fetchAgencyPrs } from "@/services/agency";

/**
 * Membership state as the admin reads it. The record KEYS are the stored
 * `agency_pr.approve_status` values and never move — only the rendered label
 * does, which is why each entry holds a FUNCTION of the dictionary rather than
 * a string. A value added server-side falls through to itself below.
 */
const PR_STATUS_LABEL: Record<
	AgencyPrApproveStatus,
	(t: PortalTranslations) => string
> = {
	pending: (t) => t.admin.statusPending,
	approved: (t) => t.adminOrg.prStatusApproved,
	rejected: (t) => t.adminOrg.prStatusRejected,
	leave_pending: (t) => t.adminOrg.prStatusLeavePending,
	left: (t) => t.adminOrg.prStatusLeft,
};

export function OrgMembersPanel({ orgId }: { orgId: string }) {
	const { logout } = useAuth();
	const { t } = usePortalLocale();
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
			fetchAgencyPrs(orgId, { search: debouncedSearch || undefined }, logout),
		staleTime: 30_000,
	});

	if (membersQuery.isLoading) {
		return (
			<div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" />
				{t.adminOrg.loadingPrs}
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
					{fill(
						debouncedSearch ? t.adminOrg.prsCountMatching : t.adminOrg.prsCount,
						{ n: members.length },
					)}
				</p>
				<div className="relative sm:w-56">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						placeholder={t.adminOrg.searchPrsPlaceholder}
						className="h-8 pl-8 text-sm"
						aria-label={t.adminOrg.searchPrsAria}
					/>
				</div>
			</div>

			{members.length === 0 ? (
				<p className="py-2 text-sm text-muted-foreground">
					{debouncedSearch
						? t.adminOrg.noPrsMatchSearch
						: t.adminOrg.noPrsLinked}
				</p>
			) : (
				<ul className="space-y-1.5">
					{members.map((member) => (
						<li
							key={member.userId}
							className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-3 py-2.5 text-base"
						>
							<div className="min-w-0 flex-1">
								<div className="font-medium">
									{member.name || member.nickname || member.userId.slice(0, 8)}
								</div>
								<div className="text-sm text-muted-foreground">
									{[member.email, member.phoneNum]
										.filter(Boolean)
										.join(" · ") || "—"}
								</div>
							</div>
							<span className="text-sm text-muted-foreground capitalize">
								{PR_STATUS_LABEL[member.approveStatus]?.(t) ??
									member.approveStatus}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
