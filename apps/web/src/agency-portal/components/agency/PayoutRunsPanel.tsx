import { RosterPlanningDatePicker } from "@agency-portal/components/agency/RosterPlanningDatePicker";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import {
	formatRM,
	IzCard,
	IzPill,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import {
	usePayoutBatch,
	usePayoutBatches,
} from "@agency-portal/hooks/use-payout-batches";
import {
	formatLocalIso,
	parseLocalIso,
	rosterWeekStart,
	weekRangeLabel,
} from "@agency-portal/lib/roster-week-plan";
import { addDays } from "date-fns";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type {
	PayoutBatch,
	PayoutBatchStatus,
	PayoutItemStatus,
} from "@/services/payout-batch";

/**
 * THE AGENCY'S PAYOUT RUNS — assemble a week, download the bank file, record
 * what the bank said.
 *
 * ⚠️ InnocenZ does not move this money. The file goes to the agency's OWN
 * corporate banking; everything here records a transfer rather than making one.
 *
 * ⚠️ BLOCKED PEOPLE ARE SHOWN, NEVER FILTERED. The API deliberately returns a
 * signed-off PR with no bank details, flagged — hiding them would recreate the
 * exact failure this lane exists to prevent: a file that pays 57 of 59 and
 * tells nobody.
 */

/** Owner's colour code: green settled, amber waiting, red failed, ink neutral. */
const BATCH_TONE: Record<PayoutBatchStatus, "green" | "amber" | "red" | "ink"> =
	{
		draft: "ink",
		exported: "amber",
		submitted: "amber",
		settled: "green",
		cancelled: "ink",
	};

const ITEM_TONE: Record<PayoutItemStatus, "green" | "amber" | "red" | "ink"> = {
	pending: "ink",
	sent: "amber",
	paid: "green",
	failed: "red",
	returned: "red",
	cancelled: "ink",
};

export function PayoutRunsPanel({ canPay }: { canPay: boolean }) {
	const { t } = usePortalLocale();
	const batchLabel: Record<PayoutBatchStatus, string> = {
		draft: t.payouts.statusDraft,
		exported: t.payouts.statusExported,
		submitted: t.payouts.statusSubmitted,
		settled: t.payouts.statusSettled,
		cancelled: t.payouts.statusCancelled,
	};
	const [weekStart, setWeekStart] = useState<string>(() =>
		rosterWeekStart(new Date().toISOString().slice(0, 10)),
	);
	/**
	 * ⚠️ THROUGH THE REPO'S OWN LOCAL-ISO PAIR, not hand-rolled date maths.
	 *
	 * The first version parsed the ISO date as local and formatted it with
	 * `toISOString()` (UTC), so in UTC+8 the last day of the week slipped back
	 * one: the panel asked for weekEnd=2026-07-31 instead of 2026-08-01 and
	 * reported "nothing signed" over a week that had a signed voucher in it.
	 * `parseLocalIso`/`formatLocalIso` are the pair the roster already uses to
	 * keep a calendar date from ever passing through a timezone.
	 */
	const weekEnd = useMemo(
		() => formatLocalIso(addDays(parseLocalIso(weekStart), 6)),
		[weekStart],
	);
	const [openBatchId, setOpenBatchId] = useState<string | null>(null);
	const [blocked, setBlocked] = useState<
		{ prName: string; voucherNo: string | null }[] | null
	>(null);

	const {
		batches,
		candidates,
		candidatesLoading,
		create,
		cancel,
		markSubmitted,
		exportCsv,
		settle,
		importResponse,
	} = usePayoutBatches({ weekStart, weekEnd });
	const [importError, setImportError] = useState<string | null>(null);

	const detail = usePayoutBatch(openBatchId);
	const summary = candidates?.summary;

	const onCreate = () => {
		setBlocked(null);
		create.mutate(
			{ weekStart, weekEnd, method: "ibg" },
			{
				onError: (err: unknown) => {
					// The 409 body names who cannot be paid — surface them rather than a
					// generic failure, because the fix is theirs to make in the app.
					const data = (
						err as {
							response?: {
								data?: {
									data?: {
										blocked?: { prName: string; voucherNo: string | null }[];
									};
								};
							};
						}
					)?.response?.data?.data;
					setBlocked(data?.blocked ?? []);
				},
			},
		);
	};

	return (
		<div className="flex flex-col gap-4">
			<IzCard>
				<IzSectionLabel>{t.payouts.chooseWeek}</IzSectionLabel>
				<RosterPlanningDatePicker
					value={weekStart}
					onChange={(iso) => setWeekStart(rosterWeekStart(iso))}
					weekly
				/>
				<p className="iz-tiny iz-muted2 mt-1">{weekRangeLabel(weekStart)}</p>

				{candidatesLoading ? (
					<p className="iz-sm iz-muted2 mt-3">{t.payouts.loading}</p>
				) : !summary ? null : summary.total === 0 ? (
					<p className="iz-sm iz-muted2 mt-3">{t.payouts.noneSigned}</p>
				) : (
					<>
						<div className="mt-3 flex flex-wrap gap-2">
							<IzPill variant="green">
								{summary.ready} {t.payouts.ready}
							</IzPill>
							{summary.blocked > 0 && (
								<IzPill variant="amber">
									{summary.blocked} {t.payouts.blocked}
								</IzPill>
							)}
							{summary.alreadyBatched > 0 && (
								<IzPill variant="ink">
									{summary.alreadyBatched} {t.payouts.alreadyInRun}
								</IzPill>
							)}
							<IzPill variant="violet">
								{formatRM(summary.readyTotalCents / 100)}
							</IzPill>
						</div>

						<ul className="mt-3 flex flex-col gap-1">
							{candidates?.candidates.map((c) => (
								<li
									key={c.voucherId}
									className="flex items-center justify-between gap-2 rounded-lg border border-[var(--iz-line)] px-2 py-1.5"
								>
									<div className="min-w-0">
										<p className="iz-sm truncate font-bold">{c.prName}</p>
										<p className="iz-tiny iz-muted2 truncate">
											{c.voucherNo ?? "—"} ·{" "}
											{c.payable
												? `${c.bankName} ${c.bankAccountMasked}`
												: t.payouts.noBankDetails}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<span className="iz-sm tabular-nums">
											{formatRM(Number(c.net))}
										</span>
										{c.alreadyBatched ? (
											<IzPill variant="ink">{t.payouts.inRun}</IzPill>
										) : c.payable ? (
											<IzPill variant="green">{t.payouts.ready}</IzPill>
										) : (
											<IzPill variant="amber">{t.payouts.blocked}</IzPill>
										)}
									</div>
								</li>
							))}
						</ul>

						{summary.blocked > 0 && (
							<p className="iz-tiny mt-2 text-[var(--iz-amber)]">
								{t.payouts.blockedHint}
							</p>
						)}

						{canPay && (
							<button
								type="button"
								className="iz-btn iz-btn-primary mt-3 w-full"
								disabled={summary.ready === 0 || create.isPending}
								onClick={onCreate}
							>
								{create.isPending
									? t.payouts.creating
									: `${t.payouts.createRun} · ${summary.ready}`}
							</button>
						)}

						{blocked && blocked.length > 0 && (
							<div className="mt-2 rounded-lg border border-[rgba(232,198,106,.35)] p-2">
								<p className="iz-sm font-bold">{t.payouts.cannotCreate}</p>
								<ul className="iz-tiny mt-1">
									{blocked.map((b) => (
										<li key={b.voucherNo ?? b.prName}>
											{b.prName} — {t.payouts.noBankDetails}
										</li>
									))}
								</ul>
							</div>
						)}
					</>
				)}
			</IzCard>

			<IzCard>
				<IzSectionLabel>{t.payouts.runs}</IzSectionLabel>
				{batches.length === 0 ? (
					<p className="iz-sm iz-muted2 mt-2">{t.payouts.noRuns}</p>
				) : (
					<ul className="mt-2 flex flex-col gap-1">
						{batches.map((b) => (
							<li key={b.id}>
								<button
									type="button"
									className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--iz-line)] px-2 py-1.5 text-left"
									onClick={() => setOpenBatchId(b.id)}
								>
									<div className="min-w-0">
										<p className="iz-sm truncate font-bold">{b.runNo}</p>
										<p className="iz-tiny iz-muted2 truncate">
											{b.weekStart} → {b.weekEnd} · {b.itemCount}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-2">
										<span className="iz-sm tabular-nums">
											{formatRM(Number(b.totalAmount))}
										</span>
										<IzPill variant={BATCH_TONE[b.status]}>
											{batchLabel[b.status]}
										</IzPill>
									</div>
								</button>
							</li>
						))}
					</ul>
				)}
			</IzCard>

			<IzSheet
				open={Boolean(openBatchId)}
				onClose={() => setOpenBatchId(null)}
				wide
			>
				{detail.data && (
					<PayoutBatchDetail
						batch={detail.data}
						canPay={canPay}
						onExport={() => exportCsv.mutate(detail.data as PayoutBatch)}
						onSubmitted={() =>
							markSubmitted.mutate((detail.data as PayoutBatch).id)
						}
						onCancel={() => {
							cancel.mutate((detail.data as PayoutBatch).id);
							setOpenBatchId(null);
						}}
						onSettle={(itemId, status, bankRef) =>
							settle.mutate({
								id: (detail.data as PayoutBatch).id,
								settlements: [{ itemId, status, bankRef }],
							})
						}
						importError={importError}
						onImport={(csv) => {
							setImportError(null);
							importResponse.mutate(
								{ id: (detail.data as PayoutBatch).id, csv },
								{
									onError: (err: unknown) => {
										// The 409 lists every line it could not match, and says
										// nothing was settled — that is the useful half.
										const res = (
											err as { response?: { data?: { message?: string } } }
										)?.response?.data;
										setImportError(res?.message ?? "Could not read that file.");
									},
								},
							);
						}}
					/>
				)}
			</IzSheet>
		</div>
	);
}

