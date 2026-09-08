/**
 * THE APP'S ONE TYPEFACE — Manrope, the same face the Agency and Outlet portals
 * render, now actually bundled so a PHONE renders it too.
 *
 * ⚠️ WHAT THIS FIXES. `F.sora` and `F.manrope` in `theme.ts` were
 * `Platform.OS === 'web' ? "'Sora', …" : undefined` — so on a real device BOTH
 * were `undefined` and all 611 `fontFamily` declarations in this app resolved to
 * the system face. The two-font design existed only in the web preview; the
 * phone had one font and it was San Francisco / Roboto. Nobody could see that
 * from the code, because a `Platform` check reads as deliberate.
 *
 * ⚠️ WHY ONE FAMILY NAME PER WEIGHT, rather than one family plus `fontWeight`.
 * React Native resolves weights within a family reliably on iOS and NOT on
 * Android, where a `fontWeight` on top of an already-bold face produces a
 * synthesised double-bold. Registering each face under its own name and
 * selecting the FAMILY is the only form that renders the same on both — it is
 * also what every `@expo-google-fonts/*` package does.
 *
 * The five faces are the weights this app actually uses: 700 ×193, 600 ×110,
 * 800 ×99, 500 ×3, plus 400 wherever no weight is set.
 *
 * Files live in `assets/fonts/` (SIL OFL 1.1 — see `OFL.txt` beside them), taken
 * from the `@expo-google-fonts/manrope` tarball. They are committed rather than
 * pulled through a dependency: `pnpm add` fails on this machine, and an asset
 * the app ships is better versioned with the app than with the lockfile.
 */
import { Platform, type TextStyle } from 'react-native';

/** The weights this app uses. 400 is the implicit default. */
export type FontWeight = 400 | 500 | 600 | 700 | 800;

/**
 * Weight → the family name that face is registered under.
 *
 * ⚠️ These strings must match the keys passed to `useFonts` EXACTLY. A typo does
 * not throw: React Native silently falls back to the system font, which is
 * precisely the failure this module exists to end.
 */
export const MANROPE_FAMILY: Record<FontWeight, string> = {
  400: 'Manrope-Regular',
  500: 'Manrope-Medium',
  600: 'Manrope-SemiBold',
  700: 'Manrope-Bold',
  800: 'Manrope-ExtraBold',
};

/**
 * The faces to register at startup, keyed by the family name that selects them.
 *
 * `require` is how Metro bundles an asset, and the paths resolve at BUILD time —
 * so a missing or misnamed file fails the build instead of falling back to the
 * system font at runtime, unnoticed.
 */
export const MANROPE_ASSETS = {
  'Manrope-Regular': require('../../assets/fonts/Manrope-Regular.ttf'),
  'Manrope-Medium': require('../../assets/fonts/Manrope-Medium.ttf'),
  'Manrope-SemiBold': require('../../assets/fonts/Manrope-SemiBold.ttf'),
  'Manrope-Bold': require('../../assets/fonts/Manrope-Bold.ttf'),
  'Manrope-ExtraBold': require('../../assets/fonts/Manrope-ExtraBold.ttf'),
};

/**
 * The style fragment for one weight of Manrope. Spread it into a style:
 *
 *     title: { ...font(700), fontSize: 16 }
 *
 * ⚠️ The two platforms need DIFFERENT shapes, which is the whole reason this is
 * a function and not a constant. On web the CSS face carries every weight, so
 * the family stays constant and `fontWeight` does the work. On native the family
 * IS the weight and `fontWeight` must be omitted — leaving it in is what
 * double-bolds on Android.
 */
/*
 * ⚠️ The return is annotated `TextStyle`, not inferred.
 *
 * Inferred, the two branches make a UNION, and a union spread into a
 * `StyleSheet.create` entry fails to satisfy `TextStyle` — 450 call sites all
 * reported the same error at once. It also pins `fontWeight` to React Native's
 * literal union instead of widening it to `string`.
 */
export function font(weight: FontWeight = 400): TextStyle {
  return Platform.OS === 'web'
    ? {
        fontFamily: "'Manrope', sans-serif",
        fontWeight: String(weight) as TextStyle['fontWeight'],
      }
    : { fontFamily: MANROPE_FAMILY[weight] };
}
