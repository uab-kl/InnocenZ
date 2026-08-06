import {
	Comcard3dPreviewThumb,
	Comcard3dPreviewVisual,
	type ComcardPreviewData,
	comcardMeasure,
} from "@agency-portal/components/agency/Comcard3dPreview";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCardTitle, IzPill } from "@agency-portal/components/iz/ui";
import { StaticComcardVisual } from "@agency-portal/components/pr/PortfolioComcardVisual";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { languagesFromPr } from "@agency-portal/lib/agency-demo";
import { cn } from "@agency-portal/lib/utils";
import { useState } from "react";

export function toComcardPreview(
	pr: Pick<
		AgencyManagedPR,
		| "id"
		| "name"
		| "height"
		| "weight"
		| "age"
		| "avatarPhoto"
		| "comcardImageUrl"
		| "portfolioPhotos"
	>,
): ComcardPreviewData {
	// Straight through, no substitutions. These three used to fall back to
	// 165cm/52kg/24y, which is how the agency's card described a body the PR had
	// never entered while her own Profile screen showed her real one. 0 reaches
	// the renderers as an em-dash.
	return {
		id: pr.id,
		name: pr.name,
		height: pr.height,
		weight: pr.weight,
		age: pr.age,
		avatarPhoto: pr.avatarPhoto,
		comcardImageUrl: pr.comcardImageUrl,
		portfolioPhotos: pr.portfolioPhotos,
	};
}

export function comcardPreviewFromSlot(
	slot: { prId: string; prName: string },
	pr?: AgencyManagedPR | null,
): ComcardPreviewData {
	if (pr) return toComcardPreview(pr);
	// A slot with no roster record behind it: we have a name and nothing else.
	return {
		id: slot.prId,
		name: slot.prName,
		height: 0,
		weight: 0,
		age: 0,
	};
}

type PrComcardIdentityProps = {
	pr: ComcardPreviewData;
	profile?: AgencyManagedPR | null;
	agencyName?: string;
	size?: "table" | "week";
	className?: string;
};

export function PrComcardIdentity({
	pr,
	profile,
	agencyName,
	size = "table",
	className,
}: PrComcardIdentityProps) {
	const [open, setOpen] = useState(false);
	const langs = profile ? languagesFromPr(profile) : [];

	return (
		<>
			<button
				type="button"
				className={cn(
					"iz-pr-comcard-thumb-btn",
					size === "week" && "iz-pr-comcard-thumb-btn--week",
					className,
				)}
				onClick={(e) => {
					e.stopPropagation();
					setOpen(true);
				}}
				aria-label={`View comcard for ${pr.name}`}
				title={`View ${pr.name}'s comcard`}
			>
				<Comcard3dPreviewThumb pr={pr} />
			</button>

			<IzSheet open={open} onClose={() => setOpen(false)}>
				<IzCardTitle className="mb-1">{pr.name}</IzCardTitle>
				{agencyName && <p className="iz-tiny iz-muted mb-3">{agencyName}</p>}
				{pr.comcardImageUrl ? (
					<StaticComcardVisual src={pr.comcardImageUrl} />
				) : (
					<Comcard3dPreviewVisual pr={pr} showName={false} />
				)}
				<div className="mt-3 flex flex-wrap gap-1.5">
					{profile?.trainingLevel && (
						<IzPill variant="ink" className="!py-0.5 !text-[9px]">
							{profile.trainingLevel}
						</IzPill>
					)}
					{profile?.rating != null && (
						<IzPill variant="gold" className="!py-0.5 !text-[9px]">
							{profile.rating}★
						</IzPill>
					)}
					{langs.slice(0, 3).map((lang) => (
						<IzPill key={lang} variant="violet" className="!py-0.5 !text-[9px]">
							{lang}
						</IzPill>
					))}
				</div>
				<p className="iz-tiny iz-muted2 mt-3 text-center">
					{comcardMeasure(pr.height, " cm")} ·{" "}
					{comcardMeasure(pr.weight, " kg")} · {comcardMeasure(pr.age, "y")}
					{profile?.place ? ` · ${profile.place}` : ""}
				</p>
			</IzSheet>
		</>
	);
}
