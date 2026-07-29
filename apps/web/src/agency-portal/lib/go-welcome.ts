import { WELCOME_PATH } from '@agency-portal/lib/nav-back';
import { useStore } from '@agency-portal/lib/store';
import { clearAuthTokens } from '@/lib/auth/auth-storage';
import { localizeHref } from '@/paraglide/runtime';

/** App login route — where signing out of a portal returns to. */
const LOGIN_PATH = '/login';

/**
 * Full URL to the app login screen (respects the Vite base path).
 *
 * Localize BEFORE prepending the base: the locale prefix belongs to the app
 * path, so `localizeHref` must not see the deploy base. Without this, signing
 * out landed on the un-prefixed `/login`.
 */
export function welcomeHref(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const path = localizeHref(LOGIN_PATH);
  return base ? `${base}${path}` : path;
}

/** Leave any portal and return to the app login screen. */
export function goToWelcome() {
  window.location.assign(welcomeHref());
}

/** Clear both the portal demo session and the app auth session, then log out. */
export function signOutToWelcome() {
  useStore.getState().signOut();
  clearAuthTokens();
  goToWelcome();
}

// `WELCOME_PATH` retained for any legacy references within the portal.
void WELCOME_PATH;
