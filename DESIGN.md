---
version: alpha
name: InnocenZ
description: >-
  The working consoles of a PR-staffing platform — admin, agency and outlet on the web, the
  PR app on the phone. A calm plum-ink dark canvas, one lavender accent for the thing you act
  on, and a strict three-step type ladder. The design has one job: every page must answer
  "where am I, what can I do here, and what is waiting for my decision" before the reader
  has to think. Plain beats clever; a page that looks quieter but works is always the win.

colors:
  canvas: "#191622"          # page background (--iz-bg / --background)
  panel: "#231f2e"           # cards, panels, sheets (--iz-panel / --card)
  panel-2: "#292433"         # one step up: inputs at rest, hovered rows (--iz-panel2)
  rail: "#14111c"            # admin sidebar (--sidebar)
  hairline: "#373141"        # 1px borders and dividers (--iz-line / --border)
  hairline-strong: "#4c435a" # input borders, focused edges (--iz-line2 / --input)
  ink: "#eee9f5"             # body text and titles (--iz-txt / --iz-title)
  ink-muted: "#c0b6cd"       # secondary text, helper lines (--iz-muted)
  ink-subtle: "#ada4b9"      # tertiary text, meta (--iz-muted2)
  accent: "#baa4d6"          # lavender: focus ring, selected state, links (--iz-violet / --primary)
  accent-light: "#d5c5e5"    # accent hover on text
  act: "#68517f"             # fill of the button that DOES the thing (save, pay, approve)
  act-border: "#9274ad"
  act-hover: "#795f93"
  on-act: "#ffffff"
  settled: "#8dc9a9"         # green — settled, verified, signed, paid
  settled-bg: "#24392f"
  waiting: "#e8c66a"         # amber — waiting on someone (portal --iz-amber; admin --signal-warn #ddbd7b)
  disputed: "#e5a1a6"        # red — disputed, refused, deductions, stopped
  disputed-bg: "#3c282f"
  wordmark: "#e0be73"        # the logo wordmark only — never a button, never text

typography:
  family-portal: "Arial, Helvetica, sans-serif"   # agency + outlet (--iz-font, SL 22 Oct 2026)
  family-admin: "Manrope"                          # admin console's approved face
  family-wordmark: "Georgia, serif"                # the logo only
  body:  { fontSize: 16px, fontWeight: 400, lineHeight: 1.5 }   # --iz-fs-micro…body
  title: { fontSize: 20px, fontWeight: 600, lineHeight: 1.3 }   # --iz-fs-title: section titles
  head:  { fontSize: 24px, fontWeight: 600, lineHeight: 1.25 }  # --iz-fs-head/display: the page <h1>
  numbers: { fontFeature: tnum, className: iz-nums }            # every money / count column

rounded:
  chip: 5px      # .iz-pill / .iz-chip
  tab: 7px       # payroll tabs, filter chips
  control: 8px   # buttons, inputs, selects
  panel: 13px    # portal panels and cards (admin cards 12–14px)
  pill: 999px    # count badges only

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px      # panel padding
  section: 32px

components:
  button-act:    { backgroundColor: "{colors.act}", textColor: "{colors.on-act}", border: "1px solid {colors.act-border}", rounded: "{rounded.control}", minHeight: 46px, padding: 10px 15px }
  button-soft:   { backgroundColor: "{colors.panel}", textColor: "{colors.ink}", border: "1px solid {colors.hairline}", rounded: "{rounded.control}", minHeight: 46px }
  button-danger: { backgroundColor: "{colors.disputed-bg}", textColor: "{colors.disputed}", border: "1px solid #96616b", rounded: "{rounded.control}", minHeight: 46px }
  input:         { backgroundColor: "{colors.panel}", textColor: "{colors.ink}", border: "1px solid {colors.hairline-strong}", rounded: "{rounded.control}", minHeight: 46px }
  panel:         { backgroundColor: "{colors.panel}", border: "1px solid {colors.hairline}", rounded: "{rounded.panel}", padding: 24px }
  status-chip:   { rounded: "{rounded.chip}", minHeight: 30px, typography: "{typography.body}" }
  focus-ring:    { outline: "2px solid {colors.accent}", outlineOffset: 3px }
---

# InnocenZ design

