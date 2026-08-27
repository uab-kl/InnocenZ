# Wiring patterns, and the traps behind them

Every entry here is a real defect from this codebase, not a style preference.

## 0. The two dictionaries are not the same shape

|  | `apps/web` | `apps/mobile` |
|---|---|---|
| Path | `src/lib/portal-i18n/translations.ts` | `src/i18n/translations.ts` |
| Hook | `usePortalLocale()` | `useLocale()` |
| Interpolator | `fill()` | `formatMessage()` |
| Locales | `en`, `zh` | `en`, `zh`, **`zh-Hant`** |
| The type | **derived** — a mapped type over `typeof en` | **declared by hand** |
| Edits per key | 2 | **4** (type + 3 locales) |
| Style | biome — tabs, double quotes | prettier — 2 spaces, single quotes |

Both make a missing locale a compile error, and that is the whole safety net.
`tsc` passing IS the proof that every language is complete — there is no
separate completeness check to run, and no reason to write one.

**Never run a formatter on either app as part of this work.** Biome on mobile
rewrites the file to tabs and double quotes. Prettier on mobile is the same trap
for the opposite reason: the files at `HEAD` *already* fail the root
`.prettierrc` (printWidth 80 against code written at ~100), so `--write` there
reformats whole files and buries the change. Verify that the way it was
verified — run the formatter's `--check` against a pristine
`git show HEAD:<file>` copy before believing a diff is yours. On web, biome is
still worth running as a **linter** (`biome lint`), because it is the only thing
that catches a conditionally-called hook; just do not let it format.

## 0b. A page with no provider is permanently English

`usePortalLocale` does **not** throw outside its provider. `context.tsx` ships a
`FALLBACK` that renders `DEFAULT_LOCALE` and no-ops `setLocale` — deliberately,
so a screen nobody has wired yet does not white-screen.

The consequence: wiring a page that sits outside `PortalLocaleProvider` produces
a page that *looks* translated in the diff and never switches. On web the
provider is mounted only in `components/layout/admin-layout.tsx` and the agency
and outlet `route.tsx` shells, so every pre-login page — `/login`,
`/reset-password`, `/forgot-password`, `/invite/*`, `/no-access` — is outside it.

Mounting it is its own task, and the ordering is a real trap: a component that
mounts the provider **cannot also consume it**. `useContext` in the same
component reads the value from *above*, which is the fallback. It has to wrap a
child:

```tsx
// WRONG — LoginRoute reads the FALLBACK, not its own provider
function LoginRoute() {
  const { t } = usePortalLocale();
  return <PortalLocaleProvider>…</PortalLocaleProvider>;
}

// RIGHT
function LoginRoute() {
  return <PortalLocaleProvider><LoginPage /></PortalLocaleProvider>;
}
function LoginPage() { const { t } = usePortalLocale(); … }
```

A pre-login page also needs a visible switcher, or the choice is unreachable to
anyone who has not already signed in on that browser.

## 1. Label maps hold FUNCTIONS, not keys

A dictionary key is itself a `string`. Storing one in a `Record<K, string>`
type-checks perfectly and then renders the key name to the screen.

```ts
// WRONG — compiles, ships "statusPending" to the user
const STATUS: Record<string, string> = { pending_review: "statusPending" };

// RIGHT
const STATUS: Record<string, { label: (t: PortalTranslations) => string }> = {
  pending_review: { label: (t) => t.admin.statusPending },
};
// call site
STATUS[row.status].label(t)
```

Applies to any map built at **module scope** — it runs before hooks, so it can
never read `t` directly. Applies to arrays of tab/card/tile config too.

**The record KEY never changes.** `pending_review`, `in_progress`, `admin` are
matched against stored data.

## 2. Resolvers for stored values

When the same stored value is rendered in several places, give it one resolver
next to the dictionary rather than a map per file. Existing ones:

| Resolver | Resolves |
|---|---|
| `admin-nav-label.ts` → `adminNavLabel`, `userTypeDescription` | sidebar/nav config titles and blurbs |
| `rbac-label.ts` → `portalCodeLabel`, `recordStatusLabel`, `rbacSectionLabel` | portal codes, `active`/`inactive` |
| `portal-role-label.ts` → `portalRoleLabel` | role names coming back from the API |
| `plan-label.ts` → `planCapacityLabel`, `planDescription`, `addonCopy` | plan catalogue copy |
| `language-label.ts` → `languageLabel`, `dressCodeLabel` | stored languages, dress codes |

