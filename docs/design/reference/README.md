# Outside design references

These two files are **reference, not rules**. The rules for InnocenZ are in
[`/DESIGN.md`](../../../DESIGN.md) at the repo root, and they win every time.

| File | Source | Why it is here |
|---|---|---|
| `stripe.DESIGN.md` | [VoltAgent/awesome-design-md](https://github.com/voltagent/awesome-design-md) `design-md/stripe/` | A money product: tabular figures for every amount, one filled action per area, quiet status chips |
| `linear.DESIGN.md` | same repo, `design-md/linear.app/` | A queue-and-to-do product on a dark canvas: lift by surface step rather than shadow, one accent used sparingly, dense lists that stay readable |

Both files are MIT licensed — see `LICENSE-awesome-design-md.txt`. Downloaded 17 Nov 2026
from commit `fcc7028` (28 Oct 2026). They describe each brand's *public website*; neither
shows the logged-in dashboard, which is the part InnocenZ actually resembles.

## What to take from them, and what never to take

**Take — patterns:** how a page says what needs you, how a queue separates "decide" from
"done", tabular numbers for money, one primary action per area, hairline borders and surface
steps instead of heavy shadows, focus rings, empty states.

**Never take — their identity:** fonts (Sohne, Linear Display), their font sizes and
negative letter-spacing, their indigo/lavender-blue, Stripe's gradient mesh, pill-shaped
buttons. InnocenZ has an approved look and an enforced 16 · 20 · 24 type ladder
(`pnpm check:type`, `CLAUDE.md`). A reference file that disagrees with `/DESIGN.md` is wrong
for this project.

## The tools that made them (installed outside the repo)

Kept in `C:\Users\jinkg\Downloads\design-tools\` on the owner's machine, never inside the repo:

| Tool | Use it to | Command |
|---|---|---|
| awesome-design-md | Pick another product's DESIGN.md to read | browse `design-tools/awesome-design-md/design-md/` (84 sites) |
| dembrandt | Pull colours, text styles, spacing and breakpoints from a public URL | `node design-tools/dembrandt/dist/index.js <url> --save-output` |
| designlang | Same, plus components, layout and accessibility, in many files | `node design-tools/design-extract/bin/design-extract.js <url>` |
| ui-ux-pro-max | Claude skill: search UX guidelines, palettes, chart types | installed at `~/.claude/skills/ui-ux-pro-max`; Python via `uv` |

⚠️ **Never run `designlang apply` (or any "write tokens into my project" command) against this
repo.** It would replace the approved tokens with another site's. Run the extractors in a
scratch folder, read the output, and carry over only the pattern you need.
