/**
 * InnocenZ PR app — full PR portal from InnocenZ-proto `/host/*`
 * Identity linked to admin backend PR "Vicky" (+60123456789).
 * Rebuild stamp: 2026-07-20T00:30Z
 */
import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { C, ensureWebFonts } from '../theme/theme';
import { SessionProvider, useSession } from '../lib/session';
import { ShiftSessionProvider } from '../lib/shift-session';
import { PrNavProvider, usePrNav } from '../lib/pr-nav';
import { PhoneFrame } from '../components/PhoneFrame';
import { BottomNav } from '../components/BottomNav';
import { LoginScreen } from '../screens/LoginScreen';
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
  const hideTabBar = route.name !== 'tabs';

  return (
    <ShiftSessionProvider>
      <PhoneFrame footer={hideTabBar ? null : <BottomNav active={tab} onChange={setTab} />}>
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
    </ShiftSessionProvider>
  );
}

function AppShell() {
  const { me, booting } = useSession();

  if (booting) {
    return (
      <PhoneFrame scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      </PhoneFrame>
    );
  }

  if (!me) {
    return (
      <PhoneFrame scroll={false}>
        <LoginScreen />
      </PhoneFrame>
    );
  }

  return (
    <PrNavProvider>
      <LoggedInShell />
    </PrNavProvider>
  );
}

export const App = () => (
  <SessionProvider>
    <StatusBar barStyle="light-content" />
    <AppShell />
  </SessionProvider>
);

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default App;