> **Who this is for:** anyone — a person or an AI agent — changing how an InnocenZ screen
> looks. Read it before touching CSS or layout. `CLAUDE.md` holds the enforced rules
> (typography ratchet, status colours, no demo data); this file explains the look and the
> patterns that sit on top of them. When the two disagree, `CLAUDE.md` wins.

## 1. The three questions

Owner's feedback from real users (16 Nov 2026): *"user don't know where he at, what he can
do, where and what he need to decide."* Every page answers all three, in this order:

| Question | Where the answer lives | Built as |
|---|---|---|
| **Where am I?** | The breadcrumb trail names portal › section › page; the rail highlights the page; the page has exactly one `<h1>` | `portalSectionLabel` (agency/outlet), `resolveAdminTrail` (admin), `IzPageTitle` / `OutletPageHeader` |
| **What can I do here?** | One filled `button-act` per area — the main action. Everything else is `button-soft`. A role that may only look sees a plain "view only" line, not a row of dead buttons | RBAC from the database (`useAgencyCan`, `useOutletCan`); `queueElsewhereLine` |
| **What is waiting for me?** | The To do panel at the top of Today/Dashboard; a count badge on the rail item and on a folded rail section; amber/red rows inside the queue | `TodoPanel` + `AgencyTodoRows` / `OutletTodoRows`, `AdminTodoPanel`, `NavAlertBadge`, `sectionNavAlert` |

A design change that makes any of these three harder to answer is a regression, however
good it looks.

## 2. The safety rule — design never changes function

Owner, 17 Nov 2026: *"stay the functions and page name … i worry about if the design too
fancy will lead to the user misunderstanding or the page no function."*

- **Never changed by a design pass:** page names, rail and menu labels, button wording,
  routes and URLs, what a role may do, what a button sends, the order of steps in a flow,
  any API call. If a better design needs one of these to change, stop and ask the owner.
  The one sanctioned wording change is the Queue pattern's pair (§7): a row that can still
  be decided says "Review", a closed row says "View" — the SAME button opening the SAME
  sheet, the word now matching what the reader can do there.
- **Too fancy, therefore banned in the consoles:** hero sections, gradients and gradient
  meshes, glass/blur panels, parallax or scroll-triggered animation, decorative
  illustrations, icons that replace words, carousels, tracked ALL-CAPS body text, more
  than one accent colour, motion longer than 200 ms. (The public homepage may use more —
  it is a marketing page — but the consoles are tools.)
- **Show less** (owner, 16 Nov 2026): a screen shows only what the reader must act on.
  Before adding a column, cell or strip, ask what decision it changes. Never show the same
  fact twice. Prefer words that name the action ("2 vouchers to sign") over words that name
  the quantity ("2 vouchers").
- **Confirm every action** with the server's own success sentence; a button that saves
  silently looks broken.
- **A real session never shows demo data** — blank states use `BLANK_*`, not `DEFAULT_*`.

## 3. Colour

One dark theme, shared by admin, agency and outlet (the token values are the same in
`approved-portal-design.css` and `admin-design.css`).

- **Surfaces step up, they do not cast shadows.** canvas → panel → panel-2. Separate things
  with a 1px `hairline` and a surface step, as Linear does; a shadow is reserved for things
  that float (sheets, menus, dialogs).
- **Lavender `accent` is scarce:** focus ring, links. It is not a background and not a text
  colour for body copy.
- **"You are here" is gold, in two places only:** the selected tab (solid gold, below) and
  the current page in the side menu (a gold tint, a full-height gold bar and a gold icon —
  never a solid gold row, which would shout over the page). Admin, agency and outlet alike;
  both live in `styles/portal-tabs.css` (admin's legacy `!important` rule in
  `admin-design.css` reads the same tokens).
