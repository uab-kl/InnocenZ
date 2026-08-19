import { SignatureInkMark } from "@agency-portal/components/iz/SignatureInkMark";
import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { PrSignaturePad } from "@agency-portal/components/pr/PrSignaturePad";
import { useMySignature } from "@agency-portal/hooks/use-my-signature";
import { useStore } from "@agency-portal/lib/store";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * Record one signature, reuse it at signing time.
 *
 * This is a convenience, not an authorisation: the stored ink is only ever
 * PRE-LOADED onto a voucher's sign button, and the signer still has to open the
 * voucher and press it. Nothing here auto-signs anything, which is why the copy
 * says so plainly — a signer who believed vouchers signed themselves would stop
 * reading them.
 */
export function SignatureOnFileCard() {
	const { t } = usePortalLocale();
	const toast = useStore((s) => s.toast);
	const { ink, isLoading, save, remove, isSaving } = useMySignature();
	const [drawing, setDrawing] = useState(false);

	const onSave = async (next: {
		w: number;
		h: number;
		strokes: [number, number][][];
	}) => {
		try {
			await save(next);
			setDrawing(false);
			toast(t.profile.signatureSaved, "success");
		} catch {
			toast(t.profile.couldNotSaveSignature, "warn");
		}
	};

	const onRemove = async () => {
		try {
			await remove();
			toast(t.profile.signatureRemoved, "success");
		} catch {
			toast(t.profile.couldNotRemoveSignature, "warn");
		}
	};

	return (
		<>
			<IzSectionLabel>{t.profile.signatureOnFile}</IzSectionLabel>
			<IzCard>
				<p className="iz-tiny iz-muted2 mb-2 pt-1">{t.profile.signatureHint}</p>

				{isLoading && <p className="iz-tiny iz-muted2">{t.common.loading}</p>}

				{!isLoading && !drawing && ink && (
					<div className="flex items-center gap-3">
						<div className="flex h-16 flex-1 items-end rounded-lg border border-[var(--iz-line)] bg-white/95 px-2 py-1">
							<SignatureInkMark
								ink={JSON.stringify(ink)}
								label={t.profile.yourSignatureOnFile}
								className="h-12 w-full"
							/>
						</div>
						<div className="flex shrink-0 flex-col gap-1.5">
							<button
								type="button"
								className="iz-btn iz-btn-sm iz-btn-soft"
								disabled={isSaving}
								onClick={() => setDrawing(true)}
							>
								<Pencil className="h-3.5 w-3.5" /> {t.profile.replace}
							</button>
							<button
								type="button"
								className="iz-btn iz-btn-sm iz-btn-ghost"
								disabled={isSaving}
								onClick={() => void onRemove()}
							>
								<Trash2 className="h-3.5 w-3.5" /> {t.profile.remove}
							</button>
						</div>
					</div>
				)}

				{!isLoading && !drawing && !ink && (
					<button
						type="button"
						className="iz-btn iz-btn-primary w-full"
						onClick={() => setDrawing(true)}
					>
						<Pencil className="h-4 w-4" /> {t.profile.recordMySignature}
					</button>
				)}

				{drawing && (
					<div className="mt-2">
						<PrSignaturePad
							label={t.profile.drawSignature}
							onConfirm={() => {
								/* the PNG is not persisted — strokes are */
							}}
							onConfirmInk={(next) => void onSave(next)}
							onCancel={() => setDrawing(false)}
						/>
					</div>
				)}
			</IzCard>
		</>
	);
}
