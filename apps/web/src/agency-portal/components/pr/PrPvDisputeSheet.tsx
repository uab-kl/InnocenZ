import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM, IzCardTitle } from "@agency-portal/components/iz/ui";
import { PV_DISPUTE_PRESETS } from "@agency-portal/lib/pr-demo";
import type { WeeklyDisputeTarget } from "@agency-portal/lib/pr-weekly-payment";
import { ImagePlus, Undo2, X } from "lucide-react";
import { useRef } from "react";

function readImageFiles(files: FileList | null): Promise<string[]> {
	if (!files?.length) return Promise.resolve([]);
	const imageFiles = Array.from(files).filter((file) =>
		file.type.startsWith("image/"),
	);
	return Promise.all(
		imageFiles.map(
			(file) =>
				new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(reader.result as string);
					reader.onerror = () => reject(reader.error);
					reader.readAsDataURL(file);
				}),
		),
	);
}

function DisputeImageAttachments({
	images,
	onChange,
}: {
	images: string[];
	onChange: (images: string[]) => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);

	const addImages = async (files: FileList | null) => {
		const next = await readImageFiles(files);
		if (next.length) onChange([...images, ...next]);
	};

	return (
		<div className="iz-pv-dispute-files mt-2">
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				multiple
				className="sr-only"
				onChange={(e) => {
					void addImages(e.target.files);
					e.target.value = "";
				}}
			/>
			<button
				type="button"
				className="iz-btn iz-btn-soft iz-btn-sm w-auto"
				onClick={() => inputRef.current?.click()}
			>
				<ImagePlus className="h-3.5 w-3.5" />
				Attach files (images)
			</button>
			{images.length > 0 && (
				<div className="iz-pv-dispute-files-grid mt-2">
					{images.map((src, index) => (
						<div
							key={`${index}-${src.slice(0, 24)}`}
							className="iz-pv-dispute-file"
						>
							<img src={src} alt="" className="iz-pv-dispute-file-img" />
							<button
								type="button"
								className="iz-pv-dispute-file-remove"
								aria-label="Remove image"
								onClick={() => onChange(images.filter((_, i) => i !== index))}
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function DisputeReasonFields({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fixedReasons: string[] = PV_DISPUTE_PRESETS.filter(
		(p) => p.label !== "Others",
	).map((p) => p.reason);

	const isPresetActive = (preset: (typeof PV_DISPUTE_PRESETS)[number]) => {
		if (preset.label === "Others") {
			return !value.trim() || !fixedReasons.includes(value);
		}
		return value === preset.reason;
	};

	return (
		<div className="iz-pv-dispute-fields">
			<p className="iz-tiny iz-muted2 mb-1.5">Quick reason</p>
			<div className="flex flex-wrap gap-1.5">
				{PV_DISPUTE_PRESETS.map((preset) => (
					<button
						key={preset.label}
						type="button"
						className={`iz-hist-chip${isPresetActive(preset) ? " iz-hist-chip--on" : ""}`}
						onClick={() => {
							onChange(preset.reason);
							if (preset.label === "Others") textareaRef.current?.focus();
						}}
					>
						{preset.label}
					</button>
				))}
			</div>
			<textarea
				ref={textareaRef}
				className="iz-pv-dispute-input mt-2"
				rows={4}
				placeholder="Add detail for your agency…"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				aria-label="Dispute reason"
			/>
		</div>
	);
}

function DisputeTargetList({ targets }: { targets: WeeklyDisputeTarget[] }) {
	if (!targets.length) return null;
	return (
		<div className="mb-3 space-y-1.5">
			{targets.map((t) => (
				<p
					key={`${t.dateIso}-${t.incomeKey}`}
					className="iz-tiny rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2.5 py-2"
				>
					<b className="text-[var(--iz-gold-l)]">
						{t.dayLabel} {t.dateLabel}
					</b>{" "}
					· {t.incomeLabel}
					{t.outlet ? ` · ${t.outlet}` : ""} · <b>{formatRM(t.amount)}</b>
				</p>
			))}
		</div>
	);
}

export function PrPvDisputeSheet({
	open,
	onClose,
	mode = "dispute",
	targets,
	reason,
	onReasonChange,
	photos,
	onPhotosChange,
	onSubmit,
	onWithdraw,
}: {
	open: boolean;
	onClose: () => void;
	mode?: "dispute" | "withdraw";
	targets: WeeklyDisputeTarget[];
	reason: string;
	onReasonChange: (value: string) => void;
	photos: string[];
	onPhotosChange: (images: string[]) => void;
	onSubmit: () => void;
	onWithdraw?: () => void;
}) {
	const isWithdraw = mode === "withdraw";

	return (
		<IzSheet open={open} onClose={onClose}>
			<IzCardTitle>
				{isWithdraw
					? "Withdraw dispute?"
					: targets.length === 1
						? "Dispute this amount"
						: "Raise dispute"}
			</IzCardTitle>
			{isWithdraw ? (
				<p className="iz-tiny iz-muted mb-3">
					Flagged this amount by mistake? Withdraw the dispute and it returns to
					verified.
				</p>
			) : null}
			<DisputeTargetList targets={targets} />
			{!isWithdraw && (
				<>
					<DisputeReasonFields value={reason} onChange={onReasonChange} />
					<DisputeImageAttachments images={photos} onChange={onPhotosChange} />
				</>
			)}
			<div className="iz-grid2 mt-3">
				<button type="button" className="iz-btn iz-btn-soft" onClick={onClose}>
					Back
				</button>
				{isWithdraw ? (
					<button
						type="button"
						className="iz-btn iz-btn-primary"
						onClick={onWithdraw}
					>
						<Undo2 className="h-4 w-4" />
						Withdraw dispute
					</button>
				) : (
					<button
						type="button"
						className="iz-btn iz-btn-primary"
						disabled={!reason.trim()}
						onClick={onSubmit}
					>
						Submit dispute
					</button>
				)}
			</div>
		</IzSheet>
	);
}
