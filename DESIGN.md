---
version: alpha
name: InnocenZ
description: >-
  The working consoles of a PR-staffing platform — admin, agency and outlet on the web, the
  PR app on the phone. Since 20 Nov 2026 the look is AFTERGLOW VIVID (owner's choice): a
  near-black night canvas with a faint glow in two corners, warm off-white text, soft
  CHAMPAGNE gold on the one thing you act on (it replaced the first build's pink-to-orange
  neon the same day — "too bright"), Sora for text and Newsreader for page titles,
  and the strict three-step type ladder. The design has one job: every page must answer
  "where am I, what can I do here, and what is waiting for my decision" before the reader
  has to think. Plain beats clever; a page that looks quieter but works is always the win.

# Values below are Afterglow Vivid, set in apps/web/src/styles/afterglow.css (step 1 of its
# build, 20 Nov 2026). The previous plum values are in git history (DESIGN.md before 20 Nov).
colors:
  canvas: "#0b0a0d"          # page background (--iz-bg / --background); faint champagne + violet corner glow
  panel: "#121116"           # cards, panels, sheets (--iz-panel / --card)
  panel-2: "#1a181e"         # one step up: inputs at rest, hovered rows (--iz-panel2)
  rail: "#0b0a0d"            # sidebars sit on the canvas (--sidebar)
  hairline: "#26232c"        # 1px borders and dividers (--iz-line / --border)
  hairline-strong: "#34303b" # input borders, focused edges (--iz-line2 / --input)
  ink: "#ebe6df"             # warm off-white — never pure white at night (--iz-txt / --iz-title)
  ink-muted: "#bdb6ad"       # secondary text, helper lines (--iz-muted)
  ink-subtle: "#a39c93"      # tertiary text, meta (--iz-muted2)
  accent: "#d9c09a"          # champagne text: focus ring, selected icon, links, outline buttons (--iz-violet / --primary)
  accent-light: "#e8d6b8"    # accent hover on text
  act: "#cbb089"             # champagne, solid — the button that DOES the thing (--iz-neon and --iz-act)
  act-hover: "#d6bd99"
  on-act: "#1c160e"          # dark ink on champagne, 8.6:1 (--iz-neon-ink / --iz-act-ink)
  tab-selected: "#3e3732"    # a SOFT champagne tint, not a fill (--iz-tab-selected-bg)
  on-tab-selected: "#e2cba6" # champagne text on it, 7.4:1 (--iz-tab-selected-ink)
  todo-tile: "linear-gradient(135deg, #ff5f9e, #ff8a4c)"  # To do icons keep a neon per kind (owner: "icon can remain")
  settled: "#5ee0a0"         # green — settled, verified, signed, paid
  settled-bg: "#13271e"
  waiting: "#ffb35c"         # amber — waiting on someone
  disputed: "#ff6b7a"        # red — disputed, refused, deductions, stopped
  disputed-bg: "#33161b"
  wordmark: "#e0be73"        # the logo wordmark only — never a button, never text

typography:
  family-portal: "Sora"                            # all three portals' text (--iz-font, admin --font-sans), owner 20 Nov 2026
  family-title: "Newsreader"                       # page titles, the one <h1> (--iz-font-title)
  family-wordmark: "Georgia, serif"                # the logo only
  body:  { fontSize: 16px, fontWeight: 400, lineHeight: 1.5 }   # --iz-fs-micro…body
  title: { fontSize: 20px, fontWeight: 600, lineHeight: 1.3 }   # --iz-fs-title: section titles
  head:  { fontSize: 24px, fontWeight: 600, lineHeight: 1.25 }  # --iz-fs-head/display: the page <h1>
  numbers: { fontFeature: tnum, className: iz-nums }            # every money / count column

rounded:          # measured on every lane 19 Nov 2026 — the steps of styles/portal-interaction.css
  chip: 6px      # --iz-radius-s: status chips, rail items, tabs, code
  tab: 6px       # --iz-radius-s
  control: 10px  # --iz-radius-m: buttons, inputs, selects
  panel: 14px    # --iz-radius-l: panels, cards, alerts, To do rows
  sheet: 20px    # --iz-radius-xl: the largest surfaces
  pill: 999px    # count badges only; avatars are circles

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

## 0. The current look — Afterglow Vivid (owner, 20 Nov 2026)

Owner: *"can try conbine this 2 ? make nice Look and feel because client use this to work
night , improve UIUX"* — then, from the preview gallery, *"Afterglow Vivid"*. It combines
Gallery Night (near-black, serif titles, hairline frames) with Neon Night (pink-to-orange
action, a colour per kind of job, corner glow), built with unslop, Huashu Design and
awesome-design-md tokens. It **replaces**, by the owner's decision: the plum canvas and
lavender accent (§3), Arial / Manrope as the portal faces (§4 and CLAUDE.md), the ban on
gradients and glow in the consoles (§2) — now allowed ONLY on the To do kind icons and the
two faint corner glows (the act button and the selected tab were neon until the Champagne
change below) — and the tracked capitals on menu
headings (now sentence case). Everything else in this file still holds: the safety rule
(§2), the 16 · 20 · 24 ladder, the status colour code, the page anatomy and motion caps.

**Night comfort rules:** text is warm off-white, never pure white; every text role is at
least 4.5:1 on its surface (measured); colour only on what you act on; status by colour AND
shape (the urgent ring on a To do icon, from step 2).

**Champagne, not neon (owner, 20 Nov 2026, the same day):** the pink-to-orange was *"too
bright"*. From a preview of the real pages the owner picked *"A · Champagne"* for the
selected tab — as a **soft tint**, not a fill — then *"all the button looks change colour
to A · Champagne"*, and *"for the icon can remain"*. So: every act button is solid
champagne `#cbb089` with dark ink; outline buttons and links take champagne text; a
selected tab (and the rail's "you are here") is the soft tint `#3e3732` with champagne
text, beside a solid champagne bar on the rail; the **To do icons keep their neon colour
per kind**. Older fills that hard-code white text read `--iz-act-ink` now, so they carry
the dark ink too. Status colours (green / amber / red) are unchanged.

**The colour rule, as the owner settled it the same evening** — *"only the button A ·
Champagne colour"* · *"the graph, icon can be neon and more colourful"* · *"all selectable
all Champagne colour"* · *"the border all colour can change to Champagne"* · *"the money
RM make more obvious colour"*:

| What it is | Colour |
|---|---|
| Anything you **interact** with — buttons, select boxes, date pickers, dropdown options, tabs, links, collapsible sections, focus rings, ticks, coloured borders | **Champagne** — solid `#cbb089` + dark ink for the one action; outlined (champagne edge + champagne text) for every other; soft tint `#3e3732` for what is selected |
| **Icons and charts** — rail icons (one neon per destination), To do tiles (one per kind), admin page icons, the Reports chart (gains neon green, losses neon red) | **Neon** |
| Money **with a state** | green settled · amber waiting · red late (the status code) |
| Money **without** one — a price, a total not yet due | **Sky** `#7dd3fc` (`--iz-money`), which carries no status meaning |
| Labels, chips, unselected options | Neutral |

The accent tokens (`--iz-gold`, `--iz-violet`, `--iz-accent`, `--primary`, `--ring`,
`--gold-light`…) are champagne because ~90 borders, focus edges and links read them;
icons and charts get neon from explicit rules. Watch-outs found on the way: a global
`main a, p a` rule colours every portal link with `--gold-light`; the prototype theme's
`:root` lavender `--iz-*` tokens leak into admin unless afterglow re-points them; and an
accent token used as a FILL under white text fails once it is light (five rules found by
scanning — fixed with dark ink).

**Build steps:** 1 colours, fonts and finish — `styles/afterglow.css`, every selector
prefixed with `html` because Vite's dev server loaded `admin-design.css` after it (measured):
an override that relies on load order silently loses. 2 To do rows (neon icon per kind,
urgent ring). 3 Today figures and the voucher beside Pending payout. 4 admin dashboard
(review panel, breakdown bar + list, the gold "System operational" pill). Preview of all of
it: the "InnocenZ Look Gallery" artifact.

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
  A count INSIDE a tab (Approvals' PR · Outlet · Team members) is one quiet pill tinted
  from the tab's own text colour — the same shape selected or not, never a fill of its own
  (owner, 19 Nov 2026: a solid black chip on the gold tab read as a second control).
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

**One scale for all three portals (owner, 19 Nov 2026: "do all").** dembrandt and designlang found 8-14
corner radii, 5 font weights and transitions at 120 / 150 / 180 / 200 ms per portal. The portal stylesheets now
name their steps (`styles/portal-interaction.css`, on body so pop-ups see them too): corners `--iz-radius-s` 6 ·
`m` 10 · `l` 14 · `xl` 20 (plus pills and circles; 1-3 px hairlines stay); weights 400 / 600 / 700 only
(`font-medium` reads 600, `font-extrabold` 700); motion `--iz-motion-press` 100 · `fast` 160 · `base` 240 ·
`enter` 360 · `slow` 400, and a bare Tailwind `transition-*` lasts 160. A new rule names a step; it never
writes a raw px or ms. Tailwind's own `rounded-*` classes still follow its theme and are the drift left.

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

- **Buttons** — 46px minimum height (touch-safe), 10px corners (`--iz-radius-m`), rounded
  rectangles (never pills). `button-act` once per area; `button-soft` for secondary; `button-danger` for
  destructive, always behind a confirm.
- **Status chips** — 6px corners (`--iz-radius-s`), the status colour code, the status WORD inside (colour is
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
  0.4 s pop, so exactly one arrival plays; nothing on leaving. **Admin's** confirmation is
  sonner's toast, now held to the same rule (`admin-design.css`, 19 Nov 2026): it travels 10px
  at the fast step instead of a whole toast height in 400 ms, its height no longer animates,
  and it is gone on the frame it is dismissed. Measured live: 10 → 0 px in ~170 ms, no
  overshoot; under reduced motion it lands and leaves at once.

**Motion per page pattern (§7)** — what a reader sees move, and the question it answers.
Nothing on this list is decoration; a pattern with no row has no motion of its own.

| Pattern | Moves | Answers |
|---|---|---|
| Today / Dashboard | M1 arrival; To do rows rise together, top row's button rings once (M3); a rail count that changes pops (M4) | What is waiting for me |
| Queue | the queue settles in one beat; a picked row's edge slides in; the detail head rises (M6); the tab you clicked brightens (M5) | What did I just pick |
| List | M1 arrival; a sheet opens from its edge / a dialog grows in place (M8); clickable rows lift for a real pointer (M7) | Where did the detail open |
| Money | M5 on week tabs; underlined amounts fade their underline (M7); the confirmation bar / toast after sign or pay | Did it save |
| Settings | the confirmation after each Save; nothing else | Did it save |
| Signed-out pages | colour fades on controls at 160 ms; the sign-in ambience loops (owner's — §12) | — |

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
- **From Mercury, Airtable and Intercom** (read 19 Nov 2026 from awesome-design-md, not
  copied; all three describe their public sites): Mercury is the nearest to the portals — a
  dark ink-violet canvas, lavender-white headings, cards one shade lifted, one action colour.
  What the three agree on, and the portals keep: **one solid action per group**, everything
  else a soft tint; **elevation is tonal** — a card is told from the canvas by its fill, never
  by a strong drop shadow; **status colours live in the content** (rows, chips), not in the
  chrome. To check on rendered pages (TEST_SCRIPT §9 item 18): any group with two solid act
  buttons, any card lifted by a heavy shadow.
- **Not borrowed (Mercury, Airtable, Intercom):** their light weights (360-500) — the
  approved portals set their own; pill-shaped actions; warm cream or white canvases. Their
  "no all-caps tracked eyebrows" rule disagrees with the portals' uppercase table headers and
  section labels — **owner's call**, never changed silently.

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
needs the right portal" screen. **Partly, since 19 Nov 2026:** sign in, sign up, forgot and
reset password now keep every text at 16px or more as drawn (they render at zoom 0.9 on a
17px root, so the floor is 1.0625rem), use weights 400 / 600 / 700 (the logo excepted) and
time every control at 160 ms — the block at the end of `styles.css`. Still their own: the
display sizes, the rem-based corners, the gold gradient button and glass card, and the six
infinite ambience loops behind sign in / sign up (ui-ux-pro-max: loops are for loading only)
— **owner's call** whether those pages join the console look. The PR phone app (`apps/mobile`) has its own layout rules
(`innocenz-mobile-flexible-ui` memory) and shares only the colour code.

## 13. The four design tools — how to install and run them

Owner, 19 Nov 2026: *"download all"* — the four GitHub tools this guide was built from, now
installed so any session can run them, not only read their earlier findings. Every one is
MIT. **They advise; this file decides** — nothing a tool emits is applied to the code
directly.

| Tool | The question it answers | Install (any device) | Run |
|---|---|---|---|
| [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | What do mature products write in their DESIGN.md? 84 brands. Read, never copy (§10) | `git clone --depth 1 https://github.com/VoltAgent/awesome-design-md` **outside the repo** | read `design-md/<brand>/DESIGN.md` |
| [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | The rules by priority — accessibility, touch, performance, style, layout, type, **motion** — with do / don't | clone the repo, copy its `.claude/skills/ui-ux-pro-max` into `~/.claude/skills/` (Python 3 needed). ⚠️ Not `npm i ui-ux-pro-max-cli`: that package lists no repository, so its origin cannot be checked | `python ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux` (also `style`, `typography`, …) |
| [design-extract](https://github.com/Manavarya09/design-extract) (`designlang`) | What a page REALLY uses — colours, type, spacing, radii, motion, contrast pairs | `npm i -g designlang` | `designlang <url> -o <dir outside the repo> --wait 3000 --no-prompts`; `--motion-runtime` for measured durations |
| [dembrandt](https://github.com/dembrandt/dembrandt) | A second opinion on the same — tokens, breakpoints, every `@keyframes` with its length | `npm i -g dembrandt` | see the Chromium trap below |

**Traps found on the day they were installed — read before trusting a report:**

- **A portal report can be of the sign-in page.** Neither page tool carries the portal
  session, which lives in browser storage — designlang's `--cookie-file` (Playwright
  storageState) did NOT carry it: the "admin dashboard" run recorded `title: "Sign in —
  InnocenZ"` and scored the LOGIN page "100% WCAG". **Check the `title` / `url` in the
  output first.** For signed-in pages, measure in Playwright with minted read-only sessions
  and every write aborted (`TEST_SCRIPT.md` §10 2026-11-19 (xxi)), or run the tools on saved,
  locally served snapshots of the signed-in pages.
- **dembrandt's own Chromium is unsigned and this PC refuses to run it** ("Permission
  denied"). Do not change the security policy: start the signed system Chrome headless with a
  throwaway profile (`chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<tmp>`)
  and run `BROWSER_CDP_ENDPOINT=http://127.0.0.1:9333 dembrandt http://localhost:3001/en`.
- **dembrandt turns a bare `localhost:3001` into `https://`** — always type `http://`.
- **Never `designlang apply`** — it writes extracted tokens straight into the project, and the
  tokens here are decided in this file.
- Reports are scratch output: keep them out of the repo.
