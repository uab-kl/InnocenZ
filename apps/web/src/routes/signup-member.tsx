import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Building2,
	Check,
	Eye,
	EyeOff,
	Loader2,
	Search,
	Store,
	User,
} from "lucide-react";
import { useRef, useState } from "react";
import { HandoffLanguageSwitcher } from "@/components/landing/handoff/HandoffLanguageSwitcher";
import { LoginAmbience } from "@/components/landing/LoginDecor";
import { env } from "@/env";
import { getPublicClient } from "@/lib/axios-v1";
import { LandingLocaleProvider, useLandingLocale } from "@/lib/landing-i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup-member")({
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: "Join a team | InnocenZ" },
			{
				name: "description",
				content:
					"Join an outlet or PR agency that is already on InnocenZ as a team member.",
			},
		],
	}),
});

function RouteComponent() {
	return (
		<LandingLocaleProvider>
			<MemberSignupPage />
		</LandingLocaleProvider>
	);
}

type OrgKind = "agency" | "outlet";
type OrgOption = { id: string; name: string };
type RoleKey = "roleFinance" | "roleDirector" | "roleOpsHead";

/**
 * Deliberately permissive — one `@`, a dot in the domain, no spaces.
 *
 * It is a TYPO CATCH, not an address validator: the only thing that proves an
 * email real is mail arriving at it, and a strict pattern reliably rejects
 * addresses that genuinely work (plus-tags, long TLDs, apostrophes). The server
 * runs zod's own `.email()` behind this anyway.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Which titles a person may ASK FOR, per portal.
 *
 * ⚠️ Owner and Guarantor are deliberately absent, and the server refuses them
 * too (`RegisterOrgMemberSchema`). Nobody outside an organisation may hand
 * themselves its top lane — the same rule that stops them being invited into
 * one. This list is the polite half; the schema is the enforcing half, and
 * neither is load-bearing on its own.
 */
const ROLE_OPTIONS: Record<
	OrgKind,
	ReadonlyArray<{ value: string; key: RoleKey }>
> = {
	agency: [
		{ value: "finance", key: "roleFinance" },
		{ value: "director", key: "roleDirector" },
	],
	outlet: [
		{ value: "finance", key: "roleFinance" },
		{ value: "director", key: "roleDirector" },
		{ value: "operations_head", key: "roleOpsHead" },
	],
};

/**
 * THE SECOND DOOR INTO A TEAM — a person joining an organisation that already
 * exists (owner, 10 Sep 2026).
 *
 * The two tiles on `/signup` register an ORGANISATION. This registers a PERSON,
 * and the two must not be merged: an organisation sign-up carries a company, an
 * SSM number, a package and a billing anchor, while this creates an account
 * with NO ROLE AT ALL and, at most, a `status: 'pending'` membership the
 * organisation approves.
 *
 * ⚠️ It DOES borrow the organisation form's dressing — the same section
 * headings, field labels and input frames (owner, 11 Sep 2026: *"the fill up
 * format follow from the organisation sign up form"*). Two sign-up pages that
 * look unrelated read as two different products; the difference between them
 * belongs in what is ASKED, not in how it looks.
 *
 * ⚠️ The organisation step is OPTIONAL by the owner's decision — skipping it
 * leaves an account any outlet or agency can later invite by email. So this
 * page must never require a choice it was told to allow skipping.
 */
