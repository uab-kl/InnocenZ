import { IzCard } from "@agency-portal/components/iz/ui";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	cardBrandFromNumber,
	describePaymentMethod,
	fetchEwalletProviders,
	fetchFpxBanks,
	isPlausibleCardNumber,
	type PaymentMethod,
	type PaymentMethodType,
	type SavePaymentMethodInput,
	willAutoCharge,
} from "@/services/payment-method";

/**
 * The dropdown list is painted by the OS, not by the page, so each option has to
 * carry its own colours — inheriting from the select is exactly what does NOT
 * happen on Windows Chrome. A literal hex rather than a CSS variable for the
 * same reason: the popup is outside the page's cascade in some engines.
 */
const OPTION_STYLE = { background: "#17121f", color: "#ece7f5" } as const;

/**
 * HOW an outlet or agency pays its subscription — real, saved and editable. One
 * component for both portals: they show the same record from the same side, and
 * a second copy is how one of them keeps a demo card.
 *
 * Three rails, not one. A card is what this screen used to assume, and for a
 * Malaysian business account it is not the common one: FPX direct debit runs on
 * a bank-approved mandate, and plenty of venues will only ever bank-transfer.
 * The card fields appear ONLY for the card rail — an expiry box beside "Bank
 * transfer" is how a form teaches people to ignore it.
 *
 * E-wallets and DuitNow are deliberately absent. They cannot be charged on a
 * schedule, so keeping one here as "how you pay" would promise a renewal that
 * never happens; those belong on a per-invoice payment link instead.
 *
 * ⚠️ THE FULL NUMBER NEVER LEAVES THIS COMPONENT. The brand and the last four
 * are derived here and only those are sent; the number itself is dropped when
 * the form closes. Nothing else is possible without a payment gateway, and
 * pretending otherwise — storing a PAN to look complete — is how an app ends up
 * holding card data it has no right to. When a gateway is finally wired, the
 * number must move into ITS hosted field rather than this input: a PAN touching
 * our own DOM is the difference between PCI-DSS SAQ-A and SAQ-A-EP.
 *
 * So a method can be RECORDED but not CHARGED, and the note under the form says
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
	const { logout } = useAuth();
	const [editing, setEditing] = useState(false);
	const [type, setType] = useState<PaymentMethodType>("card");
	const [number, setNumber] = useState("");
	const [holder, setHolder] = useState("");
	const [expiry, setExpiry] = useState("");
	const [email, setEmail] = useState("");
	const [bankCode, setBankCode] = useState("");
	const [walletProvider, setWalletProvider] = useState("");
	const [error, setError] = useState<string | null>(null);

	/**
	 * The FPX roster, fetched only once the payer actually picks that rail —
	 * a list of 18 banks is not worth loading for someone saving a card.
	 */
	const { data: banks = [] } = useQuery({
		queryKey: ["fpx-banks"],
		queryFn: () => fetchFpxBanks(logout),
		enabled: editing && type === "fpx_mandate",
		staleTime: 60 * 60 * 1000,
	});

	/** The wallet roster, on the same terms as the banks: fetched on demand only. */
	const { data: wallets = [] } = useQuery({
		queryKey: ["ewallet-providers"],
		queryFn: () => fetchEwalletProviders(logout),
		enabled: editing && type === "ewallet",
		staleTime: 60 * 60 * 1000,
	});

	/**
	 * The three rails a subscriber may CHOOSE: card, FPX direct debit, e-wallet.
	 *
	 * ⚠️ `manual_transfer` was removed from this picker on the owner's call
	 * (28 Aug 2026) — card and FPX already cover paying by credit and debit, and
	 * a third "I will send it myself" option beside them read as duplication.
	 * Nothing was saved on it at the time: zero `payment_method` rows existed on
	 * any rail, so no venue was orphaned.
	 *
	 * THE TYPE ITSELF STAYS, and removing it would break two live things:
	 *   • `subscription-payment.controller` falls back to `manual_transfer` when a
	 *     gateway names no rail, which is the honest label for money that arrived
	 *     through no instrument this app knows about;
	 *   • it is exactly what an admin marking an invoice paid from a bank
	 *     statement is recording.
	 * So the rail is no longer OFFERED; it is still how an out-of-band payment is
	 * described once it happens.
	 *
	 * DuitNow also stays out: the enum carries it, nothing renders it, and a rail
	 * with no roster behind it would be a picker that saves nothing useful.
	 */
	const methodChoices: {
		value: PaymentMethodType;
		label: string;
		note: string;
	}[] = [
		{
			value: "card",
			label: t.subscription.methodCard,
			note: t.subscription.methodCardNote,
		},
		{
			value: "fpx_mandate",
			label: t.subscription.methodFpx,
			note: t.subscription.methodFpxNote,
		},
		{
			value: "ewallet",
			label: t.subscription.methodEwallet,
			note: t.subscription.methodEwalletNote,
		},
	];

	const openForm = () => {
		// Prefilled from the saved instrument EXCEPT the card number, which we do
		// not have — re-typing it is the only way to change the last four, and a
		// masked placeholder that looked editable would be a lie.
		setNumber("");
		setType(card?.type ?? "card");
		setBankCode(card?.bankCode ?? "");
		setWalletProvider(card?.walletProvider ?? "");
		setHolder(card?.holderName ?? "");
		setExpiry(
			card?.expMonth && card?.expYear
				? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`
				: "",
		);
		setEmail(card?.billingEmail ?? "");
		setError(null);
		setEditing(true);
	};

	const submit = async () => {
		const common = {
			holderName: holder.trim() || null,
			billingEmail: email.trim() || null,
		};

		// A direct debit needs the BANK — never an account number. The payer is
		// redirected to that bank to authorise, and the bank creates the mandate.
		if (type === "fpx_mandate") {
			if (!bankCode) {
				setError(t.subscription.chooseBank);
				return;
			}
			setError(null);
			const savedMandate = await onSave({ type, bankCode, ...common });
			if (savedMandate) {
				setNumber("");
				setEditing(false);
			}
			return;
		}

		/**
		 * The wallet rail. Validated here as well as on the server for the same
		 * reason the bank is: a 400 from the schema would surface as a generic
		 * failure, and "choose your wallet" is a thing the person can act on.
		 */
		if (type === "ewallet") {
			if (!walletProvider) {
				setError(t.subscription.chooseWallet);
				return;
			}
			setError(null);
			const savedWallet = await onSave({ type, walletProvider, ...common });
			if (savedWallet) {
				setNumber("");
				setEditing(false);
			}
			return;
		}

		// A rail with no card fields skips the card validation entirely, rather
		// than validating a number nobody was asked for.
		if (type !== "card") {
			setError(null);
			const savedOther = await onSave({ type, ...common });
			if (savedOther) {
				setNumber("");
				setEditing(false);
			}
			return;
		}

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
			type: "card",
			brand: cardBrandFromNumber(digits),
			last4: digits.slice(-4),
			expMonth: month,
			expYear: year,
			...common,
		});
		if (saved) {
			setNumber("");
			setEditing(false);
		}
	};

	const summary = backed
		? card
			? describePaymentMethod(card, {
					transfer: t.subscription.savedTransfer,
					fpx: t.subscription.savedFpx,
				})
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
							? // An expiry line only makes sense on a rail that HAS one; a
								// bank transfer says what it is instead of borrowing card copy.
								card.type === "card" && card.expMonth && card.expYear
								? `${fill(t.subscription.cardExpires, {
										billed: billedLabel,
										mm: String(card.expMonth).padStart(2, "0"),
										yy: String(card.expYear).slice(-2),
									})}${card.holderName ? ` · ${card.holderName}` : ""}`
								: billedLabel
							: backed
								? fill(t.subscription.addACard, { billed: billedLabel })
								: fill(t.subscription.autoPayEnabled, { billed: billedLabel })}
					</p>
				</div>
			</div>

			{/* A mandate the bank has not approved is an ACTIVE, saved, default
			    instrument that must not be debited — the one place where "saved" and
			    "chargeable" come apart, so it gets said out loud rather than reading
			    as ready. Tested through the shared willAutoCharge rather than
			    against "pending": a CANCELLED or FAILED mandate is not pending and
			    is just as undebitable, and this branch used to let both render as
			    ready. */}
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
					onClick={openForm}
				>
					{backed && card
						? t.subscription.editPaymentMethod
						: t.subscription.addPaymentMethod}
				</button>
			)}

			{canEdit && editing && (
				<div className="mt-3 space-y-2 border-t border-[var(--iz-line)] pt-3">
					<fieldset className="iz-field">
						<legend className="iz-tiny iz-muted mb-1">
							{t.subscription.payHow}
						</legend>
						<div className="flex flex-wrap gap-2">
							{methodChoices.map((choice) => (
								<button
									key={choice.value}
									type="button"
									aria-pressed={type === choice.value}
									className={`iz-btn ${
										type === choice.value ? "iz-btn-gold" : "iz-btn-soft"
									} flex-1`}
									onClick={() => {
										setType(choice.value);
										setError(null);
									}}
								>
									{choice.label}
								</button>
							))}
						</div>
						<p className="iz-tiny iz-muted2 mt-1">
							{methodChoices.find((choice) => choice.value === type)?.note}
						</p>
					</fieldset>

					{/* Only a card rail asks for card details. Showing an expiry box
					    beside "Bank transfer" is how a form teaches people to ignore it. */}
					{type === "card" && (
						<>
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
						</>
					)}

					{/*
					 * WHICH BANK — and nothing else. No account number is asked for
					 * here or anywhere: the payer authorises at their own bank, which
					 * is the only party that needs the number, and the gateway returns
					 * a mandate token. A field for it would be data we cannot use.
					 */}
					{type === "fpx_mandate" && (
						<div className="iz-field">
							<label htmlFor="pm-bank">{t.subscription.yourBank}</label>
							{/*
							 * Styled INLINE, matching `.iz-field input` exactly, because
							 * `.iz-field` only ever styled `input`/`textarea` — an unstyled
							 * native select renders a white box with near-invisible text on
							 * this dark portal. The theme sheet is a binary file with NUL
							 * bytes (see CLAUDE.md), so adding a rule there for one control
							 * is the riskier edit.
							 *
							 * The OPTIONS carry their own dark background too: on Windows
							 * Chrome the popup list is painted by the OS and does NOT
							 * inherit the select's colours, which is exactly what made the
							 * list unreadable.
							 */}
							<select
								id="pm-bank"
								value={bankCode}
								onChange={(e) => {
									setBankCode(e.target.value);
									setError(null);
								}}
								style={{
									width: "100%",
									background: "rgba(255,255,255,0.03)",
									border: "1px solid var(--iz-line2)",
									borderRadius: "13px",
									padding: "13px",
									color: "var(--iz-txt)",
									fontSize: "15px",
									fontFamily: '"Manrope", sans-serif',
								}}
							>
								<option value="" style={OPTION_STYLE}>
									{t.subscription.chooseBankPlaceholder}
								</option>
								{banks.map((bank) => (
									<option
										key={bank.code}
										value={bank.code}
										style={OPTION_STYLE}
									>
										{bank.name}
									</option>
								))}
							</select>
							<p className="iz-tiny iz-muted2 mt-1">
								{t.subscription.bankRedirectNote}
							</p>
						</div>
					)}

					{/*
					 * WHICH WALLET — and nothing else. No wallet id, phone number or
					 * account is asked for here or anywhere: the payer opens their own
					 * app and approves, so none of that is data this application can use.
					 * Same rule that keeps the card PAN and the bank account number out.
					 */}
					{type === "ewallet" && (
						<div className="iz-field">
							<label htmlFor="pm-wallet">{t.subscription.yourWallet}</label>
							{/* Inline-styled and dark-optioned for the same reasons the bank
							    select above is — see the note there. */}
							<select
								id="pm-wallet"
								value={walletProvider}
								onChange={(e) => {
									setWalletProvider(e.target.value);
									setError(null);
								}}
								style={{
									width: "100%",
									background: "rgba(255,255,255,0.03)",
									border: "1px solid var(--iz-line2)",
									borderRadius: "13px",
									padding: "13px",
									color: "var(--iz-txt)",
									fontSize: "15px",
									fontFamily: '"Manrope", sans-serif',
								}}
							>
								<option value="" style={OPTION_STYLE}>
									{t.subscription.chooseWalletPlaceholder}
								</option>
								{wallets.map((wallet) => (
									<option
										key={wallet.code}
										value={wallet.code}
										style={OPTION_STYLE}
									>
										{wallet.name}
									</option>
								))}
							</select>
							<p className="iz-tiny iz-muted2 mt-1">
								{t.subscription.walletPushNote}
							</p>
						</div>
					)}

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
					{/*
					 * ONE NOTE PER RAIL. This used to print "InnocenZ records the CARD"
					 * under Bank transfer, where there is no card — copy about a thing
					 * the form is not collecting reads as a form that does not know what
					 * it is doing. The PAN warning belongs only where a PAN is typed.
					 */}
					<p className="iz-tiny iz-muted2">
						{type === "card"
							? `${t.subscription.cardPrivacyNote} ${t.izUi.cardNotChargedYet}`
							: type === "fpx_mandate"
								? t.subscription.mandateNotLiveYet
								: t.subscription.transferRecordedNote}
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
							{isSaving
								? t.subscription.savingCard
								: t.subscription.savePaymentMethod}
						</button>
					</div>
				</div>
			)}
		</IzCard>
	);
}
