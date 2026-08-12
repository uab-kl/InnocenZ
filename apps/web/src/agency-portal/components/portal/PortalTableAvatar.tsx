import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import { cn } from "@agency-portal/lib/utils";
import { useState } from "react";

/**
 * The 36px avatar in a portal table's PR cell: the person's own photo when the
 * account carries one, their initial when it does not.
 *
 * The initial is not a placeholder waiting for a photo — it is the answer for a
 * PR with nothing on file, and it is also where a photo that fails to load
 * lands. Rendering the `<img>` unconditionally would leave an empty violet box
 * on any broken reference, which reads as a bug in the table rather than as a
 * missing image; `onError` is what keeps those two cases looking the same.
 */
export function PortalTableAvatar({
	name,
	photo,
	className,
}: {
	/** The name the initial is taken from — the same one the row prints. */
	name: string | null | undefined;
	/** Any photo reference: R2 object key, `/img/…`, full URL, or /public path. */
	photo?: string | null;
	className?: string;
}) {
	// `prPhotoSrc` is the ONE resolver for a photo reference — never
	// `publicAssetPath` here, which cannot turn an R2 object key
	// (`user/<id>/profile/<uuid>.jpg`) into a URL anything serves.
	const src = prPhotoSrc(photo);
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";

	if (src && failedSrc !== src) {
		return (
			<span
				className={cn(
					"iz-portal-table-av iz-portal-table-av--photo",
					className,
				)}
				aria-hidden
			>
				{/* Eager. These hub tables are a few rows deep and all on screen, so
				    lazy loading buys nothing — and a lazy image that never starts also
				    never reaches `onError`, so the initial fallback would never run. */}
				<img src={src} alt="" onError={() => setFailedSrc(src)} />
			</span>
		);
	}

	return (
		<span className={cn("iz-portal-table-av", className)} aria-hidden>
			{initial}
		</span>
	);
}
