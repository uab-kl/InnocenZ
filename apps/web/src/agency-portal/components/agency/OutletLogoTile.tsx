import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import { cn } from "@agency-portal/lib/utils";
import { MapPin } from "lucide-react";
import { useState } from "react";

/**
 * The venue's identity tile: its logo when the outlet has uploaded one, the map
 * pin when it has not.
 *
 * The pin is the answer for a venue with no logo on file — two of the five
 * outlets on the live registry have none — and it is also where a logo that
 * fails to load ends up. Without the `onError` fallback a broken R2 key leaves a
 * tinted tile with nothing in it, which reads as a bug in the card rather than as
 * a venue that never uploaded a mark.
 *
 * The tile class comes from the caller, because the two places this appears are
 * sized and tinted differently: a 48px card tile that takes the card's accent
 * colour, and a 52px violet header tile.
 */
export function OutletLogoTile({
	logo,
	className,
	iconClassName = "h-6 w-6",
}: {
	/** `outlet.logoImage` — an R2 object key, or null when none was uploaded. */
	logo?: string | null;
	/** The tile class this surface uses; the logo modifier is added to it. */
	className: string;
	/** Size classes for the fallback pin, matching the surface it sits on. */
	iconClassName?: string;
}) {
	// `prPhotoSrc` is the ONE resolver: an `outlet/…` key needs the R2 base, and
	// `publicAssetPath` would prefix the Vite base instead and serve nothing.
	const src = prPhotoSrc(logo);
	const [failedSrc, setFailedSrc] = useState<string | null>(null);

	if (src && failedSrc !== src) {
		return (
			<div className={cn(className, "iz-outlet-logo-tile")} aria-hidden>
				{/* Eager. A venue list is a handful of cards, all of them on screen, so
				    lazy loading saves nothing here — and a lazy image that never
				    starts also never reaches `onError`, which is what leaves a blank
				    tile where the map pin belongs. */}
				<img src={src} alt="" onError={() => setFailedSrc(src)} />
			</div>
		);
	}

	return (
		<div className={className} aria-hidden>
			<MapPin className={iconClassName} />
		</div>
	);
}
