import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import axios from "axios";
import {
	ArrowRight,
	AtSign,
	BadgeCheck,
	Building2,
	CalendarDays,
	Check,
	CheckCircle2,
	ChevronsUpDown,
	Eye,
	EyeOff,
	FileText,
	Globe,
	IdCard,
	ImagePlus,
	Loader2,
	Lock,
	type LucideIcon,
	Mail,
	MapPin,
	Phone,
	Search,
	UserPlus,
	UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SignupAcknowledgements } from "@/components/auth/signup-acknowledgements";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	toFieldErrors,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	fetchSignupPackages,
	type SignupPackageOption,
} from "@/constants/signup-packages";
import {
	type SignupAccountType,
	signupAccountTypes,
} from "@/constants/signup-types";
import { registerUser } from "@/lib/auth/register-api";
import { createSignupSchema } from "@/lib/auth/register-schemas";
import {
	DEFAULT_COUNTRY_CODE,
	listCities,
	listStates,
} from "@/lib/geo/country-state-city";
import { ageFromDob, dobFromNric, genderFromNric } from "@/lib/ic-identity";
import { useLandingLocale } from "@/lib/landing-i18n";
import { cn } from "@/lib/utils";

/**
 * The wizard's steps, in page order, and the fields each one owns.
 *
 * Doneness is NOT a second copy of the validation rules — the live zod schema
 * is parsed and its issue paths are bucketed through this table, so a step
 * turns gold exactly when the form itself would stop complaining about it.
 * Add a field to the form and it must be listed here, or its step reports
 * done while the field is still empty.
 */
const SIGNUP_STEPS = [
	{ id: "account-type", section: "accountType", fields: ["accountType"] },
	{
		id: "company",
		section: "companyInfo",
		fields: [
			"companyName",
			"companyRegistrationOld",
			"companyRegistrationNew",
			"businessLicense",
			"addressLine1",
			"addressLine2",
			"city",
			"postcode",
			"stateCode",
			"countryCode",
		],
	},
	{
		id: "contact",
		section: "contactInfo",
		fields: [
			"personInCharge",
			"idType",
			"idNo",
			"gender",
			"dob",
			"nationality",
			"phoneNum",
			"email",
		],
	},
	{
		id: "login",
		section: "loginCredentials",
		fields: ["loginEmail", "password", "confirmPassword"],
	},
	{ id: "package", section: "packageEnrollment", fields: ["packageId"] },
	{ id: "branding", section: "branding", fields: ["logoFile"] },
	{
		id: "acknowledgements",
		section: "acknowledgements",
		fields: [
			"ackPersonalInfo",
			"ackDeclarationOfTruth",
			"ackInformationSharing",
			"acceptTerms",
		],
	},
] as const;

/**
 * A sticky spine beside the form on wide screens: one node per step, gold and
 * ticked once that step validates, so the visitor can see how much of a long
 * form is actually behind them. Hidden below `2xl`, where there is no room
 * beside the form without narrowing it, and the section headings are the
 * only structure needed.
 */
function SignupProgressRail({
	copy,
	schema,
	values,
}: {
	copy: SignupCopy;
	schema: ReturnType<typeof createSignupSchema>;
	values: Record<string, unknown>;
}) {
	const failed = useMemo(() => {
		const result = schema.safeParse(values);
		const paths = result.success
			? new Set<string>()
			: new Set(result.error.issues.map((issue) => String(issue.path[0])));
		/*
		 * The passwords-match rule is an OBJECT-level refinement, and zod skips
		 * those once any field inside has already failed. Without this the login
		 * step would tick green on two mismatched passwords whenever something
		 * else on the form was also incomplete.
		 */
		if (values.password !== values.confirmPassword)
			paths.add("confirmPassword");
		return paths;
	}, [schema, values]);

	const completed = SIGNUP_STEPS.map((step) =>
		step.fields.every((name) => !failed.has(name)),
	);
	const doneCount = completed.filter(Boolean).length;
	/* The first unfinished step is where the visitor still has work to do. */
	const activeIndex = completed.indexOf(false);

	return (
		<aside
			className="signup-progress hidden 2xl:block"
			aria-label={copy.progress.label}
		>
			<div className="signup-progress-head">
				<span className="signup-progress-title">{copy.progress.label}</span>
				<span className="signup-progress-count">
					{doneCount}
					<span>/{SIGNUP_STEPS.length}</span>
				</span>
			</div>

			<ol className="signup-progress-list">
				{SIGNUP_STEPS.map((step, index) => (
					<li
						key={step.id}
						className={cn(
							"signup-progress-step",
							completed[index] && "is-done",
							index === activeIndex && "is-active",
						)}
					>
						<a
							href={`#signup-step-${step.id}`}
							className="signup-progress-link"
							aria-current={index === activeIndex ? "step" : undefined}
						>
							<span className="signup-progress-node" aria-hidden="true">
								{completed[index] ? (
									<Check className="h-3.5 w-3.5" strokeWidth={3} />
								) : (
									index + 1
								)}
							</span>
							<span className="signup-progress-label">
								{copy.sections[step.section]}
							</span>
						</a>
					</li>
				))}
			</ol>
		</aside>
	);
}

type SignupCopy = ReturnType<typeof useLandingLocale>["t"]["signup"];

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="signup-section-title login-field-label border-b border-royal-gold/20 pb-2 uppercase text-foreground/90">
			{children}
		</h2>
	);
}

function firstFieldErrorMessage(errors: unknown[]): string | undefined {
	const items = toFieldErrors(errors);
	for (const item of items) {
		const message = item?.message?.trim();
		if (message) return message;
	}
	return undefined;
}

function RequiredMark() {
	return (
		<span className="ml-0.5 text-destructive" aria-hidden>
			*
		</span>
	);
}

