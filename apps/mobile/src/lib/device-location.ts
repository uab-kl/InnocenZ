/**
 * Reads the phone's GPS fix for an attendance stamp (check-in / check-out).
 *
 * Deliberately thin, and deliberately NOT a geo-fence. This file's only job is
 * to answer "where is this phone, and how sure is it?" — whether that position
 * is close enough to the venue is decided by the BACKEND, which recomputes the
 * distance from the outlet's own saved pin. The phone is the thing being
 * verified, so it never grades itself and never decides its own pass/fail.
 *
 * That split is why there is no bypass switch here. The old prototype flag
 * `GPS_BYPASS` only ever silenced this client; the server now blocks
 * regardless, so a client-side bypass would just turn a clear "you are 137 m
 * away" into a confusing generic failure.
 */
import * as Location from 'expo-location';

/** What the backend's CheckInMineSchema accepts. */
export type DeviceFix = {
  lat: number;
  lng: number;
  accuracyM?: number;
  /**
   * True when Android says the fix came from a mock-location provider. Passed
   * straight through without acting on it here — same rule as the distance:
   * the phone reports, the server decides. Sending it honestly costs an honest
   * PR nothing, and catches the spoofing app that a pure distance check cannot
   * see, because a faked coordinate lands perfectly on the pin.
   */
  mocked?: boolean;
};

export type LocationResult =
  | { ok: true; fix: DeviceFix }
  | { ok: false; reason: 'denied' | 'disabled' | 'timeout' | 'error'; message: string };

/** How long to wait for a fix before giving up (ms). */
const FIX_TIMEOUT_MS = 12_000;

const DENIED_MESSAGE =
  'InnocenZ needs location access to check you in at the venue. Turn it on in Settings > InnocenZ > Location, then try again.';
const DISABLED_MESSAGE =
  'Location services are off on this phone. Turn on GPS / Location, then try again.';
const TIMEOUT_MESSAGE =
  'Could not get a GPS fix. Step outside or near a window and try again.';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Ask for permission (once) and return the current fix.
 *
 * Foreground permission only — InnocenZ reads the position at the two
 * attendance moments and never in the background. This is a snapshot, not
 * tracking, and the PR sees the prompt at the moment it is used.
 */
export async function getAttendanceFix(): Promise<LocationResult> {
  try {
    // Every native call below gets its own bounded wait. Without this, a
    // device where the services check or the permission prompt itself never
    // settles (seen on some Android OEMs when the Play Services location
    // dialog is interrupted) leaves this whole function — and the caller's
    // `busy` flag — hung forever with no error ever surfaced.
    const services = await withTimeout(Location.hasServicesEnabledAsync(), FIX_TIMEOUT_MS);
    if (!services) {
      return { ok: false, reason: 'disabled', message: DISABLED_MESSAGE };
    }

    const permission = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      FIX_TIMEOUT_MS,
    );
    if (!permission || permission.status !== Location.PermissionStatus.GRANTED) {
      return { ok: false, reason: 'denied', message: DENIED_MESSAGE };
    }

    const position = await withTimeout(
      Location.getCurrentPositionAsync({
        // High accuracy matters here: a 50 m fence cannot be judged on a
        // cell-tower fix, and a loose fix only widens the server's tolerance.
        accuracy: Location.Accuracy.High,
      }),
      FIX_TIMEOUT_MS,
    );

    if (!position) {
      // Fall back to the last known fix rather than failing outright — a PR
      // standing inside a basement club may not get a fresh lock, and a fix
      // from a minute ago at the same venue is still honest evidence. The
      // server still decides whether it is close enough.
      const last = await withTimeout(
        Location.getLastKnownPositionAsync({ maxAge: 120_000 }),
        FIX_TIMEOUT_MS,
      );
      if (!last) {
        return { ok: false, reason: 'timeout', message: TIMEOUT_MESSAGE };
      }
      return { ok: true, fix: toFix(last) };
    }

    return { ok: true, fix: toFix(position) };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'Could not read your location.',
    };
  }
}

function toFix(position: Location.LocationObject): DeviceFix {
  const { latitude, longitude, accuracy } = position.coords;
  return {
    lat: latitude,
    lng: longitude,
    // Android-only; undefined on iOS, where the platform gives no equivalent
    // signal. Only sent when true so an iOS fix is never implied to be clean.
    ...(position.mocked === true ? { mocked: true } : {}),
    // `accuracy` is the device's own confidence radius in metres. Sent for
    // audit and so the server can widen (never narrow) its tolerance.
    ...(typeof accuracy === 'number' && accuracy >= 0
      ? { accuracyM: Math.round(accuracy) }
      : {}),
  };
}