function MemberSignupPage() {
	const { t } = useLandingLocale();
	const copy = t.signup.memberSignup;

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phoneNum, setPhoneNum] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [photo, setPhoto] = useState<File | null>(null);
	const [photoPreview, setPhotoPreview] = useState<string | null>(null);
	const photoInput = useRef<HTMLInputElement>(null);
	/** `null` = "I will be invited later" — a real answer, not an absence. */
	const [orgKind, setOrgKind] = useState<OrgKind | null>(null);
	const [orgId, setOrgId] = useState("");
	const [subRole, setSubRole] = useState("");
	const [formError, setFormError] = useState("");
	const [done, setDone] = useState<{ orgName: string | null } | null>(null);

	/*
	 * Only fetched once a kind is picked — both lists are public, but there is
	 * no reason to pull either before the visitor has said which one they mean.
	 */
	const orgsQuery = useQuery({
		queryKey: ["member-signup-orgs", orgKind ?? ""],
		enabled: orgKind !== null,
		queryFn: async (): Promise<OrgOption[]> => {
			const client = getPublicClient();
			const path = orgKind === "agency" ? "/auth/agencies" : "/auth/outlets";
			const response = await client.get<{ data: OrgOption[] }>(path);
			return response.data.data ?? [];
		},
	});

	const submitMutation = useMutation({
		mutationFn: async () => {
			/*
			 * FormData, not JSON — the photo is a file. `fetch` rather than the
			 * axios client so the BROWSER sets the multipart boundary; axios
			 * defaults to JSON and would send a body the server cannot parse. Same
			 * reason `updateProfileImage` uses fetch.
			 */
			const form = new FormData();
			form.append("name", name.trim());
			form.append("email", email.trim());
			if (phoneNum.trim()) form.append("phoneNum", phoneNum.trim());
			form.append("password", password);
			form.append("confirmPassword", confirmPassword);
			if (orgKind && orgId && subRole) {
				// A nested object cannot ride in a multipart field, so it goes as
				// JSON text and the server parses it back before validating.
				form.append("join", JSON.stringify({ kind: orgKind, orgId, subRole }));
			}
			if (photo) form.append("profileImage", photo);

			const response = await fetch(
				`${env.VITE_API_URL}/v1/auth/register-member`,
				{ method: "POST", body: form },
			);
			const body = (await response.json()) as {
				success: boolean;
				message: string;
				data: { requestedOrgName: string | null } | null;
			};
			if (!response.ok || !body.success) {
				throw new Error(body.message);
			}
			return body.data;
		},
		onSuccess: (data) => setDone({ orgName: data?.requestedOrgName ?? null }),
	});

	function onPhotoPicked(file: File | null) {
		setPhoto(file);
		setPhotoPreview((old) => {
			// Revoke the previous object URL — without this, picking a photo five
			// times leaks five blobs for the life of the tab.
			if (old) URL.revokeObjectURL(old);
			return file ? URL.createObjectURL(file) : null;
		});
	}

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setFormError("");
		if (!name.trim()) return;
		/*
		 * The email is checked HERE as well as by `type="email"`, because the
		 * browser's own check is bypassed by autofill on some engines and says
		 * nothing useful when it does fire. It is also the LOGIN and the address
		 * an organisation's invitation would be sent to, so a typo here is not a
		 * cosmetic problem — it is an account nobody can reach.
		 */
		if (!email.trim()) {
			setFormError(t.signup.validation.emailRequired);
			return;
		}
		if (!EMAIL_RE.test(email.trim())) {
			setFormError(t.signup.validation.emailInvalid);
			return;
		}
		if (password.length < 6) {
			setFormError(t.signup.validation.passwordMin);
			return;
		}
		if (password !== confirmPassword) {
			setFormError(t.signup.validation.passwordsMismatch);
			return;
		}
		/*
		 * Half an answer is refused rather than silently dropped. Having picked a
		 * kind and an organisation, submitting with no role would send no `join`
		 * at all and quietly create an account attached to nobody — the person
		 * would believe they had asked to join and never appear in any queue.
		 */
		if (orgKind && (!orgId || !subRole)) {
			setFormError(copy.chooseOrg);
			return;
		}
		submitMutation.mutate();
	}

	if (done) {
		return (
			<Shell>
				<div className="flex max-w-md flex-col items-center gap-4 text-center">
					<span className="grid h-14 w-14 place-items-center rounded-full border border-royal-gold/40 bg-royal-gold/10">
						<Check className="h-7 w-7 text-gold-bright" />
					</span>
					<h1 className="signup-account-title font-semibold text-foreground">
						{copy.doneTitle}
					</h1>
					<p className="text-sm text-muted-foreground">
						{done.orgName
							? copy.donePending.replace("{org}", done.orgName)
							: copy.doneNoOrg}
					</p>
					<Link
						to="/login"
						className="mt-2 inline-flex items-center justify-center rounded-lg bg-royal-gold px-5 py-3 text-sm font-semibold text-[#1a1726]"
					>
						{copy.goToLogin}
					</Link>
				</div>
			</Shell>
		);
	}

	return (
		<Shell>
			{/*
			 * `signup-form` is not decoration — `.signup-page .signup-form section
			 * > .signup-section-title` in styles.css hangs off it, so the section
			 * headings only get their real treatment inside a form carrying this
			 * class.
			 */}
			<form
				className="signup-form w-full max-w-xl space-y-6"
				onSubmit={onSubmit}
			>
				<div>
					<h1 className="signup-account-title font-semibold tracking-tight text-foreground">
						{copy.title}
					</h1>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						{copy.subtitle}
					</p>
				</div>

				{/*
				 * `.signup-section` IS the panel the organisation form's sections sit
				 * in — rounded, a gold-tinted hairline, a translucent card over the
				 * ambience, backdrop blur and a soft drop shadow. Without it the
				 * fields floated directly on the moving background, which is legible
				 * but reads as an unfinished page rather than a form.
				 */}
				<section className="signup-section">
					<SectionTitle>{copy.yourDetails}</SectionTitle>

					{/* The photo leads the section: it is the field an owner reviewing
					    this person will actually look at, and burying it under four
					    text inputs reads as an afterthought. */}
					<div className="mt-4 flex items-center gap-4">
						<span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-royal-gold/25 bg-background/40">
							{photoPreview ? (
								<img
									src={photoPreview}
									alt=""
									className="h-full w-full object-cover"
								/>
							) : (
								<User className="h-7 w-7 text-muted-foreground" />
							)}
						</span>
						<div className="min-w-0">
							<FieldLabel>{copy.photo}</FieldLabel>
							<button
								type="button"
								onClick={() => photoInput.current?.click()}
								className="mt-1 rounded-lg border border-royal-gold/25 bg-background/40 px-3 py-2 text-sm text-foreground"
							>
								{copy.choosePhoto}
							</button>
							<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
								{copy.photoHint}
							</p>
						</div>
						<input
							ref={photoInput}
							type="file"
							accept="image/*"
							hidden
							onChange={(e) => onPhotoPicked(e.target.files?.[0] ?? null)}
						/>
					</div>

					<div className="mt-4 space-y-4">
						<TextField
							label={copy.name}
							value={name}
							onChange={setName}
							required
							autoComplete="name"
						/>
						<TextField
							label={copy.email}
							value={email}
							onChange={setEmail}
							required
							type="email"
							autoComplete="email"
						/>
						<TextField
							label={copy.phone}
							hint={copy.optional}
							value={phoneNum}
							onChange={setPhoneNum}
							type="tel"
							autoComplete="tel"
						/>
						<PasswordField
							label={copy.password}
							value={password}
							onChange={setPassword}
							show={copy.showPassword}
							hide={copy.hidePassword}
						/>
						<PasswordField
							label={copy.confirmPassword}
							value={confirmPassword}
							onChange={setConfirmPassword}
							show={copy.showPassword}
							hide={copy.hidePassword}
						/>
					</div>
				</section>

				<section className="signup-section">
					<SectionTitle>{copy.orgSection}</SectionTitle>
					<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
						{copy.orgHint}
					</p>

					<div
						className="mt-4 grid grid-cols-3 gap-3"
						role="radiogroup"
						aria-label={copy.orgSection}
					>
						<KindTile
							icon={Store}
							label={copy.kindOutlet}
							selected={orgKind === "outlet"}
							onClick={() => {
								setOrgKind("outlet");
								setOrgId("");
								setSubRole("");
							}}
						/>
						<KindTile
							icon={Building2}
							label={copy.kindAgency}
							selected={orgKind === "agency"}
							onClick={() => {
								setOrgKind("agency");
								setOrgId("");
								setSubRole("");
							}}
						/>
						<KindTile
							label={copy.skipOrg}
							selected={orgKind === null}
							onClick={() => {
								setOrgKind(null);
								setOrgId("");
								setSubRole("");
							}}
						/>
					</div>

					{orgKind && (
						<div className="mt-4 space-y-4">
							<SearchSelectField
								label={copy.chooseOrg}
								value={orgId}
								onChange={setOrgId}
								loading={orgsQuery.isPending}
								options={(orgsQuery.data ?? []).map((o) => ({
									value: o.id,
									label: o.name,
								}))}
								copy={{
									search: copy.searchOrg,
									loading: copy.loadingOrgs,
									empty: copy.noOrgMatches,
									clear: copy.clearChoice,
								}}
							/>
							<SelectField
								label={copy.chooseRole}
								value={subRole}
								onChange={setSubRole}
								placeholder={copy.chooseRole}
								options={ROLE_OPTIONS[orgKind].map((r) => ({
									value: r.value,
									label: copy[r.key],
								}))}
							/>
						</div>
					)}
				</section>

				{(formError || submitMutation.isError) && (
					<p className="text-sm text-destructive">
						{formError || (submitMutation.error as Error).message}
					</p>
				)}

				<div className="space-y-3">
					<button
						type="submit"
						disabled={submitMutation.isPending}
						className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-royal-gold px-4 py-3 text-sm font-semibold text-[#1a1726] disabled:opacity-50"
					>
						{submitMutation.isPending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								{copy.submitting}
							</>
						) : (
							copy.submit
						)}
					</button>
					<Link to="/login" className="block text-center text-sm underline">
						{t.signup.backToLogin}
					</Link>
				</div>
			</form>
		</Shell>
	);
}

