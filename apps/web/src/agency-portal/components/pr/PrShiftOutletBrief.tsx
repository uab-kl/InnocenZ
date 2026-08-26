import { IzPill } from "@agency-portal/components/iz/ui";
import type { PrShiftOutletBrief } from "@agency-portal/lib/pr-shift-outlet";
import { cn } from "@agency-portal/lib/utils";
import {
	Building2,
	ExternalLink,
	MapPin,
	Shirt,
	Sparkles,
	Star,
} from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { dressCodeLabel } from "@/lib/portal-i18n/language-label";

export function PrShiftOutletBriefCard({
	brief,
	assignmentLabel,
	defaultOpen = false,
	pageLabel,
	statusLabel,
}: {
	brief: PrShiftOutletBrief;
	assignmentLabel?: string;
	defaultOpen?: boolean;
	pageLabel?: string;
	statusLabel?: string;
}) {
	const { t } = usePortalLocale();
	const [open, setOpen] = useState(defaultOpen);
	const initial = brief.name.trim()[0]?.toUpperCase() ?? "O";
	const shiftMeta = [brief.shiftDate, brief.shiftTime]
		.filter(Boolean)
		.join(" · ");

	return (
		<div className={cn("iz-pr-outlet-brief", open && "is-open")}>
			<button
				type="button"
				className="iz-pr-outlet-brief__hero"
				style={{ background: brief.heroGradient }}
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<div className="iz-pr-outlet-brief__hero-overlay" aria-hidden />
				{(pageLabel || statusLabel) && (
					<div className="iz-pr-outlet-brief__hero-head">
						{pageLabel && (
							<span className="iz-pr-outlet-brief__page-label">
								{pageLabel}
							</span>
						)}
						{statusLabel && (
							<div className="iz-pr-outlet-brief__status-block">
								<span className="iz-pr-outlet-brief__status-k">
									{t.table.status}
								</span>
								<span className="iz-pr-outlet-brief__status-v">
									{statusLabel}
								</span>
							</div>
						)}
					</div>
				)}
				<div className="iz-pr-outlet-brief__hero-main">
					<div className="iz-pr-outlet-brief__hero-foot">
						<h2 className="iz-pr-outlet-brief__name">{brief.name}</h2>
						{shiftMeta && (
							<p className="iz-pr-outlet-brief__shift-meta">{shiftMeta}</p>
						)}
						<div className="iz-pr-outlet-brief__hero-top">
							{assignmentLabel && (
								<span className="iz-pr-outlet-brief__assign">
									{assignmentLabel}
								</span>
							)}
							<div className="iz-pr-outlet-brief__hero-badges">
								{brief.vip && (
									<IzPill variant="amber" className="!text-[9px]">
										<Sparkles className="h-3 w-3" /> {t.prPortal.vipNight}
									</IzPill>
								)}
							</div>
						</div>
						<p className="iz-pr-outlet-brief__event">{brief.event}</p>
						<span className="iz-pr-outlet-brief__action">
							{open ? t.common.tapToCollapse : t.common.tapToExpand}
						</span>
					</div>
					<div className="iz-pr-outlet-brief__hero-mark">{initial}</div>
				</div>
			</button>

			{open && (
				<div className="iz-pr-outlet-brief__body">
					<div className="iz-pr-outlet-brief__row">
						<MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
						<div className="min-w-0">
							<p className="iz-pr-outlet-brief__row-label">
								{t.approvals.address}
							</p>
							<p className="iz-pr-outlet-brief__row-value">
								{brief.streetAddress}
							</p>
							<p className="iz-tiny iz-muted2 mt-0.5">
								{fill(t.prPortal.addressDistanceAway, {
									address: brief.address,
									distance: brief.distance,
								})}
							</p>
						</div>
					</div>

					<div className="iz-pr-outlet-brief__grid">
						<div>
							<p className="iz-pr-outlet-brief__meta-k">{t.rosterGrid.shift}</p>
							<p className="iz-pr-outlet-brief__meta-v">{brief.shiftDate}</p>
							<p className="iz-tiny iz-muted2">{brief.shiftTime}</p>
						</div>
						<div>
							<p className="iz-pr-outlet-brief__meta-k">{t.postJob.dressCode}</p>
							<p className="iz-pr-outlet-brief__meta-v flex items-center gap-1">
								<Shirt className="h-3 w-3 text-[var(--iz-violet-l)]" />
								{dressCodeLabel(brief.dressCode, t)}
							</p>
						</div>
						<div>
							<p className="iz-pr-outlet-brief__meta-k">
								{t.prPortal.estPayout}
							</p>
							<p className="iz-pr-outlet-brief__meta-v text-[var(--iz-gold-l)]">
								{brief.estPayout}
							</p>
							<p className="iz-tiny iz-muted2 flex items-center gap-1">
								<Star className="h-3 w-3" />{" "}
								{fill(t.prPortal.outletRating, { rating: brief.rating })}
							</p>
						</div>
					</div>

					{brief.opsContact && (
						<div className="iz-pr-outlet-brief__row !mt-2">
							<Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)]" />
							<div>
								<p className="iz-pr-outlet-brief__row-label">
									{t.prPortal.outletContact}
								</p>
								<p className="iz-pr-outlet-brief__row-value">
									{brief.opsContact}
								</p>
							</div>
						</div>
					)}

					{brief.agencyNote && (
						<p className="iz-pr-outlet-brief__note">{brief.agencyNote}</p>
					)}

					<a
						href={brief.directionsUrl}
						target="_blank"
						rel="noreferrer"
						className="iz-outlet-quick-chip mt-3 inline-flex w-full justify-center"
					>
						<ExternalLink className="h-3 w-3" />{" "}
						{t.prPortal.openDirectionsInMaps}
					</a>
				</div>
			)}
		</div>
	);
}
