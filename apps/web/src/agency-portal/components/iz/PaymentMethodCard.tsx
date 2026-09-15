import { IzCard } from "@agency-portal/components/iz/ui";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Wallet } from "lucide-react";
import { useState } from "react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	describePaymentMethod,
	fetchEwalletProviders,
	type PaymentMethod,
	type SavePaymentMethodInput,
	willAutoCharge,
} from "@/services/payment-method";

/**
 * HOW an outlet or agency pays its subscription AUTOMATICALLY. One component for
 * both portals: they show the same record from the same side.
 *
 * THE SECTION IS OPTIONAL (owner, 2 Sep 2026). With nothing set up — or when a
 * charge fails — the period stays unpaid and the org pays it by FPX or e-wallet
 * from tick-to-pay on Payment history, so "no method" is a normal state.
 *
 * WHAT THE PAYER ACTUALLY DOES (owner, 15 Sep 2026: "what does the user action
 * to make can really auto charge money"). Two tabs, one button, nothing typed:
 *
 *   • Debit / credit card — the payer is sent to the gateway's (Fiuu's) secure
 *     page, enters the card THERE and confirms with the bank's OTP (3-D
 *     Secure). The first bill is paid and the gateway returns a token; every
 *     later bill is charged to that token. Fiuu Recurring API v7.1.4, record
 *     type `T`.
 *   • E-wallet — the payer approves automatic payments in the Touch 'n Go app.
 *     Touch 'n Go is the only wallet Fiuu lists for merchant-initiated charges
 *     (record type `G`); its linking flow is not in Fiuu's public docs yet.
 *     GrabPay, ShopeePay and Boost cannot be charged automatically, so they are
 *     offered only on Payment history's pay bar, never here.
 *
 * NOTHING IS TYPED HERE: no card number, expiry, bank account number, DuitNow
 * ID or wallet phone number. The card lives in the gateway's hosted field (PCI
 * SAQ-A), and the only contact details the gateway needs — a REAL name, email
 * and mobile (Fiuu v13.93: saved cards break on dummy bill_name/bill_email/
 * bill_mobile) — come from the owner's own account, not a second copy here.
 *
 * ⚠️ UNTIL A GATEWAY IS REGISTERED THE BUTTON STAYS OFF and says so. It used to
 * be a form that "saved" a card's brand and last four, which could never be
 * charged and made the section look done when it was not.
 *
 * Rows saved on retired rails (bank direct debit, one-off FPX, a card recorded
 * by the old form) still read as what they are and can be removed.
 */