Every one takes the raw value and **falls through to it** when unrecognised, so
a value added server-side keeps rendering instead of blanking a row.

Name a resolver for the fact it resolves, not the screen that first needed it —
`recordStatusLabel` started as `rbacStatusLabel` and had to be renamed the
moment a second table wanted it.

## 3. Sentences with values → `fill`

```tsx
// WRONG — cannot be reordered, and the ZH word order differs
`${name} keeps their account but loses ${role}.`

// RIGHT
fill(t.admin.revokeRoleBody, { name, role })
// dictionary: "{name} keeps their account but loses {role}."
```

Chinese puts these fragments in a different order. Concatenation makes that
impossible to express.

A sentence that wraps its numbers in `<span className="font-medium">` has to
give that styling up to become one translatable string. That is the right
trade — English fragments around JSX cannot be reordered.

## 4. Plurals are separate keys, never a suffix

```tsx
// WRONG — renders "3 小时s ago" the moment the dictionary swaps
`${hrs} hr${hrs === 1 ? "" : "s"} ago`

// RIGHT
fill(hrs === 1 ? t.admin.dashHrAgo : t.admin.dashHrsAgo, { n: hrs })
```

Chinese has no plural form. Same for `Total ${label.toLowerCase()}` — English
grammar inside a template does not survive translation; spell both forms out.

## 5. Hook placement

`const { t } = usePortalLocale();` must be the **first statement** of the
component. Inserting it lower can put it after an early return, which is a real
React violation that `tsc` does not see. **Biome does** — always run it.

A component getting `t` for the first time may already use `t` as a parameter
name elsewhere:

```tsx
// role-sheet.tsx had three of these. Renaming to `type` surfaced a stale key={t}.
{CRU.map((t) => ...)}   // shadows the locale
```

## 6. Default parameter values cannot read the dictionary

```tsx
// WRONG — evaluated before any hook runs
function ConfirmDialog({ confirmLabel = "Confirm" }) { ... }

// RIGHT
function ConfirmDialog({ confirmLabel }) {
  const { t } = usePortalLocale();
  ... {confirmLabel ?? t.rbac.confirm}
}
```

## 7. Shared hooks that build sentences

A hook composing copy (`useAccountActions`) reads `t` itself. Any label passed
**into** it must arrive already translated by the caller, because it lands
mid-sentence. Say so on the option's doc comment.

## 8. Things that break when the label moves

- **React keys.** `key={stat.label}` remounts every tile on a locale switch —
  give the item a stable `id`.
- **Icon lookups.** `iconForNav(title)` matches on text; a translated title
  silently drops the icon. Pass an `iconKey` holding the English value.
- **Route `head()`.** Runs outside React. Leave the title English.
- **CJK line breaking.** No word boundaries — buttons need
  `white-space: nowrap` (already on `.iz-btn`).

## 7b. An OPTIONAL `t` is a default, and a default pins a locale forever

Caught three separate times in one campaign, in three different files, by three
different agents — and `tsc` was green for all three:

```ts
// WRONG — a caller that forgets gets English, silently, forever
function summary(row: Row, t: PortalTranslations = translations.en) { … }
function validateStep(s, draft, digits, copy?: Partial<SignupFieldCopy>) {
  return copy?.nameRequired ?? "Name is required";   // the `??` IS the leak
}

// RIGHT — LAST, and REQUIRED
function summary(row: Row, t: PortalTranslations) { … }
```

`formatPayTierRowSummary` shipped English pay-tier lines into a Chinese portal
this way. `validateStep` did it across all 39 signup validation messages.
`shiftDurationLabel` did it for every duration on mobile.

The rule: **an exported helper takes the dictionary LAST and WITHOUT a default.**
Then a caller that forgets is a compile error instead of a silent English string.
When you add `t` to a shared helper, expect to fix every call site — that work
is the feature, not an inconvenience.

## 8a. The icon-by-text trap fires at SCALE, and nothing catches it

