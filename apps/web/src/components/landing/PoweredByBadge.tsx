type PoweredByBadgeProps = {
	className?: string;
};

export function PoweredByBadge({ className }: PoweredByBadgeProps) {
	return (
		<div
			className={`flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/95 px-3 py-1.5 shadow-md shadow-black/10 ${className ?? ""}`}
		>
			<span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">
				Powered by
			</span>
			<img
				src="/img/uab-logo.webp"
				alt="UAB"
				className="h-5 w-auto object-contain"
			/>
		</div>
	);
}
