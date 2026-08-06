import type { LucideIcon } from "lucide-react";
import { Camera, Check, Lock, Pencil, X } from "lucide-react";
import type { ReactNode } from "react";

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
	return (
		<div
			className={`iz-profile-field${mode === "edit" ? " iz-profile-field--edit" : ""}${mode === "locked" ? " iz-profile-field--locked" : ""}`}
		>
			<div className="iz-profile-field__label">
				<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
				<span>{label}</span>
				{mode === "locked" && (
					<span className="iz-profile-field__lock" title="Not editable here">
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
	return (
		<div className="iz-profile-edit-banner" role="status">
			<div className="iz-profile-edit-banner__dot" aria-hidden />
			<div>
				<p className="iz-profile-edit-banner__title">Editing {what}</p>
				<p className="iz-profile-edit-banner__body">
					{editableHint ??
						"Highlighted fields can be changed. Use Save below when you are done."}
				</p>
			</div>
		</div>
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
	return (
		<div className="iz-profile-edit-dock" role="toolbar" aria-label="Save profile">
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
				{saving ? "Saving…" : "Save changes"}
			</button>
		</div>
	);
}

/** Primary Edit CTA in the hero (not buried at the page bottom). */
export function ProfileEditTrigger({
	onClick,
	label = "Edit profile",
}: {
	onClick: () => void;
	label?: string;
}) {
	return (
		<button
			type="button"
			className="iz-btn iz-btn-primary iz-profile-edit-trigger"
			onClick={onClick}
		>
			<Pencil className="h-4 w-4" />
			{label}
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
	return (
		<div className="iz-profile-photo-actions">
			<button
				type="button"
				className="iz-btn iz-btn-soft iz-profile-photo-actions__change"
				onClick={onChangePhoto}
			>
				<Camera className="h-4 w-4" />
				{hasPhoto ? "Change photo" : "Add photo"}
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
		<div className={`iz-profile-section${editing ? " iz-profile-section--editing" : ""}`}>
			{children}
		</div>
	);
}
