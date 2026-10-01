---
name: special-event-prices-drive-money
description: "Owner decision (29 Sep 2026): on a special night with its OWN price list, money uses that list — the PR's logging list, the voucher name check and (via line categories) the sales split; one resolver, resolveDrinkMenusForShifts"
metadata:
  type: project
---

**Owner, 29 Sep 2026 — "Use event prices":** "On a special night with its own price list, the PR's
manual entries, the drinks/services split in sales and the voucher's item-name check all use that
list. Normal shifts keep the Workspace list."

**Where it lives:** Post Job saves a special night's own list in `shift_drink_menu` (migration 0167,
the per-shift twin of `outlet_drink_menu`, as `shift_pay_tier` is of `outlet_tier_rate`). ONE
resolver decides which list a shift is priced from —
`ShiftAssignmentRepository.resolveDrinkMenusForShifts({ shiftId, outletId, eventKind }[])` → `{ source:
'event' | 'workspace', items }`: the event list when the special shift has rows, else the venue's
Workspace list. It feeds:
- the PR's `GET /shift-assignment/mine` — `drinkMenu` (the list she logs from) + `drinkMenuSource`;
  `eventDrinkMenu` stays for the card that names tonight's prices;
- the voucher item-name check — `catalogueForReceipt` in `payment-voucher.controller.ts`, via
  `getOutletForAssignment` (now also returns `shiftId` / `eventKind`);
- the sales split needs nothing: `shift-sale-from-receipts.ts` reads each line's stored `category`,
  which came from the list the PR logged from.

**Why one resolver:** the phone and the agency must hold a line to the SAME list, or a drink that
exists only on the event list is logged by the PR and then refused on the voucher.

**How to apply:** any new money path that needs "the price list for this shift" calls the resolver —
never `resolveDrinkMenusForOutlets` directly. It THROWS on a failed read: falling back to the
everyday list would price a special night wrongly, so a 500 is the honest answer. Related:
[[drinks-services-split]], [[tips-row-is-seeded-and-locked]], [[outlet-post-job-today-calendar]].
