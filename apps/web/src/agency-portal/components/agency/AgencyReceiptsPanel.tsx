import {
	formatRM,
	IzCard,
	IzPill,
	IzSelect,
} from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useAgencyReceipts } from "@agency-portal/hooks/use-agency-receipts";
import { agencyCan } from "@agency-portal/lib/agency-rbac";
import { useStore } from "@agency-portal/lib/store";
import {
	Check,
	ChevronDown,
	FileText,
	ImageOff,
	Receipt,
	RotateCcw,
	ScanLine,
	Search,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
	AgencyReceipt,
	PaymentVoucherReceiptStatus,
} from "@/services/payment-voucher";

const SOURCE_LABEL: Record<AgencyReceipt["source"], string> = {
	scan: "Scanned",
	manual: "Self-logged",
	checkin: "Check-in",
};

/**
 * "Waiting on you", not "Pending" — the label states whose move it is. A pending
 * receipt is the reason a voucher will not send, so the word has to carry that.
 */
const STATUS_LABEL: Record<PaymentVoucherReceiptStatus, string> = {
	pending: "Waiting on you",
	approved: "Approved",
	verified: "Verified",
};

const STATUS_VARIANT: Record<
	PaymentVoucherReceiptStatus,
	"amber" | "green" | "ink"
> = {
	pending: "amber",
	approved: "green",
	verified: "ink",
};

type StatusFilter = "all" | PaymentVoucherReceiptStatus;

const sumLines = (receipt: AgencyReceipt) =>
	receipt.lines.reduce((total, line) => total + Number(line.amount || 0), 0);

/**
 * The shift working day this receipt belongs to.
 *
 * A line's own `lineDate` wins because that is the day the money was earned; the
 * printed receipt date and the logged-at stamp are fallbacks in that order. They
 * genuinely differ — a receipt scanned at 01:00 belongs to the shift that ran
 * past midnight, not to the calendar day it was uploaded on.
 */
function workingDayIso(receipt: AgencyReceipt): string {
	const lineDate = receipt.lines.find((line) => line.lineDate)?.lineDate;
	return lineDate ?? receipt.receiptDate ?? receipt.loggedAt.slice(0, 10);
}

const receiptOutlet = (receipt: AgencyReceipt): string =>
	receipt.lines.find((line) => line.outlet)?.outlet ?? "—";

/** yyyy-MM-dd -> "Tue 29 Jul", the same shape the day-review panel prints. */
function formatDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

