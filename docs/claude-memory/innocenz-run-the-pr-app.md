# Running the PR app (apps/mobile)

Added 30 Jul 2026. Until that day **nothing in `apps/mobile` had ever been executed** in any
session — every change to the PR app shipped on types and reading alone, which is the weakest
evidence in this repo. The blocker was never technical.

## In a browser (no phone needed)

```
node tools/scripts/dev-mobile-web.mjs
```

or the **`mobile-web`** entry in `.claude/launch.json`. Serves on **8081**.

- **Start the backend first.** The script pins `EXPO_PUBLIC_API_URL` to
  `http://localhost:<BACKEND_PORT>/api` (root `.env` says 7777). The autodetect path resolves the dev
  machine's LAN IP from Expo's `hostUri` — right for a phone, wrong for a browser on the same machine.
- It bundles clean: **492 modules, zero console errors**. `react-native-web` and `react-dom` were
  already dependencies; `dev-mobile.mjs` runs `expo start`, which wants a TTY for its QR code and a
  phone to scan it, and that requirement alone is why this app was never run.

## Signing in

Login is by **mobile number**, and the number that works is the one on the **`user`** row, not the
`pr` row — see `innocenz-account-and-phone-rules.md`. PR password on the test data is `password`.

Since 30 Jul the login accepts `+60123456801`, `60123456801` and `012-345 6801` alike.

## What a browser does NOT prove

Camera, geofence and the native pickers behave differently or not at all. **A device run is still
owed**; use `dev-mobile.mjs` for that. What web covers is layout, navigation and anything driven by an
API response — which is most of what has actually gone wrong here.

## Driving it from a tool

The bottom-nav tabs are plain `<div>`s with no accessible role, so an accessibility-tree read returns
bare `generic` nodes and a find-by-role cannot locate them. Click by text instead:

```js
const el = [...document.querySelectorAll('div,span')].find(
  (e) => e.childElementCount === 0 && e.textContent.trim() === 'Payment',
);
const t = el.parentElement, r = t.getBoundingClientRect();
['pointerdown','mousedown','pointerup','mouseup','click'].forEach((k) =>
  t.dispatchEvent(new MouseEvent(k, { bubbles: true, clientX: r.x + r.width/2, clientY: r.y + r.height/2 })));
```

Screenshots fail while the browser pane is hidden ("not compositing frames"); reading the page text
works regardless and was enough to verify every screen.
