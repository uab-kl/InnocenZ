---
name: portal-i18n
description: Translate InnocenZ portal pages for EN/中文 language switching. Use when new or changed UI still renders English under the 中文 switch, when asked to translate a page/screen/portal, to audit which pages are still untranslated, or after a coworker adds UI to the agency, outlet, admin or PR portals.
---

# Portal translation (EN ⇄ 中文)

Wire user-visible copy to the portal dictionary so it follows the EN / 中文
switch. The signed-in portals use **`lib/portal-i18n`** — not Paraglide, which
belongs to the marketing site and which nothing in the portals renders.

## The one rule

> **Never translate a value that is stored, compared, or sent.**

Everything else here follows from it. A shift `status`, a portal `code`, an API
sort param, an `<option value>`, a React `key`, a role or module name the admin
edits by name on that same screen — all stay English. Translate the **label
rendered for that value**, never the value.

Getting this wrong does not look like a bug. It looks like a filter that
silently matches nothing, or a POST that writes 门店 into a column expecting
`outlet`.

## Layout

| Path | What it is |
|---|---|
| `apps/web/src/lib/portal-i18n/translations.ts` | The dictionary. EN half, then ZH half, same shape. |
| `apps/web/src/lib/portal-i18n/context.tsx` | `usePortalLocale()` → `{ t, locale, setLocale }` |
| `apps/web/src/lib/portal-i18n/fill.ts` | `fill(template, { name })` for `{placeholders}` |
| `apps/web/src/lib/portal-i18n/*-label.ts` | Resolvers for stored values (see patterns) |
| `apps/web/src/components/portal-language-switcher.tsx` | The live EN/中文 control. **Do not touch.** |

`PortalTranslations` is derived from the **EN** object, so a key added to EN
without a ZH counterpart is a compile error. That type is the whole safety net —
`tsc` passing is the proof that both languages are complete.

`components/LocaleSwitcher.tsx` is dead Paraglide code. Ignore it.

## Workflow

### 1. Scan

```bash
node .claude/skills/portal-i18n/scan.mjs apps/web/src --summary
```

Ranked worst-first. `[UNWIRED]` means the file never imports the dictionary;
`[partial]` means it does and these strings were left behind. Drop `--summary`
for the strings themselves, or pass one directory or file to narrow.

Every hit is a **candidate**. The scanner cannot tell a button label from an
enum — that is step 2, and it is judgement, not mechanics.

### 2. Triage

For each candidate ask: *is this rendered, or is it data?*

**Translate:** headings, labels, buttons, placeholders, empty and error states,
toasts, confirm copy, table headers, `aria-label`, validation messages.

**Leave English:**

- Route `head()` titles — evaluated outside React, cannot read the locale.
- Stored values and enums (`"active"`, `"ROOFTOP"`, `Tier I`, dress codes).
- Anything in an `<option value>` / `SelectItem value` / query param / body.
- React `key` templates, element ids, class strings, `date-fns` formats.
- Record **keys** of any label map — only the values move.
- Names of records the user creates and edits by name on that screen
  (`roleName`, `moduleName`, `displayName`, email). A translated list beside an
  untranslated edit field is two answers to the same question.
- Plan names, and PR comcards — both standing decisions.

When unsure, grep the string: if it appears in a comparison, a `value=`, or a
service call, it is data.

**Demo and seed modules** (`agency-portal/lib/*-demo.ts`, `store.ts`,
`demo-seed.ts`) score high and are mostly fake content — venue names, seeded
rows — which stays English. But some of them also hold real **label maps** that
components render, and those do need translating. Scan them, then read what the
hits actually are rather than accepting or skipping the file wholesale.

### 3. Add keys — both languages, one edit

Append to the section that fits, in **both halves** of `translations.ts`. Reuse
an existing key rather than adding a near-duplicate; check first, because a
duplicate is a `TS1117` error.

Write the ZH from the **source string**, not from the scanner's output — it
truncates at 100 chars and normalises whitespace.

### 4. Wire

Read `reference/patterns.md` before this step. It carries the resolver-function
pattern, `fill`, plurals, and hook placement — each has cost a re-do here.

The short version:

- `const { t } = usePortalLocale();` — **first statement** of the component,
  never after an early return.
- Module-scope label maps hold **functions**, `(t) => t.x.y`, never dictionary
  keys. A key is itself a `string`, so storing one type-checks and then ships
  the key name to screen.
- Sentences with values use `fill(t.x.y, { n })`, never concatenation.
- `t` goes in `useMemo`/`useEffect` dependency arrays wherever it is read —
  except write-effects, where it must **not**.

### 5. Verify

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Judge **only the files you touched**. The repo carries a large pre-existing
error baseline in `agency-portal` demo modules; compare, do not count.

```bash
cd apps/web && npx biome check --write <files>
```

Biome is the only thing that catches a **conditionally called hook** — `tsc`
will not. Pre-existing `noNonNullAssertion` warnings are baseline.

Then re-scan the same path. What remains should be only the deliberate
non-translatables from step 2. If you cannot name why a leftover is there, it is
not done.

Finally, if a dev server and a login are available, switch to 中文 and look at
the page. Source-verified is not the same as seen.

## Reporting

Say which files changed, how many candidates went in and how many remain, and
**name what you deliberately left English and why**. An unexplained leftover
reads as a miss.