function PayoutBatchDetail({
	batch,
	canPay,
	onExport,
	onSubmitted,
	onCancel,
	onSettle,
	onImport,
	importError,
}: {
	batch: PayoutBatch;
	canPay: boolean;
	onExport: () => void;
	onSubmitted: () => void;
	onCancel: () => void;
	onSettle: (
		itemId: string,
		status: "paid" | "failed",
		bankRef?: string,
	) => void;
	onImport: (csv: string) => void;
	importError: string | null;
}) {
	const { t } = usePortalLocale();
	const itemLabel: Record<PayoutItemStatus, string> = {
		pending: t.payouts.itemPending,
		sent: t.payouts.itemSent,
		paid: t.payouts.itemPaid,
		failed: t.payouts.itemFailed,
		returned: t.payouts.itemReturned,
		cancelled: t.payouts.itemCancelled,
	};
	const [bankRef, setBankRef] = useState("");
	const [responseCsv, setResponseCsv] = useState("");

	return (
		<div className="flex flex-col gap-3">
			<div>
				<p className="iz-h3">{batch.runNo}</p>
				<p className="iz-tiny iz-muted2">
					{batch.weekStart} → {batch.weekEnd} ·{" "}
					{formatRM(Number(batch.totalAmount))}
				</p>
			</div>

			<ul className="flex flex-col gap-1">
				{batch.items?.map((i) => (
					<li
						key={i.id}
						className="rounded-lg border border-[var(--iz-line)] px-2 py-1.5"
					>
						<div className="flex items-center justify-between gap-2">
							<div className="min-w-0">
								<p className="iz-sm truncate font-bold">{i.payeeName}</p>
								<p className="iz-tiny iz-muted2 truncate">
									{i.bankName} {i.bankAccountMasked}
									{i.bankRef ? ` · ${i.bankRef}` : ""}
								</p>
							</div>
							<div className="flex shrink-0 items-center gap-2">
								<span className="iz-sm tabular-nums">
									{formatRM(Number(i.amount))}
								</span>
								<IzPill variant={ITEM_TONE[i.status]}>
									{itemLabel[i.status]}
								</IzPill>
							</div>
						</div>
						{i.failureReason && (
							<p className="iz-tiny mt-1 text-[var(--iz-red)]">
								{i.failureReason}
							</p>
						)}
						{canPay && (i.status === "sent" || i.status === "pending") && (
							<div className="mt-1.5 flex gap-1.5">
								<button
									type="button"
									className="iz-btn iz-btn-soft"
									onClick={() =>
										onSettle(i.id, "paid", bankRef.trim() || undefined)
									}
								>
									{t.payouts.markPaid}
								</button>
								<button
									type="button"
									className="iz-btn iz-btn-soft"
									onClick={() => onSettle(i.id, "failed")}
								>
									{t.payouts.markFailed}
								</button>
							</div>
						)}
					</li>
				))}
			</ul>

			{canPay && (
				<div className="flex flex-col gap-2">
					<input
						type="text"
						className="w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
						placeholder={t.payouts.bankRefPlaceholder}
						value={bankRef}
						onChange={(e) => setBankRef(e.target.value)}
						aria-label={t.payouts.bankRefPlaceholder}
					/>
					<button
						type="button"
						className="iz-btn iz-btn-primary"
						onClick={onExport}
					>
						{t.payouts.downloadFile}
					</button>
					<p className="iz-tiny iz-muted2">{t.payouts.downloadHint}</p>
					{batch.status === "exported" && (
						<button
							type="button"
							className="iz-btn iz-btn-soft"
							onClick={onSubmitted}
						>
							{t.payouts.markSubmitted}
						</button>
					)}
					{batch.status === "draft" && (
						<button
							type="button"
							className="iz-btn iz-btn-soft"
							onClick={onCancel}
						>
							{t.payouts.cancelRun}
						</button>
					)}

					{/*
						Paste, not upload: no multipart middleware is mounted on this
						router and a response file is a few kilobytes. Settling by hand
						above stays the path that always works — this only saves the
						typing when the bank's file happens to fit.
					*/}
					{batch.status !== "draft" && (
						<>
							<textarea
								className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
								rows={3}
								placeholder={t.payouts.pasteResponse}
								value={responseCsv}
								onChange={(e) => setResponseCsv(e.target.value)}
								aria-label={t.payouts.pasteResponse}
							/>
							<button
								type="button"
								className="iz-btn iz-btn-soft"
								disabled={!responseCsv.trim()}
								onClick={() => onImport(responseCsv)}
							>
								{t.payouts.importResponse}
							</button>
							{importError && (
								<p className="iz-tiny text-[var(--iz-amber)]">{importError}</p>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}
