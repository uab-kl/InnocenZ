import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import {
	DEFAULT_GEO_FENCE_RADIUS,
	useOutletGeoFence,
} from "@agency-portal/hooks/use-outlet-geo-fence";
import { useStore } from "@agency-portal/lib/store";
import { Crosshair, MapPin, Search } from "lucide-react";
import { useState } from "react";
import type { GeocodeCandidate } from "@/services/outlet";

const MIN_RADIUS = 10;
const MAX_RADIUS = 1000;

/** ROOFTOP is a building; APPROXIMATE can be a whole suburb — worth flagging. */
function precisionNote(precision: GeocodeCandidate["precision"]): {
	label: string;
	warn: boolean;
} {
	if (precision === "ROOFTOP") return { label: "Rooftop", warn: false };
	if (precision === "RANGE_INTERPOLATED")
		return { label: "Interpolated", warn: false };
	if (precision === "GEOMETRIC_CENTER")
		return { label: "Block centre", warn: true };
	return { label: "Approximate — may be a whole area", warn: true };
}

/**
 * Sets the venue's check-in pin.
 *
 * Until a pin exists the backend accepts every check-in here without measuring
 * anything (`verifyWithinGeoFence` returns `enforced: false` when lat/lng are
 * null) — so this card is what turns attendance verification on for a venue.
 * A wrong pin is worse than none: it rejects staff who really are on site.
 * Hence lookup and commit are separate, and the operator sees the coordinates
 * before saving.
 *
 * Owner-only, matching `outletOwnerOnly` on PATCH /outlet/:id/geo-fence.
 */
