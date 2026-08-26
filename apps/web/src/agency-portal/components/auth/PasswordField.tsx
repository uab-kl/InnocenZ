import { Eye, EyeOff } from "lucide-react";
import { useId } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export function PasswordField({
	label,
	placeholder,
	value,
	onChange,
	show,
	onToggleShow,
	autoComplete,
}: {
	label: string;
	placeholder: string;
	value: string;
	onChange: (v: string) => void;
	show: boolean;
	onToggleShow: () => void;
	autoComplete?: string;
}) {
	const { t } = usePortalLocale();
	const inputId = useId();

	return (
		<div className="iz-field iz-security-field">
			<label htmlFor={inputId}>{label}</label>
			<div className="iz-security-field__wrap">
				<input
					id={inputId}
					type={show ? "text" : "password"}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					autoComplete={autoComplete}
				/>
				<button
					type="button"
					className="iz-signin-password-toggle iz-security-field__toggle"
					aria-label={
						show ? t.portalUi.hidePassword : t.portalUi.showPassword
					}
					onClick={onToggleShow}
				>
					{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
				</button>
			</div>
		</div>
	);
}
