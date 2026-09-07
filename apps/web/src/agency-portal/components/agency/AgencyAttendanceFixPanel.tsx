import { GpsRoadMap } from "@agency-portal/components/agency/GpsRoadMap";
import { PrFaceBubble } from "@agency-portal/components/agency/PrFaceBubble";
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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
 *
 * One PR can legitimately appear on TWO venue cards on the same date — two
 * shifts, two outlets — and the owner read that as the panel double-counting
 * her. It is not: the rows are different assignments. So a rostered row that has
 * not stamped says when it is DUE, and, when that PR is still clocked in
 * somewhere else, which venue that is. Between them the second card explains
 * itself instead of looking like an unexplained absence.
 */
export function AgencyAttendanceFixPanel({ dateIso }: { dateIso?: string }) {
	const { t } = usePortalLocale();
	// One clock reading for the whole render, so two rows of the same shift
	// cannot land on opposite sides of their start minute.
	const now = Date.now();
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
			<OutletSection
				title={t.rosterGrid.checkInLocations}
				iconKey="Check-in locations"
				hint={t.rosterGrid.loading}
				collapsible
			>
				<p className="iz-tiny iz-muted rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					{t.rosterGrid.readingAttendanceStamps}
				</p>
			</OutletSection>
		);
	}

	if (rostered === 0) {
		return (
			<OutletSection
				title={t.rosterGrid.checkInLocations}
				iconKey="Check-in locations"
				hint={t.rosterGrid.nobodyRostered}
				collapsible
				defaultOpen={false}
			>
				<p className="iz-tiny iz-muted rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					{t.rosterGrid.noPrsRosteredForDate}
				</p>
			</OutletSection>
		);
	}

	// Deliberately reports coverage, not a live headcount: "12/14 stamped" is a
	// fact about records, whereas "12 on duty" would be a claim about right now.
	const hint = (
		<span className="inline-flex items-center gap-1.5">
			{fill(t.rosterGrid.stampCoverage, {
				stamped,
				rostered,
				inRange,
				withFix,
			})}
		</span>
	);

	return (
		<OutletSection
			title={t.rosterGrid.checkInLocations}
			iconKey="Check-in locations"
			hint={hint}
			className="iz-roster-gps-section"
			collapsible
			defaultOpen={false}
		>
			<p className="iz-tiny iz-muted mb-3">
				{t.rosterGrid.positionsNote}
				{hasUnpinnedVenue ? t.rosterGrid.unpinnedVenueNote : ""}
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
													? // "within fence", NOT "within {radius} m": inRange is radius +
														// min(accuracy, 30), mirroring the door's own rule, so a fix
														// can sit outside the bare radius and still legitimately pass.
														// 69 m against a 50 m pin with ±22 m was the live case that
														// caught this — printing the radius claimed a precision the
														// test does not use. Exact figures are on each row.
														fill(t.rosterGrid.withinFencePin, {
															inRange: group.mapped.filter((r) => r.inRange)
																.length,
															total: group.mapped.length,
															radius: group.radiusM,
														})
													: t.rosterGrid.noMapPin}
												{group.latestStampAt
													? fill(t.rosterGrid.latestStamp, {
															time: stampTime(group.latestStampAt),
														})
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
												{t.rosterGrid.maps}
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
														<PrFaceBubble
															name={row.prName}
															photo={row.prPhoto}
															className="iz-roster-gps-avatar"
														/>
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
																		? t.rosterGrid.notFenced
																		: row.inRange
																			? t.rosterGrid.withinFence
																			: t.rosterGrid.outsideFence}
																</IzPill>
															</div>
															<span className="iz-roster-gps-row-meta">
																{/*
																	The hour LEADS. One PR can hold a stamped row
																	at two venues on the same date, and a bare
																	"45 m · ±13 m" on each gave the reader nothing
																	to tell the current one from the stale one.
																*/}
																{row.checkInAt
																	? fill(t.rosterGrid.stampedIn, {
																			time: stampTime(row.checkInAt),
																		})
																	: ""}
																{row.checkOutAt
																	? fill(t.rosterGrid.stampedOut, {
																			time: stampTime(row.checkOutAt),
																		})
																	: ""}
																{row.checkInAt ? " · " : ""}
																{`${Math.round(row.meters)} m`}
																{row.accuracyM
																	? ` · ±${Math.round(row.accuracyM)} m`
																	: ""}
																{/*
																	Open here, already stamped in somewhere else.
																	Marks THIS row as the stale one, which is the
																	only way two open check-ins can be ordered.
																*/}
																{row.sinceCheckedInAt
																	? fill(t.rosterGrid.sinceCheckedInAt, {
																			outlet: row.sinceCheckedInAt,
																		})
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
													<PrFaceBubble
														name={row.prName}
														photo={row.prPhoto}
														className="iz-roster-gps-avatar"
													/>
													<div className="min-w-0 flex-1">
														<div className="iz-roster-gps-row-head">
															<span className="iz-roster-gps-row-name">
																{row.prName}
															</span>
															<IzPill
																variant="ink"
																className="iz-roster-gps-row-pill"
															>
																{t.rosterGrid.noLocation}
															</IzPill>
														</div>
														<span className="iz-roster-gps-row-meta">
															{fill(t.rosterGrid.checkedInNoPosition, {
																time: stampTime(row.at),
															})}
														</span>
													</div>
												</div>
											</div>
										))}

										{group.notArrived.map((row) => {
											// Not yet their hour. "Not checked in" is only a finding
											// once the slot has STARTED; before that it reads as an
											// absence nobody was owed, which is how a PR due at 12:00
											// looked missing at 11:20.
											const notDueYet =
												row.dueAt !== null &&
												new Date(row.dueAt).getTime() > now;
											return (
												<div
													key={row.assignmentId}
													className="iz-roster-gps-row"
												>
													<div className="iz-roster-gps-row-top">
														<PrFaceBubble
															name={row.prName}
															photo={row.prPhoto}
															className="iz-roster-gps-avatar"
														/>
														<div className="min-w-0 flex-1">
															<div className="iz-roster-gps-row-head">
																<span className="iz-roster-gps-row-name">
																	{row.prName}
																</span>
																<IzPill
																	variant="ink"
																	className="iz-roster-gps-row-pill"
																>
																	{notDueYet && row.dueAt
																		? fill(t.rosterGrid.dueAt, {
																				time: stampTime(row.dueAt),
																			})
																		: t.rosterGrid.notCheckedIn}
																</IzPill>
															</div>
															<span className="iz-roster-gps-row-meta">
																{row.slot
																	? fill(t.rosterGrid.rosteredSlot, {
																			slot: row.slot,
																		})
																	: t.rosterGrid.rostered}
																{/*
																	Answers the question this card otherwise
																	raises. A PR working two venues in one day
																	sits on BOTH maps, and the venue they have
																	not checked out of is the only thing here
																	that says where they actually are.
																*/}
																{row.stillCheckedInAt
																	? fill(t.rosterGrid.stillCheckedInElsewhere, {
																			outlet: row.stillCheckedInAt,
																		})
																	: ""}
															</span>
														</div>
													</div>
												</div>
											);
										})}
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
