import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import { cn } from "@agency-portal/lib/utils";
import { useEffect, useState } from "react";

/**
 * A face, with the name's initial as the fallback — one implementation.
 *
 * Named for its first job and still mostly used for PRs, but it holds nothing
 * PR-specific: a venue's logo beside its name is the same problem, and the
 * agency worklist draws outlets this way too.
 *
 * Several agency surfaces showed a coloured letter where History showed the
 * real photo, so the same person looked like two different records depending
 * on which screen the agency happened to be on. The photo is only half of it:
 * the fallback matters just as much, because a PR with nothing on file, an R2
 * key with no public base configured, a deleted object or an expired link all
 * end at a failed <img>, and an empty circle reads as a broken page rather
 * than as "no photo". So the initial is never removed — it is what shows until
 * a photo actually loads, and what comes back if one stops loading.
 *
 * `photo` is the STORED reference, not a URL: an R2 object key, a demo
 * `/img/...` path or a data/blob URL. `prPhotoSrc` decides which is which by
 * prefix — never hand it a pre-resolved URL from a different resolver.
 */
export function PrFaceBubble({
	name,
	photo,
	className,
	photoClassName = "has-photo",
	title,
}: {
	name: string;
	photo?: string | null;
	className?: string;
	/** Applied only while a photo is really showing, so the CSS can clip it. */
	photoClassName?: string;
	title?: string;
}) {
	const src = prPhotoSrc(photo) ?? undefined;
	const [failed, setFailed] = useState(false);
	// A new src deserves its own attempt — otherwise one failure would blank
	// this PR's face for as long as the component stays mounted.
	// biome-ignore lint/correctness/useExhaustiveDependencies(src): src is the reset TRIGGER, not a value the effect reads; dropping it would clear `failed` on mount only and leave a swapped-in photo permanently hidden behind the initial.
	useEffect(() => setFailed(false), [src]);
	const showPhoto = !!src && !failed;

	return (
		<span className={cn(className, showPhoto && photoClassName)} title={title}>
			{showPhoto ? (
				<img src={src} alt="" onError={() => setFailed(true)} />
			) : (
				(name.trim()[0]?.toUpperCase() ?? "?")
			)}
		</span>
	);
}
