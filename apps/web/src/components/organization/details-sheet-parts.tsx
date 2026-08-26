import {
	Ban,
	CalendarDays,
	CheckCircle2,
	CircleCheckBig,
	Clock,
	Info,
	Loader2,
	UserCog,
	UserRound,
} from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { getR2PublicBase } from "@/lib/proof-photo";
import { formatDate } from "@/lib/utils";
import {
	type OrgStatus,
	orgStatusBadgeColors,
	orgStatusLabel,
} from "./org-status";

const DEFAULT_PROFILE_IMAGE = "/img/blank-profile-picture.png";

/** Resolve a stored asset ref (R2 key, full URL, or /img/…) to a browser URL. */
export function apiAssetUrl(
	path: string | null | undefined,
): string | undefined {
	if (!path || path === DEFAULT_PROFILE_IMAGE) return undefined;
	if (/^https?:\/\//.test(path) || path.startsWith("data:")) return path;
	// R2 object key stored in DB — prepend public base from env or /auth/me.
	if (
		path.startsWith("user/") ||
		path.startsWith("agency/") ||
		path.startsWith("outlet/")
	) {
		const r2 = getR2PublicBase();
		return r2 ? `${r2}/${path}` : undefined;
	}
	const normalized = path.startsWith("/") ? path : `/${path}`;
	// In local Vite, backend /img paths (users/pr/outlets/agencies) are proxied
	// same-origin so gallery photos and logos load without CORP issues.
	if (import.meta.env.DEV && normalized.startsWith("/img/")) {
		return normalized;
	}
	// Static assets are served at the server root (/img/...), not under /api.
	const base = env.VITE_API_URL.replace(/\/$/, "").replace(/\/api(\/v1)?$/, "");
	return `${base}${normalized}`;
}

export function DetailsHero({
	name,
	subtitle,
	status,
	meta,
	imageUrl,
}: {
	name: string;
	subtitle?: string | null;
	status: OrgStatus | string;
	meta?: ReactNode;
	imageUrl?: string;
}) {
	const { t } = usePortalLocale();
	const initial = name.trim().charAt(0).toUpperCase() || "?";
	const badgeClass =
		orgStatusBadgeColors[status as OrgStatus] ??
		"border-muted-foreground/30 bg-muted text-muted-foreground";
	const badgeLabel = orgStatusLabel(status, t);
	const [broken, setBroken] = useState(false);
	const showImage = Boolean(imageUrl) && !broken;

	// biome-ignore lint/correctness/useExhaustiveDependencies(imageUrl): imageUrl is the reset TRIGGER, not a value the effect reads — a new photo has to clear the previous one's load failure. Drop it and `broken` only ever resets on mount, so once one image 404s every later one stays hidden behind the initial.
	useEffect(() => {
		setBroken(false);
	}, [imageUrl]);

	return (
		<div className="flex flex-col items-center gap-2 py-5 text-center">
			{showImage ? (
				<img
					src={imageUrl}
					alt={fill(t.adminOrg.profilePhotoAlt, { name })}
					onError={() => setBroken(true)}
					className="h-28 w-28 rounded-full border border-(--lavender-soft)/40 bg-black object-contain p-1.5"
				/>
			) : (
				<div className="flex h-28 w-28 items-center justify-center rounded-full bg-[color:var(--lavender-soft)] text-3xl font-bold text-lavender">
					{initial}
				</div>
			)}
			<div className="mt-2 text-2xl font-bold leading-tight">{name}</div>
			{subtitle && (
				<div className="text-base text-muted-foreground">{subtitle}</div>
			)}
			<Badge variant="outline" className={`capitalize ${badgeClass}`}>
				{badgeLabel}
			</Badge>
			{meta}
		</div>
	);
}

export function DetailField({
	icon: Icon,
	label,
	value,
	href,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: string | null | undefined;
	href?: string;
}) {
	return (
		<div className="flex items-start gap-3">
			<Icon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
			<div className="min-w-0">
				<div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</div>
				{value && href ? (
					<a
						href={href}
						className="break-words text-lg font-medium text-primary hover:underline"
					>
						{value}
					</a>
				) : (
					<div className="break-words text-lg font-medium">{value || "—"}</div>
				)}
			</div>
		</div>
	);
}

export function DetailSection({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-3">
			<div>
				<p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					{title}
				</p>
				{description && (
					<p className="text-base text-muted-foreground/80">{description}</p>
				)}
			</div>
			<div className="grid grid-cols-1 gap-5 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-5 py-5 sm:grid-cols-2">
				{children}
			</div>
		</div>
	);
}

/** Shorten uuid-like actor ids for display; keep names like "system" as-is. */
function formatActor(actor: string | null | undefined): string {
	if (!actor) return "—";
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		actor,
	)
		? `${actor.slice(0, 8)}…`
		: actor;
}

