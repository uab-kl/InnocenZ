import { GpsRoadMap } from "@agency-portal/components/agency/GpsRoadMap";
import { IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useAgencyAttendanceFixes } from "@agency-portal/hooks/use-agency-attendance-fixes";
import {
	gpsMapBounds,
	mapsUrlForCoord,
	uniqueOutletPins,
} from "@agency-portal/lib/gps-locations";
import { cn } from "@agency-portal/lib/utils";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

const OUTLET_MAP_HEIGHT = 168;

/**
 * Stamps are stored as UTC instants. Rendering the raw ISO string once made a
 * 12:01 pm check-in read as 04:01, so times are always shown in the viewer's own
 * zone.
 */
function stampTime(iso: string): string {
	return new Date(iso).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Where this agency's PRs stamped attendance, for the roster's Live tab.
 *
 * The backed counterpart to `AgencyGpsPanel`, which stays on demo fixtures for
 * demo sessions. Kept as a separate component rather than feeding one component
 * from two sources, matching how the outlet reconciliation banner was split.
 *
 * It is NOT titled "Live GPS", and that is the point. The only positions the
 * system holds are snapshots taken at check-in and check-out — nothing records a
 * location in between — so every coordinate here is shown with the time it was
 * taken. A position presented without its age would read as where someone is
 * standing now, which this data cannot support.
 */
export function AgencyAttendanceFixPanel({ dateIso }: { dateIso?: string }) {
	const {
		groups,
		isLoading,
		rostered,
		stamped,
		withFix,
		inRange,
		hasUnpinnedVenue,
	} = useAgencyAttendanceFixes(dateIso);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	if (isLoading) {
		return (
			<OutletSection title="Check-in locations" hint="Loading" collapsible>
				<p className="iz-tiny iz-muted rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					Reading today's attendance stamps…
				</p>
			</OutletSection>
		);
	}

	if (rostered === 0) {
		return (
			<OutletSection
				title="Check-in locations"
				hint="Nobody rostered"
				collapsible
				defaultOpen={false}
			>
				<p className="iz-tiny iz-muted rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					No PRs are rostered for this date, so there are no attendance stamps
					to show.
				</p>
			</OutletSection>
		);
	}

	// Deliberately reports coverage, not a live headcount: "12/14 stamped" is a
	// fact about records, whereas "12 on duty" would be a claim about right now.
	const hint = (
		<span className="inline-flex items-center gap-1.5">
			{`${stamped}/${rostered} stamped · ${inRange}/${withFix} within fence`}
		</span>
	);

	return (
		<OutletSection
			title="Check-in locations"
			hint={hint}
			className="iz-roster-gps-section"
			collapsible
			defaultOpen={false}
		>
			<p className="iz-tiny iz-muted mb-3">
				Positions are recorded at check-in and check-out only — this is not live
				tracking, and each time below is when that fix was taken.
				{hasUnpinnedVenue
					? " Venues with no saved pin accept every check-in without a location check."
					: ""}
			</p>

			<div className="iz-roster-gps-grid">
				{groups.map((group) => {
					const outletPins = uniqueOutletPins(group.mapped);
					const hasMap = group.mapped.length > 0 && outletPins.length > 0;

					return (
						<IzCard
							key={group.outlet}
							flat
							className="iz-roster-gps-card !p-0 overflow-hidden"
						>
							{hasMap && (
								<GpsRoadMap
									rows={group.mapped}
									bounds={gpsMapBounds(group.mapped)}
									outletPins={outletPins}
									selectedId={selectedId}
									onSelect={setSelectedId}
									height={OUTLET_MAP_HEIGHT}
								/>
							)}

							<div className="iz-roster-gps-foot">
								<div className="iz-roster-gps-outlet">
									<div className="iz-roster-gps-outlet-head">
										<div className="iz-roster-gps-outlet-title">
											<span className="iz-roster-gps-outlet-name">
												{group.outlet}
											</span>
											<span className="iz-roster-gps-outlet-meta">
												{group.pinned
													? `${group.mapped.filter((r) => r.inRange).length}/${group.mapped.length} within ${group.radiusM} m`
													: "No map pin — check-ins here are not location-checked"}
												{group.latestStampAt
													? ` · latest ${stampTime(group.latestStampAt)}`
													: ""}
											</span>
										</div>
										{hasMap && (
											<a
												href={mapsUrlForCoord(outletPins[0].coord)}
												target="_blank"
												rel="noreferrer"
												className="iz-roster-gps-maps-link"
											>
												<ExternalLink className="h-3 w-3" />
												Maps
											</a>
										)}
									</div>

									<div className="iz-roster-gps-rows">
										{group.mapped.map((row) => {
											const isSelected = row.slotId === selectedId;
											return (
												<button
													key={row.slotId}
													type="button"
													onClick={() =>
														setSelectedId(isSelected ? null : row.slotId)
													}
													className={cn(
														"iz-roster-gps-row",
														isSelected && "on",
													)}
												>
													<div className="iz-roster-gps-row-top">
														<span className="iz-roster-gps-avatar">
															{row.prName.trim()[0]}
														</span>
														<div className="min-w-0 flex-1">
															<div className="iz-roster-gps-row-head">
																<span className="iz-roster-gps-row-name">
																	{row.prName}
																</span>
																<IzPill
																	variant={
																		row.outletUnpinned
																			? "ink"
																			: row.inRange
																				? "green"
																				: "amber"
																	}
																	className="iz-roster-gps-row-pill"
																>
																	{row.outletUnpinned
																		? "Not fenced"
																		: row.inRange
																			? "Within fence"
																			: "Outside"}
																</IzPill>
															</div>
															<span className="iz-roster-gps-row-meta">
																{`${Math.round(row.meters)} m`}
																{row.accuracyM
																	? ` · ±${Math.round(row.accuracyM)} m`
																	: ""}
															</span>
														</div>
													</div>
												</button>
											);
										})}

										{/*
											Stamped with nothing to plot. Listed rather than dropped:
											a missing fix is itself worth seeing, and inventing a
											position to fill the map is the bug this panel avoids.
										*/}
										{group.noFix.map((row) => (
											<div key={row.assignmentId} className="iz-roster-gps-row">
												<div className="iz-roster-gps-row-top">
													<span className="iz-roster-gps-avatar">
														{row.prName.trim()[0]}
													</span>
													<div className="min-w-0 flex-1">
														<div className="iz-roster-gps-row-head">
															<span className="iz-roster-gps-row-name">
																{row.prName}
															</span>
															<IzPill
																variant="ink"
																className="iz-roster-gps-row-pill"
															>
																No location
															</IzPill>
														</div>
														<span className="iz-roster-gps-row-meta">
															{`Checked in ${stampTime(row.at)} · no position recorded`}
														</span>
													</div>
												</div>
											</div>
										))}

										{group.notArrived.map((row) => (
											<div key={row.assignmentId} className="iz-roster-gps-row">
												<div className="iz-roster-gps-row-top">
													<span className="iz-roster-gps-avatar">
														{row.prName.trim()[0]}
													</span>
													<div className="min-w-0 flex-1">
														<div className="iz-roster-gps-row-head">
															<span className="iz-roster-gps-row-name">
																{row.prName}
															</span>
															<IzPill
																variant="ink"
																className="iz-roster-gps-row-pill"
															>
																Not checked in
															</IzPill>
														</div>
														<span className="iz-roster-gps-row-meta">
															{row.slot ? `Rostered · ${row.slot}` : "Rostered"}
														</span>
													</div>
												</div>
											</div>
										))}
									</div>
								</div>
							</div>
						</IzCard>
					);
				})}
			</div>
		</OutletSection>
	);
}
