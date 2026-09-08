import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { specialServiceOfferLabel } from "@agency-portal/components/special-service/job-posting-ui";
import { isSpecialServiceActionable } from "@agency-portal/lib/special-service-actions";
import {
	isLeaveAgencyService,
	type SpecialServiceInitiator,
	type SpecialServiceRecord,
	type SpecialServiceStatus,
	specialServiceStatusVariant,
} from "@agency-portal/lib/special-service-demo";
import { cn } from "@agency-portal/lib/utils";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/*
 * The RECORD KEYS below are the stored values — `status` and `initiatedBy` are
 * written, compared and filtered on as they are. Only the label rendered for
 * each one is translated.
 */
const STATUS_LABEL: Record<
	SpecialServiceStatus,
	(t: PortalTranslations) => string
> = {
	pending_admin: (t) => t.ssPortal.statusPendingAdmin,
	accepted: (t) => t.ssPortal.statusAccepted,
	rejected: (t) => t.ssPortal.statusRejected,
	pending_agency: (t) => t.ssPortal.statusPendingAgency,
	pending_pr: (t) => t.ssPortal.statusAwaitingPr,
	pending_outlet: (t) => t.ssPortal.statusAwaitingOutlet,
	pending_both: (t) => t.ssPortal.statusAwaitingBoth,
	confirmed: (t) => t.ssPortal.statusConfirmed,
	declined: (t) => t.ssPortal.statusDeclined,
	paid: (t) => t.ssPortal.statusPaid,
};

const INITIATOR_LABEL: Record<
	SpecialServiceInitiator,
	(t: PortalTranslations) => string
> = {
	agency: (t) => t.adminService.agency,
	outlet: (t) => t.table.outlet,
	pr: (t) => t.table.pr,
};

export function SpecialServiceOrderCard({
	row,
	role,
	onApprove,
	onDecline,
	onAccept,
}: {
	row: SpecialServiceRecord;
	role: "agency" | "outlet" | "pr" | "admin";
	onApprove?: (id: string) => void;
	onDecline?: (id: string) => void;
	onAccept?: (id: string) => void;
}) {
	const { t } = usePortalLocale();
	const actionable = isSpecialServiceActionable(row, role);
	const approveLabel = role === "admin" ? t.ssPortal.accept : t.common.approve;
	const declineLabel = role === "admin" ? t.common.reject : t.common.decline;

	return (
		<IzCard flat className="iz-between items-start gap-3">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="iz-heading text-sm font-bold text-[var(--iz-violet-l)]">
						{row.id}
					</span>
					<IzPill
						variant={specialServiceStatusVariant(row.status)}
						className="!text-[9px]"
					>
						{STATUS_LABEL[row.status]?.(t) ?? row.status}
					</IzPill>
					<IzPill variant="ink" className="!text-[9px]">
						{INITIATOR_LABEL[row.initiatedBy]?.(t) ?? row.initiatedBy}
					</IzPill>
				</div>
				<p className="mt-1 iz-heading text-sm font-semibold text-[var(--iz-txt)]">
					{row.prName}
				</p>
				<p className="iz-tiny iz-muted mt-0.5">
					{specialServiceOfferLabel(t, row.serviceType, row.customServiceName)} ·{" "}
					{row.outlet} · {row.date} · {row.time}
				</p>
				<p className="iz-tiny iz-muted2 mt-1 line-clamp-2">{row.description}</p>
				{!isLeaveAgencyService(row.serviceType) ? (
					<p className="iz-tiny iz-muted2 mt-1">
						{row.amountOut > 0
							? fill(t.ssPortal.orderMoneyLine, {
									inAmt: formatRM(row.amountIn),
									outAmt: formatRM(row.amountOut),
									who: row.raisedBy,
								})
							: fill(t.ssPortal.orderMoneyPendingLine, {
									inAmt: formatRM(row.amountIn),
									who: row.raisedBy,
								})}
					</p>
				) : (
					<p className="iz-tiny iz-muted2 mt-1">
						{fill(t.ssPortal.supportTicketRaisedBy, { who: row.raisedBy })}
					</p>
				)}
				{row.approvedAt &&
					(row.initiatedBy === "agency" || row.initiatedBy === "outlet") &&
					row.adminAccepted === "accepted" && (
						<p className="iz-tiny text-[var(--iz-green)] mt-0.5">
							{fill(t.ssPortal.acceptedAt, { when: row.approvedAt })}
						</p>
					)}
				{row.approvedAt && row.initiatedBy === "pr" && (
					<p className="iz-tiny text-[var(--iz-green)] mt-0.5">
						{fill(t.ssPortal.agencyApprovedAt, { when: row.approvedAt })}
					</p>
				)}
				{row.declineReason && (
					<p className="iz-tiny text-[var(--iz-amber)] mt-0.5">
						{row.declineReason}
					</p>
				)}
			</div>
			<div className="shrink-0 text-right">
				{!isLeaveAgencyService(row.serviceType) ? (
					<>
						<div className="iz-tiny iz-muted2">{t.ssPortal.out}</div>
						<div className="iz-ledger iz-heading text-base font-bold text-[var(--iz-gold-l)]">
							{row.amountOut > 0 ? formatRM(row.amountOut) : t.ssPortal.tbc}
						</div>
						{row.amountIn > 0 && (
							<p className="iz-tiny mt-1 text-[var(--iz-green)]">
								{fill(t.ssPortal.inAmount, { amount: formatRM(row.amountIn) })}
							</p>
						)}
					</>
				) : (
					<IzPill variant="amber" className="!text-[9px]">
						{t.ssPortal.support}
					</IzPill>
				)}
				{actionable &&
					(role === "agency" || role === "admin") &&
					onApprove &&
					onDecline && (
						<div className="mt-2 flex flex-col gap-1">
							<button
								type="button"
								className={cn(
									"iz-btn !py-1 !text-[10px]",
									role === "admin" ? "iz-btn-primary" : "iz-btn-soft",
								)}
								onClick={() => onApprove(row.id)}
							>
								{approveLabel}
							</button>
							<button
								type="button"
								className="iz-btn !py-1 !text-[10px]"
								onClick={() => onDecline(row.id)}
							>
								{declineLabel}
							</button>
						</div>
					)}
				{actionable && role !== "agency" && onAccept && onDecline && (
					<div className="mt-2 flex flex-col gap-1">
						<button
							type="button"
							className="iz-btn iz-btn-primary !py-1 !text-[10px]"
							onClick={() => onAccept(row.id)}
						>
							{t.ssPortal.accept}
						</button>
						<button
							type="button"
							className="iz-btn !py-1 !text-[10px]"
							onClick={() => onDecline(row.id)}
						>
							{t.common.decline}
						</button>
					</div>
				)}
			</div>
		</IzCard>
	);
}
