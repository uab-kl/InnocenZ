import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { isSpecialServiceActionable } from "@agency-portal/lib/special-service-actions";
import {
	isLeaveAgencyService,
	type SpecialServiceRecord,
	specialServiceInitiatorLabel,
	specialServiceRecordTypeLabel,
	specialServiceStatusLabel,
	specialServiceStatusVariant,
} from "@agency-portal/lib/special-service-demo";
import { cn } from "@agency-portal/lib/utils";

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
	const actionable = isSpecialServiceActionable(row, role);
	const approveLabel = role === "admin" ? "Accept" : "Approve";
	const declineLabel = role === "admin" ? "Reject" : "Decline";

	return (
		<IzCard flat className="iz-between items-start gap-3">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="font-sora text-sm font-bold text-[var(--iz-violet-l)]">
						{row.id}
					</span>
					<IzPill
						variant={specialServiceStatusVariant(row.status)}
						className="!text-[9px]"
					>
						{specialServiceStatusLabel(row.status)}
					</IzPill>
					<IzPill variant="ink" className="!text-[9px]">
						{specialServiceInitiatorLabel(row.initiatedBy)}
					</IzPill>
				</div>
				<p className="mt-1 font-sora text-sm font-semibold text-[var(--iz-txt)]">
					{row.prName}
				</p>
				<p className="iz-tiny iz-muted mt-0.5">
					{specialServiceRecordTypeLabel(row)} · {row.outlet} · {row.date} ·{" "}
					{row.time}
				</p>
				<p className="iz-tiny iz-muted2 mt-1 line-clamp-2">{row.description}</p>
				{!isLeaveAgencyService(row.serviceType) ? (
					<p className="iz-tiny iz-muted2 mt-1">
						In {formatRM(row.amountIn)}
						{row.amountOut > 0
							? ` · Out ${formatRM(row.amountOut)}`
							: " · Cost pending admin"}
						{" · "}Raised by {row.raisedBy}
					</p>
				) : (
					<p className="iz-tiny iz-muted2 mt-1">
						Support ticket · Raised by {row.raisedBy}
					</p>
				)}
				{row.approvedAt &&
					(row.initiatedBy === "agency" || row.initiatedBy === "outlet") &&
					row.adminAccepted === "accepted" && (
						<p className="iz-tiny text-[var(--iz-green)] mt-0.5">
							Accepted {row.approvedAt}
						</p>
					)}
				{row.approvedAt && row.initiatedBy === "pr" && (
					<p className="iz-tiny text-[var(--iz-green)] mt-0.5">
						Agency approved {row.approvedAt}
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
						<div className="iz-tiny iz-muted2">Out</div>
						<div className="iz-ledger font-sora text-base font-bold text-[var(--iz-gold-l)]">
							{row.amountOut > 0 ? formatRM(row.amountOut) : "TBC"}
						</div>
						{row.amountIn > 0 && (
							<p className="iz-tiny mt-1 text-[var(--iz-green)]">
								In {formatRM(row.amountIn)}
							</p>
						)}
					</>
				) : (
					<IzPill variant="amber" className="!text-[9px]">
						Support
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
							Accept
						</button>
						<button
							type="button"
							className="iz-btn !py-1 !text-[10px]"
							onClick={() => onDecline(row.id)}
						>
							Decline
						</button>
					</div>
				)}
			</div>
		</IzCard>
	);
}
