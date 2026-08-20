import { AgencyPaidPvDetail } from "@agency-portal/components/agency/AgencyPaidPvDetail";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import {
	HistDateRangePickerField,
	HistSelectField,
} from "@agency-portal/components/iz/ShiftHistoryLog";
import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	getAgencyManagedPvs,
	getAgencyManagedReceiptScans,
	receiptsForPv,
	resolvePvPrId,
	resolvePvPrName,
} from "@agency-portal/lib/agency-payroll";
import {
	fmtDateLabelFromIso,
	getPvNetTotal,
	getPvSalesTotal,
	type PrPaymentVoucher,
	type PrReceiptScan,
	parsePvIssuedMs,
	pvStatusPillVariant,
} from "@agency-portal/lib/pr-demo";
import { format } from "date-fns";
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
				<TitleWithIcon>{t.history.filterBy}</TitleWithIcon>
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
				hint={fill(t.history.recordsAndTotal, {
					records: fill(
						filtered.length === 1
							? t.history.recordCountOne
							: t.history.recordCountMany,
						{ n: filtered.length },
					),
					total: formatRM(totalPaid),
				})}
				className="!mt-4"
			>
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
								<div className="min-w-0">
									<div className="font-sora text-[15px] font-bold">{pv.id}</div>
									<p className="iz-tiny iz-muted mt-0.5">
										{resolvePvPrName(pv, agencyPRs)} · {pv.outlet}
									</p>
									{pv.prIc && <p className="iz-tiny iz-muted2">IC {pv.prIc}</p>}
									<p className="iz-tiny iz-muted2 mt-0.5">
										{t.history.cycleLabel}: {pv.cycle}
									</p>
									<p className="iz-tiny iz-muted2">
										{t.history.issued} {pv.issued}
									</p>
									<p className="iz-tiny text-[var(--iz-gold-l)] mt-0.5">
										{t.history.sales} {formatRM(getPvSalesTotal(pv))}
									</p>
								</div>
								<div className="shrink-0 text-right">
									<IzPill variant={pvStatusPillVariant(pv.status)}>
										{t.history.paid}
									</IzPill>
									<div className="iz-ledger font-sora mt-1.5 text-base font-bold">
										{formatRM(getPvNetTotal(pv))}
									</div>
									<p className="iz-tiny iz-muted2 mt-0.5">
										{t.history.netPaid}
									</p>
									{pv.paidAt && (
										<div className="mt-2.5 rounded-lg border border-[rgba(52,211,153,.28)] bg-[rgba(52,211,153,.1)] px-2.5 py-1.5 text-right">
											<p className="iz-tiny font-semibold uppercase tracking-wide text-[var(--iz-green-l)]">
												{t.history.datePaid}
											</p>
											<p className="font-sora mt-0.5 text-sm font-bold leading-tight text-[var(--iz-txt)]">
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
