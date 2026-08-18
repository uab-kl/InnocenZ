import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Clock, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { kickToLogin } from "@/lib/auth/guards";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	type AgencyOutletApproveStatus,
	fetchAgencyDirectory,
	fetchMyAgencyLinks,
	type OutletAgencyLink,
	saveMyAgencyLinks,
} from "@/services/agency-outlet";

/**
 * Which agencies this venue works with (`agency_outlet`, migration 0123).
 *
 * A venue may work with several agencies, but each link is the agency's to
 * accept: adding one here REQUESTS it, and only an `approved` link can be
 * posted to. That is the same contract a PR gets when joining an agency —
 * approved once, then used freely — which is why the status vocabulary here is
 * deliberately identical.
 *
 * Removing a link only stops future work. Shifts already posted to that agency
 * keep their own record and are untouched.
 */

const STATUS_META: Record<
	AgencyOutletApproveStatus,
	{
		label: (t: PortalTranslations) => string;
		className: string;
		Icon: typeof Check;
	}
> = {
	approved: {
		label: (t) => t.agencyLinks.statusApproved,
		className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
		Icon: Check,
	},
	pending: {
		label: (t) => t.agencyLinks.statusPending,
		className: "text-amber-300 border-amber-300/30 bg-amber-300/10",
		Icon: Clock,
	},
	rejected: {
		label: (t) => t.agencyLinks.statusRejected,
		className: "text-rose-400 border-rose-400/30 bg-rose-400/10",
		Icon: X,
	},
};

function StatusBadge({ status }: { status: AgencyOutletApproveStatus }) {
	const { t } = usePortalLocale();
	const meta = STATUS_META[status];
	return (
		<span
			className={`iz-tiny inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${meta.className}`}
		>
			<meta.Icon className="h-3 w-3" />
			{meta.label(t)}
		</span>
	);
}

