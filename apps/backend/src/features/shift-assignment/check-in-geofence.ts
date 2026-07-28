/**
 * Server-side geo-fence verification for PR attendance stamps.
 *
 * Three rules this file exists to hold:
 *  1. The distance is ALWAYS recomputed here from the outlet's own saved pin
 *     (outlet.lat / outlet.lng, reached by FK from the assignment's shift). A
 *     distance reported by the phone is never stored and never trusted — the
 *     phone is the thing being checked, so it does not get to grade itself.
 *  2. There is NO relax / demo bypass switch. The InnocenZ prototype carries
 *     DEMO_RELAX_CHECK_IN_GEOFENCE, which only warns when the PR is outside the
 *     fence. That flag must never appear on this side: the server blocks.
 *  3. An outlet that has not dropped its pin yet cannot be fenced, so those
 *     check-ins pass through unfenced rather than becoming un-checkin-able.
 *     Enforcement switches itself on per outlet the moment a pin is saved
 *     (PATCH /outlet/:id/geo-fence).
 */

/** Used when an outlet row predates the geo_fence_radius column default. */
export const DEFAULT_GEOFENCE_RADIUS_M = 50;

/**
 * How much of the device's self-reported accuracy may widen the fence. A phone
 * indoors can honestly report +/-80 m; letting that widen the fence without a
 * ceiling would make a 50 m fence meaningless, so the buffer is capped. The
 * buffer only ever widens the fence, never narrows it.
 */
export const MAX_ACCURACY_BUFFER_M = 30;

/** The outlet pin behind an assignment. `null` coords = no pin dropped yet. */
export type OutletPin = {
  outletId: string;
  lat: number | null;
  lng: number | null;
  radiusM: number;
} | null;

/** What the phone sent up with its check-in / check-out POST. */
export type DeviceFix = {
  lat?: number;
  lng?: number;
  accuracyM?: number;
  /**
   * Android sets this when the fix came from a mock-location provider, i.e. a
   * GPS-spoofing app. Self-reported, so it is a filter and not a proof: a
   * modified client can simply not send it. It catches the ordinary case —
   * someone installs a spoofer from the Play Store and stays home — which is
   * exactly the cheat a distance-based fence is otherwise blind to, because a
   * spoofed coordinate is arithmetically perfect.
   */
  mocked?: boolean;
};

/** A position resolved against an outlet pin, ready to persist. */
export type ResolvedFix = {
  lat: number;
  lng: number;
  /** Server-computed metres from the outlet pin; null when no pin is set. */
  distanceM: number | null;
  accuracyM: number | null;
};

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle metres between two WGS-84 points (haversine). Accurate to well
 * under a metre at city scale, which is an order of magnitude finer than the
 * 50 m fence it feeds, and needs no external service.
 */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Turn a raw device fix into the row we persist, recomputing the distance
 * server-side. Returns null when the phone sent no usable coordinates — the
 * caller decides whether that is acceptable (it is on check-out, it is not on
 * check-in once the outlet has a pin).
 */
export function describeDeviceFix(args: {
  outlet: OutletPin;
  device: DeviceFix;
}): ResolvedFix | null {
  const { outlet, device } = args;
  if (typeof device.lat !== 'number' || typeof device.lng !== 'number') return null;
  // A mock-provider fix is not evidence of anything. Persisting it would write
  // a fabricated coordinate into the attendance record and make the audit
  // trail read as if the PR really stood there, so it is dropped entirely
  // rather than stored with a caveat.
  if (device.mocked === true) return null;

  const hasPin = !!outlet && outlet.lat !== null && outlet.lng !== null;
  const distanceM = hasPin
    ? Math.round(
        metresBetween(
          { lat: device.lat, lng: device.lng },
          { lat: outlet!.lat as number, lng: outlet!.lng as number },
        ),
      )
    : null;

  return {
    lat: device.lat,
    lng: device.lng,
    distanceM,
    accuracyM:
      typeof device.accuracyM === 'number' ? Math.round(device.accuracyM) : null,
  };
}

export type GeoFenceVerdict =
  | {
      ok: true;
      /** Null when the outlet has no pin, so nothing could be verified. */
      fix: ResolvedFix | null;
      radiusM: number;
      /** True when a pin existed and the fix was confirmed inside it. */
      enforced: boolean;
    }
  | {
      ok: false;
      message: string;
      radiusM: number;
      detail: {
        reason: 'location_required' | 'outside_geofence' | 'mock_location';
        distanceM: number | null;
        radiusM: number;
        allowedM: number;
      };
    };

/**
 * Decide whether this check-in may proceed.
 *
 * - Outlet has no pin  -> pass, unfenced (nothing to measure against).
 * - Outlet has a pin, phone sent no fix -> refuse. Silence is not proof of
 *   presence, and accepting it would be the whole bypass we are preventing.
 * - Outlet has a pin, phone sent a fix -> pass only if the SERVER-computed
 *   distance is within radius + capped accuracy buffer.
 */
export function verifyWithinGeoFence(args: {
  outlet: OutletPin;
  device: DeviceFix;
}): GeoFenceVerdict {
  const { outlet, device } = args;
  const radiusM = outlet?.radiusM ?? DEFAULT_GEOFENCE_RADIUS_M;
  const hasPin = !!outlet && outlet.lat !== null && outlet.lng !== null;

  if (!hasPin) {
    // Nothing to measure against, so nothing to cheat. A mocked fix still gets
    // discarded by describeDeviceFix rather than stored.
    return { ok: true, fix: describeDeviceFix({ outlet, device }), radiusM, enforced: false };
  }

  // Checked before the missing-coordinate branch: a spoofed fix is a worse
  // failure than no fix, and it would otherwise sail through as a perfect 0 m.
  if (device.mocked === true) {
    return {
      ok: false,
      message:
        'This check-in was rejected because your phone is reporting a simulated location. Turn off any mock-location or GPS-spoofing app, then try again.',
      radiusM,
      detail: { reason: 'mock_location', distanceM: null, radiusM, allowedM: radiusM },
    };
  }

  const fix = describeDeviceFix({ outlet, device });
  if (!fix || fix.distanceM === null) {
    return {
      ok: false,
      message: 'Location is required to check in at this venue. Turn on GPS and try again.',
      radiusM,
      detail: { reason: 'location_required', distanceM: null, radiusM, allowedM: radiusM },
    };
  }

  const allowedM =
    radiusM + Math.min(fix.accuracyM ?? 0, MAX_ACCURACY_BUFFER_M);

  if (fix.distanceM > allowedM) {
    return {
      ok: false,
      message: `You are ${fix.distanceM} m from the venue. Check-in is only allowed within ${radiusM} m.`,
      radiusM,
      detail: { reason: 'outside_geofence', distanceM: fix.distanceM, radiusM, allowedM },
    };
  }

  return { ok: true, fix, radiusM, enforced: true };
}
