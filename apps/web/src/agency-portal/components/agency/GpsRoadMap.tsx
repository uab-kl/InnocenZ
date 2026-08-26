import { PrFaceBubble } from "@agency-portal/components/agency/PrFaceBubble";
import type {
	GeoCoord,
	GpsMapBounds,
	GpsTrackingRow,
} from "@agency-portal/lib/gps-locations";
import {
	boundsCenter,
	coordToViewport,
	geofenceDiameterPx,
	panCenterByPixels,
	pickMapZoom,
	tileRange,
} from "@agency-portal/lib/gps-locations";
import { Layers, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

const TILE_SIZE = 256;
const TILE_URL =
	"https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png";
const TILE_URL_DARK = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
const DRAG_THRESHOLD_PX = 5;

function OutletMarker({ label }: { label: string }) {
	return (
		<div className="iz-gmaps-marker iz-gmaps-marker-outlet" title={label}>
			<svg
				width="28"
				height="36"
				viewBox="0 0 28 36"
				aria-hidden="true"
				focusable="false"
			>
				<path
					d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z"
					fill="#EA4335"
				/>
				<circle cx="14" cy="14" r="6" fill="#fff" />
			</svg>
			<span className="iz-gmaps-marker-label">{label}</span>
		</div>
	);
}

function PrMarker({
	name,
	photo,
	inRange,
	selected,
	enRoute,
}: {
	name: string;
	photo?: string | null;
	inRange: boolean;
	selected: boolean;
	enRoute: boolean;
}) {
	return (
		<div
			className={`iz-gmaps-marker iz-gmaps-marker-pr${selected ? " selected" : ""}${enRoute ? " warn" : inRange ? "" : " warn"}`}
			title={name}
		>
			<PrFaceBubble
				name={name}
				photo={photo}
				className={`iz-gmaps-pr-dot${inRange && !enRoute ? " in-range" : ""}`}
			/>
			{selected && (
				<span className="iz-gmaps-marker-label iz-gmaps-marker-label-pr">
					{name}
				</span>
			)}
		</div>
	);
}

export function GpsRoadMap({
	rows,
	bounds,
	outletPins,
	selectedId,
	onSelect,
	height = 220,
	dark = false,
}: {
	rows: GpsTrackingRow[];
	bounds: GpsMapBounds;
	// radiusM is the venue's OWN fence, so the drawn circle matches what the
	// server enforces there; unpinned venues have no real fence to draw.
	outletPins: {
		outlet: string;
		coord: GeoCoord;
		radiusM?: number;
		unpinned?: boolean;
	}[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	height?: number;
	dark?: boolean;
}) {
	const { t } = usePortalLocale();
	const frameRef = useRef<HTMLDivElement>(null);
	const tilesRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{
		active: boolean;
		moved: boolean;
		startX: number;
		startY: number;
		startCenter: GeoCoord;
		pointerId: number | null;
		pinSlotId: string | null;
	}>({
		active: false,
		moved: false,
		startX: 0,
		startY: 0,
		startCenter: { lat: 0, lng: 0 },
		pointerId: null,
		pinSlotId: null,
	});

	const [width, setWidth] = useState(340);
	const [zoomOverride, setZoomOverride] = useState<number | null>(null);
	const [centerOverride, setCenterOverride] = useState<GeoCoord | null>(null);
	const [isDragging, setIsDragging] = useState(false);

	useEffect(() => {
		const el = frameRef.current;
		if (!el) return;
		const sync = () => setWidth(el.clientWidth || 340);
		sync();
		const ro = new ResizeObserver(sync);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const focusRow = selectedId
		? rows.find((r) => r.slotId === selectedId)
		: null;

	const defaultCenter = useMemo(() => {
		if (focusRow) return focusRow.prCoord;
		return boundsCenter(bounds);
	}, [focusRow, bounds]);

	// A new selection, or a new set of pins, invalidates whatever the user had
	// panned to — these five are the reset TRIGGERS, not values the effect
	// reads. Removing them makes this a mount-only reset, which would leave the
	// map frozen on the previous PR's pan after the row selection changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies(selectedId): reset trigger — see comment above
	// biome-ignore lint/correctness/useExhaustiveDependencies(bounds.minLat): reset trigger — see comment above
	// biome-ignore lint/correctness/useExhaustiveDependencies(bounds.maxLat): reset trigger — see comment above
	// biome-ignore lint/correctness/useExhaustiveDependencies(bounds.minLng): reset trigger — see comment above
	// biome-ignore lint/correctness/useExhaustiveDependencies(bounds.maxLng): reset trigger — see comment above
	useEffect(() => {
		setCenterOverride(null);
	}, [selectedId, bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng]);

	const mapCenter = centerOverride ?? defaultCenter;

	const autoZoom = useMemo(
		() => pickMapZoom(bounds, width, height),
		[bounds, width, height],
	);
	const effectiveZoom =
		zoomOverride ??
		(focusRow && !centerOverride ? Math.min(17, autoZoom + 1) : autoZoom);

	const tiles = useMemo(
		() => tileRange(mapCenter, effectiveZoom, width, height),
		[mapCenter, effectiveZoom, width, height],
	);

	const selected = focusRow ?? null;

	const endDrag = useCallback(() => {
		dragRef.current.active = false;
		dragRef.current.pointerId = null;
		dragRef.current.pinSlotId = null;
		setIsDragging(false);
	}, []);

	const onPointerDown = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (e.button !== 0) return;
			if (
				(e.target as HTMLElement).closest(
					".iz-gmaps-controls, .iz-gmaps-infowindow",
				)
			)
				return;

			const pin = (e.target as HTMLElement).closest<HTMLElement>(
				"[data-slot-id]",
			);
			dragRef.current = {
				active: true,
				moved: false,
				startX: e.clientX,
				startY: e.clientY,
				startCenter: mapCenter,
				pointerId: e.pointerId,
				// Remember the pin at press time — pointer capture retargets later events to the map.
				pinSlotId: pin?.dataset.slotId ?? null,
			};
			tilesRef.current?.setPointerCapture(e.pointerId);
			setIsDragging(true);
		},
		[mapCenter],
	);

	const onPointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag.active || drag.pointerId !== e.pointerId) return;

			const dx = e.clientX - drag.startX;
			const dy = e.clientY - drag.startY;
			if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

			drag.moved = true;
			setCenterOverride(
				panCenterByPixels(drag.startCenter, effectiveZoom, dx, dy),
			);
		},
		[effectiveZoom],
	);

	const onPointerUp = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const drag = dragRef.current;
			if (!drag.active || drag.pointerId !== e.pointerId) return;

			tilesRef.current?.releasePointerCapture(e.pointerId);

			if (!drag.moved) {
				const fromPoint = document
					.elementFromPoint(e.clientX, e.clientY)
					?.closest<HTMLElement>("[data-slot-id]")?.dataset.slotId;
				const id = drag.pinSlotId ?? fromPoint ?? null;
				if (id) onSelect(id === selectedId ? null : id);
			}

			endDrag();
		},
		[endDrag, onSelect, selectedId],
	);

	const onPointerCancel = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			if (dragRef.current.pointerId === e.pointerId) {
				tilesRef.current?.releasePointerCapture(e.pointerId);
				endDrag();
			}
		},
		[endDrag],
	);

	return (
		<div
			ref={frameRef}
			className={`iz-gmaps-frame${dark ? " iz-gmaps-frame--dark" : ""}`}
			style={{ height }}
		>
			<div
				ref={tilesRef}
				className={`iz-gmaps-tiles${isDragging ? " dragging" : ""}`}
				style={{ width: "100%", height }}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerCancel}
			>
				{tiles.map((t) => (
					<img
						key={`${t.z}-${t.x}-${t.y}`}
						src={(dark ? TILE_URL_DARK : TILE_URL)
							.replace("{z}", String(t.z))
							.replace("{x}", String(t.x))
							.replace("{y}", String(t.y))}
						alt=""
						className="iz-gmaps-tile"
						style={{
							width: TILE_SIZE,
							height: TILE_SIZE,
							left: t.left,
							top: t.top,
						}}
						draggable={false}
					/>
				))}

				{outletPins.map((pin) => {
					const pos = coordToViewport(
						pin.coord,
						mapCenter,
						effectiveZoom,
						width,
						height,
					);
					const fence = geofenceDiameterPx(
						effectiveZoom,
						pin.coord.lat,
						pin.radiusM,
					);
					return (
						<span
							key={`fence-${pin.outlet}`}
							className="iz-gmaps-geofence"
							// An unpinned venue is not fenced by the server either, so the
							// circle is drawn faint rather than implying an enforced boundary.
							style={{
								left: pos.x,
								top: pos.y,
								width: fence,
								height: fence,
								opacity: pin.unpinned ? 0.35 : undefined,
							}}
						/>
					);
				})}

				{outletPins.map((pin) => {
					const pos = coordToViewport(
						pin.coord,
						mapCenter,
						effectiveZoom,
						width,
						height,
					);
					return (
						<div
							key={pin.outlet}
							className="iz-gmaps-entity"
							style={{ left: pos.x, top: pos.y }}
						>
							<OutletMarker label={pin.outlet} />
						</div>
					);
				})}

				{rows.map((row) => {
					const pos = coordToViewport(
						row.prCoord,
						mapCenter,
						effectiveZoom,
						width,
						height,
					);
					const isSelected = row.slotId === selectedId;
					return (
						<button
							key={row.slotId}
							type="button"
							data-slot-id={row.slotId}
							className="iz-gmaps-entity iz-gmaps-entity-pr"
							style={{ left: pos.x, top: pos.y, zIndex: isSelected ? 12 : 8 }}
							tabIndex={-1}
						>
							<PrMarker
								name={row.prName}
								photo={row.prPhoto}
								inRange={row.inRange}
								selected={isSelected}
								enRoute={row.status === "en-route"}
							/>
						</button>
					);
				})}
			</div>

			<div className="iz-gmaps-controls">
				<button
					type="button"
					className="iz-gmaps-ctrl"
					onClick={() =>
						setZoomOverride((z) => Math.min(18, (z ?? effectiveZoom) + 1))
					}
					aria-label={t.agencyGps.zoomIn}
				>
					<Plus className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					className="iz-gmaps-ctrl"
					onClick={() =>
						setZoomOverride((z) => Math.max(12, (z ?? effectiveZoom) - 1))
					}
					aria-label={t.agencyGps.zoomOut}
				>
					<Minus className="h-3.5 w-3.5" />
				</button>
			</div>

			<div className="iz-gmaps-layer-chip">
				<Layers className="h-3 w-3" /> {t.agencyGps.layerMap}
			</div>

			{selected ? (
				<div className="iz-gmaps-infowindow">
					<p className="font-sora text-xs font-bold text-[#202124]">
						{selected.prName}
					</p>
					<p className="text-[10px] text-[#5f6368]">
						{selected.outlet} · {selected.meters} m ·{" "}
						{selected.inRange
							? t.rosterGrid.withinFence
							: t.rosterGrid.outsideFence}
					</p>
				</div>
			) : (
				<div
					className="iz-gmaps-infowindow iz-gmaps-infowindow-hint"
					aria-hidden
				>
					<p className="text-[10px] text-[#5f6368]">
						{t.agencyGps.dragMapHint}
					</p>
				</div>
			)}

			<p className="iz-gmaps-attrib">{t.agencyGps.mapAttribution}</p>
		</div>
	);
}