function formatLoggedAt(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString("en-GB", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * A proof photo is an opaque string — the PR app sends a data URL, older rows
 * hold a path. Rendering a path as an image gives a broken icon that reads as
 * "the evidence is missing", which is the one thing this panel must never say by
 * accident, so only what is certainly renderable is rendered.
 */
const isRenderablePhoto = (photo: string) =>
	photo.startsWith("data:image/") ||
	photo.startsWith("https://") ||
	photo.startsWith("http://");

/**
 * Does this receipt fall in the payroll week the tab is showing?
 *
 * Matched on the VOUCHER's `week_start` falling inside the tab's Sun–Sat window,
 * exactly as the voucher rows above are matched — the backend's week starts on a
 * Monday, so string equality against a Sunday tab start would hide every real
 * row. A receipt whose voucher has no week at all falls back to its own working
 * day so it surfaces somewhere rather than nowhere.
 */
function inPayrollWeek(
	receipt: AgencyReceipt,
	weekStartIso: string,
	weekEndIso: string,
): boolean {
	const anchor = receipt.weekStart ?? workingDayIso(receipt);
	return anchor >= weekStartIso && anchor <= weekEndIso;
}

/**
 * The week's receipts. Exported so the sub-tab COUNT and the list it opens are
 * computed by one rule — a count that disagrees with its own list is worse than
 * no count, because it reads as data that vanished on click.
 */
export function receiptsInPayrollWeek(
	receipts: AgencyReceipt[],
	weekStartIso: string,
	weekEndIso: string,
): AgencyReceipt[] {
	return receipts.filter((r) => inPayrollWeek(r, weekStartIso, weekEndIso));
}

function ReceiptRow({
	receipt,
	canReview,
	busy,
	onReview,
	onOpenPv,
}: {
	receipt: AgencyReceipt;
	canReview: boolean;
	busy: boolean;
	onReview: (status: "pending" | "approved") => void;
	onOpenPv?: (voucherId: string) => void;
}) {
	// Pending rows open themselves: the whole point of the row is the decision,
	// and a decision behind a click is one the reviewer can walk past.
	const [open, setOpen] = useState(receipt.status === "pending");
	const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);

	// Escape closes the enlarged photo. Without this the overlay is mouse-only —
	// it covers the screen, so a keyboard user would have nothing to tab to.
	useEffect(() => {
		if (!zoomPhoto) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setZoomPhoto(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [zoomPhoto]);
	const total = sumLines(receipt);
	const photos = receipt.proofPhotos ?? [];
	// Verified means the week closed. The server refuses to re-decide it, so the
	// buttons are withheld rather than offered and answered with a 409.
	const decidable = canReview && receipt.status !== "verified";

	return (
		<div className="rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)]/40">
			<button
				type="button"
				className="w-full px-3 py-2.5 text-left"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-1.5">
							<ScanLine className="h-3.5 w-3.5 shrink-0" />
							<span className="font-mono text-sm font-bold">
								{receipt.receiptNo}
							</span>
							<IzPill
								variant={receipt.source === "scan" ? "violet" : "amber"}
								className="!text-[10px]"
							>
								{SOURCE_LABEL[receipt.source]}
							</IzPill>
							<IzPill
								variant={STATUS_VARIANT[receipt.status]}
								className="!text-[10px]"
							>
								{STATUS_LABEL[receipt.status]}
							</IzPill>
						</div>
						<p className="iz-tiny iz-muted mt-1">
							{receipt.prName ?? "Unknown PR"} · {receiptOutlet(receipt)}
							{receipt.orderNo ? ` · order ${receipt.orderNo}` : ""}
						</p>
						<p className="iz-tiny iz-muted2 mt-0.5">
							Logged {formatLoggedAt(receipt.loggedAt)}
							{receipt.receiptTime ? ` · printed ${receipt.receiptTime}` : ""} ·{" "}
							{photos.length > 0
								? `${photos.length} photo${photos.length === 1 ? "" : "s"}`
								: "no photo"}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2 text-right">
						<div>
							<p className="iz-ledger text-sm font-bold">{formatRM(total)}</p>
							<p className="iz-tiny iz-muted2">
								{receipt.lines.length}{" "}
								{receipt.lines.length === 1 ? "item" : "items"}
							</p>
						</div>
						<ChevronDown
							className={`h-4 w-4 text-[var(--iz-muted)] transition-transform${open ? " rotate-180" : ""}`}
							aria-hidden
						/>
					</div>
				</div>
			</button>

			{open && (
				<div className="border-t border-[var(--iz-line)] px-3 py-2.5">
					{receipt.lines.length === 0 ? (
						// Not cosmetic: a receipt with no lines contributes nothing to the
						// voucher, so printing RM 0.00 alone would read as a free receipt
						// rather than as a record that never attached to any money.
						<p className="iz-tiny text-[var(--iz-amber,#d9b97a)]">
							No line items on this receipt — it adds nothing to the voucher.
						</p>
					) : (
						<div>
							{receipt.lines.map((line) => (
								<div
									key={line.id}
									className="iz-tiny flex items-center justify-between gap-2 border-b border-[var(--iz-line)] py-1 last:border-0"
								>
									<span className="iz-muted2">
										{line.quantity} × {line.description}
									</span>
									<span className="font-medium">
										{formatRM(Number(line.amount || 0))}
									</span>
								</div>
							))}
						</div>
					)}

					{receipt.note && (
						<p className="iz-tiny mt-2">
							<span className="iz-muted2">PR's note: </span>
							{receipt.note}
						</p>
					)}

					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						{photos.length === 0 && (
							<>
								<ImageOff className="h-3.5 w-3.5 opacity-60" />
								<span className="iz-tiny iz-muted2">No proof attached</span>
							</>
						)}
						{photos.map((photo, i) =>
							isRenderablePhoto(photo) ? (
								<button
									// biome-ignore lint/suspicious/noArrayIndexKey: photos are opaque strings with no id
									key={`${receipt.id}-photo-${i}`}
									type="button"
									// A 64px thumbnail cannot be read. The point of the photo is
									// that a reviewer checks the printed figures against the line,
									// so it has to open big enough to actually read.
									className="cursor-zoom-in rounded border border-[var(--iz-line)] transition-colors hover:border-[var(--iz-gold-d)]"
									onClick={() => setZoomPhoto(photo)}
									aria-label={`Enlarge proof ${i + 1} for ${receipt.receiptNo}`}
								>
									<img
										src={photo}
										alt={`Proof ${i + 1} for ${receipt.receiptNo}`}
										className="h-16 w-16 rounded object-cover"
									/>
								</button>
							) : (
								<span
									// biome-ignore lint/suspicious/noArrayIndexKey: photos are opaque strings with no id
									key={`${receipt.id}-photo-${i}`}
									className="iz-tiny iz-muted2 break-all"
								>
									{photo}
								</span>
							),
						)}
					</div>

					{receipt.status !== "pending" && (
						<p className="iz-tiny iz-muted2 mt-2">
							{receipt.reviewedBy
								? `Reviewed by ${receipt.reviewedBy}`
								: "Reviewed"}
							{" · "}
							{receipt.reviewedAt
								? new Date(receipt.reviewedAt).toLocaleDateString("en-GB")
								: "before this review existed"}
						</p>
					)}

					<div className="mt-2.5 flex flex-wrap gap-2">
						{decidable &&
							(receipt.status === "pending" ? (
								<button
									type="button"
									className="iz-btn iz-btn-primary !h-7 !px-2.5 !text-[11px]"
									disabled={busy}
									onClick={() => onReview("approved")}
								>
									<Check className="mr-1 h-3 w-3" /> Approve
								</button>
							) : (
								<button
									type="button"
									className="iz-btn iz-btn-ghost !h-7 !px-2.5 !text-[11px]"
									disabled={busy}
									onClick={() => onReview("pending")}
								>
									<RotateCcw className="mr-1 h-3 w-3" /> Withdraw approval
								</button>
							))}
						{onOpenPv && (
							<button
								type="button"
								className="iz-btn iz-btn-soft !h-7 !px-2.5 !text-[11px]"
								onClick={() => onOpenPv(receipt.voucherId)}
							>
								<FileText className="mr-1 h-3 w-3" /> Open PV
							</button>
						)}
					</div>
				</div>
			)}

			{/*
			 * Full-size proof. A dialog rather than a new tab: the reviewer is
			 * comparing the paper against the line right beside it, and a tab switch
			 * loses that. Backdrop click and Escape both close, and the image is
			 * bounded to the viewport so a tall receipt scrolls instead of
			 * overflowing off-screen.
			 */}
			{zoomPhoto && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/80 p-4"
					role="dialog"
					aria-modal="true"
					aria-label={`Proof photo for ${receipt.receiptNo}`}
				>
					<button
						type="button"
						className="absolute inset-0 cursor-zoom-out"
						onClick={() => setZoomPhoto(null)}
						aria-label="Close enlarged photo"
					/>
					<img
						src={zoomPhoto}
						alt={`Proof for ${receipt.receiptNo}`}
						className="relative max-h-[90vh] max-w-[min(90vw,900px)] rounded-lg border border-[var(--iz-line)] object-contain shadow-2xl"
					/>
					<button
						type="button"
						className="iz-btn iz-btn-soft absolute top-4 right-4 !h-8 !px-3 !text-xs"
						onClick={() => setZoomPhoto(null)}
					>
						Close
					</button>
				</div>
			)}
		</div>
	);
}

/**
 * The agency's receipt feed for one payroll week — every receipt its PRs logged,
 * read from the database and grouped by the shift day it was earned on.
 *
 * Replaces a demo-store list that could only ever be empty on a real login. The
 * review buttons hit the same endpoint as the per-voucher verify panel, so a
 * receipt approved here is approved everywhere and obeys the same two refusals:
 * a verified receipt cannot be reopened, and a signed voucher cannot be reviewed.
 *
 * The week the tab is showing is a FILTER, not the whole truth, so the count of
 * receipts sitting outside it is stated rather than left to look like absence.
 */
export function AgencyReceiptsPanel({
	weekStartIso,
	weekEndIso,
	onOpenPv,
}: {
	weekStartIso: string;
	weekEndIso: string;
	onOpenPv?: (voucherId: string) => void;
}) {
	const toast = useStore((s) => s.toast);
	const agencySubRole = useStore((s) => s.agencySubRole);
	const canReview = agencyCan(agencySubRole, "raisePv");
	const {
		receipts,
		isLoading,
		error,
		reviewReceipt,
		isReviewing,
		reviewError,
	} = useAgencyReceipts();

	const [status, setStatus] = useState<StatusFilter>("all");
	const [search, setSearch] = useState("");
	const [prId, setPrId] = useState("");
	const [outlet, setOutlet] = useState("");
	const [source, setSource] = useState<"" | AgencyReceipt["source"]>("");
	const [showFilters, setShowFilters] = useState(false);

	const weekReceipts = useMemo(
		() => receiptsInPayrollWeek(receipts, weekStartIso, weekEndIso),
		[receipts, weekStartIso, weekEndIso],
	);
	const offWeekCount = receipts.length - weekReceipts.length;

	const statusCounts = useMemo(
		() => ({
			all: weekReceipts.length,
			pending: weekReceipts.filter((r) => r.status === "pending").length,
			approved: weekReceipts.filter((r) => r.status === "approved").length,
			verified: weekReceipts.filter((r) => r.status === "verified").length,
		}),
		[weekReceipts],
	);

	const weekTotal = useMemo(
		() => weekReceipts.reduce((total, r) => total + sumLines(r), 0),
		[weekReceipts],
	);

	const prOptions = useMemo(() => {
		const byId = new Map<string, string>();
		for (const r of weekReceipts) {
			if (r.prId) byId.set(r.prId, r.prName ?? r.prId);
		}
		return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
	}, [weekReceipts]);

	const outletOptions = useMemo(
		() =>
			[...new Set(weekReceipts.map(receiptOutlet))]
				.filter((o) => o !== "—")
				.sort(),
		[weekReceipts],
	);

	const filtered = useMemo(() => {
		const needle = search.trim().toLowerCase();
		return weekReceipts.filter((r) => {
			if (status !== "all" && r.status !== status) return false;
			if (prId && r.prId !== prId) return false;
			if (outlet && receiptOutlet(r) !== outlet) return false;
			if (source && r.source !== source) return false;
			if (!needle) return true;
			return [
				r.receiptNo,
				r.orderNo ?? "",
				r.prName ?? "",
				receiptOutlet(r),
				...r.lines.map((l) => l.description),
			]
				.join(" ")
				.toLowerCase()
				.includes(needle);
		});
	}, [weekReceipts, status, prId, outlet, source, search]);

	/** Newest working day first, receipts within a day newest-logged first. */
	const days = useMemo(() => {
		const byDay = new Map<string, AgencyReceipt[]>();
		for (const r of filtered) {
			const day = workingDayIso(r);
			byDay.set(day, [...(byDay.get(day) ?? []), r]);
		}
		return [...byDay.entries()]
			.sort((a, b) => b[0].localeCompare(a[0]))
			.map(([day, rows]) => ({
				day,
				rows: [...rows].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)),
				total: rows.reduce((sum, r) => sum + sumLines(r), 0),
			}));
	}, [filtered]);

	const filtersActive = Boolean(prId || outlet || source || search.trim());

	const clearFilters = () => {
		setPrId("");
		setOutlet("");
		setSource("");
		setSearch("");
	};

	const decide = async (
		receipt: AgencyReceipt,
		next: "pending" | "approved",
	) => {
		try {
			await reviewReceipt({ receiptId: receipt.id, status: next });
			toast(
				next === "approved"
					? `${receipt.receiptNo} approved`
					: `${receipt.receiptNo} back to pending`,
				"success",
			);
		} catch {
			// The server's own words are rendered under the header; this is only the
			// nudge that tells the reviewer to go read them.
			toast("Could not record that decision", "warn");
		}
	};

	return (
		<OutletSection
			title="Receipts"
			icon={Receipt}
			hint={`${weekReceipts.length} this week · ${formatRM(weekTotal)}`}
		>
			{isLoading && (
				<IzCard flat>
					<p className="iz-tiny iz-muted">Loading receipts…</p>
				</IzCard>
			)}

			{error && (
				<IzCard flat className="border-[rgba(192,85,79,.4)]">
					<p className="iz-tiny text-[var(--iz-red,#c0554f)]">
						Could not load receipts. Check the backend is running, then reload.
					</p>
				</IzCard>
			)}

			{!isLoading && !error && (
				<>
					<div className="grid grid-cols-3 gap-2">
						<IzCard flat className="!mb-0">
							<p className="font-sora text-lg font-extrabold">
								{statusCounts.all}
							</p>
							<p className="iz-tiny iz-muted2">Receipts</p>
						</IzCard>
						<IzCard
							flat
							className={`!mb-0${statusCounts.pending > 0 ? " border-[rgba(244,183,64,.4)]" : ""}`}
						>
							<p
								className={`font-sora text-lg font-extrabold${statusCounts.pending > 0 ? " text-[var(--iz-amber,#d9b97a)]" : ""}`}
							>
								{statusCounts.pending}
							</p>
							<p className="iz-tiny iz-muted2">Waiting on you</p>
						</IzCard>
						<IzCard flat className="!mb-0">
							<p className="iz-ledger font-sora text-lg font-extrabold">
								{formatRM(weekTotal)}
							</p>
							<p className="iz-tiny iz-muted2">Commission logged</p>
						</IzCard>
					</div>

					{statusCounts.pending > 0 && (
						<IzCard
							flat
							className="mt-2 border-[rgba(244,183,64,.4)] bg-[rgba(244,183,64,.08)]"
						>
							<p className="iz-sm font-bold text-[var(--iz-amber)]">
								{statusCounts.pending} receipt
								{statusCounts.pending === 1 ? "" : "s"} awaiting your approval
							</p>
							<p className="iz-tiny iz-muted2 mt-0.5">
								A voucher cannot be sent while one of its receipts is pending —
								and the PR cannot dispute the money behind it until you decide.
							</p>
						</IzCard>
					)}

					{reviewError && (
						<IzCard flat className="mt-2 border-[rgba(192,85,79,.4)]">
							<p className="iz-tiny text-[var(--iz-red,#c0554f)]">
								{reviewError}
							</p>
						</IzCard>
					)}

					<div className="mt-2 flex flex-wrap gap-1.5">
						{(
							[
								["all", "All"],
								["pending", "Waiting on you"],
								["approved", "Approved"],
								["verified", "Verified"],
							] as [StatusFilter, string][]
						).map(([value, label]) => (
							<button
								key={value}
								type="button"
								className={`iz-payroll-tab !flex-none !px-2.5 !text-[11px]${status === value ? " on" : ""}`}
								onClick={() => setStatus(value)}
							>
								{label} ({statusCounts[value]})
							</button>
						))}
					</div>

					<div className="mt-2 flex items-center gap-2">
						<div className="relative flex-1">
							<Search
								className="absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--iz-muted)]"
								aria-hidden
							/>
							<input
								type="search"
								className="w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] py-1.5 pr-2 pl-7 text-xs"
								placeholder="Receipt no, order no, PR, outlet or item"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								aria-label="Search receipts"
							/>
						</div>
						<button
							type="button"
							className="iz-btn iz-btn-soft !h-8 !px-2.5 !text-[11px]"
							onClick={() => setShowFilters((v) => !v)}
							aria-expanded={showFilters}
						>
							<SlidersHorizontal className="mr-1 h-3 w-3" /> Filters
						</button>
					</div>

					{showFilters && (
						<div className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)]/60 p-2.5 sm:grid-cols-3">
							<IzSelect
								block
								className="!text-xs"
								value={prId}
								onChange={(e) => setPrId(e.target.value)}
							>
								<option value="">All PRs</option>
								{prOptions.map(([id, name]) => (
									<option key={id} value={id}>
										{name}
									</option>
								))}
							</IzSelect>
							<IzSelect
								block
								className="!text-xs"
								value={outlet}
								onChange={(e) => setOutlet(e.target.value)}
							>
								<option value="">All outlets</option>
								{outletOptions.map((o) => (
									<option key={o} value={o}>
										{o}
									</option>
								))}
							</IzSelect>
							<IzSelect
								block
								className="!text-xs"
								value={source}
								onChange={(e) =>
									setSource(e.target.value as "" | AgencyReceipt["source"])
								}
							>
								<option value="">All entry methods</option>
								<option value="scan">Scanned</option>
								<option value="manual">Self-logged</option>
								<option value="checkin">Check-in</option>
							</IzSelect>
							{filtersActive && (
								<button
									type="button"
									className="iz-tiny text-left text-[var(--iz-gold-l)] sm:col-span-3"
									onClick={clearFilters}
								>
									Clear filters
								</button>
							)}
						</div>
					)}

					<div className="mt-3 space-y-3">
						{days.length === 0 ? (
							<IzCard className="text-center">
								<p className="iz-sm iz-muted">
									{receipts.length === 0
										? "No receipts logged yet. PRs log these from their Payment screen as they work a shift."
										: filtersActive || status !== "all"
											? "No receipts match these filters."
											: "No receipts logged in this payroll week."}
								</p>
							</IzCard>
						) : (
							days.map(({ day, rows, total }) => (
								<div key={day}>
									<div className="mb-1.5 flex items-baseline justify-between gap-2">
										<p className="iz-tiny font-bold tracking-wide">
											{formatDay(day)}
										</p>
										<p className="iz-tiny iz-muted2">
											{rows.length} receipt{rows.length === 1 ? "" : "s"} ·{" "}
											{formatRM(total)}
										</p>
									</div>
									<div className="space-y-2">
										{rows.map((receipt) => (
											<ReceiptRow
												key={receipt.id}
												receipt={receipt}
												canReview={canReview}
												busy={isReviewing}
												onReview={(next) => void decide(receipt, next)}
												onOpenPv={onOpenPv}
											/>
										))}
									</div>
								</div>
							))
						)}
					</div>

					{offWeekCount > 0 && (
						<p className="iz-tiny iz-muted2 mt-3">
							{offWeekCount} more receipt{offWeekCount === 1 ? "" : "s"} sit
							{offWeekCount === 1 ? "s" : ""} in other payroll weeks — switch
							the week tab above to review them.
						</p>
					)}

					{!canReview && weekReceipts.length > 0 && (
						<p className="iz-tiny iz-muted2 mt-2">
							Your agency role can see these receipts but not approve them —
							owner and finance review receipts.
						</p>
					)}
				</>
			)}
		</OutletSection>
	);
}
