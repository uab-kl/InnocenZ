import { PORTFOLIO_SLOT_COUNT } from "@agency-portal/lib/pr-demo";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { Camera, X } from "lucide-react";
import { useRef } from "react";

function readImageFile(file: File, onLoad: (dataUrl: string) => void) {
	const reader = new FileReader();
	reader.onload = () => {
		if (typeof reader.result === "string") onLoad(reader.result);
	};
	reader.readAsDataURL(file);
}

type PortfolioGalleryPickerProps = {
	value: (string | null)[];
	onChange: (next: (string | null)[]) => void;
	onWarn?: (message: string) => void;
	editable?: boolean;
	className?: string;
};

export function portfolioFilledCount(slots: (string | null)[]): number {
	return slots.filter(Boolean).length;
}

export function PortfolioGalleryPicker({
	value,
	onChange,
	onWarn,
	editable = true,
	className = "",
}: PortfolioGalleryPickerProps) {
	const fileRef = useRef<HTMLInputElement>(null);
	const slotRef = useRef(0);

	const slots = [...value];
	while (slots.length < PORTFOLIO_SLOT_COUNT) slots.push(null);

	const openUpload = (slot: number) => {
		if (!editable) return;
		slotRef.current = slot;
		fileRef.current?.click();
	};

	const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			onWarn?.("Please choose an image file");
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			onWarn?.("Image must be under 5 MB");
			return;
		}
		readImageFile(file, (dataUrl) => {
			const next = [...slots];
			next[slotRef.current] = dataUrl;
			onChange(next);
		});
	};

	const removePhoto = (slot: number) => {
		const next = [...slots];
		next[slot] = null;
		onChange(next);
	};

	return (
		<>
			<input
				ref={fileRef}
				type="file"
				accept="image/*"
				className="sr-only"
				onChange={onFilePick}
			/>
			<div className={`iz-pgrid iz-pgrid-8 ${className}`.trim()}>
				{Array.from({ length: PORTFOLIO_SLOT_COUNT }, (_, i) => {
					const src = slots[i];
					return (
						<div key={i} className="relative">
							<button
								type="button"
								className={`iz-pcell w-full${src ? " has-photo" : ""}${editable ? " editable" : ""}`}
								onClick={() => (editable ? openUpload(i) : undefined)}
								aria-label={
									src
										? `Portfolio photo ${i + 1}`
										: `Add portfolio photo ${i + 1}`
								}
							>
								{src ? (
									<img
										src={publicAssetPath(src)}
										alt=""
										className="h-full w-full rounded-[10px] object-cover"
									/>
								) : (
									<Camera className="h-[18px] w-[18px]" />
								)}
							</button>
							{editable && src && (
								<button
									type="button"
									className="iz-pcell-remove"
									aria-label="Remove photo"
									onClick={() => removePhoto(i)}
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</div>
					);
				})}
			</div>
		</>
	);
}
