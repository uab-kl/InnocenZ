import { Eye, EyeOff } from "lucide-react";

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
	return (
		<div className="iz-field iz-security-field">
			<label>{label}</label>
			<div className="iz-security-field__wrap">
				<input
					type={show ? "text" : "password"}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					autoComplete={autoComplete}
				/>
				<button
					type="button"
					className="iz-signin-password-toggle iz-security-field__toggle"
					aria-label={show ? "Hide password" : "Show password"}
					onClick={onToggleShow}
				>
					{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
				</button>
			</div>
		</div>
	);
}
