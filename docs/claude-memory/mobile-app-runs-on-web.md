---
name: mobile-app-runs-on-web
description: "HOW TO RUN THE PR APP — expo start --web via tools/scripts/dev-mobile-web.mjs (or the mobile-web launch entry). Ends the 'nothing in apps/mobile has ever been run' era; it bundles clean and found a blocking bug in its first minute."
metadata: 
  node_type: memory
  type: reference
  originSessionId: 8853986f-5672-4e84-bcf9-9373f637ca51
  modified: 2026-07-30T14:00:47.146Z
---

**The PR app runs in a browser.** Added 30 Jul 2026 (`10c047b`); before that, nothing in
`apps/mobile` had been executed in ANY session, and every change to it shipped on types and reading.

```
node tools/scripts/dev-mobile-web.mjs      # or the `mobile-web` entry in .claude/launch.json
```

- Serves on **8081**. Start the **backend first** — the script pins `EXPO_PUBLIC_API_URL` to
  `http://localhost:<BACKEND_PORT>/api` (root `.env` says 7777), because the autodetect path resolves
  the LAN IP from Expo's hostUri, which is right for a phone and wrong for a browser.
- Bundles clean: **492 modules, zero console errors**. `react-native-web` + `react-dom` were already
  dependencies — the blocker was never technical, it was that `dev-mobile.mjs` runs `expo start`,
  which wants a TTY for its QR code and a phone to scan it.
- **Log in by MOBILE NUMBER**, and the number that works is the one on the **`user`** row, not the
  `pr` row — read [[pr-phone-login-mismatch]] BEFORE trying, or a fine login looks broken. PR
  password is `password`.

## What a browser does NOT prove

Camera, geofence and the native pickers behave differently or not at all. A **device run is still
owed**; use `dev-mobile.mjs` for that. What web does cover is layout, navigation and anything driven
by an API response — which is most of what has gone wrong on this project.

## Driving it

The bottom-nav tabs are plain `<div>`s with no accessible role, so `read_page` returns bare
`generic` refs and `find` cannot locate them. Dispatch a click by text instead:

```js
const el = [...document.querySelectorAll('div,span')].find(
  (e) => e.childElementCount === 0 && e.textContent.trim() === 'Payment',
);
const t = el.parentElement, r = t.getBoundingClientRect();
['pointerdown','mousedown','pointerup','mouseup','click'].forEach((k) =>
  t.dispatchEvent(new MouseEvent(k, { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })));
```

Screenshots fail while the Browser pane is hidden ("not compositing frames"); `get_page_text` works
regardless and was enough to verify every screen.
