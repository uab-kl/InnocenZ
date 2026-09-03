---
name: innocenz-portal-button-colours
description: "The web portal's button colour code (owner, 2 Sep 2026) — champagne gold = save/pay, dark soft = secondary, segmented tabs = a choice; `--iz-gold` is violet, not gold"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e2fc9165-55fd-439f-a58d-3751e117f247
  modified: 2026-09-02T08:35:40.733Z
---

Owner's colour code for buttons on the outlet/agency web portal (`apps/web`, theme
`agency-portal/prototype-theme.css`), fixed on 2 Sep 2026 after three corrections in a row:

- **Champagne gold = act / commit / money.** `.iz-btn-gold` and `.iz-btn-primary` share
  `--iz-grad-accent` (#f2d9a0 → #e3b877 → #c99b4e, ink #241a08). Use it for Save, Pay by
  FPX, Save workspace, "Ask for a new price" — the action that sends something. NOT a bright
  yellow: the owner rejected #f2c14e as "ugly".
- **Red = ending something.** `.iz-btn-danger` (`--iz-red` text, faint red fill):
  "Cancel POS · plan only", Remove payment method's confirm. Same rule as the phone's
  gold=act / red=close.
- **Dark soft = neutral / secondary.** `.iz-btn-soft` (glass background, `--iz-line2` border,
  white text): a form's Cancel, Add payment method, Edit payment method, "Cancel request".
  ⚠️ The owner pointed at the two POS buttons and said "remember this colour code", then
  "change it the colour" — the two buttons were UNcoloured and had to become gold + red; a
  plain soft pair on an act/close decision is the thing to avoid, not the reference.
- **A chosen option = the pressed-tab colour on a normal soft button.** `.iz-btn-soft.iz-btn-on`
  (lavender `--iz-gold` border, faint warm fill, `--iz-gold-l` text — the same colours as the
  payroll week tabs' `.on`). Used for the Card / Bank direct debit rail picker. Keep the
  FULL-SIZE `.iz-btn` shape: the owner rejected the small segmented `.iz-payroll-tab` pills
  there ("ugly, redesign the button style to previous") but kept the colour ("this colour
  remain"). A pressed choice must NEVER be painted gold.
- ⚠️ `--iz-gold` (#b79ce8) is the portal's VIOLET under a misleading name, read by half the
  portal for lavender accents. Never treat it as gold and never recolour it.

**Why:** the gold class was used by a dozen buttons and defined nowhere, so Save/Pay rendered
as bare text next to a bordered Cancel — the escape looked like the button. The first fix (a
bright yellow, also on the pressed rail) was rejected twice.

**How to apply:** new primary button → `iz-btn iz-btn-gold` (or `iz-btn-primary`); secondary →
`iz-btn iz-btn-soft`; two-way toggle → the payroll tab classes. One gold in the theme, not two.
See [[innocenz-mobile-flexible-ui]] for the phone's gold=act / red=close rule.
