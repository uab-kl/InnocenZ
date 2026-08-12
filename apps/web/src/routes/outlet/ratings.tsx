import {
	OutletEmptyState,
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import {
	type OutletRating,
	useOutletRatings,
} from "@agency-portal/hooks/use-outlet-ratings";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";

// The outlet's own ratings, which until now it could write but never read back.
// The Calendar that used to answer to this path moved to `/outlet/calendar`.
export const Route = createFileRoute("/outlet/ratings")({
	component: RatingsPage,
});

/** Star filter — `null` means "any". */
type StarFilter = 1 | 2 | 3 | 4 | 5 | null;

function StarRow({ stars }: { stars: number }) {
	return (
		<div
			// `role="img"` so the label has something to attach to: the stars are one
			// meaningful graphic, not five, and each <Star> is aria-hidden below.
			role="img"
			className="flex items-center gap-0.5"
			aria-label={`${stars} of 5 stars`}
		>
			{[1, 2, 3, 4, 5].map((n) => (
				<Star
					key={n}
					aria-hidden="true"
					className={`h-3.5 w-3.5 ${
						n <= stars
							? "fill-[var(--iz-gold)] text-[var(--iz-gold)]"
							: "text-[var(--iz-muted2)]"
					}`}
				/>
			))}
		</div>
	);
}

function RatingCard({ rating }: { rating: OutletRating }) {
	return (
		<li className="rounded-xl border border-[var(--iz-line)] bg-white/[0.02] p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate font-sora text-sm font-bold">
						{rating.prName || "Unnamed PR"}
					</p>
					<div className="mt-1 flex items-center gap-2">
						<StarRow stars={rating.stars} />
						<span className="iz-tiny iz-muted">{rating.stars}/5</span>
					</div>
				</div>
				<span className="iz-tiny iz-muted shrink-0">{rating.dateLabel}</span>
			</div>

			{rating.tags.length > 0 && (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{rating.tags.map((tag) => (
						<span key={tag} className="iz-pill iz-pill-violet !text-[10px]">
							{tag}
						</span>
					))}
				</div>
			)}

			{rating.note && (
				<p className="iz-tiny mt-3 whitespace-pre-wrap text-[var(--iz-text)]">
					{rating.note}
				</p>
			)}
		</li>
	);
}

function RatingsPage() {
	const outletName = useStore((s) => s.outletWorkspace.outletName);
	const demoRatings = useStore((s) => s.ratings);
	const backend = useOutletRatings();

	const [query, setQuery] = useState("");
	const [starFilter, setStarFilter] = useState<StarFilter>(null);

	// A real outlet session reads the `rating` table; demo sessions keep the demo
	// store, which carries no prId — hence the empty one.
	const ratings = useMemo<OutletRating[]>(() => {
		if (backend.backed) return backend.ratings;
		return demoRatings.map((r) => ({
			id: r.id,
			prId: "",
			prName: r.pr,
			stars: r.stars,
			note: r.note ?? "",
			tags: r.tags ?? [],
			createdAt: r.date,
			dateLabel: r.date,
		}));
	}, [backend.backed, backend.ratings, demoRatings]);

	const visible = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return ratings.filter((r) => {
			if (starFilter !== null && r.stars !== starFilter) return false;
			if (!needle) return true;
			return (
				r.prName.toLowerCase().includes(needle) ||
				r.note.toLowerCase().includes(needle) ||
				r.tags.some((t) => t.toLowerCase().includes(needle))
			);
		});
	}, [ratings, query, starFilter]);

	// Averaged over every rating the outlet holds, not the filtered view — a
	// filtered average would read as the outlet's overall verdict while silently
	// describing a subset.
	const canRate = useOutletCan()("ratePrs");
	const average = useMemo(() => {
		if (ratings.length === 0) return null;
		const total = ratings.reduce((sum, r) => sum + r.stars, 0);
		return total / ratings.length;
	}, [ratings]);

	return (
		<OutletPage>
			<OutletPageHeader
				eyebrow={outletName}
				title="Ratings"
				hint={
					canRate
						? "Ratings you have left on PRs. Rate a PR from Today once their shift is sealed."
						: "Ratings this outlet has left on PRs. Your role can view but not rate."
				}
			/>

			{ratings.length > 0 && (
				<div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--iz-line)] bg-white/[0.02] px-4 py-3">
					<div className="flex items-center gap-2">
						<span className="font-sora text-xl font-bold">
							{average?.toFixed(1)}
						</span>
						<StarRow stars={Math.round(average ?? 0)} />
					</div>
					<span className="iz-tiny iz-muted">
						{ratings.length} rating{ratings.length === 1 ? "" : "s"}
						{backend.backed ? "" : " · demo data"}
					</span>
				</div>
			)}

			{ratings.length > 0 && (
				<div className="mb-4 flex flex-wrap items-center gap-2">
					<input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search PR, note or tag…"
						className="min-w-0 flex-1 rounded-xl border border-[var(--iz-line2)] bg-white/[0.03] px-3.5 py-2 text-sm outline-none"
					/>
					<div className="flex gap-1.5">
						{([null, 5, 4, 3, 2, 1] as StarFilter[]).map((n) => (
							<button
								key={n ?? "any"}
								type="button"
								onClick={() => setStarFilter(n)}
								className={`iz-pill !text-[10px] ${
									starFilter === n ? "iz-pill-violet" : "iz-pill-ink"
								}`}
							>
								{n === null ? "All" : `${n}★`}
							</button>
						))}
					</div>
				</div>
			)}

			{backend.backed && backend.isLoading && (
				<p className="iz-tiny iz-muted">Loading ratings…</p>
			)}

			{backend.backed && backend.isError && (
				<div className="rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					<p className="iz-tiny iz-muted">
						Could not load ratings. This shows nothing rather than demo rows, so
						an empty list is never mistaken for "no ratings".
					</p>
					<button
						type="button"
						onClick={backend.refetch}
						className="iz-btn iz-btn-ghost mt-3"
					>
						Try again
					</button>
				</div>
			)}

			{!backend.isLoading && !backend.isError && ratings.length === 0 && (
				<OutletEmptyState>
					No ratings yet. Once a PR's shift is sealed on Today, you can rate
					them and it will appear here.
				</OutletEmptyState>
			)}

			{!backend.isError && ratings.length > 0 && visible.length === 0 && (
				<OutletEmptyState>No rating matches that search.</OutletEmptyState>
			)}

			{visible.length > 0 && (
				<ul className="flex flex-col gap-3">
					{visible.map((rating) => (
						<RatingCard key={rating.id} rating={rating} />
					))}
				</ul>
			)}
		</OutletPage>
	);
}
