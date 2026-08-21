import type { LucideIcon } from "lucide-react";
import { Camera, Check, Lock, Pencil, X } from "lucide-react";
import type { ReactNode } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/** View = read-only display · edit = editable input · locked = shown but not editable here. */
export type ProfileFieldMode = "view" | "edit" | "locked";

export function ProfileSettingsField({
	icon: Icon,
	label,
	value,
	onChange,
	mode,
	hint,
	placeholder,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	onChange?: (v: string) => void;
	mode: ProfileFieldMode;
	hint?: string;
	placeholder?: string;
}) {
	const { t } = usePortalLocale();
	return (
		<div
			className={`iz-profile-field${mode === "edit" ? " iz-profile-field--edit" : ""}${mode === "locked" ? " iz-profile-field--locked" : ""}`}
		>
			<div className="iz-profile-field__label">
				<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
				<span>{label}</span>
				{mode === "locked" && (
					<span
						className="iz-profile-field__lock"
						title={t.profile.notEditableHere}
					>
						<Lock className="h-3 w-3" aria-hidden />
					</span>
				)}
			</div>
			{mode === "edit" ? (
				<input
					className="iz-profile-field__input"
					value={value}
					placeholder={placeholder}
					onChange={(e) => onChange?.(e.target.value)}
					autoComplete="off"
				/>
			) : (
				<p className="iz-profile-field__value">{value.trim() ? value : "—"}</p>
			)}
			{hint && <p className="iz-profile-field__hint">{hint}</p>}
		</div>
	);
}

/** Amber strip while editing — makes the mode obvious at a glance. */
export function ProfileEditingBanner({
	what,
	editableHint,
}: {
	/** Short noun: "outlet profile" / "agency profile" */
	what: string;
	/** What actually persists on Save (real sessions often only save the org name). */
	editableHint?: string;
}) {
	const { t } = usePortalLocale();
	return (
		<output className="iz-profile-edit-banner">
			<div className="iz-profile-edit-banner__dot" aria-hidden />
			<div>
				<p className="iz-profile-edit-banner__title">Editing {what}</p>
				<p className="iz-profile-edit-banner__body">
					{editableHint ?? t.profile.highlightedFieldsHint}
				</p>
			</div>
		</output>
	);
}

/** Sticky Save / Cancel dock — always visible while editing. */
export function ProfileEditDock({
	onSave,
	onCancel,
	saving,
}: {
	onSave: () => void;
	onCancel: () => void;
	saving?: boolean;
}) {
	const { t } = usePortalLocale();
	return (
		<div
			className="iz-profile-edit-dock"
			role="toolbar"
			aria-label={t.profile.saveProfile}
		>
			<button
				type="button"
				className="iz-btn iz-btn-soft iz-profile-edit-dock__cancel"
				onClick={onCancel}
				disabled={saving}
			>
				<X className="h-4 w-4" />
				Cancel
			</button>
			<button
				type="button"
				className="iz-btn iz-btn-primary iz-profile-edit-dock__save"
				onClick={onSave}
				disabled={saving}
			>
				<Check className="h-4 w-4" />
				{saving ? t.profile.saving : t.profile.saveChanges}
			</button>
		</div>
	);
}

/** Primary Edit CTA in the hero (not buried at the page bottom). */
export function ProfileEditTrigger({
	onClick,
	label,
}: {
	onClick: () => void;
	label?: string;
}) {
	const { t } = usePortalLocale();
	// Resolved in the body, not as a default PARAMETER: a default arg is evaluated
	// before any hook can run, so it cannot read the dictionary — that is how the
	// date picker and language picker hints stayed English through three passes.
	const text = label ?? t.profile.editProfile;
	return (
		<button
			type="button"
			className="iz-btn iz-btn-primary iz-profile-edit-trigger"
			onClick={onClick}
		>
			<Pencil className="h-4 w-4" />
			{text}
		</button>
	);
}

/** Photo controls that read clearly when editing (not a tiny corner icon alone). */
export function ProfilePhotoActions({
	onChangePhoto,
	onRemovePhoto,
	hasPhoto,
}: {
	onChangePhoto: () => void;
	onRemovePhoto?: () => void;
	hasPhoto: boolean;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-profile-photo-actions">
			<button
				type="button"
				className="iz-btn iz-btn-soft iz-profile-photo-actions__change"
				onClick={onChangePhoto}
			>
				<Camera className="h-4 w-4" />
				{hasPhoto ? t.profile.changePhoto : t.profile.addPhoto}
			</button>
			{hasPhoto && onRemovePhoto && (
				<button
					type="button"
					className="iz-profile-photo-actions__remove"
					onClick={onRemovePhoto}
				>
					Remove
				</button>
			)}
		</div>
	);
}

export function ProfileSectionCard({
	editing,
	children,
}: {
	editing: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={`iz-profile-section${editing ? " iz-profile-section--editing" : ""}`}
		>
			{children}
		</div>
	);
}