/** The organisation form's section heading, verbatim, so the two pages read as
 * one product. */
function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="signup-section-title login-field-label border-b border-royal-gold/20 pb-2 uppercase text-foreground/90">
			{children}
		</h2>
	);
}

function FieldLabel({
	children,
	hint,
	required,
}: {
	children: React.ReactNode;
	hint?: string;
	required?: boolean;
}) {
	return (
		<span className="login-field-label block text-foreground">
			{children}
			{/* The same red asterisk the organisation form uses. `aria-hidden`
			    because the input's own `required` is what a screen reader reads —
			    the mark is for the eye, and announcing it twice is noise. */}
			{required ? (
				<span className="ml-0.5 text-destructive" aria-hidden>
					*
				</span>
			) : null}
			{hint ? (
				<span className="ml-1 font-normal text-muted-foreground">({hint})</span>
			) : null}
		</span>
	);
}

/** The organisation form's input frame — same height, border and background. */
const INPUT_CLASS =
	"login-input-group flex h-11 w-full items-center rounded-md border border-royal-gold/20 bg-background/40 px-3 text-base leading-normal text-foreground";

function TextField({
	label,
	hint,
	value,
	onChange,
	type = "text",
	required,
	autoComplete,
}: {
	label: string;
	hint?: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
	required?: boolean;
	autoComplete?: string;
}) {
	return (
		<label className="block space-y-1.5">
			<FieldLabel hint={hint} required={required}>
				{label}
			</FieldLabel>
			<input
				type={type}
				required={required}
				value={value}
				autoComplete={autoComplete}
				onChange={(e) => onChange(e.target.value)}
				className={INPUT_CLASS}
			/>
		</label>
	);
}