export function AgencyLinksPanel({
	outletId,
	canManage,
}: {
	/** Which venue. `null` while the profile loads; the hook derives it server-side when omitted. */
	outletId?: string | null;
	canManage: boolean;
}) {
	const { t } = usePortalLocale();
	const queryClient = useQueryClient();
	const [picked, setPicked] = useState("");
	const [saveFailed, setSaveFailed] = useState(false);

	const linksQuery = useQuery({
		queryKey: ["agency-outlet", "mine", outletId ?? "self"],
		queryFn: () => fetchMyAgencyLinks(kickToLogin, outletId ?? undefined),
		staleTime: 30_000,
	});

	const directoryQuery = useQuery({
		queryKey: ["agency-outlet", "directory"],
		queryFn: () => fetchAgencyDirectory(kickToLogin),
		staleTime: 5 * 60_000,
	});

	const links = useMemo<OutletAgencyLink[]>(
		() => linksQuery.data ?? [],
		[linksQuery.data],
	);

	/** Only agencies not already linked — re-requesting an existing link is a no-op. */
	const addable = useMemo(() => {
		const taken = new Set(links.map((l) => l.agencyId));
		return (directoryQuery.data ?? []).filter((a) => !taken.has(a.id));
	}, [directoryQuery.data, links]);

	const save = useMutation({
		// The endpoint takes the WHOLE desired list, not a delta. Agencies that
		// were already approved keep that status server-side, so saving here can
		// never push an existing partner back into the queue.
		mutationFn: (agencyIds: string[]) =>
			saveMyAgencyLinks(agencyIds, kickToLogin, outletId ?? undefined),
		onSuccess: (fresh) => {
			queryClient.setQueryData(
				["agency-outlet", "mine", outletId ?? "self"],
				fresh,
			);
			// The agency portal's outlet list is derived from these links.
			queryClient.invalidateQueries({ queryKey: ["agency", "outlets"] });
			setPicked("");
			setSaveFailed(false);
		},
		onError: () => setSaveFailed(true),
	});

	const requestLink = () => {
		if (!picked) return;
		save.mutate([...links.map((l) => l.agencyId), picked]);
	};

	const removeLink = (agencyId: string) => {
		save.mutate(
			links.filter((l) => l.agencyId !== agencyId).map((l) => l.agencyId),
		);
	};

	const approvedCount = links.filter(
		(l) => l.approveStatus === "approved",
	).length;

	return (
		<>
			<IzSectionLabel>{t.agencyLinks.agencies}</IzSectionLabel>
			<IzCard className="mt-2">
				<p className="iz-tiny iz-muted mb-3">{t.agencyLinks.blurb}</p>

				{linksQuery.isLoading ? (
					<p className="iz-tiny iz-muted">{t.agencyLinks.loading}</p>
				) : links.length === 0 ? (
					<p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-2">
						{t.agencyLinks.noneYet}
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{links.map((link) => (
							<li
								key={link.id}
								className="flex items-center gap-3 rounded-xl border border-[var(--iz-line)] px-3 py-2.5"
							>
								<span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--iz-line)] text-[var(--iz-gold)]">
									<Building2 className="h-4 w-4" />
								</span>

								{/* min-w-0 is load-bearing: without it a flex child refuses to
								    shrink below its content and `truncate` never engages, so a
								    long agency name would push the badge off the row. */}
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-semibold leading-tight">
										{link.agencyName}
									</div>
									<div className="iz-tiny iz-muted truncate leading-tight">
										{link.agencyCode}
									</div>
									{link.approveStatus === "rejected" && link.rejectReason && (
										<div className="iz-tiny mt-1 text-rose-400">
											{link.rejectReason}
										</div>
									)}
								</div>

								<StatusBadge status={link.approveStatus} />

								{canManage && (
									/* Deliberately NOT `iz-btn`: that class is `width: 100%`
									   with 14px padding — a full-width CTA. Using it for an icon
									   made the button swallow the row and collapse the name to
									   zero width, which is why the agency looked nameless. */
									<button
										type="button"
										aria-label={fill(t.agencyLinks.removeNamed, {
											name: link.agencyName,
										})}
										title={fill(t.agencyLinks.removeNamed, {
											name: link.agencyName,
										})}
										className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--iz-line)] iz-muted transition-colors hover:border-rose-400/40 hover:text-rose-400 disabled:opacity-40"
										disabled={save.isPending}
										onClick={() => removeLink(link.agencyId)}
									>
										<Trash2 className="h-4 w-4" />
									</button>
								)}
							</li>
						))}
					</ul>
				)}

				{/* `iz-field-input` is the house select style — the same one the Team
				    members panel above uses, so the two read as one screen. `iz-input`
				    (what this used before) does not exist in the theme at all, which is
				    why the control collapsed to its content width. */}
				{canManage && (
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<select
							className="iz-field-input min-w-[16rem] flex-1 !text-sm"
							value={picked}
							disabled={save.isPending || addable.length === 0}
							onChange={(e) => setPicked(e.target.value)}
						>
							<option value="">
								{addable.length === 0
									? t.agencyLinks.allAdded
									: t.agencyLinks.chooseAgency}
							</option>
							{addable.map((agency) => (
								<option key={agency.id} value={agency.id}>
									{agency.name} · {agency.agencyCode}
								</option>
							))}
						</select>
						{/* `!w-auto` because `iz-btn` is width:100% — without the override
						    this button takes the whole row and squeezes the select to
						    nothing, which is exactly what it was doing. */}
						<button
							type="button"
							className="iz-btn iz-btn-primary !w-auto shrink-0 !px-5 !py-2.5 !text-sm"
							disabled={!picked || save.isPending}
							onClick={requestLink}
						>
							<Plus className="h-4 w-4" />
							{save.isPending ? t.common.saving : t.agencyLinks.request}
						</button>
					</div>
				)}

				{saveFailed && (
					<p className="iz-tiny mt-2 text-rose-400">
						{t.agencyLinks.couldNotSave}
					</p>
				)}

				{approvedCount === 0 && links.length > 0 && (
					<p className="iz-tiny iz-muted mt-2">{t.agencyLinks.noApprovedYet}</p>
				)}
			</IzCard>
		</>
	);
}