export function PaymentMethodCard({
	card,
	backed,
	demoLast4,
	canEdit,
	isLoading,
	isRemoving = false,
	billedLabel,
	onRemove,
}: {
	card: PaymentMethod | null;
	backed: boolean;
	demoLast4: string;
	canEdit: boolean;
	isLoading: boolean;
	/** Accepted for the callers' shape; the form no longer saves by itself. */
	isSaving?: boolean;
	isRemoving?: boolean;
	billedLabel: string;
	/**
	 * Kept for the gateway's return path, which will record the token-backed
	 * instrument; the buttons here do not call it while no gateway is connected.
	 */
	onSave?: (
		input: Omit<SavePaymentMethodInput, "outletId">,
	) => Promise<boolean>;
	/**
	 * Retire the saved instrument — auto-debit off, pay by hand from then on.
	 * Optional so a caller with no delete path simply shows no Remove button.
	 */
	onRemove?: () => Promise<boolean>;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const { user } = useCurrentUser();
	const [editing, setEditing] = useState(false);
	const [confirmingRemove, setConfirmingRemove] = useState(false);
	const [tab, setTab] = useState<"card" | "ewallet">("card");

	/**
	 * ONLY to print a saved wallet's name in the header ("E-wallet · TNG" is the
	 * code, not the name the venue chose).
	 */
	const { data: wallets = [] } = useQuery({
		queryKey: ["ewallet-providers"],
		queryFn: () => fetchEwalletProviders(logout),
		enabled: card?.type === "ewallet",
		staleTime: 60 * 60 * 1000,
	});
	const walletNames = Object.fromEntries(
		wallets.map((wallet) => [wallet.code, wallet.name]),
	);

	/**
	 * No payment gateway is registered yet, so neither button can open a real
	 * card page or wallet link. One flag, so the day the gateway lands this is
	 * the line that changes.
	 */
	const gatewayConnected = false;
	// The gateway page needs a real mobile number; say so before the payer
	// presses, rather than after the page refuses.
	const missingMobile = !user?.contactNo?.trim();

	const tabs: {
		value: "card" | "ewallet";
		label: string;
		how: string;
		action: string;
	}[] = [
		{
			value: "card",
			label: t.subscription.methodCardAuto,
			how: t.subscription.autoCardHow,
			action: t.subscription.addCardSecure,
		},
		{
			value: "ewallet",
			label: t.subscription.methodEwallet,
			how: t.subscription.autoWalletHow,
			action: t.subscription.linkWallet,
		},
	];
	const current = tabs.find((item) => item.value === tab) ?? tabs[0];

	const remove = async () => {
		if (!onRemove) return;
		const removed = await onRemove();
		if (removed) {
			setConfirmingRemove(false);
			setEditing(false);
		}
	};

	const summary = backed
		? card
			? describePaymentMethod(
					card,
					{
						transfer: t.subscription.savedTransfer,
						fpx: t.subscription.savedFpx,
						fpxLink: t.subscription.savedFpxLink,
						ewallet: t.subscription.methodEwallet,
					},
					walletNames,
				)
			: t.subscription.noCardSaved
		: `Visa ···· ${demoLast4}`;

	/**
	 * The line under the summary says what will HAPPEN at renewal: the billing
	 * line when something can be charged, otherwise that the org pays by hand.
	 */
	const subline = !backed
		? fill(t.subscription.autoPayEnabled, { billed: billedLabel })
		: card && willAutoCharge(card)
			? billedLabel
			: fill(t.subscription.noMethodPaysByFpx, { billed: billedLabel });

	return (
		<IzCard flat>
			<div className="flex items-center gap-2">
				{card?.type === "ewallet" ? (
					<Wallet className="h-4 w-4 text-[var(--iz-muted)]" />
				) : (
					<CreditCard className="h-4 w-4 text-[var(--iz-muted)]" />
				)}
				<div className="min-w-0">
					<p className="iz-sm font-semibold">
						{isLoading ? t.subscription.loadingCard : summary}
					</p>
					<p className="iz-tiny iz-muted">{subline}</p>
				</div>
			</div>

			{/* A mandate the bank has not approved is saved but must not be
			    debited — said out loud rather than reading as ready. */}
			{backed && card?.type === "fpx_mandate" && !willAutoCharge(card) && (
				<p
					className="iz-tiny mt-2"
					style={{ color: "var(--iz-amber-l, #ffc46b)" }}
				>
					{t.subscription.mandatePending}
				</p>
			)}

			{canEdit && !editing && (
				<button
					type="button"
					className="iz-btn iz-btn-soft mt-3 w-full"
					onClick={() => {
						setTab(card?.type === "ewallet" ? "ewallet" : "card");
						setConfirmingRemove(false);
						setEditing(true);
					}}
				>
					{backed && card
						? t.subscription.editPaymentMethod
						: t.subscription.setupAutoPay}
				</button>
			)}

			{canEdit && editing && (
				<div className="mt-3 space-y-3 border-t border-[var(--iz-line)] pt-3">
					{/* A choice, not an action: the pressed tab lifts lavender, never
					    gold — gold is the one button that does something. */}
					<div className="flex gap-2">
						{tabs.map((item) => (
							<button
								key={item.value}
								type="button"
								aria-pressed={tab === item.value}
								className={`iz-btn iz-btn-soft flex-1${
									tab === item.value ? " iz-btn-on" : ""
								}`}
								onClick={() => setTab(item.value)}
							>
								{item.label}
							</button>
						))}
					</div>

					<p className="iz-tiny iz-muted2">{current.how}</p>

					{missingMobile && (
						<p
							className="iz-tiny"
							style={{ color: "var(--iz-amber-l, #ffc46b)" }}
						>
							{t.subscription.needMobile}
						</p>
					)}

					<div className="flex gap-2">
						<button
							type="button"
							className="iz-btn iz-btn-soft flex-1"
							disabled={isRemoving}
							onClick={() => {
								setConfirmingRemove(false);
								setEditing(false);
							}}
						>
							{t.common.cancel}
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-gold flex-1"
							disabled={!gatewayConnected || missingMobile || isRemoving}
						>
							{current.action}
						</button>
					</div>
					{!gatewayConnected && (
						<p className="iz-tiny iz-muted2">
							{t.subscription.autoNotConnected}
						</p>
					)}

					{/*
					 * REMOVE is the way back to "no method" — auto-debit off, pay by
					 * hand. Two presses on purpose: the first shows what removing does
					 * and the second does it, and the result shown is the server's own
					 * sentence, never a local guess.
					 */}
					{backed && card && onRemove && !confirmingRemove && (
						<button
							type="button"
							className="iz-btn iz-btn-soft w-full"
							disabled={isRemoving}
							onClick={() => setConfirmingRemove(true)}
						>
							{t.subscription.removePaymentMethod}
						</button>
					)}
					{backed && card && onRemove && confirmingRemove && (
						<div className="space-y-2 border-t border-[var(--iz-line)] pt-2">
							<p className="iz-tiny iz-muted2">
								{t.subscription.removeMethodNote}
							</p>
							<div className="flex gap-2">
								<button
									type="button"
									className="iz-btn iz-btn-soft flex-1"
									disabled={isRemoving}
									onClick={() => setConfirmingRemove(false)}
								>
									{t.common.cancel}
								</button>
								<button
									type="button"
									className="iz-btn iz-btn-danger flex-1"
									disabled={isRemoving}
									onClick={remove}
								>
									{isRemoving
										? t.subscription.removingMethod
										: t.subscription.confirmRemoveMethod}
								</button>
							</div>
						</div>
					)}
				</div>
			)}
		</IzCard>
	);
}