This was already written down in §8 below, and a later pass still walked into it
at **32 sites**, because the failure is invisible: `iconForNav(label)` matches on
English text and ALWAYS returns something, so a translated title degrades to a
plausible-looking `CircleHelp` "?" glyph. `iconForTitle` (via `TitleWithIcon`,
which derives its key from the rendered *children*) returns null instead, and the
icon just disappears. No error, no blank, nothing for `tsc` or biome to see.

Writing the warning down was not enough. **Run the check** — the risk set is any
file that both passes a translated label AND uses a text-matched lookup:

```bash
comm -12 \
  <(rg 'title=\{t\.|eyebrow=\{t\.|label=\{t\.' apps/web/src -g '*.tsx' -l | sort) \
  <(rg -l 'OutletSection|OutletPageHeader|TitleWithIcon|iconForNav|iconForLabel' apps/web/src -g '*.tsx' | sort)
```

Then check each hit carries an escape: `grep -iq 'iconkey=\|icon='`. **Case-
insensitive matters** — the eyebrow escape is `eyebrowIconKey`, and a
case-sensitive `iconKey=` reports an already-fixed file as broken. Piping the
first `rg` into `xargs rg` instead of `comm` silently returns nothing on Windows
paths, which reads as "all clear" — verify the halves return non-zero counts
before believing an empty intersection.

Every hit needs an explicit English `iconKey` (or `icon={iconForNav("…")}`).
Recover the English from git — `git log -S <key> -- <file>`, then read the literal
out of the parent commit — never guess it. A wrong key reproduces the identical
silent "?".

If a component derives an icon from a prop and offers no escape hatch, ADD one
before fixing its callers; `OutletPageHeader`'s `iconKey` guarded only `title`
and not `eyebrow`, which blocked three fixes until the prop existed.

## 8b. A stored string can be a MATCHING KEY, not just a value

The strongest version of the one rule, and the one that is easiest to miss:
some English strings are *parsed back*. Translating those does not merely
mislabel something — it silently breaks a lookup, or rewrites stored records.

Real cases from `apps/mobile`, each proven by grep before the decision:

- `MONTH_NAMES[…]` is written into a **persisted** PV snapshot as `"18 Jul"`
  and parsed back through a separate English `PV_MONTHS` map.
- `weekRangeLabel()`'s output (`"16 Aug – 22 Aug 2026"`) is compared against the
  persisted `HistPayWeek.weekLabel` to pair a history week with its voucher.
- `WEEKDAY_ABBR` becomes `WeeklyDayPay.day`, copied onto every persisted voucher
  line and spliced into the dispute reason POSTed to the agency portal.
- `"am"` / `"pm"` are re-parsed by `parseAmPmToken` to drive the History filter,
  and by `venue-time.ts` to pick a cancellation band — a translated meridiem
  would quote a fee from a different band than the server seals.

The fix is never to translate the producer. Keep the stored string English and
resolve it **at the render**, which is also how `statusMeta`
(`"Signed 5 Aug 2026 · 3:04"`) and the API's English error messages are handled.

Test for it like this: grep the string and ask whether any hit is a comparison,
a `Map` key, a regex, or a value written to storage. If yes, it is a key.

## 9. Codemod hygiene

If you script the edits rather than hand-editing:

- The repo is **CRLF**. Strip `\r` before matching and restore on write, or an
  offset computed on `\n` splices into the middle of a token.
- Braceless JSX props are the standard slip: `placeholder=t.foo`. End every
  codemod with `s.replace(/=(t\.[A-Za-z][A-Za-z0-9.]*)/g, "={$1}")`.
- Anchor hook insertion on a **known first statement**, not on a signature
  shape. Shape-matching misplaced three hooks in one pass.
- Make it idempotent, or a re-run duplicates every hook it inserted.
- Report per-file hit/miss counts. A silent zero-match is how a page ships
  half-translated.
- Inline JSX (`<h2 ...>Title</h2>`) needs a `>Title<` replacement; a
  whole-line matcher misses it. Expect both shapes in the same file.

## 10. Verifying

`tsc` proves both languages are complete (the type is derived from the EN
object) and catches duplicate keys as `TS1117`. It does **not** catch
conditional hooks — biome does.

Judge only files you touched. Baselines: `apps/web` carries a large pre-existing
error count in `agency-portal` demo modules; `apps/mobile` **must** be checked
with `-p tsconfig.app.json`, because its `tsconfig.json` is solution-style,
compiles zero files, and always reports clean.
