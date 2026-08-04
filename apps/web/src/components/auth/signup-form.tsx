import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	AtSign,
	BadgeCheck,
	Building2,
	Eye,
	EyeOff,
	ImagePlus,
	Loader2,
	Lock,
	Mail,
	Phone,
	UserRound,
	X,
	type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SignupAcknowledgements } from "@/components/auth/signup-acknowledgements";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSignupPackages } from "@/constants/signup-packages";
import {
	type SignupAccountType,
	signupAccountTypes,
} from "@/constants/signup-types";
import { createSignupSchema } from "@/lib/auth/register-schemas";
import { useLandingLocale } from "@/lib/landing-i18n";
import { cn } from "@/lib/utils";

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="signup-section-title login-field-label border-b border-royal-gold/20 pb-2 uppercase text-foreground/90">
			{children}
		</h2>
	);
}

export function SignupForm() {
	const navigate = useNavigate();
	const { locale, t } = useLandingLocale();
	const copy = t.signup;
	const fields = copy.fields;
	const signupSchema = useMemo(
		() => createSignupSchema(copy.validation),
		[copy.validation],
	);
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [logoPreview, setLogoPreview] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			accountType: "outlet" as SignupAccountType,
			companyName: "",
			companyRegistrationOld: "",
			companyRegistrationNew: "",
			companyAddress: "",
			personInCharge: "",
			phoneNum: "",
			email: "",
			loginEmail: "",
			password: "",
			confirmPassword: "",
			packageId: getSignupPackages("outlet", locale)[0]?.id ?? "",
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
		onSubmit: async () => {
			await navigate({ to: "/login" });
		},
	});

	return (
		<form
			id="signup-form"
			className="signup-form"
			aria-label={copy.heading.line2}
			onSubmit={(e) => {
				e.preventDefault();
				form.handleSubmit();
			}}
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
									<button
										key={type.key}
										type="button"
										role="radio"
										aria-checked={selected}
										disabled={form.state.isSubmitting}
										onClick={() => {
											field.handleChange(type.key);
											const packages = getSignupPackages(type.key, locale);
											form.setFieldValue("packageId", packages[0]?.id ?? "");
										}}
										className={cn(
											"flex flex-col items-start gap-2 rounded-xl border px-4 py-4 text-left transition-all",
											selected
												? "border-royal-gold/60 bg-royal-gold/10 shadow-glow-gold"
												: "border-royal-gold/20 bg-background/40 hover:border-royal-gold/35",
										)}
									>
										<Icon
											className={cn(
												"h-6 w-6",
												selected ? "text-gold-bright" : "text-muted-foreground",
											)}
										/>
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
					</Field>
				)}
			</form.Field>

			<FieldGroup className="gap-10">
				<section className="space-y-6">
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

					<form.Field name="companyAddress">
						{(field) => {
							const isInvalid =
								field.state.meta.isDirty && !field.state.meta.isValid;
							const errorId = `${field.name}-error`;
							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel
										htmlFor={field.name}
										className="login-field-label"
									>
										{fields.companyAddress.label}
									</FieldLabel>
									<Textarea
										id={field.name}
										name={field.name}
										required
										placeholder={fields.companyAddress.placeholder}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										disabled={form.state.isSubmitting}
										aria-invalid={isInvalid}
										aria-describedby={isInvalid ? errorId : undefined}
										className="min-h-28 border-royal-gold/20 bg-background/60 text-[1.5rem] leading-relaxed"
									/>
									{isInvalid && (
										<FieldError
											id={errorId}
											errors={field.state.meta.errors}
											className="text-xl"
										/>
									)}
								</Field>
							);
						}}
					</form.Field>
				</section>

				<section className="space-y-6">
					<SectionTitle>{copy.sections.contactInfo}</SectionTitle>

					<form.Field name="personInCharge">
						{(field) => (
							<SignupTextField
								field={field}
								label={fields.personInCharge.label}
								icon={UserRound}
								placeholder={fields.personInCharge.placeholder}
								autoComplete="name"
								isSubmitting={form.state.isSubmitting}
							/>
						)}
					</form.Field>

					<form.Field name="phoneNum">
						{(field) => (
							<SignupTextField
								field={field}
								label={fields.phoneNum.label}
								icon={Phone}
								placeholder={fields.phoneNum.placeholder}
								type="tel"
								autoComplete="tel"
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
							/>
						)}
					</form.Field>
				</section>

				<section className="space-y-6">
					<SectionTitle>{copy.sections.loginCredentials}</SectionTitle>

					<form.Field name="loginEmail">
						{(field) => (
							<SignupTextField
								field={field}
								label={fields.loginEmail.label}
								icon={AtSign}
								placeholder={fields.loginEmail.placeholder}
								type="email"
								autoComplete="username"
								isSubmitting={form.state.isSubmitting}
								description={fields.loginEmail.description}
							/>
						)}
					</form.Field>

					<form.Field name="password">
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

					<form.Field name="confirmPassword">
						{(field) => (
							<SignupPasswordField
								field={field}
								label={fields.confirmPassword.label}
								placeholder={fields.confirmPassword.placeholder}
								showPassword={showConfirmPassword}
								onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
								isSubmitting={form.state.isSubmitting}
							/>
						)}
					</form.Field>
				</section>

				<section className="space-y-6">
					<SectionTitle>{copy.sections.packageEnrollment}</SectionTitle>

					<form.Subscribe selector={(state) => state.values.accountType}>
						{(accountType) => (
							<form.Field name="packageId">
								{(field) => {
									const packages = getSignupPackages(accountType, locale);
									const isInvalid =
										field.state.meta.isDirty && !field.state.meta.isValid;
									const errorId = `${field.name}-error`;
									const selected = packages.find(
										(pkg) => pkg.id === field.state.value,
									);

									return (
										<Field data-invalid={isInvalid}>
											<FieldLabel
												htmlFor={field.name}
												className="login-field-label"
											>
												{fields.package.label}
											</FieldLabel>
											<Select
												value={field.state.value}
												onValueChange={field.handleChange}
												disabled={form.state.isSubmitting}
												required
											>
												<SelectTrigger
													id={field.name}
													className="login-input-group h-auto w-full border-royal-gold/20 bg-background/60 py-3"
												>
													<SelectValue
														placeholder={fields.package.placeholder}
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
											{selected && (
												<FieldDescription className="signup-helper text-muted-foreground">
													{selected.detail}
												</FieldDescription>
											)}
											{isInvalid && (
												<FieldError
													id={errorId}
													errors={field.state.meta.errors}
													className="text-xl"
												/>
											)}
										</Field>
									);
								}}
							</form.Field>
						)}
					</form.Subscribe>
				</section>

				<section className="space-y-6">
					<SectionTitle>{copy.sections.branding}</SectionTitle>

					<form.Field name="logoFile">
						{(field) => {
							const isInvalid =
								field.state.meta.isDirty && !field.state.meta.isValid;
							const errorId = `${field.name}-error`;

							return (
								<Field data-invalid={isInvalid}>
									<FieldLabel
										htmlFor="signup-logo"
										className="login-field-label"
									>
										{fields.logo.label}
									</FieldLabel>
									<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
										<label
											htmlFor="signup-logo"
											className={cn(
												"flex min-h-40 flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-royal-gold/30 bg-background/40 px-6 py-8 text-center transition-colors hover:border-royal-gold/50 hover:bg-background/55",
												form.state.isSubmitting &&
													"pointer-events-none opacity-60",
											)}
										>
											<ImagePlus className="h-10 w-10 text-royal-gold" />
											<span className="signup-upload-title font-medium text-foreground">
												{fields.logo.uploadTitle}
											</span>
											<span className="signup-upload-hint text-muted-foreground">
												{fields.logo.uploadHint}
											</span>
											<input
												id="signup-logo"
												type="file"
												required
												accept="image/png,image/jpeg,image/webp,image/gif"
												className="sr-only"
												disabled={form.state.isSubmitting}
												onChange={(event) => {
													const file = event.target.files?.[0] ?? null;
													field.handleChange(file);
													if (logoPreview) URL.revokeObjectURL(logoPreview);
													setLogoPreview(
														file ? URL.createObjectURL(file) : null,
													);
												}}
											/>
										</label>

										{logoPreview && (
											<div className="relative shrink-0">
												<img
													src={logoPreview}
													alt="Logo preview"
													className="h-36 w-36 rounded-xl border border-royal-gold/25 object-cover"
												/>
												<Button
													type="button"
													variant="secondary"
													size="icon-sm"
													className="absolute -top-2 -right-2"
													disabled={form.state.isSubmitting}
													onClick={() => {
														field.handleChange(null);
														if (logoPreview) URL.revokeObjectURL(logoPreview);
														setLogoPreview(null);
													}}
													aria-label="Remove logo"
												>
													<X className="h-4 w-4" />
												</Button>
											</div>
										)}
									</div>
									{isInvalid && (
										<FieldError
											id={errorId}
											errors={field.state.meta.errors}
											className="text-xl"
										/>
									)}
								</Field>
							);
						}}
					</form.Field>
				</section>

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
			</FieldGroup>

			<form.Subscribe
				selector={(state) => [state.isSubmitting, state.canSubmit]}
			>
				{([isSubmitting, canSubmit]) => (
					<Button
						type="submit"
						form="signup-form"
						className="login-btn mt-8 w-full bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
						disabled={isSubmitting || !canSubmit}
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
}: SignupTextFieldProps) {
	const isInvalid = field.state.meta.isDirty && !field.state.meta.isValid;
	const errorId = `${field.name}-error`;

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={field.name} className="login-field-label">
				{label}
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
					required
					placeholder={placeholder}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					disabled={isSubmitting}
					aria-invalid={isInvalid}
					aria-describedby={isInvalid ? errorId : undefined}
					autoComplete={autoComplete}
					className="login-input"
				/>
			</InputGroup>
			{description && (
				<FieldDescription className="signup-helper text-muted-foreground">
					{description}
				</FieldDescription>
			)}
			{isInvalid && (
				<FieldError
					id={errorId}
					errors={field.state.meta.errors}
					className="text-xl"
				/>
			)}
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

function SignupPasswordField({
	field,
	label,
	placeholder,
	showPassword,
	onToggle,
	isSubmitting,
}: SignupPasswordFieldProps) {
	const isInvalid = field.state.meta.isDirty && !field.state.meta.isValid;
	const errorId = `${field.name}-error`;

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor={field.name} className="login-field-label">
				{label}
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
					required
					placeholder={placeholder}
					value={field.state.value}
					onBlur={field.handleBlur}
					onChange={(e) => field.handleChange(e.target.value)}
					disabled={isSubmitting}
					aria-invalid={isInvalid}
					aria-describedby={isInvalid ? errorId : undefined}
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
			{isInvalid && (
				<FieldError
					id={errorId}
					errors={field.state.meta.errors}
					className="text-xl"
				/>
			)}
		</Field>
	);
}