export function SystemInfoCard({
	createdBy,
	createdAt,
	updatedBy,
	updatedAt,
}: {
	createdBy: string | null | undefined;
	createdAt: string | null | undefined;
	updatedBy: string | null | undefined;
	updatedAt: string | null | undefined;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="space-y-3 rounded-lg border border-(--lavender-soft)/30 bg-card p-5">
			<div className="flex items-center gap-2 text-base font-bold">
				<Info className="h-5 w-5 text-lavender" />
				{t.adminOrg.systemInformation}
			</div>
			<div className="grid grid-cols-1 gap-5 rounded-md bg-muted/30 px-5 py-5 sm:grid-cols-2">
				<DetailField
					icon={UserRound}
					label={t.adminOrg.createdBy}
					value={formatActor(createdBy)}
				/>
				<DetailField
					icon={CalendarDays}
					label={t.adminOrg.createdAt}
					value={createdAt ? formatDate(createdAt) : null}
				/>
				<DetailField
					icon={UserCog}
					label={t.adminOrg.updatedBy}
					value={formatActor(updatedBy)}
				/>
				<DetailField
					icon={Clock}
					label={t.adminOrg.updatedAt}
					value={updatedAt ? formatDate(updatedAt) : null}
				/>
			</div>
		</div>
	);
}

/**
 * Colour only. The card's heading is `orgStatusLabel`, so the badge in the hero
 * and the heading here cannot drift into two wordings for one status.
 */
const approvalStatusClass: Record<OrgStatus, string> = {
	pending_review:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	active:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	suspended:
		"border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
	inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

export function ApprovalStatusCard({
	status,
	entityLabel,
	busy,
	onApprove,
	onSuspend,
}: {
	status: OrgStatus;
	/**
	 * The word for the kind of organisation, landing MID-sentence in all four
	 * descriptions below. It must arrive already translated — the call site
	 * passes `t.adminOrg.entityAgency` / `t.adminOrg.entityOutlet`, never the
	 * stored "agency" / "outlet".
	 */
	entityLabel: string;
	busy: boolean;
	onApprove: () => void;
	onSuspend: () => void;
}) {
	const { t } = usePortalLocale();
	const description =
		status === "pending_review"
			? fill(t.adminOrg.approvalPendingBody, { entity: entityLabel })
			: status === "active"
				? fill(t.adminOrg.approvalActiveBody, { entity: entityLabel })
				: status === "suspended"
					? fill(t.adminOrg.approvalSuspendedBody, { entity: entityLabel })
					: fill(t.adminOrg.approvalInactiveBody, { entity: entityLabel });

	return (
		<div className="space-y-3 rounded-lg border-l-4 border-(--lavender-soft) bg-card p-4">
			<div className="flex items-center gap-2 text-base font-bold">
				<CircleCheckBig className="h-5 w-5 text-lavender" />
				{t.adminOrg.approvalStatus}
			</div>
			<div
				className={`rounded-md border px-4 py-3 ${approvalStatusClass[status]}`}
			>
				<div className="text-base font-bold">{orgStatusLabel(status, t)}</div>
				<div className="text-sm opacity-90">{description}</div>
			</div>
			<div className="flex flex-wrap gap-2 pt-1">
				{status === "pending_review" && (
					<Button size="sm" disabled={busy} onClick={onApprove}>
						{busy ? (
							<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
						) : (
							<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
						)}
						{t.common.approve}
					</Button>
				)}
				{status === "active" && (
					<Button
						size="sm"
						variant="outline"
						disabled={busy}
						onClick={onSuspend}
					>
						{busy ? (
							<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
						) : (
							<Ban className="mr-1 h-3.5 w-3.5" />
						)}
						{t.adminOrg.suspend}
					</Button>
				)}
				{status === "suspended" && (
					<Button size="sm" disabled={busy} onClick={onApprove}>
						{busy ? (
							<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
						) : (
							<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
						)}
						{t.adminUsers.reactivate}
					</Button>
				)}
				{status === "pending_review" && (
					<span className="flex items-center gap-1 text-sm text-muted-foreground">
						<Clock className="h-4 w-4" />
						{t.adminOrg.awaitingFirstApproval}
					</span>
				)}
			</div>
		</div>
	);
}
