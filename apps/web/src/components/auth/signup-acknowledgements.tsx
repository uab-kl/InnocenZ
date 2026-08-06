import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { useLandingLocale } from "@/lib/landing-i18n";
import { cn } from "@/lib/utils";

type SignupDisclaimerId =
	| "personal-info"
	| "declaration-of-truth"
	| "information-sharing"
	| "terms";

type AcknowledgementFieldName =
	| "ackPersonalInfo"
	| "ackDeclarationOfTruth"
	| "ackInformationSharing"
	| "acceptTerms";

interface SignupAcknowledgementsProps {
	isSubmitting: boolean;
	fields: {
		ackPersonalInfo: AcknowledgementFieldApi;
		ackDeclarationOfTruth: AcknowledgementFieldApi;
		ackInformationSharing: AcknowledgementFieldApi;
		acceptTerms: AcknowledgementFieldApi;
	};
}

interface AcknowledgementFieldApi {
	state: {
		value: boolean;
		meta: { isDirty: boolean; isValid: boolean; errors: unknown[] };
	};
	handleChange: (value: boolean) => void;
	handleBlur: () => void;
}

export function SignupAcknowledgements({
	isSubmitting,
	fields,
}: SignupAcknowledgementsProps) {
	const { t } = useLandingLocale();
	const copy = t.signup.acknowledgements;
	const [openDisclaimer, setOpenDisclaimer] =
		useState<SignupDisclaimerId | null>(null);

	const disclaimerById = {
		"personal-info": copy.personalInfo,
		"declaration-of-truth": copy.declarationOfTruth,
		"information-sharing": copy.informationSharing,
		terms: copy.terms,
	} as const;

	const activeDisclaimer = openDisclaimer
		? disclaimerById[openDisclaimer]
		: null;

	const acknowledgementRows: {
		field: AcknowledgementFieldApi;
		name: AcknowledgementFieldName;
		disclaimerId: SignupDisclaimerId;
		label: string;
	}[] = [
		{
			field: fields.ackPersonalInfo,
			name: "ackPersonalInfo",
			disclaimerId: "personal-info",
			label: copy.personalInfo.title,
		},
		{
			field: fields.ackDeclarationOfTruth,
			name: "ackDeclarationOfTruth",
			disclaimerId: "declaration-of-truth",
			label: copy.declarationOfTruth.title,
		},
		{
			field: fields.ackInformationSharing,
			name: "ackInformationSharing",
			disclaimerId: "information-sharing",
			label: copy.informationSharing.title,
		},
	];

	return (
		<>
			<div className="signup-acknowledgements">
				<header className="signup-section-header">
					<span className="signup-step" aria-hidden>
						06
					</span>
					<h2 className="signup-section-title">
						{t.signup.sections.acknowledgements}
					</h2>
				</header>

				<div className="signup-section-body">
					<div className="overflow-hidden rounded-xl border border-royal-gold/20 bg-background/30">
						{acknowledgementRows.map((row, index) => {
							return (
								<div
									key={row.name}
									className={cn(
										"px-3.5 py-3.5",
										index < acknowledgementRows.length - 1 &&
											"border-b border-royal-gold/12",
									)}
								>
									<AcknowledgementRow
										id={row.name}
										checked={row.field.state.value}
										disabled={isSubmitting}
										label={row.label}
										onCheckedChange={row.field.handleChange}
										onBlur={row.field.handleBlur}
										onOpen={() => setOpenDisclaimer(row.disclaimerId)}
									/>
								</div>
							);
						})}
					</div>

					<div className="border-t border-royal-gold/16 pt-5">
						<header className="mb-3 flex items-baseline gap-3">
							<span className="signup-step" aria-hidden>
								07
							</span>
							<h3 className="signup-section-title">
								{t.signup.sections.terms}
							</h3>
						</header>

						<Field
							data-invalid={
								fields.acceptTerms.state.meta.isDirty &&
								!fields.acceptTerms.state.meta.isValid
							}
						>
							<AcknowledgementRow
								id="acceptTerms"
								checked={fields.acceptTerms.state.value}
								disabled={isSubmitting}
								onCheckedChange={fields.acceptTerms.handleChange}
								onBlur={fields.acceptTerms.handleBlur}
								onOpen={() => setOpenDisclaimer("terms")}
								label={
									<>
										{copy.termsCheckboxPrefix}{" "}
										<button
											type="button"
											className="signup-ack-link font-medium text-gold-bright underline underline-offset-4 hover:text-gold"
											onClick={() => setOpenDisclaimer("terms")}
										>
											{copy.termsCheckboxLink}
										</button>
									</>
								}
							/>
						</Field>
					</div>
				</div>
			</div>

			<Dialog
				open={openDisclaimer !== null}
				onOpenChange={(open) => {
					if (!open) setOpenDisclaimer(null);
				}}
			>
				<DialogContent className="signup-disclaimer-dialog w-full max-w-[calc(100%-2rem)] border-royal-gold/25 bg-card p-6 sm:max-w-2xl sm:p-8">
					<DialogHeader>
						<DialogTitle className="signup-disclaimer-title font-bold text-foreground">
							{activeDisclaimer?.title}
						</DialogTitle>
						<DialogDescription className="signup-disclaimer-body pt-2 text-left text-muted-foreground">
							{activeDisclaimer?.body}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter showCloseButton={false}>
						<Button
							type="button"
							className="signup-disclaimer-done login-btn w-full bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95 sm:w-auto"
							onClick={() => setOpenDisclaimer(null)}
						>
							{copy.done}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function AcknowledgementRow({
	id,
	checked,
	disabled,
	label,
	onCheckedChange,
	onBlur,
	onOpen,
}: {
	id: string;
	checked: boolean;
	disabled: boolean;
	label: React.ReactNode;
	onCheckedChange: (checked: boolean) => void;
	onBlur: () => void;
	onOpen: () => void;
}) {
	return (
		<div className="flex items-start gap-3">
			<input
				id={id}
				type="checkbox"
				checked={checked}
				disabled={disabled}
				onBlur={onBlur}
				onChange={(event) => onCheckedChange(event.target.checked)}
				className="signup-ack-checkbox mt-1.5 size-5 shrink-0 rounded border border-royal-gold/40 bg-background accent-[var(--royal-gold)]"
			/>
			<div className="signup-ack-label min-w-0 text-foreground">
				{typeof label === "string" ? (
					<button
						type="button"
						className="signup-ack-link text-left font-medium text-gold-bright underline underline-offset-4 hover:text-gold"
						onClick={onOpen}
					>
						{label}
					</button>
				) : (
					label
				)}
			</div>
		</div>
	);
}
