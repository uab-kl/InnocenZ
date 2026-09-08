import { IzSheet, type SheetVariant } from "@agency-portal/components/iz/Sheet";
import { IzCardTitle } from "@agency-portal/components/iz/ui";
import { verifyDemoOtp } from "@agency-portal/lib/verify-demo-otp";
import type { ReactNode } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export function isValidDemoOtp(code: string) {
	return verifyDemoOtp(code);
}

export function OtpVerifySheet({
	open,
	onClose,
	title,
	description,
	otp,
	onOtpChange,
	onVerify,
	onResend,
	verifyLabel,
	variant = "dialog",
}: {
	open: boolean;
	onClose: () => void;
	title: string;
	description: ReactNode;
	otp: string;
	onOtpChange: (value: string) => void;
	onVerify: () => void;
	onResend: () => void;
	verifyLabel?: string;
	variant?: SheetVariant;
}) {
	const { t } = usePortalLocale();

	return (
		<IzSheet open={open} onClose={onClose} variant={variant}>
			<IzCardTitle>{title}</IzCardTitle>
			<p className="iz-tiny iz-muted mb-3">{description}</p>
			<input
				value={otp}
				onChange={(e) =>
					onOtpChange(e.target.value.replace(/\D/g, "").slice(0, 6))
				}
				inputMode="numeric"
				placeholder="123456"
				className="iz-pv-dispute-input !min-h-0 py-3 text-center iz-nums text-lg tracking-[0.35em]"
				aria-label={t.portalUi.oneTimePassword}
			/>
			<button
				type="button"
				className="iz-btn iz-btn-primary mt-4 w-full"
				onClick={onVerify}
			>
				{/* Read in the BODY, not as a default parameter: a default is
				    evaluated before any hook has run, so it cannot see `t`. */}
				{verifyLabel ?? t.portalUi.verifyOtp}
			</button>
			<button
				type="button"
				className="iz-btn iz-btn-soft mt-2.5 w-full"
				onClick={onResend}
			>
				{t.portalUi.resendOtp}
			</button>
		</IzSheet>
	);
}
