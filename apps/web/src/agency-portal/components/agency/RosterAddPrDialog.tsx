import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { CreatePrPersonnelInput } from "@/services/pr-personnel";

interface RosterAddPrDialogProps {
	open: boolean;
	onClose: () => void;
}

/**
 * Planning-view dialog to add a PR (promoter) to the agency roster on the
 * backend. Collects a `CreatePrPersonnelInput` (name required, plus optional
 * nickname/contact) and calls the roster `addPr` mutation, which invalidates
 * the roster queries. The agency is inferred from the caller's scope server-side.
 */
export function RosterAddPrDialog({ open, onClose }: RosterAddPrDialogProps) {
	const { t } = usePortalLocale();
	const { addPr } = useRosterMutations();

	const [name, setName] = useState("");
	const [nickname, setNickname] = useState("");
	const [phone, setPhone] = useState("");
	const [email, setEmail] = useState("");
	const [icNo, setIcNo] = useState("");

	// Reset the form each time the dialog opens.
	useEffect(() => {
		if (!open) return;
		setName("");
		setNickname("");
		setPhone("");
		setEmail("");
		setIcNo("");
	}, [open]);

	const handleClose = () => {
		addPr.reset();
		onClose();
	};

	const isValid = name.trim() !== "";

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!isValid || addPr.isPending) return;
		const input: CreatePrPersonnelInput = {
			name: name.trim(),
			nickname: nickname.trim() || undefined,
			phone: phone.trim() || undefined,
			email: email.trim() || undefined,
			icNo: icNo.trim() || undefined,
		};
		addPr.mutate(input, { onSuccess: handleClose });
	};

	return (
		<IzSheet open={open} onClose={addPr.isPending ? () => {} : handleClose}>
			<form onSubmit={handleSubmit}>
				<div className="iz-sheet-head">
					<div>
						<p className="iz-tiny iz-muted2 uppercase tracking-widest">
							{t.roster.planning}
						</p>
						<h3>{t.approvals.addPr}</h3>
					</div>
					<button
						type="button"
						className="iz-sheet-close"
						onClick={handleClose}
						disabled={addPr.isPending}
						aria-label={t.common.close}
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div>
					<span className="iz-field-label">{t.agencyMisc.name}</span>
					<input
						type="text"
						className="iz-select iz-select-block"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={t.agencyMisc.fullNamePlaceholder}
						aria-label={t.agencyRoster.prNameField}
					/>
				</div>

				<div className="mt-4 grid grid-cols-2 gap-3">
					<div>
						<span className="iz-field-label">{t.agencyRoster.nickname}</span>
						<input
							type="text"
							className="iz-select iz-select-block"
							value={nickname}
							onChange={(e) => setNickname(e.target.value)}
							aria-label={t.agencyRoster.nickname}
						/>
					</div>
					<div>
						<span className="iz-field-label">{t.agencyRoster.icNo}</span>
						<input
							type="text"
							className="iz-select iz-select-block"
							value={icNo}
							onChange={(e) => setIcNo(e.target.value)}
							aria-label={t.agencyRoster.icNo}
						/>
					</div>
				</div>

				<div className="mt-4 grid grid-cols-2 gap-3">
					<div>
						<span className="iz-field-label">{t.agencyRoster.phone}</span>
						<input
							type="tel"
							className="iz-select iz-select-block"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
							aria-label={t.agencyRoster.phone}
						/>
					</div>
					<div>
						<span className="iz-field-label">{t.managePr.email}</span>
						<input
							type="email"
							className="iz-select iz-select-block"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							aria-label={t.managePr.email}
						/>
					</div>
				</div>

				{addPr.isError && (
					<p className="iz-tiny mt-3 text-[var(--iz-danger,#dc2626)]">
						{t.agencyRoster.couldNotAddPr}
					</p>
				)}

				<button
					type="submit"
					className="iz-btn iz-btn-primary mt-5 w-full"
					disabled={!isValid || addPr.isPending}
				>
					{addPr.isPending ? t.approvals.adding : t.approvals.addPr}
				</button>
			</form>
		</IzSheet>
	);
}
