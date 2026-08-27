import { IzCard } from "@agency-portal/components/iz/ui";
import { CreditCard } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	cardBrandFromNumber,
	isPlausibleCardNumber,
	type PaymentMethod,
	type SavePaymentMethodInput,
} from "@/services/payment-method";

/**
 * The card an outlet or agency pays its subscription with — real, saved and
 * editable. One component for both portals: they show the same record from the
 * same side, and a second copy is how one of them keeps a demo card.
 *
 * ⚠️ THE FULL NUMBER NEVER LEAVES THIS COMPONENT. The brand and the last four
 * are derived here and only those are sent; the number itself is dropped when
 * the form closes. Nothing else is possible without a payment gateway, and
 * pretending otherwise — storing a PAN to look complete — is how an app ends up
 * holding card data it has no right to.
 *
 * So the card can be RECORDED but not CHARGED, and the note under the form says
 * exactly that rather than implying auto-pay is live.
 */
export function PaymentMethodCard({
	card,
	backed,
	demoLast4,
	canEdit,
	isLoading,
	isSaving,
	billedLabel,
	onSave,
}: {
	card: PaymentMethod | null;
	backed: boolean;
	demoLast4: string;
	canEdit: boolean;
	isLoading: boolean;
	isSaving: boolean;
	billedLabel: string;
	onSave: (input: Omit<SavePaymentMethodInput, "outletId">) => Promise<boolean>;
}) {
	const { t } = usePortalLocale();
	const [editing, setEditing] = useState(false);
	const [number, setNumber] = useState("");
	const [holder, setHolder] = useState("");
	const [expiry, setExpiry] = useState("");
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);

	const openForm = () => {
		// Prefilled from the saved card EXCEPT the number, which we do not have —
		// re-typing it is the only way to change the last four, and a masked
		// placeholder that looked editable would be a lie.
		setNumber("");
		setHolder(card?.holderName ?? "");
		setExpiry(
			card
				? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`
				: "",
		);
		setEmail(card?.billingEmail ?? "");
		setError(null);
		setEditing(true);
	};

	const submit = async () => {
		const digits = number.replace(/\D/g, "");
		if (!isPlausibleCardNumber(digits)) {
			setError(t.subscription.cardNumberInvalid);
			return;
		}
		const match = expiry.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
		if (!match) {
			setError(t.subscription.expiryFormat);
			return;
		}
		const month = Number(match[1]);
		const year =
			match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
		if (month < 1 || month > 12) {
			setError(t.subscription.expiryMonthRange);
			return;
		}
		const now = new Date();
		if (
			year < now.getFullYear() ||
			(year === now.getFullYear() && month < now.getMonth() + 1)
		) {
			setError(t.subscription.cardExpired);
			return;
		}
		setError(null);
		const saved = await onSave({
			brand: cardBrandFromNumber(digits),
			last4: digits.slice(-4),
			expMonth: month,
			expYear: year,
			holderName: holder.trim() || null,
			billingEmail: email.trim() || null,
		});
		if (saved) {
			setNumber("");
			setEditing(false);
		}
	};

	const summary = backed
		? card
			? `${card.brand} ···· ${card.last4}`
			: t.subscription.noCardSaved
		: `Visa ···· ${demoLast4}`;

	return (
		<IzCard flat>
			<div className="flex items-center gap-2">
				<CreditCard className="h-4 w-4 text-[var(--iz-muted)]" />
				<div className="min-w-0">
					<p className="iz-sm font-semibold">
						{isLoading ? t.subscription.loadingCard : summary}
					</p>
					<p className="iz-tiny iz-muted">
						{backed && card
							? `${fill(t.subscription.cardExpires, {
									billed: billedLabel,
									mm: String(card.expMonth).padStart(2, "0"),
									yy: String(card.expYear).slice(-2),
								})}${card.holderName ? ` · ${card.holderName}` : ""}`
							: backed
								? fill(t.subscription.addACard, { billed: billedLabel })
								: fill(t.subscription.autoPayEnabled, { billed: billedLabel })}
					</p>
				</div>
			</div>

			{canEdit && !editing && (
				<button
					type="button"
					className="iz-btn iz-btn-soft mt-3 w-full"
					onClick={openForm}
				>
					{backed && card ? t.subscription.editCard : t.subscription.addCard}
				</button>
			)}

			{canEdit && editing && (
				<div className="mt-3 space-y-2 border-t border-[var(--iz-line)] pt-3">
					<div className="iz-field">
						<label htmlFor="pm-number">{t.subscription.cardNumber}</label>
						<input
							id="pm-number"
							inputMode="numeric"
							autoComplete="cc-number"
							placeholder="4242 4242 4242 4242"
							value={number}
							onChange={(e) => setNumber(e.target.value)}
						/>
					</div>
					<div className="grid grid-cols-2 gap-2">
						<div className="iz-field">
							<label htmlFor="pm-exp">{t.subscription.expiry}</label>
							<input
								id="pm-exp"
								inputMode="numeric"
								autoComplete="cc-exp"
								placeholder="09/28"
								value={expiry}
								onChange={(e) => setExpiry(e.target.value)}
							/>
						</div>
						<div className="iz-field">
							<label htmlFor="pm-holder">{t.subscription.nameOnCard}</label>
							<input
								id="pm-holder"
								autoComplete="cc-name"
								placeholder={t.subscription.asPrinted}
								value={holder}
								onChange={(e) => setHolder(e.target.value)}
							/>
						</div>
					</div>
					<div className="iz-field">
						<label htmlFor="pm-email">
							{t.subscription.billingEmailOptional}
						</label>
						<input
							id="pm-email"
							type="email"
							placeholder="accounts@venue.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>

					{error && (
						<p
							className="iz-tiny"
							style={{ color: "var(--iz-red-l, #ff8080)" }}
						>
							{error}
						</p>
					)}
					<p className="iz-tiny iz-muted2">
						{t.subscription.cardPrivacyNote} {t.izUi.cardNotChargedYet}
					</p>

					<div className="flex gap-2">
						<button
							type="button"
							className="iz-btn iz-btn-soft flex-1"
							disabled={isSaving}
							onClick={() => setEditing(false)}
						>
							{t.common.cancel}
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-gold flex-1"
							disabled={isSaving}
							onClick={submit}
						>
							{isSaving ? t.subscription.savingCard : t.subscription.saveCard}
						</button>
					</div>
				</div>
			)}
		</IzCard>
	);
}
