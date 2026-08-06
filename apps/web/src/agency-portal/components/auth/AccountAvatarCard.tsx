import { useStore } from "@agency-portal/lib/store";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Check, Loader2, User } from "lucide-react";
import { useRef, useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { uploadMyProfileImage } from "@/lib/auth/profile-api";
import { profileQueryKey, useProfile } from "@/lib/auth/use-profile";

const ACCEPTED = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Signed-in user's personal avatar (`user.profile_image` → R2
 * `user/{id}_{name}/profile/…`). Shared by outlet + agency Settings — not the
 * organisation logo on the hero.
 */
export function AccountAvatarCard() {
	const toast = useStore((s) => s.toast);
	const queryClient = useQueryClient();
	const { data: me, isLoading } = useProfile();
	const fileRef = useRef<HTMLInputElement>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [justUploaded, setJustUploaded] = useState(false);

	const savedUrl = apiAssetUrl(me?.profileImage);
	const src = preview ?? savedUrl ?? null;
	const letter =
		me?.displayName?.trim()[0]?.toUpperCase() ||
		me?.username?.trim()[0]?.toUpperCase() ||
		"?";

	const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file || !me?.id) return;
		if (!ACCEPTED.split(",").includes(file.type)) {
			toast("Only JPG, PNG, and WebP images are allowed", "warn");
			return;
		}
		if (file.size > MAX_BYTES) {
			toast("Image must be under 5 MB", "warn");
			return;
		}

		const objectUrl = URL.createObjectURL(file);
		setPreview(objectUrl);
		setUploading(true);
		setJustUploaded(false);
		try {
			await uploadMyProfileImage(me.id, file);
			await queryClient.invalidateQueries({ queryKey: profileQueryKey });
			setPreview(null);
			URL.revokeObjectURL(objectUrl);
			setJustUploaded(true);
			toast("Photo uploaded successfully", "success");
		} catch (err) {
			toast(
				err instanceof Error ? err.message : "Could not upload profile photo",
				"warn",
			);
			setPreview(null);
			URL.revokeObjectURL(objectUrl);
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
					<p className="text-sm font-semibold text-[var(--iz-txt)]">Your photo</p>
					<p className="iz-tiny iz-muted mt-0.5">
						Personal account avatar — not the organisation logo above.
					</p>
				</div>
				{/* `.iz-btn` is width:100% by default — without auto/sm it crushes the copy. */}
				<button
					type="button"
					className="iz-btn iz-btn-soft iz-btn-sm shrink-0 !w-auto"
					disabled={uploading}
					onClick={() => fileRef.current?.click()}
				>
					<Camera className="h-3.5 w-3.5" />
					{src ? "Change" : "Upload"}
				</button>
			</div>
			{justUploaded && (
				<p
					className="mt-2 flex items-center gap-1.5 text-xs font-semibold"
					style={{ color: "var(--iz-green, #6ee7a8)" }}
					role="status"
				>
					<Check className="h-3.5 w-3.5 shrink-0" />
					Photo uploaded successfully
				</p>
			)}
		</div>
	);
}
