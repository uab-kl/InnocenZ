/**
 * Outlet financial defaults — deliberately a LEAF module with no imports.
 *
 * These lived in `outlet-financial-sync.ts`, which imports from `outlet-demo.ts`
 * while `outlet-demo.ts` imported these constants back out of it: a cycle. That
 * survived only as long as the bundler happened to enter `outlet-demo` first.
 *
 * It stopped surviving and took the whole agency portal down with
 * `Cannot access 'DEFAULT_PER_TABLE_RM' before initialization`. `outlet-demo`
 * reads these at MODULE-EVALUATION time (its `priceRm` / `perTableRm` literals),
 * not inside a function, so when `outlet-financial-sync` is entered first it
 * suspends at its `outlet-demo` import — above the `const` declarations below —
 * and `outlet-demo` then reaches for a binding still in the temporal dead zone.
 *
 * A module with no imports can never be half-initialised, so both sides can
 * depend on this one safely. `outlet-financial-sync` re-exports every name here,
 * so existing import sites keep working unchanged.
 */

export const DEFAULT_PER_DRINK_RM = 120;
export const DEFAULT_PER_TABLE_RM = 100;
export const DEFAULT_DRINK_UNITS = 4;
export const DEFAULT_TABLE_UNITS = 0.9;