- **The selected TAB is solid gold with dark ink — in all three portals** (owner, 17 Nov
  2026: "the select tab can design so user know where they at", pointing at the admin
  dashboard's gold filter; "all the others also follow"). One file,
  `styles/portal-tabs.css`, two tokens (`--iz-tab-selected-bg` = `--gradient-royal`,
  `--iz-tab-selected-ink`). Gold here means "you are here"; "waiting" is the small amber
  COUNT badge, a different shape. A new tab strip is added to that file's list.
- **`act` (deep violet) fills the one button that does the thing.** Historically called
  "gold" in class names (`.iz-btn-gold`, `--iz-gold`) — the value is violet; do not
  "restore" a gold colour.
- **Status colour code (owner, 23 Aug 2026) — the only meaning colour may carry:**

  | Colour | Means | Examples |
  |---|---|---|
  | green `settled` | Done, nothing asked of you | verified, sealed wages, signed, paid, totals |
  | amber `waiting` | Someone has to act | pending AND approved-not-yet-paid (deliberately the same) |
  | white / ink | Mixed states | a week with some days settled and some not |
  | red `disputed` | Disputed, refused, money taken off, stopped | disputes, deductions, declined |
  | grey (admin `neutral`) | Switched off, nothing wrong | inactive account |

  Authorities: `cellReviewTone()` (mobile), `STATUS_VARIANT` (agency receipts),
  `lib/status-tone.ts` (admin). A new status gets a tone there — never a hand-picked colour.
- The `wordmark` gold (`#e0be73`) belongs to the logo; the selected-tab gold above is the
  only other gold on screen.

## 4. Type

- **Three sizes, every role, every portal (owner, 17 Nov 2026):** 16 body · 20 section title
  · 24 page title. Pages name a `--iz-fs-*` token, never a px value; `pnpm check:type`
  fails on a new raw size and runs in CI.
- **Weights:** 400 for text, 600 for titles and the figure that matters. No 300 (too thin
  on a dark canvas), no 800.
- **Money and counts use tabular figures** (`iz-nums`) so columns line up — Stripe's habit,
  and the right one for vouchers and invoices.
- **Families:** agency + outlet Arial, admin Manrope — each portal's approved design. The
  logo wordmark (Georgia) and digits inside small count badges are the only exceptions.
- Do not copy a reference site's negative letter-spacing or display sizes.

## 5. Layout

**The shell (all three portals):** left rail grouped into sections (Overview, Operation, …)
that fold; a folded section shows the sum of its items' badges. Top bar: trail on the left,
bell and account on the right. Rail width 266px, collapsed 76px (admin 68px).

**Page anatomy, top to bottom — keep this order on every page:**

1. Trail + `<h1>` page title (+ at most one line saying what the page is for).
2. The page's main action, top-right of the header (one `button-act`).
3. Anything waiting for the reader (To do panel / amber-red alert strip `.iz-alert--amber|red`).
4. Filters and tabs — the selected tab shows its state, not just its colour.
5. The content: table, list or cards.
6. Empty state that says what to do next, not just "No data".

**Spacing:** gaps 12–20px between siblings, 24px panel padding, 32px between page
sections. Use `gap` on flex/grid, not margins. Mobile/narrow widths stack to one column and
never scroll sideways (wide tables scroll inside their own container).

## 6. Components

- **Buttons** — 46px minimum height (touch-safe), 8px corners, rounded rectangles (never
  pills). `button-act` once per area; `button-soft` for secondary; `button-danger` for
  destructive, always behind a confirm.
- **Status chips** — 5px corners, the status colour code, the status WORD inside (colour is
  never the only signal).
- **To do rows** — one row per kind of waiting work: what it is, how many, why it matters,
  one link straight to the right tab. Red rows first, then amber. Shows "Checking…" while
  counts load and "All clear" only when every count is known and zero.
- **Count badges** — on the rail item and on its folded section; red if any is red. The
  number is announced with words for screen readers ("3 to review"), not a bare digit.
- **Tables** — header row in `ink-muted`, money right-aligned in `iz-nums`, one status chip
  per row, the row's action at the end. Drop any column that repeats another (§2).
- **Sheets and dialogs** — the title says what is being decided; the act button repeats the
  verb ("Approve 3 PRs"), the other button is "Cancel".
- **Forms** — label above the field, helper text below in `ink-muted`, the error in
  `disputed` next to the field it is about, saying how to fix it.
- **Loading / empty / error** — every list has all three. Loading keeps the layout's shape;
  empty says what to do; error says what failed and offers retry.

## 7. Page patterns

| Pattern | Pages | Shape |
|---|---|---|
| **Today / Dashboard** | agency Today, outlet Today, admin Dashboard | To do panel first, then today's live picture, then figures |
| **Queue** | Approvals, Pending, Disputes, Plan requests, Receipts, Overtime | An amber strip "N waiting for your decision" (the rail badge's own number) with "Show only these"; new rows carry an amber leading edge and a filled "Review"; in-hand rows a filled "Review" and no edge; closed rows a quiet "View". Built: `components/admin/queue-cues.tsx` (admin Plan Request, Plan Change). Agency/outlet Approvals already work as tabs with counts |
| **List** | Manage PR, Outlets, Members, Subscriptions | Search + filters, table, row opens a detail sheet |
| **Money** | Payroll / Payment vouchers, Billing, Invoices | Week or period header, totals in `iz-nums`, status chip per voucher, sign/pay as the act button |
| **Settings** | Workspace, Settings, Profile | Sections as panels, one Save per panel, the server's confirmation shown after save |

## 8. Motion

From `styles/portal-interaction.css` (one feel in all three portals): actions step up 1px on
hover (150 ms), press sinks 1px and scales to .985 (90 ms); linked cards lift 2px; the focus
ring appears at once. Transitions animate colour, opacity and transform only — never size or
padding. Tabs, pickers and calendar cells do not move. `prefers-reduced-motion` turns it off.

## 9. Accessibility

Visible focus on everything interactive (2px lavender ring, 3px offset). Text contrast at
least 4.5:1 on its surface — the muted inks are tuned for `panel`, check them before using
them on `panel-2`. 46px touch targets. Status never by colour alone. Live counts use one
polite announcement with words.

## 10. What we borrowed — and from whom

References in [`docs/design/reference/`](docs/design/reference/README.md):

- **From Stripe** (a money product): tabular figures on every amount; one filled action per
  area; quiet status pills; dense tables that stay readable.
- **From Linear** (a queue product on a dark canvas): hierarchy by surface step and hairline
  rather than shadow; one accent used sparingly; the inbox pattern — what needs you first,
  done things quieter below.
- **Not borrowed:** their fonts, sizes, letter-spacing, colours, Stripe's gradient mesh,
  pill buttons, Linear's near-black canvas.

## 11. Checking a design change

A design change is done only when all of these hold (Fix Rules in `CLAUDE.md`):

1. `pnpm check:type` — no new type breach. Typecheck and biome clean for touched files.
2. Walk every touched page as **every lane** (admin; agency owner/guarantor/director;
   outlet owner/guarantor/finance/operations head/director) with minted read-only sessions:
   page renders, no console errors, buttons still lead where they did, no demo data.
3. Measure, don't trust the source: `getComputedStyle` sizes on the rendered page stay on
   16 · 20 · 24; nothing overflows at 1440px and at phone width.
3a. **Everything clickable looks clickable** (ui-ux-pro-max "Hover States", "Active State",
   "Input Affordance"): a pointer cursor (`styles/portal-interaction.css` gives every
   button/tab/link one), a visible boundary at rest — border, fill or underline — a hover
   answer, and a selected tab in solid gold with dark ink (`styles/portal-tabs.css`), never
   a fill one shade off its neighbours. A clickable list row is a box at rest (hairline), not a line of text.
   Audit it by walking every page and listing interactive elements with no border, fill,
   underline, tint or icon — on 17 Nov that found 21 request rows on Agency Approvals.
4. Never click a write button to "see if it works" — prove it by reading code and rows.
5. Record the slice in `TEST_SCRIPT.md` (§10 row; §11 if a user can see it).

## 12. Where it lives

| What | File |
|---|---|
| Agency + outlet tokens and approved look | `apps/web/src/agency-portal/approved-portal-design.css` |
| Legacy portal base (being overridden) | `apps/web/src/agency-portal/prototype-theme.css` |
| Admin tokens and look | `apps/web/src/components/admin/admin-design.css` |
| Shared hover / press / focus | `apps/web/src/styles/portal-interaction.css` |
| Portal shell, rail, trail | `agency-portal/components/portal/PortalShell.tsx`, `PortalDesignChrome.tsx` |
| Admin shell, rail, trail | `components/layout/sidebar.tsx`, `components/admin/admin-design-chrome.tsx`, `admin-trail.ts` |
| To do panels | `agency-portal/components/portal/TodoPanel.tsx`, `components/admin/admin-todo-panel.tsx` |
| Status tones | `lib/status-tone.ts` (admin), `STATUS_VARIANT`, mobile `receipt-review.ts` |
| Type ladder check | `tools/scripts/check-portal-typography.mjs` + its baseline |

**Not yet on this system:** the public homepage, login and sign-up pages, and the "this link
needs the right portal" screen. The PR phone app (`apps/mobile`) has its own layout rules
(`innocenz-mobile-flexible-ui` memory) and shares only the colour code.
