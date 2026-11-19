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
  than one accent colour. (The public homepage may use more — it is a marketing page —
  but the consoles are tools.)
- **Motion in the consoles is capped, not banned** (owner, 17 Nov 2026: *"i still cant see
  any animation style design for agency and outlet protal"*): a state change ≤ 450 ms, a
  one-shot ring ≤ 700 ms, a continuous loop only while something loads. Still no parallax
  and no scroll-triggered motion. This replaces the old "nothing longer than 200 ms" ban;
  §8 lists what moves and why.
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
  counts load and "All clear" only when every count is known and zero. "Checking…" waits for
  every read behind a row or strip in the panel — the agency's five approval reads, the
  outlet's banners — so it never says "All clear" and then grows a row.
- **Count badges** — on the rail item and on its folded section; red if any is red. The
  number is announced with words for screen readers ("3 to review"), not a bare digit.
- **Tables** — header row in `ink-muted`, money right-aligned in `iz-nums`, one status chip
  per row, the row's action at the end. Drop any column that repeats another (§2).
- **Clickable amounts and inline links** (18 Nov) — underlined at rest in hairline grey
  (`--iz-line2`) with the text in the row's own ink, never lavender at rest; hover and focus
  turn the underline lavender and the text ink, with the shared focus ring. No chevron.
  `.iz-roster-amount-btn`; `.iz-inline-link` for a link inside a sentence, scoped to
  `:is(.iz-portal, .iz-sheet)` because sheets are portalled to `<body>`.
- **Money that opens nothing** — ink. Lavender only on a figure that is a link. No amber or
  green on Outstanding / Pending payout; red only for disputed and deductions.
- **KPI tiles** — a small arrow after the label only on a tile that is a link; a plain tile
  has none, so the arrow itself says "this opens".
- **Blocking reasons** — an amber notice box (`div.iz-alert--notice`), never a link or a
  button, no arrow, title at 600. The same warning has the same shape on every page.
- **Voucher detail bar** — sticky at 768px and wider only; on a phone it scrolls away.
- **Confirmation bar** — one flat bar, fill one step above the cards, warn = red, gone after
  2800 ms. Below 768px it is fixed to the window, so a result that lands after scrolling is
  still seen. Admin's toasts are themed to match.
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

`styles/portal-interaction.css` (all three portals): actions step up 1px on hover (150 ms),
press sinks 1px and scales to .985 (90 ms); linked cards lift 2px; the focus ring appears at
once. `agency-portal/portal-motion.css` (agency + outlet only, owner 17 Nov 2026) holds the
motion that GUIDES (M1-M9) and is where new agency/outlet motion goes. Older motion still
lives where it was and portal-motion.css only overrides or guards it: the sheet, dialog and
toast keyframes in `prototype-theme.css`, the To do row lift in `todo-panel.css`, the
Approvals row transitions in `agency-approvals-design.css`.

**The rule:** motion follows a user action (a click, a pick, a hover) or a mount (a page, a
row) — never a refetch that changes nothing, never a return to the window, and nothing
plays on its own. The one deliberate exception is M4: a rail count that CHANGES after the
counts have loaded pops, and its pop is the news; a badge that is merely there when the page
opens stays still (owner, 18 Nov 2026). Each motion
answers one of §1's questions; none decorates. Only colour, opacity, translate, scale and
box-shadow animate, plus one rotate: a disclosure chevron turning as its section opens
(150-200 ms, the band Linear and Cal use for icon transforms). Size, padding, font weight,
filters and gradients never animate. Tabs never move; their gold answers instead. Three
"nothing" rules keep it from reading as a generated site (owner, 18 Nov 2026 — "less look
like AI website"):
- **Nothing overshoots.** Every curve decelerates and no keyframe passes its resting value;
  of 56 curves extracted from the six reference sites, none overshoots.
- **Nothing staggers.** No entrance waits for its place in a list: tiles and rows that mount
  together arrive together. A row-by-row cascade kept each later item invisible while it
  waited, which reads as still loading.
- **Nothing leaves with motion.** Unmount is instant, so no state waits on an animation —
  including the portal's Radix dialogs and popovers, which open with their fade and zoom only
  when motion is allowed and close at once.

Colour fades are not movement: a hover tint, an underline turning lavender, or a status
colour that changed because the status did fades at `-fast`, under reduced motion too.

**Tokens** — Linear's extracted 100 / 160 / 400 / 700 ms plus two named in-betweens:
`--iz-motion-press` 100 · `-fast` 160 · `-base` 240 (fades) · `-enter` 360 (travel) ·
`-slow` 400 · `-ring` 700 (one-shot rings only) · `-step` 45 ms (the rail bar's lead-in;
never a stagger) · `-rise` 10px. Eases `--iz-ease-out` (arriving), `--iz-ease-settle`
(settling), `--iz-ease-soft` (fades, colour). No rule types a raw duration or delay; the one
loading loop is 4 × `-slow`. Neither in-between is invented: 240 is Stripe's own opacity
fade and 360 is Wise's and Cal's 0.35 s. On a work page travel is 8-10px — the reference
products move 5-6px; only their homepages travel 24px or more.

**What moves (M1-M9):**
- **M1 page arrives** — the page root fades (opacity only: it holds the fixed Post Job
  dock) and its header rises 10px. Its figures (Today KPIs, Payroll metrics, Roster stats,
  Calendar stats) arrive with it, in the same fade — one arrival per navigation.
- **M2 you are here** — the desktop rail's current item flashes gold and its bar draws; a
  section the user opens settles in; on a phone the page name in the trail settles instead.
- **M3 To do** — each row rises as it mounts, and rows that mount together rise together (no
  stagger; urgency is the order on the page, not a cascade). The top row's button rings
  once, 360 ms after the counts are known — when its row has finished rising — and only
  after every count behind the panel is known (owner, 18 Nov
  2026 — "yes fix the to do panel"). TodoPanel marks the list `data-iz-settled` the first
  render nothing is loading and never takes it off; M3 rings only inside a settled list.
  Every row present then starts its ring together in a transparent tone and only the first
  sets the gold — one visible ring when the counts settle (before, a row landing late ABOVE
  one already shown rang gold a second time). A row that BECOMES first after a refetch does
  not ring; a row that MOUNTS after the list settled (a queue going 0 → n while the page is
  open) rings, gold only if first — news, like an M4 pop. Sticky, so a read that refetches
  when the window regains focus never replays it. Outlet Today also holds the list on its
  banners' reads (agency links, prices, the statement check), passed as TodoPanel `loading`.
  If the first item is a strip rather than a link row, no ring plays — as at rest, where only
  a link row carries the filled button.
- **M4 counts** — a badge grows in from 0.9 and fades (360 ms, no overshoot — the old
  0.88 → 1.03 → 1 "pop" was the extractor's template keyframe, not Linear's). It does this
  only on CHANGE (owner, 18 Nov 2026: "Pop only on change"). A desktop-rail
  badge stays still while a page opens or reloads; it pops only when its number changes after
  every query behind the rail has given its first answer (`PortalNavAlerts` passes that
  "settled" flag from the queries' own loading flags, never a timer) — a new approval, 0 → 1
  included. Only a red one also rings. A refetch with the same number, the load's own last
  count, and a badge shown because a rail group was folded shut all stay still. The badge
  marks itself `data-iz-pop` for 1200 ms (longer than the 360 ms pop + 700 ms ring — a test
  enforces it); M4 animates only a marked badge, and the mark comes off so opening a folded
  section never replays it.
- **Boot splash** (all three portals, `portal-gate-loading.tsx`) — the logo pulse and the bar
  loop run only when the reader allows motion, and the bar moves by `transform`, never `left`.
  Under reduced motion nothing moves: the moving segment is not drawn, leaving the still,
  empty track and the "getting ready" line — a frozen segment would read as stuck progress.
- **M5 tabs** — the tab the user just clicked brightens and settles (an inset wash on its
  gold, no outer halo: Linear's "selected = surface lift"), and what it swapped in fades. Keyed on
  `[data-iz-picked]`, which `agency-portal/lib/motion-pick.ts` puts on the strip for 700 ms
  after a CLICK (mouse, tap, or Enter/Space), so nothing plays on page load, on keyboard
  travel, or when the user comes back to the window. ⚠️ Never key it on `:focus` — that was
  measured: `:focus` re-matches when the window regains focus and replayed the fade over
  the voucher list at the same moment react-query refetched, which reads as "it reloaded".
  The M2 section settle uses the same mark.
- **M6 Approvals** — a queue settles in one beat, every row together; a picked row's edge
  slides in; the detail head rises on each new pick.
- **M7 clickable** — To do rows, linked KPI tiles and outlet cards lift 2px for a real
  pointer. The To do arrow and the linked KPI tiles' arrow slide 4px toward where they go,
  on hover with a real pointer and on keyboard focus. A PR's photo in a table answers with a
  lavender hairline — it never grows or glows, because a figure that hops in a table reads
  as noise. The Post Job event card and the outlet comcard button lift only for a real
  pointer, so a tap never leaves a card raised. Underlined figures and links (roster amounts,
  the shift detail's Workspace links, a paid invoice number) fade their underline with their
  text at `-fast`; keyboard focus answers at once, like the ring. Manage PR cards lift
  without a shadow — surfaces step up, they do not cast shadows (§3). A row that opens
  nothing (the Roster check-in rows with no position, or not yet arrived) has no pointer
  and no hover; a disabled act chip has no pointer either.
- **M8 overlays** — the phone menu slides in its full width; scrims fade. A centred dialog
  fades and grows 0.97 → 1 in place in 240 ms, never travelling (it used to slide 16-42px);
  the phone bottom sheet still rises from its edge. A popover never animates on close.
- **M9 loading** — the To do "Checking…" border breathes. Loops are for loading only: this
  border, plus a spinner while a request is in flight (a cut-loss approve, the member list
  loading, an avatar upload), which spins only when motion is allowed and otherwise stands
  still beside its words. No status, badge or waiting state ever loops — the Subscription
  "requested with admin" dot is still, because its amber panel and words already say it is
  waiting.
- **Charts** — draw at once. The outlet Reports bars do not grow from zero and their tooltip
  does not glide (recharts' animation is off), so a week change never reads as a reload.
- **Scrolls the portal does for you** — a deep-linked receipt, a Workspace #section, the
  shift detail's jumps to Live sales, Labour cost and Top PRs glide only when motion is
  allowed and land at once under reduced motion (`agency-portal/lib/motion-scroll.ts`), as
  Back to top already did.
- **Confirmation bar** — drops 10px into place in 160 ms (`iz-m-drop`), replacing the legacy
  0.4 s pop, so exactly one arrival plays; nothing on leaving.

**Guards:** every new animation sits inside `@media screen and (prefers-reduced-motion:
no-preference)`. Under reduced motion, G in `portal-motion.css` also:
- narrows every transition in both portals to colour and opacity, so a legacy chevron turn,
  a lift or a switch knob simply lands;
- keeps the shared actions' hover lift and press still for agency and outlet (admin keeps
  `portal-interaction.css`'s own behaviour);
- switches off the Radix popover arrival and the legacy page, sheet and toast animations.

`@media print` stops every animation and transition in both portals. The two legacy loops
that are not loading (the profile edit dot, the report range pulse) stop after three beats;
neither renders today, and the cap stays for when they return.
`agency-portal/lib/portal-motion-guards.test.ts` enforces the rules above — no overshoot, no
stagger (in every agency/outlet stylesheet and in the markup), one loop, no halo, spinners
behind `motion-safe:`, no exit animations, the dialog that never travels, the rows that open
nothing, no glowing gradient act button — and every check first fails on a planted breach.

**Measuring:** entrances use `backwards` fill, and a hidden Browser pane produces no frames,
so an element mid-entrance there reads opacity 0 for as long as the pane stays hidden. Force
a frame (front the pane, take a screenshot or hover) before any `getComputedStyle` sweep,
and never filter a sweep on opacity.

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
- **From six motion extracts** (Linear, Stripe, Mercury, Wise, Superhuman, Cal — each the
  public homepage, so none shows a logged-in product): durations by purpose (press 60-100
  ms, hover colour 100-200, icon transforms 150-200, fades 200-400); decelerating curves only
  (ours are Linear's three); colour as the hover answer; small travel.
- **Not borrowed (motion):** homepage loops, marquees, shimmer and gradient sweeps; blinking
  carets and scroll-triggered reveals; blur-ins, springs and overshoot; staggered cascades;
  cards that grow or glow under the pointer; exit animations (Linear, Mercury and Cal
  animate things leaving; the portals do not).

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
| Selected tab (gold) and rail "you are here" | `apps/web/src/styles/portal-tabs.css` |
| Agency + outlet motion (M1-M9) | `apps/web/src/agency-portal/portal-motion.css`, `agency-portal/lib/motion-pick.ts` |
| Portal shell, rail, trail | `agency-portal/components/portal/PortalShell.tsx`, `PortalDesignChrome.tsx` |
| Admin shell, rail, trail | `components/layout/sidebar.tsx`, `components/admin/admin-design-chrome.tsx`, `admin-trail.ts` |
| To do panels | `agency-portal/components/portal/TodoPanel.tsx`, `components/admin/admin-todo-panel.tsx` |
| Status tones | `lib/status-tone.ts` (admin), `STATUS_VARIANT`, mobile `receipt-review.ts` |
| Type ladder check | `tools/scripts/check-portal-typography.mjs` + its baseline |

**Not yet on this system:** the public homepage, login and sign-up pages, and the "this link
needs the right portal" screen. The PR phone app (`apps/mobile`) has its own layout rules
(`innocenz-mobile-flexible-ui` memory) and shares only the colour code.
