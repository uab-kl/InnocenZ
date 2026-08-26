import { GpsRoadMap } from "@agency-portal/components/agency/GpsRoadMap";
import { PrFaceBubble } from "@agency-portal/components/agency/PrFaceBubble";
import { IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import {
	buildGpsTrackingRows,
	GEOFENCE_METERS,
	gpsMapBounds,
	mapsUrlForCoord,
	OUTLET_GPS,
	uniqueOutletPins,
} from "@agency-portal/lib/gps-locations";
import { getPrRosterId } from "@agency-portal/lib/pr-demo";
import { cn } from "@agency-portal/lib/utils";
import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

const OUTLET_MAP_HEIGHT = 168;

export function AgencyGpsPanel({
	roster,
	agencyPRs,
	dateIso,
	prCheckInMeta,
	prSubRole,
}: {
	roster: AgencyRosterSlot[];
	agencyPRs: AgencyManagedPR[];
	dateIso: string;
	prCheckInMeta?: { gpsFallback?: boolean };
	prSubRole?: "pr_tied" | null;
}) {
	const { t } = usePortalLocale();
	const activePrId = prSubRole ? getPrRosterId(prSubRole) : undefined;
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const rows = useMemo(
		() =>
			buildGpsTrackingRows(
				roster,
				agencyPRs,
				dateIso,
				prCheckInMeta,
				activePrId,
			),
		[roster, agencyPRs, dateIso, prCheckInMeta, activePrId],
	);

	const groupedByOutlet = useMemo(() => {
		const map = new Map<string, typeof rows>();
		for (const row of rows) {
			const list = map.get(row.outlet) ?? [];
			list.push(row);
			map.set(row.outlet, list);
		}
		return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [rows]);

	useEffect(() => {
		if (selectedId && !rows.some((r) => r.slotId === selectedId)) {
			setSelectedId(null);
		}
	}, [rows, selectedId]);

	const inRangeCount = rows.filter((r) => r.inRange).length;
	const outletCount = groupedByOutlet.length;

	const gpsHintNode = (
		<span className="inline-flex items-center gap-1.5">
			<span className="iz-roster-gps-live-dot" aria-hidden />
			{fill(
				outletCount === 1
					? t.agencyGps.outletsWithinFenceOne
					: t.agencyGps.outletsWithinFenceMany,
				{ n: outletCount, inRange: inRangeCount, total: rows.length },
			)}
		</span>
	);

	if (rows.length === 0) {
		return (
			<OutletSection
				title={t.roster.liveGps}
				iconKey="Live GPS"
				hint={t.agencyGps.noActivePrs}
				collapsible
				defaultOpen={false}
			>
				<p className="iz-tiny iz-muted rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					{t.agencyGps.locationsWhenOnDuty}
				</p>
			</OutletSection>
		);
	}

	return (
		<OutletSection
			title={t.roster.liveGps}
			iconKey="Live GPS"
			hint={gpsHintNode}
			className="iz-roster-gps-section"
			collapsible
			defaultOpen={false}
		>
			<div className="iz-roster-gps-grid">
				{groupedByOutlet.map(([outlet, outletRows]) => {
					const outletPins = uniqueOutletPins(outletRows);
					const bounds = gpsMapBounds(outletRows);
					const pin = outletPins[0] ?? {
						outlet,
						// Only reached when the group somehow has no rows; the real pin
						// travels on the rows themselves, from the outlet's saved location.
						coord: OUTLET_GPS[outlet] ?? OUTLET_GPS["Velvet 23"],
						radiusM: GEOFENCE_METERS,
						unpinned: true,
					};
					const outletInRange = outletRows.filter((r) => r.inRange).length;

					return (
						<IzCard
							key={outlet}
							flat
							className="iz-roster-gps-card !p-0 overflow-hidden"
						>
							<GpsRoadMap
								rows={outletRows}
								bounds={bounds}
								outletPins={outletPins}
								selectedId={selectedId}
								onSelect={setSelectedId}
								height={OUTLET_MAP_HEIGHT}
							/>

							<div className="iz-roster-gps-foot">
								<div className="iz-roster-gps-outlet">
									<div className="iz-roster-gps-outlet-head">
										<div className="iz-roster-gps-outlet-title">
											<span className="iz-roster-gps-outlet-name">
												{outlet}
											</span>
											<span className="iz-roster-gps-outlet-meta">
												{pin.unpinned
													? t.rosterGrid.noMapPin
													: // "within fence", NOT "within {radius} m": the pass test is
														// the radius PLUS up to 30 m of accuracy, so a fix can sit
														// outside the bare radius and still legitimately pass. The
														// pin's radius is printed beside it, never instead of it.
														fill(t.rosterGrid.withinFencePin, {
															inRange: outletInRange,
															total: outletRows.length,
															radius: pin.radiusM ?? GEOFENCE_METERS,
														})}
											</span>
										</div>
										<a
											href={mapsUrlForCoord(pin.coord)}
											target="_blank"
											rel="noreferrer"
											className="iz-roster-gps-maps-link"
										>
											<ExternalLink className="h-3 w-3" />
											{t.rosterGrid.maps}
										</a>
									</div>
									<div className="iz-roster-gps-rows">
										{outletRows.map((row) => {
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
																	variant="green"
																	className="iz-roster-gps-row-pill"
																>
																	{t.roster.onDuty}
																</IzPill>
															</div>
															<span className="iz-roster-gps-row-meta">
																{/*
                                  An estimated row has no device fix behind it,
                                  so its distance is not a measurement and must
                                  not be shown as one. Same for an unpinned
                                  venue: nothing was fenced, so nothing can be
                                  reported as in or out of it.
                                */}
																{row.estimated
																	? t.agencyGps.noGpsRecorded
																	: `${Math.round(row.meters)} m`}
																{" · "}
																{row.estimated
																	? t.agencyGps.estimated
																	: row.gpsFallback
																		? t.agencyGps.fallback
																		: row.outletUnpinned
																			? t.rosterGrid.notFenced
																			: row.inRange
																				? t.rosterGrid.withinFence
																				: t.rosterGrid.outsideFence}
																{!row.estimated && row.accuracyM
																	? ` · ±${Math.round(row.accuracyM)} m`
																	: ""}
															</span>
														</div>
													</div>
												</button>
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