export function GeoFenceCard({ canEdit }: { canEdit: boolean }) {
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
		lookup,
		clearCandidates,
		save,
	} = useOutletGeoFence();

	const [address, setAddress] = useState("");
	const [radius, setRadius] = useState(String(DEFAULT_GEO_FENCE_RADIUS));
	const [manual, setManual] = useState(false);
	const [manualLat, setManualLat] = useState("");
	const [manualLng, setManualLng] = useState("");

	// Demo sessions have no outlet to pin; the demo store holds no coordinates.
	// Say so rather than rendering nothing — an operator who sees no card at all
	// cannot tell "not available on a demo login" from "this venue is fenced".
	if (!backed)
		return (
			<>
				<IzSectionLabel>Attendance</IzSectionLabel>
				<IzCard>
					<p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
						Demo session — sign in with a real outlet account to pin the venue
						and switch on the check-in fence.
					</p>
				</IzCard>
			</>
		);

	const radiusValue = Number(radius);
	const radiusValid =
		Number.isInteger(radiusValue) &&
		radiusValue >= MIN_RADIUS &&
		radiusValue <= MAX_RADIUS;

	const commit = async (lat: number, lng: number) => {
		if (!radiusValid) {
			toast(`Radius must be ${MIN_RADIUS}–${MAX_RADIUS} metres`, "warn");
			return;
		}
		try {
			await save({ lat, lng, radius: radiusValue });
			toast("Check-in pin saved", "success");
			setManual(false);
			setManualLat("");
			setManualLng("");
		} catch {
			toast("Could not save the pin", "warn");
		}
	};

	const commitManual = () => {
		const lat = Number(manualLat);
		const lng = Number(manualLng);
		if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
			toast("Latitude must be between -90 and 90", "warn");
			return;
		}
		if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
			toast("Longitude must be between -180 and 180", "warn");
			return;
		}
		void commit(lat, lng);
	};

	return (
		<>
			<IzSectionLabel>Attendance</IzSectionLabel>
			<IzCard>
				{/* Saving a pin is the fence master-switch, so lead with whether it
				    is on: from that moment every check-in outside the radius is
				    refused server-side (HTTP 422). */}
				{pin ? (
					<p className="iz-tiny mb-2 rounded-lg border border-[rgba(74,222,128,.35)] bg-[rgba(74,222,128,.08)] px-2.5 py-1.5 text-[var(--iz-green)]">
						Fence ON · pin saved at {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)} ·{" "}
						{pin.radius} m — check-ins outside this circle are refused.
					</p>
				) : (
					<p className="iz-tiny mb-2 rounded-lg border border-[rgba(251,191,36,.35)] bg-[rgba(251,191,36,.08)] px-2.5 py-1.5 text-[var(--iz-amber,#fbbf24)]">
						No map pin yet — the check-in rule is NOT enforced for this venue.
						Saving a pin switches it on immediately.
					</p>
				)}

				<div className="flex items-start justify-between gap-3">
					<div>
						<div className="flex items-center gap-2 text-sm font-semibold">
							<MapPin className="h-4 w-4" /> Check-in location
						</div>
						<p className="iz-tiny iz-muted mt-1">
							{pin
								? `PRs must be within ${pin.radius} m of this point to check in.`
								: "No pin set — check-ins here are accepted without any location check."}
						</p>
					</div>
					<span
						className={`iz-pill !text-[10px] ${pin ? "iz-pill-green" : "iz-pill-amber"}`}
					>
						{isLoading ? "Loading" : pin ? "Fenced" : "Not set"}
					</span>
				</div>

				{!canEdit && (
					<p className="iz-tiny iz-muted2 mt-3">
						Only the outlet owner can change the check-in pin.
					</p>
				)}

				{canEdit && (
					<div className="mt-4 space-y-3">
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								className="iz-btn iz-btn-soft"
								disabled={isLookingUp}
								onClick={() => void lookup()}
							>
								<Crosshair className="h-4 w-4" />
								{isLookingUp ? "Looking up…" : "Find from venue address"}
							</button>
							<button
								type="button"
								className="iz-btn iz-btn-soft"
								onClick={() => {
									setManual((m) => !m);
									clearCandidates();
								}}
							>
								{manual ? "Cancel manual entry" : "Enter coordinates"}
							</button>
						</div>

						<div className="flex gap-2">
							<input
								className="iz-field-input flex-1"
								placeholder="Or search another address"
								value={address}
								onChange={(e) => setAddress(e.target.value)}
							/>
							<button
								type="button"
								className="iz-btn iz-btn-soft"
								disabled={isLookingUp || address.trim().length < 3}
								onClick={() => void lookup(address)}
							>
								<Search className="h-4 w-4" /> Search
							</button>
						</div>

						<label className="block">
							<span className="iz-tiny iz-muted">Radius (metres)</span>
							<input
								className="iz-field-input mt-1 w-32"
								inputMode="numeric"
								value={radius}
								onChange={(e) => setRadius(e.target.value)}
							/>
						</label>

						{lookupError && (
							<p className="iz-tiny rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5 text-[var(--iz-amber,#d9b97a)]">
								{lookupError}
							</p>
						)}

						{manual && (
							<div className="rounded-lg border border-[var(--iz-line)] p-3">
								<p className="iz-tiny iz-muted mb-2">
									Read the coordinates off any map app at the venue's door.
								</p>
								<div className="flex gap-2">
									<input
										className="iz-field-input flex-1"
										placeholder="Latitude"
										value={manualLat}
										onChange={(e) => setManualLat(e.target.value)}
									/>
									<input
										className="iz-field-input flex-1"
										placeholder="Longitude"
										value={manualLng}
										onChange={(e) => setManualLng(e.target.value)}
									/>
								</div>
								<button
									type="button"
									className="iz-btn iz-btn-primary mt-2 w-full"
									disabled={isSaving}
									onClick={commitManual}
								>
									{isSaving ? "Saving…" : "Save this pin"}
								</button>
							</div>
						)}

						{candidates.length > 0 && (
							<div className="space-y-2">
								{searchedAddress && (
									<p className="iz-tiny iz-muted2">
										Searched: {searchedAddress}
									</p>
								)}
								{candidates.map((candidate) => {
									const note = precisionNote(candidate.precision);
									return (
										<div
											key={candidate.placeId}
											className="rounded-lg border border-[var(--iz-line)] p-3"
										>
											<div className="text-sm font-medium">
												{candidate.formattedAddress}
											</div>
											<p className="iz-tiny iz-muted2 mt-0.5 font-mono">
												{candidate.lat.toFixed(6)}, {candidate.lng.toFixed(6)}
											</p>
											<p
												className={`iz-tiny mt-0.5 ${note.warn ? "text-[var(--iz-amber,#d9b97a)]" : "iz-muted"}`}
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
												{isSaving ? "Saving…" : "Use this location"}
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}
			</IzCard>
		</>
	);
}
