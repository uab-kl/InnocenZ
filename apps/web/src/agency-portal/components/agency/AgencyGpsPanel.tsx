import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { OutletSection } from '@agency-portal/components/outlet/OutletSection';
import { IzCard, IzPill } from '@agency-portal/components/iz/ui';
import { GpsRoadMap } from '@agency-portal/components/agency/GpsRoadMap';
import type {
  AgencyManagedPR,
  AgencyRosterSlot,
} from '@agency-portal/lib/agency-demo';
import {
  buildGpsTrackingRows,
  gpsMapBounds,
  mapsUrlForCoord,
  OUTLET_GPS,
  uniqueOutletPins,
} from '@agency-portal/lib/gps-locations';
import { getPrRosterId } from '@agency-portal/lib/pr-demo';
import { cn } from '@agency-portal/lib/utils';

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
  prSubRole?: 'pr_tied' | null;
}) {
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
      {`${outletCount} outlets · ${inRangeCount}/${rows.length} in geofence`}
    </span>
  );

  if (rows.length === 0) {
    return (
      <OutletSection
        title="Live GPS"
        hint="No active PRs to track"
        collapsible
        defaultOpen={false}
      >
        <p className="iz-tiny iz-muted rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
          PR locations appear when someone is on duty today.
        </p>
      </OutletSection>
    );
  }

  return (
    <OutletSection
      title="Live GPS"
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
            coord: OUTLET_GPS[outlet] ?? OUTLET_GPS['Velvet 23'],
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
                        {outletInRange}/{outletRows.length} in geofence
                      </span>
                    </div>
                    <a
                      href={mapsUrlForCoord(pin.coord)}
                      target="_blank"
                      rel="noreferrer"
                      className="iz-roster-gps-maps-link"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Maps
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
                            'iz-roster-gps-row',
                            isSelected && 'on',
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
                                  variant="green"
                                  className="iz-roster-gps-row-pill"
                                >
                                  On duty
                                </IzPill>
                              </div>
                              <span className="iz-roster-gps-row-meta">
                                {row.meters} m
                                {row.gpsFallback
                                  ? ' · Fallback'
                                  : row.inRange
                                    ? ' · In geofence'
                                    : ' · Outside'}
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
