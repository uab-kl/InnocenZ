---
name: portal-colour-rule
description: "Owner's colour rule for admin/agency/outlet web portals — champagne = interact, neon = icons/charts, money by state or sky, static stays neutral"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 76c5c026-418e-4b9b-8924-c12205530acf
  modified: 2026-11-20T09:44:45.570Z
---

Owner's standing colour rule for the three web portals (admin, agency, outlet), set on
20 Nov 2026 in this order: "only the button A · Champagne colour" · "the graph, icon can be
neon and more colourful" · "all selectable all Champagne colour" · "the border all colour can
change to Champagne" · "the money RM make more obvious colour" · "the words inside also
Champagne" (collapsible headers) · "what kind of things what colour remember" · "remember
static dont be like too messy colour".

| Kind of thing | Colour |
|---|---|
| Anything you click or choose — buttons, select boxes, date pickers, dropdown options, tabs, links, collapsible section headers (title + chevron), back/Return, focus rings, ticks, coloured borders | CHAMPAGNE: the one action solid `#cbb089` + dark ink `#1c160e`; every other control OUTLINED (a FULL `#cbb089` edge ALWAYS — owner: "border always show Champagne not the cursor move then show" — + `#d9c09a` text; hover = a faint champagne fill); selected = soft tint `#3e3732` + `#e2cba6` text |
| Icons and charts — rail icons (one neon per destination), To do tiles (one per kind), page icons, chart bars (gain neon green, loss neon red) | NEON |
| Money with a state | green settled · amber waiting · red late (the status code) |
| Money with no state (price, total not yet due) | sky `#7dd3fc` (`--iz-money`) |
| STATIC things — text, cards, labels, chips, unselected options, page backgrounds | NEUTRAL (warm off-white text, muted greys, hairlines). Never decorate them with colour. |

**Owner exception (20 Nov 2026):** on Payroll's receipt and dispute cards the KEY IDENTIFIERS are champagne text too — receipt no, order no, outlet name, and the dispute's "Voucher says" amount ("the receipt no order no and the outlet name can chanpagne colour ? · the dispute amount outlet name also"). Static, but the owner wants them to stand out; do not "correct" them back to neutral.

**Why:** the first night build (pink→orange neon fills) was "too bright"; users could not
tell what was clickable ("some button can click make sure the UIUX user will know"); and
colour on things you cannot press makes the page messy ("dont be like too messy colour").

**How to apply:** before giving anything a colour, ask "can you press it?" (champagne),
"is it an icon or a chart?" (neon), "is it money?" (state colour or sky) — otherwise it is
neutral. Everything lives in `apps/web/src/styles/afterglow.css` (DESIGN.md §0 has the
table). Accent tokens (`--iz-gold`, `--iz-violet`, `--iz-accent`, `--primary`, `--ring`,
`--gold-light`) are champagne because ~90 borders/links read them; icons and charts get
neon from explicit rules. Measure with the button audit, not by eye. Traps: a light
accent token used as a FILL under white text fails contrast — give it dark ink; `main a`
in styles.css colours portal links with `--gold-light`; the prototype theme's `:root`
lavender `--iz-*` tokens leak into admin. Related: [[css-override-load-order-trap]],
[[typography-is-enforced-by-a-check]], [[innocenz-status-colour-code]].