/**
 * A password field WITH AN EYE (owner, 11 Sep 2026).
 *
 * On BOTH fields, not just the first: the thing people actually get wrong is
 * the confirmation, and hiding the one field where a typo is most likely is how
 * "passwords do not match" becomes a loop somebody cannot see their way out of.
 */
function PasswordField({
	label,
	value,
	onChange,
	show,
	hide,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	show: string;
	hide: string;
}) {
	const [visible, setVisible] = useState(false);
	return (
		<label className="block space-y-1.5">
			<FieldLabel required>{label}</FieldLabel>
			<div className={cn(INPUT_CLASS, "gap-2 pr-1")}>
				<input
					type={visible ? "text" : "password"}
					required
					minLength={6}
					value={value}
					autoComplete="new-password"
					onChange={(e) => onChange(e.target.value)}
					className="h-full w-full bg-transparent outline-none"
				/>
				<button
					type="button"
					onClick={() => setVisible((v) => !v)}
					aria-label={visible ? hide : show}
					title={visible ? hide : show}
					className="grid h-8 w-8 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
				>
					{visible ? (
						<EyeOff className="h-4 w-4" />
					) : (
						<Eye className="h-4 w-4" />
					)}
				</button>
			</div>
		</label>
	);
}

/**
 * AN ORGANISATION PICKER YOU CAN TYPE INTO.
 *
 * A native <select> was fine for the eight venues on this database and stops
 * being fine at forty: the list is alphabetical, so somebody looking for
 * "Velvet 23" scrolls past everything else, and on a phone the native wheel
 * makes that worse. Typing three letters is the only interaction here that does
 * not get slower as the platform grows.
 *
 * Deliberately hand-rolled rather than a combobox dependency — this is a
 * signed-out page and the whole behaviour is a filter over an in-memory array.
 *
 * ⚠️ The ROLE picker beside it stays a plain <select>. Two or three fixed
 * options do not need searching, and a search box over three items is a worse
 * control than a list of three.
 */
