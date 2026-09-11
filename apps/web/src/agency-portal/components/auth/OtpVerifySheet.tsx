import { IzSheet, type SheetVariant } from "@agency-portal/components/iz/Sheet";
import { IzCardTitle } from "@agency-portal/components/iz/ui";
import { verifyDemoOtp } from "@agency-portal/lib/verify-demo-otp";
import type { ReactNode } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
	resendIn = 0,
	busy = false,
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
	/**
	 * Seconds until Resend is offered again, or 0 when it is available.
	 *
	 * ⚠️ The server allows FIVE sends per hour per phone number, and counts the
	 * ones it refuses. A free-looking button let somebody spend that budget in
	 * seconds and lock themselves out of their own number, so the wait is shown
	 * rather than discovered.
	 */
	resendIn?: number;
	/** In flight — verifying and resending must not race each other. */
	busy?: boolean;
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
				disabled={busy || resendIn > 0}
			>
				{resendIn > 0
					? fill(t.portalUi.resendOtpIn, { seconds: resendIn })
					: t.portalUi.resendOtp}
			</button>
		</IzSheet>
	);
}
