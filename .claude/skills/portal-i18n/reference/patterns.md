# Wiring patterns, and the traps behind them

Every entry here is a real defect from this codebase, not a style preference.

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
