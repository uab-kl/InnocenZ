/**
 * InnocenZ PR app — full PR portal from InnocenZ-proto `/host/*`
 * Identity linked to admin backend PR "Vicky" (+60123456789).
 * Rebuild stamp: 2026-07-20T00:30Z
 */
import React, { useEffect, useState } from 'react';
import { Platform, StatusBar } from 'react-native';
import { AppSafeAreaProvider } from '../lib/safe-area';
import { useFonts } from 'expo-font';
import { ensureWebFonts } from '../theme/theme';
import { MANROPE_ASSETS } from '../theme/fonts';
import { SessionProvider, useSession } from '../lib/session';
import { ShiftSessionProvider } from '../lib/shift-session';
import { ActiveShiftProvider } from '../lib/active-shift';
import { PrEarningsProvider } from '../lib/pr-earnings';
import { PaymentHistoryProvider } from '../lib/payment-history';
import { SignedPvProvider } from '../lib/signed-pv';
import { PrNavProvider, usePrNav } from '../lib/pr-nav';
import { LocaleProvider } from '../i18n';
import { PhoneFrame } from '../components/PhoneFrame';
import { BootSplash } from '../components/BootSplash';
import { BottomNav } from '../components/BottomNav';
import { TopBar } from '../components/TopBar';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/sign-up';
import { ShiftsScreen } from '../screens/ShiftsScreen';
import { CheckInScreen } from '../screens/CheckInScreen';
import { PaymentScreen } from '../screens/PaymentScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { SecurityScreen } from '../screens/SecurityScreen';
import { PvDetailScreen } from '../screens/PvDetailScreen';

ensureWebFonts();

function LoggedInShell() {
  const { route, setTab, tab } = usePrNav();
  const showTabBar = route.name === 'tabs' || route.name === 'scan';

  return (
    <ShiftSessionProvider>
      <ActiveShiftProvider>
      <PrEarningsProvider>
      <PaymentHistoryProvider>
      <SignedPvProvider>
        <PhoneFrame
          header={showTabBar ? <TopBar onOpenProfile={() => setTab('profile')} /> : null}
          footer={showTabBar ? <BottomNav active={tab} onChange={setTab} /> : null}
        >
          {route.name === 'scan' && (
            <ScanScreen category={route.category} mode={route.mode} editId={route.editId} />
          )}
          {route.name === 'pvDetail' && <PvDetailScreen pvId={route.pvId} />}
          {route.name === 'security' && <SecurityScreen />}
          {route.name === 'tabs' && tab === 'shifts' && <ShiftsScreen onNavigate={setTab} />}
          {route.name === 'tabs' && tab === 'checkin' && <CheckInScreen onNavigate={setTab} />}
          {route.name === 'tabs' && tab === 'payment' && <PaymentScreen onNavigate={setTab} />}
          {route.name === 'tabs' && tab === 'history' && <HistoryScreen onNavigate={setTab} />}
          {route.name === 'tabs' && tab === 'profile' && <ProfileScreen onNavigate={setTab} />}
        </PhoneFrame>
      </SignedPvProvider>
      </PaymentHistoryProvider>
      </PrEarningsProvider>
      </ActiveShiftProvider>
    </ShiftSessionProvider>
  );
}

function AppShell() {
  const { me, booting } = useSession();
  const [authView, setAuthView] = useState<'signIn' | 'signUp'>('signIn');

  // Signup leaves authView on 'signUp'; clear it once logged in so logout
  // returns to Login, not the registration wizard.
  useEffect(() => {
    if (me) setAuthView('signIn');
  }, [me]);

  if (booting) {
    return (
      <PhoneFrame scroll={false}>
        <BootSplash />
      </PhoneFrame>
    );
  }

  if (!me) {
    return (
      <PhoneFrame scroll={false}>
        {authView === 'signUp' ? (
          <SignUpScreen onBackToSignIn={() => setAuthView('signIn')} />
        ) : (
          <LoginScreen onCreateAccount={() => setAuthView('signUp')} />
        )}
      </PhoneFrame>
    );
  }

  return (
    <PrNavProvider>
      <LoggedInShell />
    </PrNavProvider>
  );
}

/**
 * Fonts are registered BEFORE anything draws, and the app waits for them.
 *
 * ⚠️ The wait is the point. React Native does not fail when a family is
 * missing — it silently substitutes the system face, which is exactly how this
 * app spent its whole life rendering San Francisco while the code said Sora.
 * Painting a frame before the faces land would reintroduce that in miniature:
 * a flash of the wrong typeface on every cold start.
 *
 * `error` is surfaced rather than swallowed. If a face fails to load the app
 * still runs — it simply looks wrong — and a silent fallback is the one outcome
 * this whole change exists to prevent, so it is logged loudly.
 *
 * On web `useFonts` resolves immediately; `ensureWebFonts()` above already
 * injected the same family through a stylesheet link.
 */
export const App = () => {
  const [fontsLoaded, fontError] = useFonts(MANROPE_ASSETS);

  useEffect(() => {
    if (fontError) {
      console.error(
        '[fonts] Manrope failed to load — the app is rendering the system face:',
        fontError,
      );
    }
  }, [fontError]);

  /*
   * Hold the frame until the faces are in — ON NATIVE ONLY.
   *
   * ⚠️ Gating the WEB build blanked the whole app: `#root` rendered 0 children
   * indefinitely, with no console error to explain it. `ensureWebFonts()` above
   * already injects the same family through a stylesheet link there, so the gate
   * bought nothing on web and cost everything.
   *
   * A load ERROR never blocks either: the app then renders with the system face,
   * which is wrong-looking but usable, and a blank screen is neither.
   */
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError) return null;

  return (
    <AppSafeAreaProvider>
      <LocaleProvider>
        <SessionProvider>
          <StatusBar barStyle="light-content" />
          <AppShell />
        </SessionProvider>
      </LocaleProvider>
    </AppSafeAreaProvider>
  );
};

export default App;
