import {
	type AvatarCropResult,
	AvatarCropSheet,
	fileFromCropResult,
	type PendingAvatarPick,
} from "@agency-portal/components/portal/AvatarCropSheet";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { useStore } from "@agency-portal/lib/store";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Crop, Loader2, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import {
	fetchMyProfileImageSource,
	uploadMyProfileImage,
} from "@/lib/auth/profile-api";
import { profileQueryKey, useProfile } from "@/lib/auth/use-profile";
import { usePortalLocale } from "@/lib/portal-i18n/context";

const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Signed-in user's personal avatar (`user.profile_image` → R2
 * `user/{id}_{name}/profile/…`). Shared by outlet + agency Settings — not the
 * organisation logo on the hero.
 */
export function AccountAvatarCard() {
	const { t } = usePortalLocale();
	const toast = useStore((s) => s.toast);
	const queryClient = useQueryClient();
	const { data: me, isLoading } = useProfile();
	const fileRef = useRef<HTMLInputElement>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [justUploaded, setJustUploaded] = useState(false);
	/** Picked but not yet framed — the crop sheet owns it until confirmed. */
	const [pendingPhoto, setPendingPhoto] = useState<PendingAvatarPick | null>(
		null,
	);
	/**
	 * The ORIGINAL image behind the uploaded avatar, plus where it was framed,
	 * so Adjust re-crops the full-resolution source rather than the output.
	 *
	 * No longer cleared on reload: the original is now stored beside the avatar
	 * in R2 and read back through the API below. It still cannot be read from the
	 * R2 public host directly — that host sends no CORS header, so its pixels
	 * could never go back on a canvas — which is precisely why the server serves
	 * it instead.
	 */
	const [photoSource, setPhotoSource] = useState<PendingAvatarPick | null>(
		null,
	);

	/**
	 * Recover the stored original on mount, so Adjust is offered for a photo
	 * uploaded in an earlier session rather than only the one just picked.
	 *
	 * ⚠️ Stored with the FUNCTIONAL updater — `prev ?? fetched` — so a response
	 * that lands after the person has picked a new file cannot overwrite the
	 * image they are framing, without making `photoSource` a dependency that
	 * would re-run this effect the moment a pick set it. Silent on failure: no
	 * source simply means no Adjust, exactly how this card behaved before.
	 */
	useEffect(() => {
		if (!me?.id) return;
		let cancelled = false;
		void fetchMyProfileImageSource(me.id).then((source) => {
			if (cancelled || !source) return;
			setPhotoSource(
				(prev) =>
					prev ?? {
						dataUrl: source.dataUrl,
						fileName: source.fileName,
						contentType: source.contentType,
						state: source.state ?? undefined,
					},
			);
		});
		return () => {
			cancelled = true;
		};
	}, [me?.id]);

	const savedUrl = apiAssetUrl(me?.profileImage);
	const src = preview ?? savedUrl ?? null;
	const letter =
		me?.displayName?.trim()[0]?.toUpperCase() ||
		me?.username?.trim()[0]?.toUpperCase() ||
		"?";

	const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file || !me?.id) return;
		if (!ACCEPTED.split(",").includes(file.type)) {
			toast(t.profile.onlyJpgPngWebp, "warn");
			return;
		}
		if (file.size > MAX_BYTES) {
			toast(t.profile.imageUnder5Mb, "warn");
			return;
		}

		// The crop sheet stands between the picker and the POST. This upload is
		// immediate and has no draft to undo — so framing has to happen BEFORE
		// the request, not after it.
		const reader = new FileReader();
		reader.onload = () => {
			const picked: PendingAvatarPick = {
				dataUrl: reader.result as string,
				fileName: file.name || "avatar.png",
				contentType: file.type || "image/png",
			};
			setPhotoSource(picked);
			setPendingPhoto(picked);
		};
		reader.onerror = () => toast(t.profile.cropFailed, "warn");
		reader.readAsDataURL(file);
	};

	/** Reopen the sheet on the ORIGINAL image, framed where it was left. */
	const adjustCrop = () => {
		if (!photoSource || uploading) return;
		setPendingPhoto(photoSource);
	};

	const uploadCropped = async (result: AvatarCropResult) => {
		if (!me?.id) return;
		setPendingPhoto(null);
		// Remember the framing so the next Adjust opens where this one ended.
		setPhotoSource((s) => (s ? { ...s, state: result.state } : s));
		// The cropped square IS the preview — no object URL to revoke, and what
		// is on screen while the request runs is what the request is sending.
		setPreview(result.dataUrl);
		setUploading(true);
		setJustUploaded(false);
		try {
			await uploadMyProfileImage(me.id, fileFromCropResult(result), {
				// The un-cropped ORIGINAL travels with the cropped file, so a later
				// session can re-frame the real source instead of the output.
				sourceDataUrl: photoSource?.dataUrl ?? null,
				state: result.state,
			});
			await queryClient.invalidateQueries({ queryKey: profileQueryKey });
			setPreview(null);
			setJustUploaded(true);
			toast(t.profile.photoUploaded, "success");
		} catch (err) {
			toast(
				err instanceof Error ? err.message : t.profile.couldNotUploadPhoto,
				"warn",
			);
			setPreview(null);
			setJustUploaded(false);
		} finally {
			setUploading(false);
		}
	};

	if (isLoading || !me?.id) return null;

	return (
		<div className="iz-account-avatar-card mb-3 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-3 py-3">
			<input
				ref={fileRef}
				type="file"
				accept={ACCEPTED}
				className="sr-only"
				onChange={onPick}
			/>
			<AvatarCropSheet
				open={Boolean(pendingPhoto)}
				pick={pendingPhoto}
				onCancel={() => setPendingPhoto(null)}
				onConfirm={uploadCropped}
			/>
			<div className="flex flex-wrap items-center gap-3">
				<div className="relative shrink-0">
					<div
						className={`iz-avatar iz-avatar--md${src ? " iz-avatar-photo" : ""}`}
						style={src ? undefined : { background: "var(--iz-grad)" }}
					>
						{src ? (
							<img src={publicAssetPath(src)} alt="" />
						) : (
							letter || <User className="h-5 w-5" />
						)}
					</div>
					{uploading && (
						<span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
							<Loader2 className="h-4 w-4 animate-spin text-white" />
						</span>
					)}
				</div>
				<div className="min-w-0 flex-1 basis-40">
					<p className="text-sm font-semibold text-[var(--iz-txt)]">
						{t.profile.yourPhoto}
					</p>
					<p className="iz-tiny iz-muted mt-0.5">
						{t.profile.personalAvatarHint}
					</p>
				</div>
				{/* `.iz-btn` is width:100% by default — without auto/sm it crushes the copy. */}
				{photoSource && (
					<button
						type="button"
						className="iz-btn iz-btn-soft iz-btn-sm shrink-0 !w-auto"
						disabled={uploading}
						onClick={adjustCrop}
					>
						<Crop className="h-3.5 w-3.5" />
						{t.profile.cropAdjust}
					</button>
				)}
				<button
					type="button"
					className="iz-btn iz-btn-soft iz-btn-sm shrink-0 !w-auto"
					disabled={uploading}
					onClick={() => fileRef.current?.click()}
				>
					<Camera className="h-3.5 w-3.5" />
					{src ? t.profile.change : t.profile.upload}
				</button>
			</div>
			{justUploaded && (
				<output
					className="mt-2 flex items-center gap-1.5 text-xs font-semibold"
					style={{ color: "var(--iz-green, #6ee7a8)" }}
				>
					<Check className="h-3.5 w-3.5 shrink-0" />
					{t.profile.photoUploaded}
				</output>
			)}
		</div>
	);
}
