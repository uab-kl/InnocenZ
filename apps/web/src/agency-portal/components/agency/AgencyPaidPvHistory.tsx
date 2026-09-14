import { AgencyPaidPvDetail } from "@agency-portal/components/agency/AgencyPaidPvDetail";
import { PvCardSummary } from "@agency-portal/components/iz/PvCardSummary";
import {
	HistDateRangePickerField,
	HistSelectField,
} from "@agency-portal/components/iz/ShiftHistoryLog";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	getAgencyManagedPvs,
	getAgencyManagedReceiptScans,
	receiptsForPv,
	resolvePvPrId,
} from "@agency-portal/lib/agency-payroll";
import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import {
	fmtDateLabelFromIso,
	getPvNetTotal,
	type PrPaymentVoucher,
	type PrReceiptScan,
	parsePvIssuedMs,
	pvStatusPillVariant,
} from "@agency-portal/lib/pr-demo";
import { format } from "date-fns";
import { Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

function pvIssuedDateIso(pv: PrPaymentVoucher): string {
	const ms = parsePvIssuedMs(pv.issued);
	if (!ms) return "";
	return format(new Date(ms), "yyyy-MM-dd");
}

export function AgencyPaidPvHistory({
	pvs,
	receiptScans,
	agencyPRs,
	initialPvId,
	onClearInitialPv,
}: {
	pvs: PrPaymentVoucher[];
	receiptScans: PrReceiptScan[];
	agencyPRs: AgencyManagedPR[];
	initialPvId?: string;
	onClearInitialPv?: () => void;
}) {
	const { t } = usePortalLocale();
	const [detailId, setDetailId] = useState<string | null>(initialPvId ?? null);
	const [outletFilter, setOutletFilter] = useState("");
	const [prFilter, setPrFilter] = useState("");
	const [dateRange, setDateRange] = useState({ from: "", to: "" });

	const paidPvs = useMemo(
		() =>
			getAgencyManagedPvs(pvs, agencyPRs).filter((p) => p.status === "PAID"),
		[pvs, agencyPRs],
	);

	const outlets = useMemo(
		() => [...new Set(paidPvs.map((p) => p.outlet))].sort(),
		[paidPvs],
	);

	const prOptions = useMemo(() => {
		const ids = new Set(
			paidPvs
				.map((pv) => resolvePvPrId(pv, agencyPRs))
				.filter((id): id is string => Boolean(id)),
		);
		return agencyPRs
			.filter((pr) => ids.has(pr.id))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [paidPvs, agencyPRs]);

	const dateOptions = useMemo(() => {
		const byIso = new Map<string, string>();
		for (const pv of paidPvs) {
			const key = pvIssuedDateIso(pv);
			if (!key || byIso.has(key)) continue;
			byIso.set(key, fmtDateLabelFromIso(key));
		}
		return [...byIso.entries()]
			.sort(([a], [b]) => b.localeCompare(a))
			.map(([key, label]) => ({ key, label }));
	}, [paidPvs]);

	const filtered = useMemo(() => {
		return paidPvs
			.filter((pv) => {
				if (outletFilter && pv.outlet !== outletFilter) return false;
				if (prFilter && resolvePvPrId(pv, agencyPRs) !== prFilter) return false;
				const dateIso = pvIssuedDateIso(pv);
				if (dateRange.from && dateIso && dateIso < dateRange.from) return false;
				if (dateRange.to && dateIso && dateIso > dateRange.to) return false;
				return true;
			})
			.sort((a, b) => parsePvIssuedMs(b.issued) - parsePvIssuedMs(a.issued));
	}, [paidPvs, outletFilter, prFilter, dateRange, agencyPRs]);

	const totalPaid = useMemo(
		() => filtered.reduce((sum, pv) => sum + getPvNetTotal(pv), 0),
		[filtered],
	);

	const agencyReceiptScans = useMemo(
		() => getAgencyManagedReceiptScans(receiptScans, agencyPRs, pvs),
		[receiptScans, agencyPRs, pvs],
	);

	const detail = paidPvs.find((p) => p.id === detailId);

	if (detail) {
		return (
			<AgencyPaidPvDetail
				pv={detail}
				receiptScans={receiptsForPv(agencyReceiptScans, detail)}
				agencyPRs={agencyPRs}
				onBack={() => {
					setDetailId(null);
					onClearInitialPv?.();
				}}
			/>
		);
	}

	return (
		<>
			<p className="iz-tiny iz-muted mt-1">{t.history.paidPvIntro}</p>

			<p className="iz-txn-filter-heading mt-4">
				{/* The icon table is keyed on ENGLISH; letting TitleWithIcon scrape
				    the translated children drops the glyph with no error. */}
				<TitleWithIcon icon={iconForNav("Filter by")}>
					{t.history.filterBy}
				</TitleWithIcon>
			</p>
			<div className="iz-txn-filters">
				<HistSelectField
					label={t.history.colOutlet}
					value={outletFilter}
					onChange={setOutletFilter}
					options={[
						{ value: "", label: t.filters.allOutlets },
						...outlets.map((o) => ({ value: o, label: o })),
					]}
				/>
				<HistDateRangePickerField
					label={t.history.colDate}
					range={dateRange}
					onChange={setDateRange}
					dateOptions={dateOptions}
				/>
				<HistSelectField
					label={t.history.colPr}
					value={prFilter}
					onChange={setPrFilter}
					options={[
						{ value: "", label: t.filters.allPrs },
						...prOptions.map((pr) => ({ value: pr.id, label: pr.name })),
					]}
				/>
			</div>

			<OutletSection
				title={t.history.paidPvSectionTitle}
				iconKey="Paid payment vouchers"
				/* No hint: the count and the money both live in the card below, and a
				   heading that repeats either of them is one more thing to read. */
				className="!mt-4"
			>
				{/*
				 * What this archive comes to, in the SETTLED colour.
				 *
				 * It was a muted clause in the section's hint line — same size and
				 * weight as the record count beside it — so the one figure the page
				 * exists to report read as a footnote. Green because the money has
				 * already moved: the owner's status code reserves green for settled,
				 * and every DATE PAID stamp below this card already uses it.
				 *
				 * Shaped like the Pending Payout card on Payroll on purpose — the two
				 * are the same question at opposite ends of the rail (what is still
				 * owed / what has been paid) and should not need learning twice.
				 */}
				{filtered.length > 0 && (
					<IzCard
						flat
						className="!mb-2.5 !border-[rgba(52,211,153,.3)] !bg-[image:linear-gradient(180deg,rgba(52,211,153,.07),transparent)]"
					>
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
							<Wallet className="h-4 w-4 shrink-0 text-[var(--iz-green)]" />
							{/* The COUNT, not the section's own title — repeating the heading
							    directly under itself says nothing twice. */}
							<p className="iz-sm font-bold">
								{fill(
									filtered.length === 1
										? t.history.recordCountOne
										: t.history.recordCountMany,
									{ n: filtered.length },
								)}
							</p>
							<div className="ml-auto text-right">
								{/* ⚠️ `--iz-green`, NOT `--iz-green-l`. The latter does not exist
								    — `getPropertyValue` returns "" — so `color: var(--iz-green-l)`
								    resolves to nothing and the text quietly inherits. The DATE
								    PAID stamp below had been asking for that dead variable since
								    it was written, which is why it was never actually green
								    either; both point at the real one now. */}
								<div className="iz-ledger iz-heading text-base font-bold text-[var(--iz-green)]">
									{formatRM(totalPaid)}
								</div>
								<p className="iz-tiny iz-muted2">{t.history.totalPaid}</p>
							</div>
						</div>
					</IzCard>
				)}

				{filtered.length === 0 ? (
					<IzCard className="text-center">
						<p className="iz-sm iz-muted">{t.history.noPaidVouchersMatch}</p>
					</IzCard>
				) : (
					<div className="space-y-2.5">
						{filtered.map((pv) => (
							<button
								key={pv.id}
								type="button"
								className="iz-card iz-between w-full cursor-pointer text-left"
								onClick={() => setDetailId(pv.id)}
							>
								<PvCardSummary pv={pv} agencyPRs={agencyPRs} />
								<div className="shrink-0 text-right">
									<IzPill variant={pvStatusPillVariant(pv.status)}>
										{t.history.paid}
									</IzPill>
									<div className="iz-ledger iz-heading mt-1.5 text-base font-bold">
										{formatRM(getPvNetTotal(pv))}
									</div>
									<p className="iz-tiny iz-muted2 mt-0.5">
										{t.history.netPaid}
									</p>
									{pv.paidAt && (
										<div className="mt-2.5 rounded-lg border border-[rgba(52,211,153,.28)] bg-[rgba(52,211,153,.1)] px-2.5 py-1.5 text-right">
											<p className="iz-tiny font-semibold uppercase tracking-wide text-[var(--iz-green)]">
												{t.history.datePaid}
											</p>
											<p className="iz-heading mt-0.5 text-sm font-bold leading-tight text-[var(--iz-txt)]">
												{pv.paidAt}
											</p>
										</div>
									)}
								</div>
							</button>
						))}
					</div>
				)}
			</OutletSection>
		</>
	);
}