export function SignupForm() {
	const navigate = useNavigate();
	const { t } = useLandingLocale();
	const copy = t.signup;
	const fields = copy.fields;
	const signupSchema = useMemo(
		() => createSignupSchema(copy.validation),
		[copy.validation],
	);
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [logoPreview, setLogoPreview] = useState<string | null>(null);
	const [successOpen, setSuccessOpen] = useState(false);
	const [registeredAs, setRegisteredAs] = useState<SignupAccountType>("outlet");
	const [sameAsCompanyEmail, setSameAsCompanyEmail] = useState(false);
	const [accountType, setAccountType] = useState<SignupAccountType>("outlet");
	const [packages, setPackages] = useState<SignupPackageOption[]>([]);
	const [packagesLoading, setPackagesLoading] = useState(true);
	const [packagesError, setPackagesError] = useState<string | null>(null);
	const [packagesTick, setPackagesTick] = useState(0);

	const goToLogin = () => {
		setSuccessOpen(false);
		void navigate({ to: "/login" });
	};

	const form = useForm({
		defaultValues: {
			accountType: "outlet" as SignupAccountType,
			companyName: "",
			companyRegistrationOld: "",
			companyRegistrationNew: "",
			businessLicense: "",
			addressLine1: "",
			addressLine2: "",
			city: "",
			postcode: "",
			stateCode: "",
			countryCode: DEFAULT_COUNTRY_CODE,
			personInCharge: "",
			// NRIC is the default because almost every owner holds one, and it is the
			// branch that fills in the birth date, age and gender by itself.
			idType: "NRIC",
			idNo: "",
			gender: "",
			dob: "",
			nationality: "",
			phoneNum: "",
			email: "",
			loginEmail: "",
			password: "",
			confirmPassword: "",
			packageId: "",
			logoFile: null as File | null,
			ackPersonalInfo: false,
			ackDeclarationOfTruth: false,
			ackInformationSharing: false,
			acceptTerms: false,
		},
		validators: {
			onChange: signupSchema,
			onSubmit: signupSchema,
		},
		onSubmitInvalid: ({ formApi }) => {
			const fieldMeta = formApi.state.fieldMeta;
			for (const meta of Object.values(fieldMeta)) {
				const message = firstFieldErrorMessage(meta?.errors ?? []);
				if (message) {
					toast.error(message);
					return;
				}
			}
			toast.error(copy.errors.unexpected);
		},
		onSubmit: async ({ value }) => {
			if (!value.logoFile) {
				toast.error(copy.validation.logoRequired);
				return;
			}
			try {
				const result = await registerUser({
					...value,
					logoFile: value.logoFile,
				});
				if (!result.success) {
					toast.error(result.message || copy.errors.registrationFailed);
					return;
				}
				// The account exists either way — still show the success dialog.
				// But the logo is a required field whose upload fails open on the
				// server, so say so rather than let them find a blank Settings
				// header later and assume they never uploaded one.
				if (result.logoUploadFailed) {
					toast.error(copy.success.logoUploadFailed);
				}
				setRegisteredAs(value.accountType);
				setSuccessOpen(true);
			} catch (err) {
				if (axios.isAxiosError(err)) {
					const status = err.response?.status;
					// 5xx / no response — never surface raw server/SQL text.
					if (!status || status >= 500) {
						toast.error(copy.errors.internalServerError);
						return;
					}
					toast.error(
						(err.response?.data as { message?: string })?.message ||
							copy.errors.registrationFailed,
					);
					return;
				}
				toast.error(copy.errors.unexpected);
			}
		},
	});

	// Client-only load from `main.subscription` (avoid SSR empty dehydrate).
	// biome-ignore lint/correctness/useExhaustiveDependencies(packagesTick): the retry counter is the re-run TRIGGER of this fetch, not a value read inside it — remove it and the "try again" button stops reloading the package list.
	// biome-ignore lint/correctness/useExhaustiveDependencies(form.getFieldValue): the tanstack form instance is stable for the life of the component; listing its bound methods would re-request the package list on any render that hands back a new form object.
	// biome-ignore lint/correctness/useExhaustiveDependencies(form.setFieldValue): same stable form instance — see above; this effect must fire on account-type change and manual retry only.
	// biome-ignore lint/correctness/useExhaustiveDependencies(copy.packages.loadFailed): a last-resort error string read only in the catch; depending on it would re-request the package list on every locale switch.
	useEffect(() => {
		let cancelled = false;
		setPackagesLoading(true);
		setPackagesError(null);
		fetchSignupPackages(accountType)
			.then((list) => {
				if (cancelled) return;
				setPackages(list);
				const current = form.getFieldValue("packageId");
				const stillValid = list.some((pkg) => pkg.id === current);
				form.setFieldValue(
					"packageId",
					stillValid ? current : (list[0]?.id ?? ""),
				);
			})
			.catch((err) => {
				if (cancelled) return;
				setPackages([]);
				form.setFieldValue("packageId", "");
				const message = axios.isAxiosError(err)
					? ((err.response?.data as { message?: string })?.message ??
						err.message)
					: err instanceof Error
						? err.message
						: copy.packages.loadFailed;
				setPackagesError(message);
			})
			.finally(() => {
				if (!cancelled) setPackagesLoading(false);
			});
		return () => {
			cancelled = true;
		};
		// form is a stable tanstack form API; packagesTick forces manual retry.
		// eslint-disable-next-line react-hooks/exhaustive-deps -- reload on account / retry only
	}, [accountType, packagesTick]);

	return (
		<>
			{/* Form column plus the sticky step spine; the spine hides itself
			    below `2xl` — under that the rail would have to eat into the
			    form's own 42rem measure to fit. */}
			<div className="flex items-start gap-8 2xl:gap-12">
				<form
					id="signup-form"
					className="signup-form min-w-0 flex-1 2xl:max-w-2xl"
					aria-label={copy.heading.line2}
					noValidate
					onSubmit={(e) => {
						e.preventDefault();
						form.handleSubmit();
					}}
				>
					<section
						id="signup-step-account-type"
						className="scroll-mt-28 mb-10 space-y-6"
					>
						<form.Field name="accountType">
							{(field) => (
								<Field className="mb-8">
									<SectionTitle>{copy.sections.accountType}</SectionTitle>
									<div
										className="mt-4 grid grid-cols-2 gap-3"
										role="radiogroup"
										aria-label={copy.sections.accountType}
									>
										{signupAccountTypes.map((type) => {
											const Icon = type.icon;
											const selected = field.state.value === type.key;
											const accountCopy = copy.accountTypes[type.key];

											return (
												// biome-ignore lint/a11y/useSemanticElements: role="radio" on a <button> inside the role="radiogroup" above is the WAI-ARIA composite pattern; a real <input type="radio"> would have to be sr-only behind this card, which hides the focus ring and changes the keyboard flow of the live signup form
												<button
													key={type.key}
													type="button"
													role="radio"
													aria-checked={selected}
													disabled={form.state.isSubmitting}
													onClick={() => {
														field.handleChange(type.key);
														setAccountType(type.key);
														form.setFieldValue("packageId", "");
													}}
													className={cn(
														"flex flex-col items-center gap-2 rounded-xl border px-4 py-5 text-center transition-all",
														selected
															? "border-royal-gold/60 bg-royal-gold/10 shadow-glow-gold"
															: "border-royal-gold/20 bg-background/40 hover:border-royal-gold/35",
													)}
												>
													{/* A centred tile, matching every other icon on the
											    signed-out surface. The whole card stacks centred —
											    two choices side by side read as a pair of buttons,
											    not as two paragraphs. */}
													<span
														className={cn(
															"grid h-12 w-12 place-items-center rounded-xl border transition-colors",
															selected
																? "border-royal-gold/45 bg-royal-gold/15"
																: "border-royal-gold/20 bg-white/[0.035]",
														)}
													>
														<Icon
															className={cn(
																"h-7 w-7",
																selected
																	? "text-gold-bright"
																	: "text-muted-foreground",
															)}
														/>
													</span>
													<span className="signup-account-title font-semibold text-foreground">
														{accountCopy.title}
													</span>
													<span className="signup-account-desc text-muted-foreground">
														{accountCopy.description}
													</span>
												</button>
											);
										})}
									</div>

									{/*
									 * THE THIRD DOOR, and deliberately NOT a third tile.
									 *
									 * The two above register an ORGANISATION — they carry a
									 * company, an SSM number and a subscription. A person
									 * joining a team that already exists answers none of that,
									 * so putting them side by side would offer three things
									 * that look alike and behave nothing alike. A link says
									 * "you are on the wrong page" without pretending to be a
									 * fourth of the same kind.
									 */}
									{/*
									 * ⚠️ A CALLOUT, because a one-line link under two big tiles
									 * loses every time.
									 *
									 * These read as three ways to sign up and they are not: the
									 * tiles REGISTER A COMPANY — SSM number, subscription, billing
									 * anchor — while this adds a PERSON to a company that already
									 * exists. Somebody joining their employer's team picks Outlet,
									 * is asked for a business licence, and either abandons the
									 * form or invents one. Both readers are named here so each
									 * can rule themselves out.
									 *
									 * Below the tiles, not above: the two account types are what
									 * most visitors come for, and this is the exception that
									 * catches the rest.
									 */}
									<div className="mt-5 rounded-xl border border-royal-gold/25 bg-background/50 p-4">
										<p className="text-xs leading-relaxed text-muted-foreground">
											{copy.memberSignup.linkOwnerHint}
										</p>
										<div className="mt-3 flex items-start gap-3 border-t border-royal-gold/15 pt-3">
											<span className="grid size-9 shrink-0 place-items-center rounded-lg border border-royal-gold/25 bg-royal-gold/10">
												<UserPlus className="size-4 text-gold-bright" />
											</span>
											<div className="min-w-0">
												<p className="font-semibold text-foreground">
													{copy.memberSignup.linkPrompt}
												</p>
												<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
													{copy.memberSignup.linkBody}
												</p>
												<Link
													to="/signup-member"
													className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-royal-gold/40 bg-royal-gold/10 px-3 py-2 font-semibold text-gold-bright transition-colors hover:border-royal-gold/60 hover:bg-royal-gold/15"
												>
													{copy.memberSignup.linkAction}
													<ArrowRight className="size-4" />
												</Link>
											</div>
										</div>
									</div>
								</Field>
							)}
						</form.Field>
					</section>

					<FieldGroup className="gap-10">
						<section
							id="signup-step-company"
							className="scroll-mt-28 space-y-6"
						>
							<SectionTitle>{copy.sections.companyInfo}</SectionTitle>

							<form.Field name="companyName">
								{(field) => (
									<SignupTextField
										field={field}
										label={fields.companyName.label}
										icon={Building2}
										placeholder={fields.companyName.placeholder}
										autoComplete="organization"
										isSubmitting={form.state.isSubmitting}
									/>
								)}
							</form.Field>

							<div className="grid gap-6 sm:grid-cols-2">
								<form.Field name="companyRegistrationOld">
									{(field) => (
										<SignupTextField
											field={field}
											label={fields.companyRegistrationOld.label}
											icon={BadgeCheck}
											placeholder={fields.companyRegistrationOld.placeholder}
											required={false}
											isSubmitting={form.state.isSubmitting}
										/>
									)}
								</form.Field>

								<form.Field name="companyRegistrationNew">
									{(field) => (
										<SignupTextField
											field={field}
											label={fields.companyRegistrationNew.label}
											icon={BadgeCheck}
											placeholder={fields.companyRegistrationNew.placeholder}
											isSubmitting={form.state.isSubmitting}
										/>
									)}
								</form.Field>
							</div>

							{/* Its own row under the two registration numbers, because it is a
							    third document and not a variant of either: SSM registers the
							    company, the licence permits it to trade. */}
							<form.Field name="businessLicense">
								{(field) => (
									<SignupTextField
										field={field}
										label={fields.businessLicense.label}
										icon={FileText}
										placeholder={fields.businessLicense.placeholder}
										isSubmitting={form.state.isSubmitting}
									/>
								)}
							</form.Field>

							<form.Field name="addressLine1">
								{(field) => (
									<SignupTextField
										field={field}
										label={fields.addressLine1.label}
										icon={MapPin}
										placeholder={fields.addressLine1.placeholder}
										autoComplete="address-line1"
										isSubmitting={form.state.isSubmitting}
									/>
								)}
							</form.Field>

							<form.Field name="addressLine2">
								{(field) => (
									<SignupTextField
										field={field}
										label={fields.addressLine2.label}
										icon={MapPin}
										placeholder={fields.addressLine2.placeholder}
										autoComplete="address-line2"
										required={false}
										isSubmitting={form.state.isSubmitting}
									/>
								)}
							</form.Field>

							<div className="grid gap-6 sm:grid-cols-2">
								<form.Field name="city">
									{(field) => (
										<form.Subscribe
											selector={(state) => state.values.stateCode}
										>
											{(stateCode) => {
												const cities = listCities(
													DEFAULT_COUNTRY_CODE,
													stateCode,
												);
												if (cities.length === 0) {
													return (
														<SignupTextField
															field={field}
															label={fields.city.label}
															icon={MapPin}
															placeholder={
																stateCode
																	? fields.city.placeholder
																	: fields.city.chooseStateFirst
															}
															autoComplete="address-level2"
															isSubmitting={
																form.state.isSubmitting || !stateCode
															}
														/>
													);
												}
												return (
													<SignupGeoSelect
														label={fields.city.label}
														required
														placeholder={
															stateCode
																? fields.city.placeholder
																: fields.city.chooseStateFirst
														}
														searchPlaceholder={copy.searchPlaceholder}
														noResults={copy.noResults}
														value={field.state.value}
														disabled={form.state.isSubmitting || !stateCode}
														options={cities.map((c) => ({
															value: c.name,
															label: c.name,
														}))}
														onChange={field.handleChange}
													/>
												);
											}}
										</form.Subscribe>
									)}
								</form.Field>

								<form.Field name="postcode">
									{(field) => (
										<SignupTextField
											field={field}
											label={fields.postcode.label}
											icon={MapPin}
											placeholder={fields.postcode.placeholder}
											autoComplete="postal-code"
											isSubmitting={form.state.isSubmitting}
										/>
									)}
								</form.Field>
							</div>

							<div className="grid gap-6 sm:grid-cols-2">
								<Field>
									<FieldLabel className="login-field-label">
										{fields.country.label}
									</FieldLabel>
									<div className="login-input-group flex h-11 w-full items-center rounded-md border border-royal-gold/20 bg-background/40 px-3 text-base leading-normal text-foreground">
										{fields.country.value}
									</div>
									<FieldDescription className="signup-helper text-muted-foreground">
										{fields.country.notice}
									</FieldDescription>
								</Field>

								<form.Field name="stateCode">
									{(field) => {
										const states = listStates(DEFAULT_COUNTRY_CODE);
										return (
											<SignupGeoSelect
												label={fields.state.label}
												required
												placeholder={fields.state.placeholder}
												searchPlaceholder={copy.searchPlaceholder}
												noResults={copy.noResults}
												value={field.state.value}
												disabled={form.state.isSubmitting}
												options={states.map((s) => ({
													value: s.isoCode,
													label: s.name,
												}))}
												onChange={(next) => {
													field.handleChange(next);
													form.setFieldValue("city", "");
												}}
											/>
										);
									}}
								</form.Field>
							</div>
						</section>

						<section
							id="signup-step-contact"
							className="scroll-mt-28 space-y-6"
						>
							<SectionTitle>{copy.sections.contactInfo}</SectionTitle>

							<form.Field name="personInCharge">
								{(field) => (
									<SignupTextField
										field={field}
										label={fields.personInCharge.label}
										icon={UserRound}
										placeholder={fields.personInCharge.placeholder}
										description={fields.personInCharge.hint}
										autoComplete="name"
										isSubmitting={form.state.isSubmitting}
									/>
								)}
							</form.Field>

							{/*
							 * IDENTITY. Until 9 Sep 2026 organisation sign-up asked for a
							 * name, a phone and an email — which is why every owner’s IC,
							 * birth date and gender read as blank on the admin screens while
							 * PR sign-up had collected all three since day one.
							 */}
							<form.Field name="idType">
								{(field) => (
									<SignupChoiceField
										name={field.name}
										label={fields.idType.label}
										value={field.state.value}
										onChange={(next) => field.handleChange(next)}
										disabled={form.state.isSubmitting}
										options={[
											{ value: "NRIC", label: fields.idType.nric },
											{ value: "Passport", label: fields.idType.passport },
										]}
									/>
								)}
							</form.Field>

							<form.Subscribe selector={(state) => state.values.idType}>
								{(idType) => (
									<>
										<form.Field name="idNo">
											{(field) => (
												<SignupTextField
													field={field}
													label={fields.idNo.label}
													icon={IdCard}
													placeholder={
														idType === "NRIC"
															? fields.idNo.placeholderNric
															: fields.idNo.placeholderPassport
													}
													/*
													 * Read the IC back to its owner AS THEY TYPE. The
													 * server derives the same two values and stores its
													 * own answer, so this is not the source of anything
													 * — it is the only moment the one person who knows
													 * the date is looking at what the number says.
													 */
													description={
														idType === "NRIC"
															? (icReadback(
																	field.state.value,
																	fields.icDerived,
																) ?? undefined)
															: undefined
													}
													isSubmitting={form.state.isSubmitting}
												/>
											)}
										</form.Field>

										{/*
										 * The IC cross-check lives HERE and not only in the schema.
										 * A zod `.superRefine` on the object does not run until
										 * every field in it parses, so on a form this long the
										 * mismatch would stay silent until the very last field was
										 * filled — which is the wrong moment to learn that the id
										 * number was mistyped. The schema keeps its copy so a
										 * submit cannot slip past; this one is what the person sees.
										 */}
										<form.Field
											name="gender"
											validators={{
												onChangeListenTo: ["idNo", "idType"],
												onChange: ({ value, fieldApi }) => {
													if (!value) return undefined;
													if (
														fieldApi.form.getFieldValue("idType") !== "NRIC"
													) {
														return undefined;
													}
													const fromIc = genderFromNric(
														fieldApi.form.getFieldValue("idNo"),
													);
													return fromIc && fromIc !== value
														? copy.validation.genderMismatch
														: undefined;
												},
											}}
										>
											{(field) => (
												<SignupChoiceField
													name={field.name}
													label={fields.gender.label}
													value={field.state.value}
													onChange={(next) => field.handleChange(next)}
													disabled={form.state.isSubmitting}
													hint={
														idType === "NRIC" ? fields.gender.hint : undefined
													}
													invalid={
														field.state.meta.isDirty &&
														!field.state.meta.isValid
													}
													/* Guarded on `isDirty`, exactly like the text fields:
													   an untouched form was greeting every visitor with
													   “Gender is required” before they had typed anything. */
													error={
														field.state.meta.isDirty &&
														!field.state.meta.isValid
															? field.state.meta.errors
																	.map((e) =>
																		typeof e === "string"
																			? e
																			: (e?.message ?? ""),
																	)
																	.filter(Boolean)[0]
															: undefined
													}
													options={[
														{ value: "male", label: fields.gender.male },
														{ value: "female", label: fields.gender.female },
													]}
												/>
											)}
										</form.Field>

										{/* A passport carries neither a birth date nor a gender, so
										    the two facts the NRIC would have supplied are asked for
										    outright — and only then. */}
										{idType !== "NRIC" && (
											<>
												<form.Field name="dob">
													{(field) => (
														<SignupTextField
															field={field}
															label={fields.dob.label}
															icon={CalendarDays}
															placeholder={fields.dob.placeholder}
															isSubmitting={form.state.isSubmitting}
														/>
													)}
												</form.Field>
												<form.Field name="nationality">
													{(field) => (
														<SignupTextField
															field={field}
															label={fields.nationality.label}
															icon={Globe}
															placeholder={fields.nationality.placeholder}
															isSubmitting={form.state.isSubmitting}
														/>
													)}
												</form.Field>
											</>
										)}
									</>
								)}
							</form.Subscribe>

							<form.Field name="phoneNum">
								{(field) => (
									<SignupPhoneField
										field={field}
										label={fields.phoneNum.label}
										placeholder={fields.phoneNum.placeholder}
										dialDisplay={fields.phoneNum.dialDisplay}
										dialNotice={fields.phoneNum.dialNotice}
										isSubmitting={form.state.isSubmitting}
									/>
								)}
							</form.Field>

							<form.Field name="email">
								{(field) => (
									<SignupTextField
										field={field}
										label={fields.email.label}
										icon={Mail}
										placeholder={fields.email.placeholder}
										type="email"
										autoComplete="email"
										isSubmitting={form.state.isSubmitting}
										description={fields.email.description}
										onValueChange={(next) => {
											if (sameAsCompanyEmail) {
												form.setFieldValue("loginEmail", next);
											}
										}}
									/>
								)}
							</form.Field>
						</section>

						<section id="signup-step-login" className="scroll-mt-28 space-y-6">
							<SectionTitle>{copy.sections.loginCredentials}</SectionTitle>

							<form.Field name="loginEmail">
								{(field) => (
									<div className="space-y-3">
										<SignupTextField
											field={field}
											label={fields.loginEmail.label}
											icon={AtSign}
											placeholder={fields.loginEmail.placeholder}
											type="email"
											autoComplete="username"
											isSubmitting={
												form.state.isSubmitting || sameAsCompanyEmail
											}
											description={fields.loginEmail.description}
										/>
										<label className="flex cursor-pointer items-start gap-3 text-foreground">
											<input
												type="checkbox"
												checked={sameAsCompanyEmail}
												disabled={form.state.isSubmitting}
												onChange={(event) => {
													const checked = event.target.checked;
													setSameAsCompanyEmail(checked);
													if (checked) {
														form.setFieldValue(
															"loginEmail",
															form.getFieldValue("email"),
														);
													}
												}}
												className="signup-ack-checkbox mt-0.5 size-5 shrink-0 rounded border border-royal-gold/40 bg-background accent-[var(--royal-gold)]"
											/>
											<span className="signup-ack-label text-sm font-medium leading-snug">
												{fields.loginEmail.sameAsCompanyEmail}
											</span>
										</label>
									</div>
								)}
							</form.Field>

							<form.Field
								name="password"
								validators={{
									// Re-run when confirm changes so a fixed match clears the error.
									onChangeListenTo: ["confirmPassword"],
									onChange: ({ value }) => {
										const v = copy.validation;
										if (!value) return { message: v.passwordRequired };
										if (value.length < 8) return { message: v.passwordMin };
										return undefined;
									},
								}}
							>
								{(field) => (
									<SignupPasswordField
										field={field}
										label={fields.password.label}
										placeholder={fields.password.placeholder}
										showPassword={showPassword}
										onToggle={() => setShowPassword(!showPassword)}
										isSubmitting={form.state.isSubmitting}
									/>
								)}
							</form.Field>

							<form.Field
								name="confirmPassword"
								validators={{
									// Live match check whenever either password field changes.
									onChangeListenTo: ["password"],
									onChange: ({ value, fieldApi }) => {
										const v = copy.validation;
										const password = fieldApi.form.getFieldValue("password");
										if (!value) return { message: v.confirmPasswordRequired };
										if (value !== password) {
											return { message: v.passwordsMismatch };
										}
										return undefined;
									},
								}}
							>
								{(field) => (
									<SignupPasswordField
										field={field}
										label={fields.confirmPassword.label}
										placeholder={fields.confirmPassword.placeholder}
										showPassword={showConfirmPassword}
										onToggle={() =>
											setShowConfirmPassword(!showConfirmPassword)
										}
										isSubmitting={form.state.isSubmitting}
									/>
								)}
							</form.Field>
						</section>

						<section
							id="signup-step-package"
							className="scroll-mt-28 space-y-6"
						>
							<SectionTitle>{copy.sections.packageEnrollment}</SectionTitle>

							<form.Field name="packageId">
								{(field) => {
									const isInvalid =
										field.state.meta.isDirty && !field.state.meta.isValid;
									const selected = packages.find(
										(pkg) => pkg.id === field.state.value,
									);
									const empty =
										!packagesLoading && !packagesError && packages.length === 0;

									return (
										<Field data-invalid={isInvalid}>
											<FieldLabel
												htmlFor={field.name}
												className="login-field-label"
											>
												{fields.package.label}
												<RequiredMark />
											</FieldLabel>
											<Select
												value={field.state.value || undefined}
												onValueChange={field.handleChange}
												disabled={
													form.state.isSubmitting ||
													packagesLoading ||
													packages.length === 0
												}
											>
												<SelectTrigger
													id={field.name}
													className="login-input-group h-auto w-full border-royal-gold/20 bg-background/60 py-3"
												>
													<SelectValue
														placeholder={
															packagesLoading
																? copy.packages.loadingShort
																: fields.package.placeholder
														}
													/>
												</SelectTrigger>
												<SelectContent className="signup-package-select-content">
													{packages.map((pkg) => (
														<SelectItem
															key={pkg.id}
															value={pkg.id}
															className="signup-package-item py-3 text-[1.5rem] leading-snug"
														>
															{pkg.name} · {pkg.capacity} · {pkg.priceLabel}
															{pkg.period}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{packagesLoading && (
												<FieldDescription className="signup-helper text-muted-foreground">
													{copy.packages.loadingLong}
												</FieldDescription>
											)}
											{packagesError && (
												<FieldDescription className="signup-helper flex flex-wrap items-center gap-2 text-destructive">
													<span>
														{copy.packages.loadFailed}: {packagesError}
													</span>
													<button
														type="button"
														className="underline underline-offset-2"
														onClick={() => setPackagesTick((n) => n + 1)}
													>
														Retry
													</button>
												</FieldDescription>
											)}
											{empty && (
												<FieldDescription className="signup-helper text-muted-foreground">
													No active plans for this account type in the database.
												</FieldDescription>
											)}
											{selected && !packagesLoading && (
												<FieldDescription className="signup-helper text-muted-foreground">
													{selected.detail}
												</FieldDescription>
											)}
										</Field>
									);
								}}
							</form.Field>
						</section>

						<section
							id="signup-step-branding"
							className="scroll-mt-28 space-y-6"
						>
							<SectionTitle>{copy.sections.branding}</SectionTitle>

							<form.Subscribe selector={(state) => state.values.accountType}>
								{(accountType) => {
									const logoLabel =
										accountType === "agency"
											? fields.logo.labelAgency
											: fields.logo.labelOutlet;
									const logoUploadTitle =
										accountType === "agency"
											? fields.logo.uploadTitleAgency
											: fields.logo.uploadTitleOutlet;

									return (
										<form.Field name="logoFile">
											{(field) => {
												const isInvalid =
													field.state.meta.isDirty && !field.state.meta.isValid;

												const clearLogo = () => {
													field.handleChange(null);
													if (logoPreview) URL.revokeObjectURL(logoPreview);
													setLogoPreview(null);
												};

												const onPickFile = (
													event: React.ChangeEvent<HTMLInputElement>,
												) => {
													const file = event.target.files?.[0] ?? null;
													field.handleChange(file);
													if (logoPreview) URL.revokeObjectURL(logoPreview);
													setLogoPreview(
														file ? URL.createObjectURL(file) : null,
													);
													// Allow re-selecting the same file after remove.
													event.target.value = "";
												};

												return (
													<Field data-invalid={isInvalid}>
														<FieldLabel
															htmlFor="signup-logo"
															className="login-field-label"
														>
															{logoLabel}
															<RequiredMark />
														</FieldLabel>

														{logoPreview ? (
															<div className="signup-logo-showcase relative overflow-hidden rounded-2xl border border-royal-gold/25 bg-background/35">
																<div className="flex flex-col items-center gap-5 px-6 py-8 sm:flex-row sm:items-center sm:gap-8 sm:px-8 sm:py-7">
																	<div className="relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-royal-gold/20 bg-[#0c0a12] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] sm:size-32">
																		<img
																			src={logoPreview}
																			alt=""
																			className="max-h-full max-w-full object-contain p-3"
																		/>
																	</div>
																	<div className="min-w-0 flex-1 text-center sm:text-left">
																		<p className="signup-upload-title font-medium text-foreground">
																			{logoUploadTitle}
																		</p>
																		<p className="signup-upload-hint mt-1 text-muted-foreground">
																			{fields.logo.uploadHint}
																		</p>
																		<div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
																			<label
																				htmlFor="signup-logo"
																				className={cn(
																					"inline-flex cursor-pointer items-center justify-center rounded-md border border-royal-gold/35 bg-royal-gold/10 px-3.5 py-2 text-sm font-medium text-gold-bright transition-colors hover:border-royal-gold/55 hover:bg-royal-gold/15",
																					form.state.isSubmitting &&
																						"pointer-events-none opacity-60",
																				)}
																			>
																				Change
																			</label>
																			<Button
																				type="button"
																				variant="ghost"
																				size="sm"
																				className="text-muted-foreground hover:text-destructive"
																				disabled={form.state.isSubmitting}
																				onClick={clearLogo}
																			>
																				Remove
																			</Button>
																		</div>
																	</div>
																</div>
																<input
																	id="signup-logo"
																	type="file"
																	accept="image/png,image/jpeg,image/webp,image/gif"
																	className="sr-only"
																	disabled={form.state.isSubmitting}
																	onChange={onPickFile}
																/>
															</div>
														) : (
															<label
																htmlFor="signup-logo"
																className={cn(
																	"flex min-h-44 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-royal-gold/30 bg-background/40 px-6 py-10 text-center transition-colors hover:border-royal-gold/50 hover:bg-background/55",
																	form.state.isSubmitting &&
																		"pointer-events-none opacity-60",
																)}
															>
																<ImagePlus className="h-10 w-10 text-royal-gold" />
																<span className="signup-upload-title font-medium text-foreground">
																	{logoUploadTitle}
																</span>
																<span className="signup-upload-hint text-muted-foreground">
																	{fields.logo.uploadHint}
																</span>
																<input
																	id="signup-logo"
																	type="file"
																	accept="image/png,image/jpeg,image/webp,image/gif"
																	className="sr-only"
																	disabled={form.state.isSubmitting}
																	onChange={onPickFile}
																/>
															</label>
														)}
													</Field>
												);
											}}
										</form.Field>
									);
								}}
							</form.Subscribe>
						</section>

						<div id="signup-step-acknowledgements" className="scroll-mt-28">
							<form.Field name="ackPersonalInfo">
								{(ackPersonalInfo) => (
									<form.Field name="ackDeclarationOfTruth">
										{(ackDeclarationOfTruth) => (
											<form.Field name="ackInformationSharing">
												{(ackInformationSharing) => (
													<form.Field name="acceptTerms">
														{(acceptTerms) => (
															<SignupAcknowledgements
																isSubmitting={form.state.isSubmitting}
																fields={{
																	ackPersonalInfo,
																	ackDeclarationOfTruth,
																	ackInformationSharing,
																	acceptTerms,
																}}
															/>
														)}
													</form.Field>
												)}
											</form.Field>
										)}
									</form.Field>
								)}
							</form.Field>
						</div>
					</FieldGroup>

					<form.Subscribe selector={(state) => state.isSubmitting}>
						{(isSubmitting) => (
							<Button
								type="submit"
								form="signup-form"
								className="login-btn mt-8 w-full bg-(image:--gradient-royal) font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
								disabled={isSubmitting}
								aria-busy={isSubmitting}
							>
								{isSubmitting ? (
									<>
										<Loader2 className="h-6 w-6 animate-spin" />
										{copy.buttons.creating}
									</>
								) : (
									copy.buttons.createAccount
								)}
							</Button>
						)}
					</form.Subscribe>

					<p className="login-support mt-8 text-center text-muted-foreground">
						{copy.footer.alreadyHaveAccount}{" "}
						<Link
							to="/login"
							className="text-gold-bright underline underline-offset-4 hover:text-gold"
						>
							{copy.footer.signIn}
						</Link>
					</p>
				</form>

				<form.Subscribe selector={(state) => state.values}>
					{(values) => (
						<SignupProgressRail
							copy={copy}
							schema={signupSchema}
							values={values}
						/>
					)}
				</form.Subscribe>
			</div>

			<Dialog
				open={successOpen}
				onOpenChange={(open) => {
					if (!open) goToLogin();
				}}
			>
				<DialogContent
					showCloseButton={false}
					className="signup-success-dialog w-full max-w-[calc(100%-2rem)] border-royal-gold/25 bg-card p-8 sm:max-w-lg sm:p-10"
					onEscapeKeyDown={(e) => {
						e.preventDefault();
						goToLogin();
					}}
					onPointerDownOutside={(e) => {
						e.preventDefault();
						goToLogin();
					}}
				>
					<DialogHeader className="items-center text-center sm:items-center sm:text-center">
						<CheckCircle2
							className="mb-2 h-14 w-14 text-royal-gold"
							strokeWidth={1.75}
							aria-hidden
						/>
						<DialogTitle className="text-[2rem] leading-tight font-bold text-foreground">
							{copy.success.title}
						</DialogTitle>
						<DialogDescription className="pt-3 text-[1.35rem] leading-relaxed text-muted-foreground">
							{registeredAs === "agency"
								? copy.success.bodyAgency
								: copy.success.bodyOutlet}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter
						showCloseButton={false}
						className="mt-2 sm:justify-center"
					>
						<Button
							type="button"
							className="signup-success-btn h-11 w-full rounded-md bg-(image:--gradient-royal) px-8 text-base font-bold text-[#1a1726] hover:opacity-95 sm:w-auto sm:min-w-44"
							onClick={goToLogin}
						>
							{copy.success.continueToLogin}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

interface SignupTextFieldProps {
	field: {
		name: string;
		state: {
			value: string;
			meta: { isDirty: boolean; isValid: boolean; errors: unknown[] };
		};
		handleBlur: () => void;
		handleChange: (value: string) => void;
	};
	label: string;
	icon: LucideIcon;
	placeholder: string;
	type?: string;
	autoComplete?: string;
	isSubmitting: boolean;
	description?: string;
	required?: boolean;
	onValueChange?: (value: string) => void;
}

/**
 * What the IC says, as one line under the number field: `From your IC: born
 * 1995-03-12 · age 31`. Null while the number is not yet a whole NRIC, so the
 * line appears when it becomes true rather than flickering a wrong date on the
 * way there.
 */
function icReadback(idNo: string, template: string): string | null {
	const dob = dobFromNric(idNo);
	if (!dob) return null;
	const age = ageFromDob(dob);
	return fillTemplate(template, {
		date: dob,
		age: age == null ? "—" : String(age),
	});
}

/** `{name}` → value. The landing dictionary has no fill helper of its own. */
function fillTemplate(
	template: string,
	values: Record<string, string>,
): string {
	return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
		key in values ? values[key] : whole,
	);
}

/**
 * Two or three exclusive pills — ID type, gender. A radiogroup of buttons
 * rather than a <select>: both choices are always visible, which is what makes
 * a wrong one obvious, and it matches the account-type cards at the top of the
 * same form.
 */
function SignupChoiceField({
	name,
	label,
	value,
	onChange,
	options,
	disabled,
	hint,
	invalid,
	error,
}: {
	name: string;
	label: string;
	value: string;
	onChange: (next: string) => void;
	options: { value: string; label: string }[];
	disabled?: boolean;
	hint?: string;
	invalid?: boolean;
	error?: string;
}) {
	return (
		<Field data-invalid={invalid}>
			<FieldLabel htmlFor={name} className="login-field-label">
				{label}
				<RequiredMark />
			</FieldLabel>
			<div
				id={name}
				role="radiogroup"
				aria-label={label}
				className="grid grid-cols-2 gap-3"
			>
				{options.map((option) => {
					const selected = value === option.value;
					return (
						// biome-ignore lint/a11y/useSemanticElements: role="radio" on a <button> inside role="radiogroup" is the WAI-ARIA composite pattern the account-type cards above already use
						<button
							key={option.value}
							type="button"
							role="radio"
							aria-checked={selected}
							disabled={disabled}
							onClick={() => onChange(option.value)}
							className={cn(
								"rounded-xl border px-4 py-3 text-center text-sm font-medium transition-all",
								selected
									? "border-royal-gold/60 bg-royal-gold/10 text-foreground shadow-glow-gold"
									: "border-royal-gold/20 bg-background/40 text-muted-foreground hover:border-royal-gold/35",
							)}
						>
							{option.label}
						</button>
					);
				})}
			</div>
			{(error ?? hint) && (
				<FieldDescription
					className={cn(
						"signup-helper",
						error ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{error ?? hint}
				</FieldDescription>
			)}
		</Field>
	);
}
function SignupTextField({
	field,
	label,
	icon: Icon,
	placeholder,
	type = "text",
	autoComplete,
	isSubmitting,
	description,
	required = true,
	onValueChange,
}: SignupTextFieldProps) {
	const isInvalid = field.state.meta.isDirty && !field.state.meta.isValid;

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={field.name} className="login-field-label">
				{label}
				{required ? <RequiredMark /> : null}
			</FieldLabel>
			<InputGroup className="login-input-group h-auto border-royal-gold/20 bg-background/60">
				<InputGroupAddon align="inline-start">
					<Icon
						className="size-5 text-royal-gold"
						strokeWidth={1.75}
						aria-hidden
					/>
				</InputGroupAddon>
				<InputGroupInput
					id={field.name}
					name={field.name}
					type={type}
					placeholder={placeholder}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => {
						field.handleChange(e.target.value);
						onValueChange?.(e.target.value);
					}}
					disabled={isSubmitting}
					aria-invalid={isInvalid}
					aria-required={required}
					autoComplete={autoComplete}
					className="login-input"
				/>
			</InputGroup>
			{description && (
				<FieldDescription className="signup-helper text-muted-foreground">
					{description}
				</FieldDescription>
			)}
		</Field>
	);
}

function SignupGeoSelect({
	label,
	placeholder,
	searchPlaceholder,
	noResults,
	value,
	options,
	disabled,
	required = false,
	onChange,
}: {
	label: string;
	placeholder: string;
	searchPlaceholder: string;
	noResults: string;
	value: string;
	options: Array<{ value: string; label: string }>;
	disabled?: boolean;
	required?: boolean;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const selectedLabel =
		options.find((option) => option.value === value)?.label ?? "";
	const needle = query.trim().toLowerCase();
	const filtered = needle
		? options.filter(
				(option) =>
					option.label.toLowerCase().includes(needle) ||
					option.value.toLowerCase().includes(needle),
			)
		: options;

	const pick = (next: string) => {
		onChange(next);
		setOpen(false);
		setQuery("");
	};

	return (
		<Field>
			<FieldLabel className="login-field-label">
				{label}
				{required ? <RequiredMark /> : null}
			</FieldLabel>
			<Popover
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setQuery("");
				}}
			>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						role="combobox"
						aria-expanded={open}
						disabled={disabled}
						className={cn(
							"login-input-group h-auto w-full justify-between border-royal-gold/20 bg-background/60 px-3 py-3 font-normal hover:bg-background/70",
							!selectedLabel && "text-muted-foreground",
						)}
					>
						<span className="truncate text-left text-[length:inherit]">
							{selectedLabel || placeholder}
						</span>
						<ChevronsUpDown
							className="ml-2 size-4 shrink-0 opacity-50"
							aria-hidden
						/>
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="w-[var(--radix-popover-trigger-width)] border-royal-gold/20 p-0"
					align="start"
					onOpenAutoFocus={(event) => event.preventDefault()}
				>
					<div className="border-b border-royal-gold/15 p-2">
						<div className="relative">
							<Search
								className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
								aria-hidden
							/>
							<Input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={searchPlaceholder}
								className="h-9 border-royal-gold/20 bg-background/60 pl-7"
								aria-label={searchPlaceholder}
							/>
						</div>
					</div>
					<ul className="max-h-72 overflow-y-auto p-1">
						<li>
							<button
								type="button"
								onClick={() => pick("")}
								className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
							>
								<Check
									className={cn(
										"size-4 shrink-0",
										value ? "opacity-0" : "opacity-100",
									)}
								/>
								<span className="truncate">{placeholder}</span>
							</button>
						</li>
						{filtered.map((option) => (
							<li key={option.value}>
								<button
									type="button"
									onClick={() => pick(option.value)}
									className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
								>
									<Check
										className={cn(
											"size-4 shrink-0",
											value === option.value ? "opacity-100" : "opacity-0",
										)}
									/>
									<span className="truncate">{option.label}</span>
								</button>
							</li>
						))}
						{filtered.length === 0 ? (
							<li className="px-2 py-6 text-center text-sm text-muted-foreground">
								{noResults}
							</li>
						) : null}
					</ul>
				</PopoverContent>
			</Popover>
		</Field>
	);
}

interface SignupPasswordFieldProps {
	field: {
		name: string;
		state: {
			value: string;
			meta: { isDirty: boolean; isValid: boolean; errors: unknown[] };
		};
		handleBlur: () => void;
		handleChange: (value: string) => void;
	};
	label: string;
	placeholder: string;
	showPassword: boolean;
	onToggle: () => void;
	isSubmitting: boolean;
}

function SignupPhoneField({
	field,
	label,
	placeholder,
	dialDisplay,
	dialNotice,
	isSubmitting,
}: {
	field: {
		name: string;
		state: {
			value: string;
			meta: { isDirty: boolean; isValid: boolean; errors: unknown[] };
		};
		handleBlur: () => void;
		handleChange: (value: string) => void;
	};
	label: string;
	placeholder: string;
	dialDisplay: string;
	dialNotice: string;
	isSubmitting: boolean;
}) {
	const isInvalid = field.state.meta.isDirty && !field.state.meta.isValid;

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={field.name} className="login-field-label">
				{label}
				<RequiredMark />
			</FieldLabel>
			<div className="flex gap-2">
				<div className="login-input-group flex h-auto shrink-0 items-center gap-2 rounded-md border border-royal-gold/20 bg-background/40 px-3 py-3 text-base text-foreground">
					<span className="whitespace-nowrap font-medium">{dialDisplay}</span>
				</div>
				<InputGroup className="login-input-group h-auto min-w-0 flex-1 border-royal-gold/20 bg-background/60">
					<InputGroupAddon align="inline-start">
						<Phone
							className="size-5 text-royal-gold"
							strokeWidth={1.75}
							aria-hidden
						/>
					</InputGroupAddon>
					<InputGroupInput
						id={field.name}
						name={field.name}
						type="tel"
						inputMode="numeric"
						autoComplete="tel-national"
						placeholder={placeholder}
						value={field.state.value}
						onBlur={field.handleBlur}
						onChange={(e) => {
							const digits = e.target.value
								.replace(/\D/g, "")
								.replace(/^0+/, "")
								.slice(0, 10);
							field.handleChange(digits);
						}}
						disabled={isSubmitting}
						aria-invalid={isInvalid}
						aria-required
						className="login-input"
					/>
				</InputGroup>
			</div>
			<FieldDescription className="signup-helper text-muted-foreground">
				{dialNotice}
			</FieldDescription>
		</Field>
	);
}

function SignupPasswordField({
	field,
	label,
	placeholder,
	showPassword,
	onToggle,
	isSubmitting,
}: SignupPasswordFieldProps) {
	const isInvalid = field.state.meta.isDirty && !field.state.meta.isValid;

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={field.name} className="login-field-label">
				{label}
				<RequiredMark />
			</FieldLabel>
			<InputGroup className="login-input-group h-auto border-royal-gold/20 bg-background/60">
				<InputGroupAddon align="inline-start">
					<Lock
						className="size-5 text-royal-gold"
						strokeWidth={1.75}
						aria-hidden
					/>
				</InputGroupAddon>
				<InputGroupInput
					id={field.name}
					name={field.name}
					type={showPassword ? "text" : "password"}
					placeholder={placeholder}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					disabled={isSubmitting}
					aria-invalid={isInvalid}
					aria-required
					autoComplete="new-password"
					className="login-input"
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						type="button"
						onClick={onToggle}
						aria-label={showPassword ? "Hide password" : "Show password"}
						disabled={isSubmitting}
						variant="ghost"
						size="icon-sm"
					>
						{showPassword ? (
							<EyeOff
								className="size-5 text-muted-foreground"
								strokeWidth={1.75}
								aria-hidden
							/>
						) : (
							<Eye
								className="size-5 text-muted-foreground"
								strokeWidth={1.75}
								aria-hidden
							/>
						)}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</Field>
	);
}
