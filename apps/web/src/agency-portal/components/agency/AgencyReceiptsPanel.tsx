import { AgencyReceiptEditor } from "@agency-portal/components/agency/AgencyReceiptEditor";
import { ProofPhotos } from "@agency-portal/components/agency/ProofPhotoViewer";
import { ShiftFactsBlock } from "@agency-portal/components/agency/ShiftFactsBlock";
import {
	formatRM,
	IzCard,
	IzPill,
	IzSelect,
} from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useAgencyReceipts } from "@agency-portal/hooks/use-agency-receipts";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import {
	DISPUTE_COMPONENT_LABEL,
	isDisputed,
	openDisputesFor,
} from "@agency-portal/lib/receipt-disputes";
import { receiptStatusTag } from "@agency-portal/lib/receipt-status";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import {
	Check,
	ChevronDown,
	FileText,
	ImageOff,
	Pencil,
	Receipt,
	RotateCcw,
	ScanLine,
	Search,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type {
	AgencyReceipt,
	PaymentVoucherReceiptStatus,
} from "@/services/payment-voucher";

// Dictionary KEYS, not finished strings: these sit at module scope, where the
// locale hook cannot be called. The row component resolves them against its own
// `t`. The record keys stay the API's values (`scan`, `manual`, `checkin`) —
// those are data, not copy.
const SOURCE_LABEL: Record<
	AgencyReceipt["source"],
	keyof PortalTranslations["receipts"]
> = {
	scan: "scanned",
	manual: "selfLogged",
	checkin: "checkIn",
};

// The status label and its colour moved to `lib/receipt-status.ts` — three
// panels drew this pill and the dispute queue's copy had drifted to a different
// colour and a different word for the same receipt.

/**
 * "disputed" is deliberately NOT a `PaymentVoucherReceiptStatus`.
 *
 * The three real statuses describe the AGENCY's review; a dispute is what the
 * PR says about it, and the two coexist — a verified receipt can be under a live
 * claim, which is exactly the case that used to render as a plain green
 * "Verified". Modelling it as a fourth status would force one to overwrite the
 * other and lose whichever fact came second.
 */
type StatusFilter = "all" | PaymentVoucherReceiptStatus | "disputed";

const sumLines = (receipt: AgencyReceipt) =>
	receipt.lines.reduce((total, line) => total + Number(line.amount || 0), 0);

/**
 * The shift working day this receipt belongs to.
 *
 * A line's own `lineDate` wins because that is the day the money was earned; the
 * printed receipt date and the logged-at stamp are fallbacks in that order. They
 * genuinely differ — a receipt scanned at 01:00 belongs to the shift that ran
 * past midnight, not to the calendar day it was uploaded on.
 *
 * EXPORTED because the home hub used to read `receiptDate` directly and printed
 * a different day for the same receipt: live rows carry `receipt_date` =
 * 2026-06-16 against lines dated 2026-08-06 and 2026-08-10. Two surfaces asking
 * "which day is this receipt for" must not answer it two ways, so both now call
 * this. It also means a junk `receipt_date` is tolerated rather than displayed —
 * see TEST_SCRIPT §9 for the self-log form that writes it.
 */
export function workingDayIso(receipt: AgencyReceipt): string {
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

// `isRenderablePhoto` moved to ProofPhotoViewer — one rule about what counts as
// renderable evidence, in one place, rather than a private copy per panel.

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
	const { t } = usePortalLocale();
	/**
	 * The claims the PR has open on this paper.
	 *
	 * Read off the feed, not derived here — the server decides which receipts a
	 * claim reaches, so this list and the dispute queue's evidence block are the
	 * same fact rather than two guesses at it.
	 */
	const claims = openDisputesFor(receipt);
	const tag = receiptStatusTag(receipt);
	// Pending rows open themselves: the whole point of the row is the decision,
	// and a decision behind a click is one the reviewer can walk past. A DISPUTED
	// row opens for the same reason — somebody is waiting on an answer, and the
	// claim is worth less folded away than the approval it is arguing with.
	const [open, setOpen] = useState(
		receipt.status === "pending" || claims.length > 0,
	);
	// The enlarge overlay that lived here is gone — ProofPhotoViewer owns it now,
	// with zoom and pan this one never had.
	// Closed by default. The editor states what a correction costs and carries
	// three live write buttons, so it is opened deliberately rather than sitting
	// under the reviewer's cursor while they are only reading.
	const [editing, setEditing] = useState(false);

	const total = sumLines(receipt);
	const photos = receipt.proofPhotos ?? [];
	// Approve/withdraw stop at VERIFIED — the server refuses to re-decide it.
	// EDITING no longer stops there (owner's rule, 23 Aug 2026): scans verify
	// at creation and a correction verifies the receipt, so verified means
	// CHECKED, not closed.
	const decidable = canReview && receipt.status !== "verified";
	/*
	 * WHAT CORRECTING A RECEIPT DEPENDS ON — and what it deliberately does not.
	 *
	 * Not the source: a scanned paper and a self-logged one are corrected under
	 * the same rule, which is what lets the agency fix an OCR misread and a PR's
	 * typo with one button. Not the review state either: a receipt still WAITING
	 * on the agency is editable — that is the whole point of the wait — and a
	 * verified one stays editable because the PR may still be disputing it.
	 *
	 * The PR's signature is the only lock, matching every one of the four write
	 * endpoints. `voucherStatus` stands in for `prSignedAt`, which this feed does
	 * not carry.
	 */
	const signedOff =
		receipt.voucherStatus === "signed" || receipt.voucherStatus === "paid";
	const canEdit = canReview && !signedOff;

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
								{t.receipts[SOURCE_LABEL[receipt.source]]}
							</IzPill>
							{/* ONE tag, and an open claim owns it — see `receiptStatusTag`. */}
							<IzPill variant={tag.variant} className="!text-[10px]">
								{t.receipts[tag.labelKey]}
							</IzPill>
						</div>
						<p className="iz-tiny iz-muted mt-1">
							{/* The feed has carried prNickname since the receipt review shipped;
							    this row simply never read it. Shared formatter, so all three
							    payee surfaces say the same thing. */}
							{formatPayeeLabel(receipt.prNickname, receipt.prName) ||
								t.receipts.unknownPr}{" "}
							· {receiptOutlet(receipt)}
							{receipt.orderNo
								? ` · ${fill(t.agencyReceipts.orderNoInline, {
										no: receipt.orderNo,
									})}`
								: ""}
						</p>
						{/* THE SHIFT THE OUTLET POSTED — without it a stack of receipts from
						    one venue is indistinguishable and the reviewer cannot tell which
						    night's money they are approving.
						    THE SAME block the dispute queue draws — one component, not a
						    second spelling. The agency reads both screens while deciding
						    the same money, and a one-liner here beside a block there is
						    how they drift. */}
						{receipt.shift && (
							<div className="mt-1.5">
								<ShiftFactsBlock shift={receipt.shift} />
							</div>
						)}
						<p className="iz-tiny iz-muted2 mt-0.5">
							{fill(t.agencyReceipts.loggedAt, {
								when: formatLoggedAt(receipt.loggedAt),
							})}
							{receipt.receiptTime
								? ` · ${fill(t.agencyReceipts.printedAt, {
										time: receipt.receiptTime,
									})}`
								: ""}{" "}
							·{" "}
							{photos.length > 0
								? fill(
										photos.length === 1
											? t.agencyReceipts.photoCountOne
											: t.agencyReceipts.photoCountMany,
										{ n: photos.length },
									)
								: t.agencyReceipts.noPhoto}
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2 text-right">
						<div>
							<p className="iz-ledger text-sm font-bold">{formatRM(total)}</p>
							<p className="iz-tiny iz-muted2">
								{fill(
									receipt.lines.length === 1
										? t.agencyReceipts.itemCountOne
										: t.agencyReceipts.itemCountMany,
									{ n: receipt.lines.length },
								)}
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
					{/* WHAT IS BEING ARGUED, above the figures being argued about.
					    Correcting the lines below does NOT settle a claim — accepting
					    or rejecting it is a separate decision, taken in the dispute
					    queue — so the row says so rather than letting a reviewer
					    assume a saved edit closed it. */}
					{claims.length > 0 && (
						<div className="mb-2 rounded-lg border border-[rgba(192,85,79,.4)] bg-[rgba(192,85,79,.08)] px-2 py-1.5">
							<p className="iz-tiny font-bold text-[var(--iz-red,#c0554f)]">
								{claims.length === 1
									? t.agencyReceipts.disputingOne
									: fill(t.agencyReceipts.disputingMany, {
											n: claims.length,
										})}
							</p>
							{claims.map((claim) => (
								<p key={claim.id} className="iz-tiny iz-muted2 mt-0.5">
									{t.money[DISPUTE_COMPONENT_LABEL[claim.component]]} ·{" "}
									{formatDay(claim.disputeDate)}
									{claim.reason ? ` · ${claim.reason}` : ""}
								</p>
							))}
							<p className="iz-tiny iz-muted2 mt-0.5">
								{t.agencyReceipts.correctThenSettleHint}
							</p>
						</div>
					)}
					{receipt.lines.length === 0 ? (
						// Not cosmetic: a receipt with no lines contributes nothing to the
						// voucher, so printing RM 0.00 alone would read as a free receipt
						// rather than as a record that never attached to any money.
						<p className="iz-tiny text-[var(--iz-amber,#d9b97a)]">
							{t.agencyReceipts.noLineItemsOnReceipt}
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
							<span className="iz-muted2">{t.receipts.prsNote} </span>
							{receipt.note}
						</p>
					)}

					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						{photos.length === 0 && (
							<>
								<ImageOff className="h-3.5 w-3.5 opacity-60" />
								<span className="iz-tiny iz-muted2">
									{t.receipts.noProofAttached}
								</span>
							</>
						)}
						{/* The SHARED viewer, same as the dispute queue and the verify
						    panel. This row's own enlarge showed the photo at one fixed
						    size, still unreadable when the paper was shot at an angle —
						    the shared one zooms to 6x and pans, which is what checking a
						    printed total against a line actually needs. */}
						{/* The label lands INSIDE the shared viewer's own copy, so it has
						    to arrive already translated. */}
						<ProofPhotos
							photos={photos}
							label={fill(t.agencyReceipts.receiptScanLabel, {
								receiptNo: receipt.receiptNo,
							})}
						/>
					</div>

					{receipt.status !== "pending" && (
						<p className="iz-tiny iz-muted2 mt-2">
							{receipt.reviewedBy
								? `${t.receipts.reviewedBy} ${receipt.reviewedBy}`
								: t.receipts.reviewed}
							{" · "}
							{receipt.reviewedAt
								? new Date(receipt.reviewedAt).toLocaleDateString("en-GB")
								: t.agencyReceipts.beforeThisReviewExisted}
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
									<Check className="mr-1 h-3 w-3" /> {t.common.approve}
								</button>
							) : (
								<button
									type="button"
									className="iz-btn iz-btn-ghost !h-7 !px-2.5 !text-[11px]"
									disabled={busy}
									onClick={() => onReview("pending")}
								>
									<RotateCcw className="mr-1 h-3 w-3" />{" "}
									{t.agencyReceipts.withdrawApproval}
								</button>
							))}
						{onOpenPv && (
							<button
								type="button"
								className="iz-btn iz-btn-soft !h-7 !px-2.5 !text-[11px]"
								onClick={() => onOpenPv(receipt.voucherId)}
							>
								<FileText className="mr-1 h-3 w-3" /> {t.agencyReceipts.openPv}
							</button>
						)}
					</div>

					{/*
					 * Under Approve, not beside it: approving is the common move and
					 * correcting is the exception, and a row of equal buttons would
					 * make the two read as alternatives of the same weight.
					 */}
					{canEdit && (
						<div className="mt-1.5">
							<button
								type="button"
								className="iz-btn iz-btn-ghost !h-7 !px-2.5 !text-[11px]"
								onClick={() => setEditing((v) => !v)}
								aria-expanded={editing}
							>
								<Pencil className="mr-1 h-3 w-3" />{" "}
								{editing ? t.receipts.closeEditor : t.common.edit}
							</button>
						</div>
					)}
					{/* An absent button explains nothing — say which rule removed it. */}
					{canReview && signedOff && (
						<p className="iz-tiny iz-muted2 mt-1.5">
							{t.agencyReceipts.prSignedNoCorrections}
						</p>
					)}

					{canEdit && editing && (
						<AgencyReceiptEditor receipt={receipt} lines={receipt.lines} />
					)}
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
	focusReceiptId,
}: {
	weekStartIso: string;
	weekEndIso: string;
	onOpenPv?: (voucherId: string) => void;
	/** Deep-linked receipt to scroll to — see the effect below. */
	focusReceiptId?: string;
}) {
	const { t } = usePortalLocale();
	const toast = useStore((s) => s.toast);
	const canReview = useAgencyCan()("raisePv");
	const {
		receipts,
		isLoading,
		error,
		reviewReceipt,
		isReviewing,
		reviewError,
		approveAllWeek,
		isApprovingAll,
	} = useAgencyReceipts();

	const handleApproveAll = async () => {
		try {
			const result = await approveAllWeek(weekStartIso);
			toast(result.message, "success");
		} catch {
			toast(t.receipts.approveAllFailed, "warn");
		}
	};

	/**
	 * Bring the deep-linked receipt into view once its row exists.
	 *
	 * Deliberately depends on `receipts` as well as the id: the page picks the
	 * week first and the list renders after the fetch resolves, so scrolling on
	 * mount alone would aim at an element that is not on the page yet.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies(receipts): receipts is the re-run TRIGGER, not a value the effect reads — it re-queries the DOM for the deep-linked row. Drop it and the scroll only fires before the fetch resolves, when `receipt-<id>` is not on the page yet, so the deep link lands nowhere.
	useEffect(() => {
		if (!focusReceiptId) return;
		const el = document.getElementById(`receipt-${focusReceiptId}`);
		el?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, [focusReceiptId, receipts]);

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

	/**
	 * EXCLUSIVE buckets (owner, 26 Aug 2026) — the four chips partition the week:
	 * pending + approved + verified + disputed = all.
	 *
	 * A disputed receipt is COUNTED only as disputed because it is TAGGED only as
	 * disputed. They overlapped at first, and the result was a row filed under
	 * "Verified (3)" whose own pill read "Disputed" — sending anyone who trusted
	 * the chips to the wrong list to find it.
	 */
	const statusCounts = useMemo(() => {
		const review = (status: PaymentVoucherReceiptStatus) =>
			weekReceipts.filter((r) => r.status === status && !isDisputed(r)).length;
		return {
			all: weekReceipts.length,
			pending: review("pending"),
			approved: review("approved"),
			verified: review("verified"),
			disputed: weekReceipts.filter(isDisputed).length,
		};
	}, [weekReceipts]);

	/**
	 * EVERY pending receipt, disputed or not — what "Approve all" actually
	 * touches.
	 *
	 * Deliberately not `statusCounts.pending`. The server's sweep is
	 * `status = 'pending'` and knows nothing about claims, so a banner reading
	 * the exclusive chip count would promise to approve two and approve three.
	 * The chip counts what is SHOWN under it; this counts what the BUTTON does,
	 * and one number cannot answer both questions.
	 */
	const pendingAll = useMemo(
		() => weekReceipts.filter((r) => r.status === "pending").length,
		[weekReceipts],
	);

	const weekTotal = useMemo(
		() => weekReceipts.reduce((total, r) => total + sumLines(r), 0),
		[weekReceipts],
	);

	const prOptions = useMemo(() => {
		const byId = new Map<string, string>();
		for (const r of weekReceipts) {
			// The filter names people the same way the rows do — picking "Vicky"
			// from a dropdown that only lists legal names is a lookup the agency
			// should not have to do in their head.
			if (r.prId) {
				byId.set(r.prId, formatPayeeLabel(r.prNickname, r.prName) || r.prId);
			}
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
			// The chips partition the week, so a review bucket EXCLUDES anything
			// under a live claim — the same rule the counts above use, because a
			// chip whose count and whose list disagree is worse than either.
			if (status === "disputed") {
				if (!isDisputed(r)) return false;
			} else if (status !== "all" && (r.status !== status || isDisputed(r))) {
				return false;
			}
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
				fill(
					next === "approved"
						? t.agencyReceipts.toastApproved
						: t.agencyReceipts.toastBackToPending,
					{ receiptNo: receipt.receiptNo },
				),
				"success",
			);
		} catch {
			// The server's own words are rendered under the header; this is only the
			// nudge that tells the reviewer to go read them.
			toast(t.receipts.couldNotRecordDecision, "warn");
		}
	};

	return (
		<OutletSection
			title={t.receipts.receipts}
			icon={Receipt}
			hint={`${weekReceipts.length} ${t.payroll.thisWeekSuffix} · ${formatRM(weekTotal)}`}
		>
			{isLoading && (
				<IzCard flat>
					<p className="iz-tiny iz-muted">{t.receipts.loadingReceipts}</p>
				</IzCard>
			)}

			{error && (
				<IzCard flat className="border-[rgba(192,85,79,.4)]">
					<p className="iz-tiny text-[var(--iz-red,#c0554f)]">
						{t.agencyReceipts.couldNotLoadReceipts}
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
							<p className="iz-tiny iz-muted2">{t.receipts.receipts}</p>
						</IzCard>
						<IzCard
							flat
							className={`!mb-0${pendingAll > 0 ? " border-[rgba(244,183,64,.4)]" : ""}`}
						>
							<p
								className={`font-sora text-lg font-extrabold${pendingAll > 0 ? " text-[var(--iz-amber,#d9b97a)]" : ""}`}
							>
								{pendingAll}
							</p>
							<p className="iz-tiny iz-muted2">{t.receipts.waitingOnYou}</p>
						</IzCard>
						<IzCard flat className="!mb-0">
							<p className="iz-ledger font-sora text-lg font-extrabold">
								{formatRM(weekTotal)}
							</p>
							<p className="iz-tiny iz-muted2">{t.receipts.commissionLogged}</p>
						</IzCard>
					</div>

					{pendingAll > 0 && (
						<IzCard
							flat
							className="mt-2 border-[rgba(244,183,64,.4)] bg-[rgba(244,183,64,.08)]"
						>
							<p className="iz-sm font-bold text-[var(--iz-amber)]">
								{fill(
									pendingAll === 1
										? t.agencyReceipts.awaitingApprovalOne
										: t.agencyReceipts.awaitingApprovalMany,
									{ n: pendingAll },
								)}
								{/* Says out loud why this number can exceed the "Waiting on
								    you" chip: the chip files a disputed receipt under
								    Disputed, the sweep below still approves it. Without the
								    clause the two numbers look like a bug. */}
								{pendingAll > statusCounts.pending
									? ` · ${fill(t.agencyReceipts.ofThemDisputed, {
											n: pendingAll - statusCounts.pending,
										})}`
									: ""}
							</p>
							<p className="iz-tiny iz-muted2 mt-0.5">
								{t.agencyReceipts.voucherBlockedHint}
							</p>
							{/* The owner's one click. The endpoint approves only receipts
							    still pending on THIS week and skips anything the PR has
							    already signed, so the button cannot overreach the banner
							    above it. */}
							{canReview && (
								<button
									type="button"
									className="iz-btn iz-btn-primary mt-2 !h-8 !px-3 !text-[11px]"
									disabled={isApprovingAll}
									onClick={() => void handleApproveAll()}
								>
									<Check className="mr-1 h-3.5 w-3.5" />
									{t.receipts.approveAll} ({pendingAll})
								</button>
							)}
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
								["all", t.common.all],
								["pending", t.receipts.waitingOnYou],
								["approved", t.receipts.approved],
								["verified", t.receipts.verified],
								["disputed", t.receipts.disputed],
							] as [StatusFilter, string][]
						).map(([value, label]) => (
							<button
								key={value}
								type="button"
								// The space before `${` is deliberate: Tailwind v4 drops an
								// arbitrary-value class glued to an interpolation, and
								// `!text-[11px]` only survives here because other panels
								// happen to use it in a plain string.
								className={`iz-payroll-tab !flex-none !px-2.5 !text-[11px] ${status === value ? "on" : ""}`}
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
								placeholder={t.receipts.searchPlaceholder}
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								aria-label={t.receipts.searchReceipts}
							/>
						</div>
						<button
							type="button"
							className="iz-btn iz-btn-soft !h-8 !px-2.5 !text-[11px]"
							onClick={() => setShowFilters((v) => !v)}
							aria-expanded={showFilters}
						>
							<SlidersHorizontal className="mr-1 h-3 w-3" /> {t.payroll.filters}
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
								<option value="">{t.receipts.allPrs}</option>
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
								<option value="">{t.receipts.allOutlets}</option>
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
								<option value="">{t.receipts.allEntryMethods}</option>
								<option value="scan">{t.receipts.scanned}</option>
								<option value="manual">{t.receipts.selfLogged}</option>
								<option value="checkin">{t.receipts.checkIn}</option>
							</IzSelect>
							{filtersActive && (
								<button
									type="button"
									className="iz-tiny text-left text-[var(--iz-gold-l)] sm:col-span-3"
									onClick={clearFilters}
								>
									{t.payroll.clearFilters}
								</button>
							)}
						</div>
					)}

					<div className="mt-3 space-y-3">
						{days.length === 0 ? (
							<IzCard className="text-center">
								<p className="iz-sm iz-muted">
									{receipts.length === 0
										? t.payroll.noReceiptsLoggedYet
										: filtersActive || status !== "all"
											? t.receipts.noReceiptsMatch
											: t.receipts.noReceiptsThisWeek}
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
											{fill(
												rows.length === 1
													? t.agencyReceipts.receiptCountOne
													: t.agencyReceipts.receiptCountMany,
												{ n: rows.length },
											)}{" "}
											· {formatRM(total)}
										</p>
									</div>
									{/*
									 * TWO COLUMNS from `xl` up — a receipt card holds a fixed
									 * amount of content and a portal-width screen fits two of
									 * them side by side, which halves the scrolling on a day
									 * with six.
									 *
									 * `items-start` is load-bearing: grid items stretch by
									 * default, so one row with its editor open would drag its
									 * neighbour to the same height and leave a tall empty card
									 * beside it. Each card keeps its own height instead.
									 *
									 * Nothing inside truncates — the one `truncate` in this
									 * whole tree (the editor's item name) now wraps, because at
									 * half width it would have hidden the very words a reviewer
									 * checks against the paper.
									 */}
									<div className="grid items-start gap-2 xl:grid-cols-2">
										{rows.map((receipt) => (
											<div
												key={receipt.id}
												id={`receipt-${receipt.id}`}
												className={
													focusReceiptId === receipt.id
														? "rounded-xl ring-1 ring-[var(--iz-gold)]"
														: undefined
												}
											>
												<ReceiptRow
													receipt={receipt}
													canReview={canReview}
													busy={isReviewing}
													onReview={(next) => void decide(receipt, next)}
													onOpenPv={onOpenPv}
												/>
											</div>
										))}
									</div>
								</div>
							))
						)}
					</div>

					{offWeekCount > 0 && (
						<p className="iz-tiny iz-muted2 mt-3">
							{fill(
								offWeekCount === 1
									? t.agencyReceipts.offWeekOne
									: t.agencyReceipts.offWeekMany,
								{ n: offWeekCount },
							)}
						</p>
					)}

					{!canReview && weekReceipts.length > 0 && (
						<p className="iz-tiny iz-muted2 mt-2">
							{t.agencyReceipts.roleCannotApprove}
						</p>
					)}
				</>
			)}
		</OutletSection>
	);
}
