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
 * THE SECTION IS OPTIONAL, and saving something here means AUTO-DEBIT (owner's
 * rule, 2 Sep 2026). Two rails: Card, and Bank direct debit — the FPX mandate
 * the payer authorises once at their bank, after which every period is taken
 * without a tap. With nothing saved, or when a debit bounces on an empty
 * account, the period simply stays unpaid and the org pays it by one-off FPX
 * from tick-to-pay on Payment history. So "no method" is a normal state, not a
 * gap to nag about, and the header says what happens in that state.
 *
 * The one-off FPX link rail and the e-wallet rail were withdrawn from the
 * picker the same day. Their types, columns and describers STAY: rows saved on
 * them exist and must keep reading as what they are, here and on the admin
 * panel. A venue on one of them opens the form onto the nearest offered rail
 * (FPX → direct debit, wallet → card) and re-saves, or removes it.
 *
 * The card fields appear ONLY for the card rail — an expiry box beside a bank
 * picker is how a form teaches people to ignore it.
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
	isRemoving = false,
	billedLabel,
	onSave,
	onRemove,
}: {
	card: PaymentMethod | null;
	backed: boolean;
	demoLast4: string;
	canEdit: boolean;
	isLoading: boolean;
	isSaving: boolean;
	isRemoving?: boolean;
	billedLabel: string;
	onSave: (input: Omit<SavePaymentMethodInput, "outletId">) => Promise<boolean>;
	/**
	 * Retire the saved instrument — auto-debit off, FPX by hand from then on.
	 * Optional so a caller with no delete path simply shows no Remove button.
	 */
	onRemove?: () => Promise<boolean>;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const [editing, setEditing] = useState(false);
	const [confirmingRemove, setConfirmingRemove] = useState(false);
	const [type, setType] = useState<PaymentMethodType>("card");
	const [number, setNumber] = useState("");
	const [holder, setHolder] = useState("");
	const [expiry, setExpiry] = useState("");
	const [email, setEmail] = useState("");
	const [bankCode, setBankCode] = useState("");
	const [error, setError] = useState<string | null>(null);

	/**
	 * The bank roster, fetched only once the payer actually picks that rail —
	 * a list of 18 banks is not worth loading for someone saving a card.
	 */
	const { data: banks = [] } = useQuery({
		queryKey: ["fpx-banks"],
		queryFn: () => fetchFpxBanks(logout),
		enabled: editing && type === "fpx_mandate",
		staleTime: 60 * 60 * 1000,
	});

	/**
	 * The wallet roster — ONLY for a wallet that is already saved, because the
	 * collapsed header prints its name and "E-wallet · TNG" is the code, not
	 * the name the venue chose. Nothing offers the rail any more.
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
	 * The two rails a subscriber may CHOOSE, both of which auto-debit.
	 *
	 * ⚠️ `manual_transfer` (28 Aug 2026), then `ewallet` and one-off `fpx`
	 * (2 Sep 2026) were removed from this picker on the owner's call. THE TYPES
	 * STAY, and removing them would break live things:
	 *   • `subscription-payment.controller` stamps `fpx` on every manual pay-now
	 *     and falls back to `manual_transfer` when a gateway names no rail;
	 *   • rows saved on the withdrawn rails exist and the header, the admin
	 *     panel and the receipts must keep describing them truthfully.
	 * So those rails are no longer OFFERED; they are still how a payment that
	 * happened is described.
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
	];

	const openForm = () => {
		// Prefilled from the saved instrument EXCEPT the card number, which we do
		// not have — re-typing it is the only way to change the last four, and a
		// masked placeholder that looked editable would be a lie.
		setNumber("");
		// A row on a withdrawn rail opens onto the nearest offered one rather than
		// onto a choice the picker cannot show pressed.
		const offered = methodChoices.some((choice) => choice.value === card?.type);
		setType(
			card && offered
				? card.type
				: card?.type === "fpx"
					? "fpx_mandate"
					: "card",
		);
		setBankCode(card?.bankCode ?? "");
		setHolder(card?.holderName ?? "");
		setExpiry(
			card?.expMonth && card?.expYear
				? `${String(card.expMonth).padStart(2, "0")}/${String(card.expYear).slice(-2)}`
				: "",
		);
		setEmail(card?.billingEmail ?? "");
		setError(null);
		setConfirmingRemove(false);
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
	 * The line under the summary says what will HAPPEN at renewal. A card with
	 * an expiry prints it; a chargeable instrument prints the billing line; a
	 * mandate the bank has not approved keeps the billing line and gets the
	 * amber sentence below; and anything that cannot auto-debit — nothing saved,
	 * or a row on a withdrawn rail — says plainly that the org pays by FPX.
	 */
	const subline = !backed
		? fill(t.subscription.autoPayEnabled, { billed: billedLabel })
		: !card
			? fill(t.subscription.noMethodPaysByFpx, { billed: billedLabel })
			: card.type === "card" && card.expMonth && card.expYear
				? `${fill(t.subscription.cardExpires, {
						billed: billedLabel,
						mm: String(card.expMonth).padStart(2, "0"),
						yy: String(card.expYear).slice(-2),
					})}${card.holderName ? ` · ${card.holderName}` : ""}`
				: willAutoCharge(card) || card.type === "fpx_mandate"
					? billedLabel
					: fill(t.subscription.noMethodPaysByFpx, { billed: billedLabel });

	return (
		<IzCard flat>
			<div className="flex items-center gap-2">
				<CreditCard className="h-4 w-4 text-[var(--iz-muted)]" />
				<div className="min-w-0">
					<p className="iz-sm font-semibold">
						{isLoading ? t.subscription.loadingCard : summary}
					</p>
					<p className="iz-tiny iz-muted">{subline}</p>
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
					{/* Said before the picker, not after: a person deciding whether to
					    fill this in needs to know it is optional and what saving does. */}
					<p className="iz-tiny iz-muted2">{t.subscription.methodOptional}</p>

					<fieldset className="iz-field">
						<legend className="iz-tiny iz-muted mb-1">
							{t.subscription.payHow}
						</legend>
						{/* Full-size soft buttons, and the CHOSEN one carries the payroll
						    tabs' pressed colour (owner, 2 Sep 2026: "redesign the button
						    style to previous" / "this colour remain"). A choice, not an
						    action: it lifts lavender, never gold — gold is Save and Pay. */}
						<div className="flex flex-wrap gap-2">
							{methodChoices.map((choice) => (
								<button
									key={choice.value}
									type="button"
									aria-pressed={type === choice.value}
									className={`iz-btn iz-btn-soft flex-1${
										type === choice.value ? " iz-btn-on" : ""
									}`}
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
					    beside a bank picker is how a form teaches people to ignore it. */}
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
					 * ONE NOTE PER RAIL. The PAN warning belongs only where a PAN is
					 * typed; the mandate note says the bank redirect is not live yet.
					 */}
					<p className="iz-tiny iz-muted2">
						{type === "card"
							? `${t.subscription.cardPrivacyNote} ${t.izUi.cardNotChargedYet}`
							: t.subscription.mandateNotLiveYet}
					</p>

					<div className="flex gap-2">
						<button
							type="button"
							className="iz-btn iz-btn-soft flex-1"
							disabled={isSaving || isRemoving}
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
							disabled={isSaving || isRemoving}
							onClick={submit}
						>
							{isSaving
								? t.subscription.savingCard
								: t.subscription.savePaymentMethod}
						</button>
					</div>

					{/*
					 * REMOVE is the way back to "no method" — auto-debit off, FPX by
					 * hand. Two presses on purpose: the first shows what removing does
					 * and the second does it, and the result shown is the server's own
					 * sentence, never a local guess (silence reads as failure and
					 * invites a second, harmful click).
					 */}
					{backed && card && onRemove && !confirmingRemove && (
						<button
							type="button"
							className="iz-btn iz-btn-soft w-full"
							disabled={isSaving || isRemoving}
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
									className="iz-btn iz-btn-soft flex-1"
									style={{ color: "var(--iz-red-l, #ff8080)" }}
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
