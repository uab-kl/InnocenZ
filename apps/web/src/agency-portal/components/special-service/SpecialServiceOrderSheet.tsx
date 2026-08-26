import {
	formatRM,
	IzCardTitle,
	IzSelect,
	IzTimeInput,
} from "@agency-portal/components/iz/ui";
import {
	specialServiceOfferLabel,
	specialServiceOfferSummary,
} from "@agency-portal/components/special-service/job-posting-ui";
import type { SpecialServiceInitiator } from "@agency-portal/lib/special-service-demo";
import {
	AGENCY_SPECIAL_SERVICE_OFFERS,
	type AgencySpecialServiceOffer,
	isLeaveAgencyService,
	specialServiceOffer,
} from "@agency-portal/lib/special-service-demo";
import { useId } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export type SpecialServiceOrderDraft = {
	prId: string;
	outlet: string;
	serviceType: string;
	amountOut: string;
	amountIn: string;
	time: string;
	note: string;
};

export function SpecialServiceOrderSheet({
	role,
	draft,
	onChange,
	prOptions,
	outletOptions,
	showOutletPicker,
	showPrPicker,
	showAmountIn,
	onSubmit,
	submitLabel,
	serviceOffers = AGENCY_SPECIAL_SERVICE_OFFERS,
}: {
	role: SpecialServiceInitiator;
	draft: SpecialServiceOrderDraft;
	onChange: (patch: Partial<SpecialServiceOrderDraft>) => void;
	prOptions: { id: string; name: string }[];
	outletOptions?: string[];
	showOutletPicker?: boolean;
	showPrPicker?: boolean;
	showAmountIn?: boolean;
	onSubmit: () => void;
	/** Arrives ALREADY TRANSLATED — the caller knows which action it stands for. */
	submitLabel: string;
	serviceOffers?: AgencySpecialServiceOffer[];
}) {
	const { t } = usePortalLocale();
	const offer = specialServiceOffer(draft.serviceType);
	const leaveRequest = isLeaveAgencyService(draft.serviceType);
	const fieldId = useId();

	const onServiceTypeChange = (serviceId: string) => {
		const next = specialServiceOffer(serviceId);
		onChange({
			serviceType: serviceId,
			amountOut: next ? String(next.defaultRate) : draft.amountOut,
		});
	};

	return (
		<>
			<IzCardTitle>
				{leaveRequest
					? t.ssPortal.serviceRequestTitle
					: role === "agency"
						? t.ssPortal.bookAgencyService
						: t.ssPortal.orderAgencyService}
			</IzCardTitle>
			<p className="iz-tiny iz-muted mb-3">
				{leaveRequest
					? t.ssPortal.leaveHint
					: role === "agency"
						? t.ssPortal.agencyBookHint
						: role === "outlet"
							? t.ssPortal.outletOrderHint
							: t.ssPortal.prOrderHint}
			</p>

			{showPrPicker !== false && (
				<>
					<label
						htmlFor={`${fieldId}-pr`}
						className="iz-tiny iz-muted mb-1 block"
					>
						{t.table.pr}
					</label>
					<IzSelect
						block
						id={`${fieldId}-pr`}
						className="mb-3 !text-sm"
						value={draft.prId}
						onChange={(e) => onChange({ prId: e.target.value })}
					>
						{prOptions.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</IzSelect>
				</>
			)}

			{showOutletPicker && outletOptions && (
				<>
					<label
						htmlFor={`${fieldId}-outlet`}
						className="iz-tiny iz-muted mb-1 block"
					>
						{t.table.outlet}
					</label>
					<IzSelect
						block
						id={`${fieldId}-outlet`}
						className="mb-3 !text-sm"
						value={draft.outlet}
						onChange={(e) => onChange({ outlet: e.target.value })}
					>
						{outletOptions.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</IzSelect>
				</>
			)}

			<label
				htmlFor={`${fieldId}-service`}
				className="iz-tiny iz-muted mb-1 block"
			>
				{t.ssPortal.service}
			</label>
			<IzSelect
				block
				id={`${fieldId}-service`}
				className="mb-1 !text-sm"
				value={draft.serviceType}
				onChange={(e) => onServiceTypeChange(e.target.value)}
			>
				{serviceOffers.map((o) => (
					<option key={o.id} value={o.id}>
						{specialServiceOfferLabel(t, o.id)}
					</option>
				))}
			</IzSelect>
			{offer && (
				<p className="iz-tiny iz-muted2 mb-3">
					{specialServiceOfferSummary(t, offer.id)}
				</p>
			)}

			{!leaveRequest && role === "agency" && (
				<>
					<label
						htmlFor={`${fieldId}-amount-out`}
						className="iz-tiny iz-muted mb-1 block"
					>
						{t.ssPortal.amountOutRm}
						{offer && (
							<span className="iz-muted2">
								{" · "}
								{fill(t.ssPortal.defaultAmount, {
									amount: formatRM(offer.defaultRate),
								})}
							</span>
						)}
					</label>
					<input
						id={`${fieldId}-amount-out`}
						type="number"
						min={0}
						step={5}
						className="iz-field-input mb-3 !text-sm"
						value={draft.amountOut}
						onChange={(e) => onChange({ amountOut: e.target.value })}
					/>
				</>
			)}

			{(showAmountIn || role === "agency") && !leaveRequest && (
				<>
					<label
						htmlFor={`${fieldId}-amount-in`}
						className="iz-tiny iz-muted mb-1 block"
					>
						{t.ssPortal.amountInRm}
					</label>
					<input
						id={`${fieldId}-amount-in`}
						type="number"
						min={0}
						step={5}
						className="iz-field-input mb-3 !text-sm"
						placeholder={t.ssPortal.amountInPlaceholder}
						value={draft.amountIn}
						onChange={(e) => onChange({ amountIn: e.target.value })}
					/>
				</>
			)}

			{!leaveRequest && (
				<>
					<span className="iz-tiny iz-muted mb-1 block">
						{t.ssPortal.serviceTime}
					</span>
					<IzTimeInput
						value={draft.time}
						onChange={(time) => onChange({ time })}
						className="mb-3 !text-sm"
						aria-label={t.ssPortal.serviceTime}
					/>
				</>
			)}

			<label
				htmlFor={`${fieldId}-note`}
				className="iz-tiny iz-muted mb-1 block"
			>
				{leaveRequest ? t.ssPortal.reason : t.ssPortal.notes}
			</label>
			<textarea
				id={`${fieldId}-note`}
				className="iz-field-input mb-4 min-h-[72px] !text-sm"
				placeholder={
					leaveRequest
						? t.ssPortal.reasonPlaceholder
						: t.ssPortal.notesPlaceholder
				}
				value={draft.note}
				onChange={(e) => onChange({ note: e.target.value })}
			/>

			<button
				type="button"
				className="iz-btn iz-btn-primary w-full"
				onClick={onSubmit}
			>
				{submitLabel}
			</button>
		</>
	);
}
