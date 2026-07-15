type MaterialIconProps = {
	name: string;
	className?: string;
};

/** Google Material Symbols — https://fonts.google.com/icons */
export function MaterialIcon({ name, className = "" }: MaterialIconProps) {
	return (
		<span className={`material-symbols-outlined ${className}`} aria-hidden>
			{name}
		</span>
	);
}
