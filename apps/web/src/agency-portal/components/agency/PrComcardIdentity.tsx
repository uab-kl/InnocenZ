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
import { splitCardLanguages } from "@agency-portal/lib/agency-demo";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import { recordRating } from "@agency-portal/lib/pr-rating-summary";
import { cn } from "@agency-portal/lib/utils";
import { useState } from "react";

/**
 * The sheet is a full-width bottom panel — every language fits, so nothing is
 * collapsed here. It was `slice(0, 3)`, silently.
 */
const MAX_SHEET_LANGUAGES = Number.POSITIVE_INFINITY;

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
	// The same splitter the Manage-PR card uses, so one PR's languages read the
	// same on both screens. This sheet has room for all of them, so the cap is
	// the full list and `hidden` is always 0 here — but it goes through the one
	// helper rather than a second private slice, which is what let the roster
	// drift to three languages while Manage PR and her own phone showed four.
	const langs = splitCardLanguages(
		profile ?? { languages: [] },
		MAX_SHEET_LANGUAGES,
	);
	// Not `profile.rating` — see recordRating: that field is a 0 placeholder on
	// every backend PR, and `!= null` printed it as a real "0★" score.
	const rating = profile ? recordRating(profile) : null;
	// "(Vicky) Victoria Tan Mei Lin", never the nickname alone. `pr.name` is the
	// FLOOR name — right for the comcard artwork's name plate, wrong for anything
	// that identifies the person. Kept as the fallback for a slot with no roster
	// record behind it, where the nickname is genuinely all we hold.
	const label = profile
		? formatPayeeLabel(profile.name, profile.icName)
		: pr.name;

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
				aria-label={`View comcard for ${label}`}
				title={`View ${label}'s comcard`}
			>
				<Comcard3dPreviewThumb pr={pr} />
			</button>

			<IzSheet open={open} onClose={() => setOpen(false)}>
				{/*
					"(Vicky) Victoria Tan Mei Lin", never the nickname alone. The card
					used to print `pr.name`, which the mapper fills with the NICKNAME —
					so the agency saw "Vicky" with no way to tell whose IC that is.
					`formatPayeeLabel` is the one spelling of a payee across the portal;
					it collapses to a single name when there is only one to show.
				*/}
				<IzCardTitle className="mb-1">{label}</IzCardTitle>
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
					{/*
						`rating: 0` is the mapper's placeholder for "GET /pr returns no
						rating", NOT a score — see pr-rating-summary.ts. The old
						`!= null` test let that 0 through, so every backend PR wore a
						gold "0★" badge as if an outlet had rated her one star. Vicky has
						no rows in `rating` at all. A score is shown only when one exists.
					*/}
					{rating !== null && (
						<IzPill variant="gold" className="!py-0.5 !text-[9px]">
							{rating}★
						</IzPill>
					)}
					{/*
						Every language on the account. This was capped at 3, which is how
						the roster showed Vicky as English/Mandarin/Hokkien while her
						profile — reading the same `user_profile.languages` — showed those
						plus Cantonese. One row, two answers, purely from a slice.
					*/}
					{langs.shown.map((lang) => (
						<IzPill key={lang} variant="violet" className="!py-0.5 !text-[9px]">
							{lang}
						</IzPill>
					))}
					{/*
						Unreachable while the cap above is the full list, and kept so it
						stays unreachable: if anyone ever caps this sheet again, the count
						says so out loud instead of dropping a language silently. IzPill
						takes no `title`, so the tooltip lives on the wrapper.
					*/}
					{langs.hidden > 0 && (
						<span title={langs.all.join(" · ")}>
							<IzPill variant="violet" className="!py-0.5 !text-[9px]">
								+{langs.hidden}
							</IzPill>
						</span>
					)}
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