function SearchSelectField({
	label,
	value,
	onChange,
	options,
	loading,
	copy,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	options: Array<{ value: string; label: string }>;
	loading: boolean;
	copy: { search: string; loading: string; empty: string; clear: string };
}) {
	const [query, setQuery] = useState("");
	const chosen = options.find((o) => o.value === value) ?? null;

	const needle = query.trim().toLowerCase();
	const matches = needle
		? options.filter((o) => o.label.toLowerCase().includes(needle))
		: options;

	/*
	 * Once something is chosen the list collapses to a single confirmed row.
	 * Leaving eight options on screen under a made choice reads as though it has
	 * not been made — and re-opening is one click on Clear.
	 */
	if (chosen) {
		return (
			<div className="block space-y-1.5">
				<FieldLabel required>{label}</FieldLabel>
				<div className={cn(INPUT_CLASS, "justify-between gap-2")}>
					<span className="truncate">{chosen.label}</span>
					<button
						type="button"
						onClick={() => {
							onChange("");
							setQuery("");
						}}
						className="shrink-0 rounded px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
					>
						{copy.clear}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="block space-y-1.5">
			<FieldLabel required>{label}</FieldLabel>
			<div className={cn(INPUT_CLASS, "gap-2")}>
				<Search className="size-4 shrink-0 text-muted-foreground" />
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={loading ? copy.loading : copy.search}
					className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground"
				/>
			</div>

			{/* Capped height with its own scroll: an unbounded list would push the
			    Create-account button off a phone screen as the platform grows. */}
			<div className="max-h-56 overflow-y-auto rounded-md border border-royal-gold/20 bg-background/60">
				{loading ? (
					<p className="px-3 py-3 text-sm text-muted-foreground">
						{copy.loading}
					</p>
				) : matches.length === 0 ? (
					<p className="px-3 py-3 text-sm text-muted-foreground">
						{copy.empty}
					</p>
				) : (
					matches.map((o) => (
						<button
							key={o.value}
							type="button"
							onClick={() => onChange(o.value)}
							className="block w-full truncate px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-royal-gold/10"
						>
							{o.label}
						</button>
					))
				)}
			</div>
		</div>
	);
}

function SelectField({
	label,
	value,
	onChange,
	placeholder,
	options,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	options: Array<{ value: string; label: string }>;
}) {
	return (
		<label className="block space-y-1.5">
			<FieldLabel>{label}</FieldLabel>
			{/*
			 * ⚠️ `color-scheme: dark` IS THE FIX, not the option colours.
			 *
			 * A native <select> popup is painted by the OS, not by the page. On a
			 * light-themed Windows it opened WHITE while the options inherited the
			 * page's near-white text — the owner's screenshot showed eight venues
			 * that could only be read one at a time, whichever the mouse happened
			 * to be over. `color-scheme` tells the browser this control is dark and
			 * repaints the whole popup, scrollbar included.
			 *
			 * The explicit option colours stay as a belt: engines that ignore
			 * `color-scheme` on a popup still honour a background-color on the
			 * option itself, and a hex is used rather than a CSS variable because
			 * custom properties are unreliable inside a native popup.
			 */}
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				style={{ colorScheme: "dark" }}
				className={cn(
					INPUT_CLASS,
					"[&>option]:bg-[#17122a] [&>option]:text-white",
				)}
			>
				<option value="">{placeholder}</option>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}

function KindTile({
	icon: Icon,
	label,
	selected,
	onClick,
}: {
	icon?: React.ComponentType<{ className?: string }>;
	label: string;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: role="radio" on a <button> inside the role="radiogroup" above is the WAI-ARIA composite pattern, matching the account-type tiles on /signup
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			onClick={onClick}
			className={cn(
				"flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-5 text-center transition-all",
				selected
					? "border-royal-gold/60 bg-royal-gold/10 shadow-glow-gold"
					: "border-royal-gold/20 bg-background/40 hover:border-royal-gold/35",
			)}
		>
			{Icon ? (
				<span
					className={cn(
						"grid h-10 w-10 place-items-center rounded-xl border transition-colors",
						selected
							? "border-royal-gold/45 bg-royal-gold/15"
							: "border-royal-gold/20 bg-white/[0.035]",
					)}
				>
					<Icon
						className={cn(
							"h-5 w-5",
							selected ? "text-gold-bright" : "text-muted-foreground",
						)}
					/>
				</span>
			) : null}
			<span className="signup-account-desc font-semibold text-foreground">
				{label}
			</span>
		</button>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	const { t } = useLandingLocale();
	return (
		/*
		 * ⚠️ `login-page signup-page` IS THE BACKGROUND. `LoginAmbience` renders
		 * nothing on its own — the sweep, drifting pools, rays, grain and vignette
		 * are painted by CSS scoped to these two classes, and `.signup-page
		 * .login-ambience` is what pins the field `position: fixed` so it does not
		 * stretch down the whole scroll height of a long form. Without them the
		 * component mounted and the page rendered flat, which is exactly what it
		 * did until the owner asked about the background.
		 */
		<div className="login-page signup-page relative flex min-h-svh w-full flex-col">
			<LoginAmbience />

			{/* The same overlay rail as /signup and /login: back link far left,
			    language switcher far right. `absolute` so it does not push the
			    form down the page. */}
			<header className="login-rail absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-6 lg:px-12">
				<Link
					to="/signup"
					className="login-back inline-flex items-center gap-2 font-semibold uppercase tracking-[0.14em] text-foreground/70 transition-colors hover:text-gold-bright"
				>
					<ArrowLeft className="h-5 w-5" />
					{t.signup.backToLogin}
				</Link>
				<HandoffLanguageSwitcher />
			</header>

			<div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-6 py-24">
				{children}
			</div>
		</div>
	);
}
