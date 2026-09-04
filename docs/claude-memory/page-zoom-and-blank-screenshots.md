---
name: page-zoom-and-blank-screenshots
description: "CSS `zoom` scales a whole page in one line but does NOT scale viewport units; and the Browser pane screenshots the landing page blank below the fold while Chrome DevTools captures it fine"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 61f29c7e-fac6-4312-a873-e88aef236b42
  modified: 2026-09-04T08:14:58.601Z
---

Two things learned scaling the InnocenZ landing + auth surface down 20% (4 Sep 2026, X74).

## 1. `zoom` is the right knob, and `svh` is the trap that comes with it

`apps/web/src/landing-handoff.css` and the `.login-page` block in `styles.css` are laid out in
**hardcoded px end to end** — a root `font-size` change reaches almost nothing, and scripting a
proportional sweep of every `px` value would also shrink border widths and media-query
breakpoints. One declaration does the whole job:

```css
.landing-page,
.login-page { zoom: var(--iz-page-scale, 0.8); }
```

⚠️ **`zoom` deliberately does NOT compensate viewport units.** `100svh` inside a `0.8`-scaled
shell paints at **80% of the screen** — it showed as a hard edge and a bare strip under the
signup brand panel. Every full-viewport box needs the scale divided back out:

```css
.login-page.min-h-svh, .login-page .min-h-svh { min-height: calc(100svh / var(--iz-page-scale, 0.8)); }
```

Four shells lean on it here: `routes/login.tsx`, `routes/signup.tsx`, `AuthCardShell.tsx`
(`min-h-svh`, plus a sticky `h-svh` panel) and `HandoffHomePage.tsx` (`min-h-screen`).

`vw` is scaled the same way, and that is the easy overshoot: `84vw` inside a `0.8` page renders
at `0.84 × 0.8 = 67%` of the screen, not 84% — the first gutter pass came out twice as wide as
intended. **Write every width as its VISUAL size and divide the scale back out**, so the numbers
in the CSS mean what they say:

```css
.landing-page .hz-wrap { width: calc(min(1400px, 84vw) / var(--iz-page-scale, 0.8)); }
```

Measured at 1920: a 1400px column with 253px each side. `getBoundingClientRect()` returns the
**rendered** (post-zoom) size, so measure with it rather than reasoning about the computed value.
Percentages are the exception — they resolve against a containing block that `zoom` already
divided, so `width: 100%` fills its parent visually with no correction needed.

## 2. The Browser pane screenshots the landing page BLANK below the fold

Every `mcp__Claude_Browser__computer{action:"screenshot"}` past the hero came back as one flat
colour — with `zoom` on **and** off, with `content-visibility` forced visible, after wheel
scrolling as well as `scrollIntoView`. **The page was fine**: `elementFromPoint(400,250)` hit the
section title, every ancestor was `opacity: 1` with no transform, and the section's rect was
`top: 30, height: 755`. It is the capture path, not the page — the hero is the only section with
`content-visibility: visible` and the only one that ever captured.

**Use `mcp__plugin_ecc_chrome-devtools__take_screenshot` for anything below the fold on
`/en`** (`new_page` → `resize_page` → `evaluate_script` to scroll → `take_screenshot`). It
rendered all three card grids correctly at 1440×900. Sections are lazy-mounted by
`LazyMount` + IntersectionObserver, so scroll in ~400px steps once before jumping to an anchor,
or `document.getElementById('platform')` is `null`.

Related: [[innocenz-run-the-pr-app]], [[innocenz-env-gotchas]], [[absent-evidence-is-about-the-instrument]] —
a blank screenshot is evidence about the instrument, exactly like a zero grep count.
