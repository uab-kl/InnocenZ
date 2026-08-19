import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import {
	DEFAULT_GEO_FENCE_RADIUS,
	useOutletGeoFence,
} from "@agency-portal/hooks/use-outlet-geo-fence";
import { useStore } from "@agency-portal/lib/store";
import { Crosshair, MapPin, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type { GeocodeCandidate } from "@/services/outlet";

const MIN_RADIUS = 10;
const MAX_RADIUS = 1000;

/** ROOFTOP is a building; APPROXIMATE can be a whole suburb — worth flagging. */
function precisionNote(
	precision: GeocodeCandidate["precision"],
	t: PortalTranslations,
): {
	label: string;
	warn: boolean;
} {
	if (precision === "ROOFTOP")
		return { label: t.geofence.precisionRooftop, warn: false };
	if (precision === "RANGE_INTERPOLATED")
		return { label: t.geofence.precisionInterpolated, warn: false };
	if (precision === "GEOMETRIC_CENTER")
		return { label: t.geofence.precisionBlockCentre, warn: true };
	return { label: t.geofence.precisionApproximate, warn: true };
}

/** Hairline rule with a centred word — ties the two lookup routes into one step. */
function OrDivider() {
	const { t } = usePortalLocale();
	return (
		<div className="flex items-center gap-3" aria-hidden="true">
			<span className="h-px flex-1 bg-[var(--iz-line)]" />
			<span className="iz-tiny iz-muted2">{t.geofence.or}</span>
			<span className="h-px flex-1 bg-[var(--iz-line)]" />
		</div>
	);
}

/**
 * Sets the venue's check-in pin.
 *
 * Until a pin exists the backend accepts every check-in here without measuring
 * anything (`verifyWithinGeoFence` returns `enforced: false` when lat/lng are
 * null) — so this card is what turns attendance verification on for a venue.
 * A wrong pin is worse than none: it rejects staff who really are on site.
 * Hence lookup and commit are separate: the operator confirms the matched
 * address and its precision before anything is saved. Coordinates are
 * deliberately not shown — `precisionNote` is what flags a bad match now.
 *
 * Owner-only, matching `outletOwnerOnly` on PATCH /outlet/:id/geo-fence.
 */
export function GeoFenceCard({ canEdit }: { canEdit: boolean }) {
	const { t } = usePortalLocale();
	const toast = useStore((s) => s.toast);
	const {
		backed,
		pin,
		isLoading,
		candidates,
		searchedAddress,
		lookupError,
		isLookingUp,
		isSaving,
		isClearing,
		lookup,
		save,
		clearPin,
	} = useOutletGeoFence();

	const [address, setAddress] = useState("");
	// null = untouched, so the field tracks the server value as it loads and
	// after each save. Seeding state with the saved radius instead would pin it
	// at the default (50) for the whole first render pass — and re-saving would
	// then silently shrink a venue fenced at any other distance.
	const [radiusDraft, setRadiusDraft] = useState<string | null>(null);
	// Removing a pin silently re-opens the venue to check-ins from anywhere, and
	// nothing downstream would flag it — so it costs a second click, not a toast
	// after the fact.
	const [confirmingRemove, setConfirmingRemove] = useState(false);

	// Demo sessions have no outlet to pin; the demo store holds no coordinates.
	// Say so rather than rendering nothing — an operator who sees no card at all
	// cannot tell "not available on a demo login" from "this venue is fenced".
	if (!backed)
		return (
			<>
				<IzSectionLabel>{t.geofence.attendance}</IzSectionLabel>
				<IzCard>
					<p className="iz-tiny iz-muted text-pretty rounded-[14px] border border-dashed border-[var(--iz-line)] px-3 py-2">
						{t.geofence.demoSession}
					</p>
				</IzCard>
			</>
		);

	const savedRadius = pin?.radius ?? DEFAULT_GEO_FENCE_RADIUS;
	const radius = radiusDraft ?? String(savedRadius);
	const radiusValue = Number(radius);
	const radiusValid =
		Number.isInteger(radiusValue) &&
		radiusValue >= MIN_RADIUS &&
		radiusValue <= MAX_RADIUS;
	// Radius alone is savable once a pin exists — otherwise widening a fence
	// would mean re-finding an address you have already confirmed.
	const radiusChanged =
		pin != null && radiusValid && radiusValue !== pin.radius;

	const commit = async (lat: number, lng: number) => {
		if (!radiusValid) {
			toast(
				fill(t.geofence.radiusMustBe, { min: MIN_RADIUS, max: MAX_RADIUS }),
				"warn",
			);
			return;
		}
		try {
			await save({ lat, lng, radius: radiusValue });
			setRadiusDraft(null);
			toast(t.geofence.pinSaved, "success");
		} catch {
			toast(t.geofence.couldNotSavePin, "warn");
		}
	};

	const removePin = async () => {
		try {
			await clearPin();
			setConfirmingRemove(false);
			setRadiusDraft(null);
			toast(t.geofence.pinRemoved, "success");
		} catch {
			toast(t.geofence.couldNotRemovePin, "warn");
		}
	};

	return (
		<>
			<IzSectionLabel>{t.geofence.attendance}</IzSectionLabel>
			<IzCard>
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-sm font-semibold">
							<MapPin className="h-4 w-4 shrink-0" />{" "}
							{t.geofence.checkInLocation}
						</div>
						{/* Saving a pin is the fence master-switch. State it once — the
						    colour carries the urgency, the sentence the consequence —
						    rather than repeating it in a banner, a pill and a caption. */}
						<p
							className={`iz-tiny mt-1 text-pretty ${
								pin ? "iz-muted" : "text-[var(--iz-amber)]"
							}`}
						>
							{pin
								? fill(t.geofence.withinMetres, { radius: pin.radius })
								: t.geofence.noPinYet}
						</p>
					</div>
					<span
						className={`iz-pill !text-[10px] shrink-0 ${pin ? "iz-pill-green" : "iz-pill-amber"}`}
					>
						{isLoading
							? t.geofence.loading
							: pin
								? t.geofence.fenced
								: t.geofence.notSet}
					</span>
				</div>

				{!canEdit && (
					<p className="iz-tiny iz-muted2 mt-3 text-pretty">
						{t.geofence.onlyOwnerCanChange}
					</p>
				)}

				{canEdit && (
					<div className="mt-4 space-y-4">
						<div>
							<div className="flex flex-wrap items-end gap-3">
								<label className="block">
									<span className="iz-tiny iz-muted">{t.geofence.radius}</span>
									<div className="mt-1 flex items-center gap-2">
										{/* `.iz-field-input` is width:100%, which outranks a bare
										    `w-24` in the cascade — hence the `!`. */}
										<input
											className={`iz-field-input !w-24 tabular-nums ${
												radiusValid ? "" : "!border-[var(--iz-red)]"
											}`}
											inputMode="numeric"
											aria-label={t.geofence.radiusAria}
											aria-invalid={!radiusValid}
											value={radius}
											onChange={(e) => setRadiusDraft(e.target.value)}
										/>
										<span className="iz-tiny iz-muted2">
											{t.geofence.metres}
										</span>
									</div>
								</label>
								{radiusChanged && (
									<button
										type="button"
										className="iz-btn iz-btn-soft iz-btn-sm shrink-0 whitespace-nowrap"
										disabled={isSaving}
										onClick={() => void commit(pin.lat, pin.lng)}
									>
										{isSaving ? t.common.saving : t.geofence.updateRadius}
									</button>
								)}
							</div>
							{!radiusValid && (
								<p className="iz-tiny mt-1.5 text-pretty text-[var(--iz-red)]">
									{fill(t.geofence.radiusRange, {
										min: MIN_RADIUS,
										max: MAX_RADIUS,
									})}
								</p>
							)}
						</div>

						<div className="space-y-3">
							<p className="iz-tiny iz-muted2 text-pretty">
								{pin ? t.geofence.movePin : t.geofence.findFrontDoor}
							</p>

							{/* `!` throughout this card: the theme's `.iz-btn`/`.iz-btn-sm`/
							    `.iz-field-input` all hard-set width and outrank plain
							    Tailwind width utilities in the cascade. */}
							<button
								type="button"
								className="iz-btn iz-btn-soft iz-btn-sm !w-full"
								disabled={isLookingUp}
								onClick={() => void lookup()}
							>
								<Crosshair className="h-4 w-4" />
								{isLookingUp
									? t.geofence.lookingUp
									: t.geofence.findFromVenueAddress}
							</button>

							<OrDivider />

							{/* `.iz-btn` is width:100% (mobile-first), which would starve the
							    input on this row — `.iz-btn-sm` restores width:auto. */}
							<div className="flex gap-2">
								<input
									className="iz-field-input min-w-0 flex-1"
									placeholder={t.geofence.searchAnotherAddress}
									value={address}
									onChange={(e) => setAddress(e.target.value)}
								/>
								<button
									type="button"
									className="iz-btn iz-btn-soft iz-btn-sm shrink-0 whitespace-nowrap"
									disabled={isLookingUp || address.trim().length < 3}
									onClick={() => void lookup(address)}
								>
									<Search className="h-4 w-4" /> {t.common.search}
								</button>
							</div>
						</div>

						{lookupError && (
							<p className="iz-tiny text-pretty rounded-[14px] border border-dashed border-[var(--iz-line)] px-3 py-2 text-[var(--iz-amber)]">
								{lookupError}
							</p>
						)}

						{candidates.length > 0 && (
							<div className="space-y-2">
								{searchedAddress && (
									<p className="iz-tiny iz-muted2 text-pretty">
										{fill(t.geofence.searched, { address: searchedAddress })}
									</p>
								)}
								{/* Panel radius sits above the 14px button it contains, so the
								    corners nest rather than fight. */}
								{candidates.map((candidate) => {
									const note = precisionNote(candidate.precision, t);
									return (
										<div
											key={candidate.placeId}
											className="rounded-2xl border border-[var(--iz-line)] bg-[var(--iz-bg2)] p-3"
										>
											<div className="text-sm font-medium text-balance">
												{candidate.formattedAddress}
											</div>
											<p
												className={`iz-tiny mt-0.5 ${note.warn ? "text-[var(--iz-amber)]" : "iz-muted"}`}
											>
												{note.label}
											</p>
											<button
												type="button"
												className="iz-btn iz-btn-primary mt-2 w-full"
												disabled={isSaving}
												onClick={() =>
													void commit(candidate.lat, candidate.lng)
												}
											>
												{isSaving
													? t.common.saving
													: t.geofence.useThisLocation}
											</button>
										</div>
									);
								})}
							</div>
						)}

						{/* Last, and behind a confirm: this is the only control on the card
						    that makes the venue LESS verified than it was. */}
						{pin &&
							(confirmingRemove ? (
								<div className="rounded-2xl border border-[rgba(240,138,138,.35)] bg-[var(--iz-red-bg)] p-3">
									<p className="iz-tiny text-pretty text-[var(--iz-red)]">
										{t.geofence.removeConfirm}
									</p>
									<div className="mt-2 flex flex-wrap gap-2">
										<button
											type="button"
											className="iz-btn iz-btn-soft iz-btn-sm shrink-0"
											disabled={isClearing}
											onClick={() => setConfirmingRemove(false)}
										>
											{t.geofence.keepThePin}
										</button>
										<button
											type="button"
											className="iz-btn iz-btn-danger iz-btn-sm shrink-0"
											disabled={isClearing}
											onClick={() => void removePin()}
										>
											{isClearing
												? t.geofence.removing
												: t.geofence.yesRemoveIt}
										</button>
									</div>
								</div>
							) : (
								<button
									type="button"
									className="iz-btn iz-btn-ghost iz-btn-sm !w-full !text-[var(--iz-red)]"
									onClick={() => setConfirmingRemove(true)}
								>
									<Trash2 className="h-4 w-4" /> {t.geofence.removePin}
								</button>
							))}
					</div>
				)}
			</IzCard>
		</>
	);
}
