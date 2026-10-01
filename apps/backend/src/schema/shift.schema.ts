import { z } from 'zod';
import {
  shiftStatusValues,
  shiftEventKindValues,
  type ShiftEventKind,
} from '@/features/shift/shift.model';
import { tierRateKindValues } from '@/features/outlet-workspace/outlet-workspace.model';
import { specialEventTypeValues } from '@/schema/shift-template.schema';
import { slotMinutes } from '@/util/slot-window';

/**
 * A slot is either absent or a readable TIME WINDOW — never a bare label.
 *
 * Every guard that protects a shift reads its clock: the venue's own clash rule,
 * the PR double-booking check, the travel gap, sealing and the pro-rata pay
 * window. A label such as "Late night" gives all of them nothing to compare, so
 * it never clashed with anything — a venue could stack a "Late night" on top of
 * its 22:00 - 04:00, and a PR could be booked into both. Refused here, once,
 * rather than taught to five guards. No slot at all stays allowed: that is the
 * deliberate "untimed shift", and every guard already treats it as such.
 */
export const SLOT_NEEDS_WINDOW =
  'Give the shift a time window such as "22:00 - 04:00" — a label on its own cannot be checked for clashes.';

const slot = z
  .string()
  .max(100, 'Slot is too long')
  .refine((value) => value.trim() === '' || slotMinutes(value) !== null, SLOT_NEEDS_WINDOW)
  .optional();

// Accept a non-negative number from the client and store it as a fixed(2) string,
// matching the numeric(12,2) columns.
const money = z.number().nonnegative().transform((n) => n.toFixed(2));

// Nullable numeric → fixed(2) string or null (for columns that may be unset).
const optionalNumeric = z
  .number()
  .min(0)
  .nullish()
  .transform((n) => (n == null ? null : n.toFixed(2)));

// Required percentage → fixed(2) string, defaulting to '0' (numeric(6,2) NOT NULL).
const requiredPct = z
  .number()
  .min(0)
  .optional()
  .default(0)
  .transform((n) => n.toFixed(2));

/**
 * One per-shift pay-tier override the outlet composes at post time. Mirrors an
 * `outlet_tier_rate` row plus the requested `prCount`; the output shape matches
 * the repo's `ShiftPayTierInput` (numeric columns as fixed(2) strings).
 */
const ShiftPayTierSchema = z.object({
  kind: z.enum(tierRateKindValues).default('tier'),
  tier: z
    .string()
    .max(50)
    .nullish()
    .transform((v) => v ?? null),
  wagePerHour: optionalNumeric,
  drinkPct: requiredPct,
  happyHourDrinkPct: optionalNumeric,
  tipPct: requiredPct,
  otAfterHours: optionalNumeric,
  targetSalesRm: optionalNumeric,
  prCount: z.number().int().nonnegative().optional().default(0),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});

/**
 * How many items one event's own price list may carry. The largest everyday
 * list on the live database holds 9 (29 Sep 2026), so this refuses nothing
 * honest — it only stops a runaway client writing thousands of rows in one post.
 */
export const EVENT_DRINK_MENU_MAX = 100;

/**
 * 'drink' | 'service' | 'tip' — the SAME three values `outlet_drink_menu` takes
 * (`DrinkMenuItemSchema`). The composer opens an event's list as a COPY of the
 * Workspace list, and every venue's Workspace list carries its seeded Tips row
 * as 'tip' (8 of the 25 live rows). Refusing the value would fail every special
 * post that kept that row; collapsing it to 'service' would file the event's
 * tips as service sales.
 */
export const eventDrinkMenuCategoryValues = ['drink', 'service', 'tip'] as const;

/** numeric(12,2) holds ten integer digits — the column's own ceiling, not a price cap. */
const PRICE_CEILING_RM = 9_999_999_999.99;

/**
 * One line of a special event's OWN price list (`shift_drink_menu`, 0167) — the
 * per-shift twin of a Workspace `DrinkMenuItemSchema` row. `priceRm` leaves as a
 * fixed(2) string, like every other money field on a shift.
 */
const EventDrinkMenuItemSchema = z.object({
  /** The composer's item id — a Workspace row's own slug when it was copied. */
  slug: z
    .string()
    .trim()
    .min(1, 'Every event price needs an id')
    .max(100, 'An event price id is too long'),
  name: z
    .string()
    .trim()
    .min(1, 'Name every item on the event price list')
    .max(255, 'An event price name is too long'),
  priceRm: z
    .number()
    .nonnegative('An event price cannot be negative')
    .max(PRICE_CEILING_RM, 'An event price is too large')
    .transform((n) => n.toFixed(2)),
  category: z.enum(eventDrinkMenuCategoryValues).optional().default('service'),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});

export const CreateShiftSchema = z.object({
  // Optional: derived from the caller's agency for agency users; required for admin.
  agencyId: z.string().uuid('Invalid agency ID').optional(),
  /**
   * Which of the outlet's APPROVED agencies this job goes to (0124).
   *
   * Omitted or empty means "all of them" — the same thing the old single-agency
   * behaviour meant when a venue had one link, so an existing client that never
   * sends this keeps working unchanged.
   *
   * Advisory, not authoritative: the controller intersects it with the outlet's
   * approved links, so naming an unapproved agency cannot create an invitation.
   */
  agencyIds: z.array(z.string().uuid('Invalid agency ID')).max(20).optional(),
  outletId: z.string().uuid('Invalid outlet ID'),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd'),
  slot,
  eventName: z.string().max(255, 'Event name is too long').optional(),
  eventKind: z.enum(shiftEventKindValues).optional(),
  /** The event template this shift was posted from (0128) — optional. */
  templateId: z.string().uuid('Invalid template ID').optional(),
  /**
   * The special SUB-TYPE and its "Other" name (0167). Stored only on a special
   * shift, the name only while the type is 'other' — `normaliseSpecialEvent`
   * decides, on every write. On an edit, null clears and omitted keeps.
   */
  specialEventType: z.enum(specialEventTypeValues).nullish(),
  customSpecialEventName: z.string().trim().max(120, 'The event name is too long').nullish(),
  /**
   * The special event's OWN price list (0167), from the Post Job event price
   * editor. The same three states as `payTiers`: omitted keeps what is stored,
   * `[]` clears it (the night is then priced from the Workspace list), a list
   * replaces it. Never stored on a shift that is not special.
   */
  eventDrinkMenu: z
    .array(EventDrinkMenuItemSchema)
    .max(EVENT_DRINK_MENU_MAX, `An event price list can hold at most ${EVENT_DRINK_MENU_MAX} items`)
    .optional(),
  languages: z.string().max(255, 'Languages is too long').optional(),
  // 60 to match the column AND `shift_template.dress_code` — see 0132.
  dressCode: z.string().max(60, 'Dress code is too long').optional(),
  quantity: z.number().int().nonnegative().optional(),
  filled: z.number().int().nonnegative().optional(),
  preferredRating: z.number().int().min(0).max(5).optional(),
  payPerHour: money.optional(),
  estimatedCost: money.optional(),
  liveSales: money.optional(),
  // Per-shift rate overrides (Post Job pay-tier rows). Omit to keep the outlet's
  // workspace defaults; an empty array clears any existing overrides on update.
  payTiers: z.array(ShiftPayTierSchema).optional(),
  // Named-PR requests from the venue's SELECT PRS picker (0131). Each pick
  // names the person AND the membership its card came from, because a PR can
  // belong to several agencies and only the addressed agency may see the ask.
  // Capped at the largest plan's named-slot allowance.
  requestedPrs: z
    .array(
      z.object({
        userId: z.string().uuid(),
        agencyId: z.string().uuid(),
      }),
    )
    .max(100)
    .optional(),
});

export const UpdateShiftSchema = CreateShiftSchema.partial().extend({
  status: z.enum(shiftStatusValues).optional(),
});

/**
 * How many shifts one `POST /shift/batch` may carry.
 *
 * Post Job builds a batch as its drafts × the dates each one picked, and the
 * composer caps neither — so this is chosen, not derived: the longest month with
 * a shift every night. That is past anything the composer's quick picks build
 * (the widest is one week) and far past the largest batch any venue has posted
 * (3 shifts inside one minute, read off the shared database on 30 Sep 2026),
 * while keeping a batch's one transaction short: each item costs ~7 checking
 * reads and ~5 writes against a database ~20 ms away. A bigger roster is two
 * posts, and the refusal below says exactly that.
 */
export const SHIFT_BATCH_MAX = 31;

/** Refusals of the batch ENVELOPE. A bad ITEM answers as `POST /shift` would. */
export const SHIFT_BATCH_NOT_A_LIST = 'Send the shifts to post as a list of items.';
export const SHIFT_BATCH_EMPTY = 'Add at least one shift to post.';
export const SHIFT_BATCH_TOO_MANY = `You can post at most ${SHIFT_BATCH_MAX} shifts at once — split the rest into a second post.`;

/**
 * `POST /shift/batch` — `{ items: [...] }`, each item exactly the body
 * `POST /shift` takes.
 *
 * Only the envelope is checked here. The items stay `unknown` on purpose: the
 * controller parses each one with `CreateShiftSchema` inside the single post's
 * own check, one at a time, so a bad item is refused with the very sentence a
 * single post would get — and named by its index — rather than by whatever
 * path-shaped message a nested array schema would compose.
 */
export const CreateShiftBatchSchema = z.object(
  {
    items: z
      .array(z.unknown(), { error: SHIFT_BATCH_NOT_A_LIST })
      .min(1, SHIFT_BATCH_EMPTY)
      .max(SHIFT_BATCH_MAX, SHIFT_BATCH_TOO_MANY),
  },
  { error: SHIFT_BATCH_NOT_A_LIST },
);

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;
export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;
/** One parsed event price line — the repository's `ShiftDrinkMenuInput` shape. */
export type EventDrinkMenuRow = z.infer<typeof EventDrinkMenuItemSchema>;

/** What a shift row already holds about its special night — the edit's baseline. */
export type StoredSpecialEvent = {
  eventKind: ShiftEventKind;
  specialEventType: string | null;
  customSpecialEventName: string | null;
};

export type NormalisedSpecialEvent = {
  /** The two shift columns to write; absent = leave the stored pair alone. */
  columns?: { specialEventType: string | null; customSpecialEventName: string | null };
  /** undefined = leave the event's price rows alone; [] = clear them; rows = replace. */
  eventDrinkMenu?: EventDrinkMenuRow[];
};

/**
 * THE ONE RULE for what a shift stores about its special night (0167) — for a
 * post (`stored` omitted) and for an edit (`stored` = the row as it stands).
 *
 *  - A shift that is not special stores NULL type and name and NO event prices,
 *    whatever the request carried. An edit that turns a special shift normal
 *    clears all three.
 *  - The "Other" name is kept only while the type IS 'other'. A VIP night that
 *    kept a leftover custom name would carry a label nothing should ever print.
 *  - On an edit, an omitted field falls back to the stored one, and an edit
 *    that names none of the four writes none of them — a status-only PUT stays
 *    exactly that.
 *  - `eventDrinkMenu` keeps the `payTiers` contract: undefined leaves the rows
 *    alone, [] clears them, a list replaces them.
 *
 * Normalised rather than refused: the composer can legitimately carry a stale
 * type or price list across a switch back to Normal, and the right answer is to
 * not store it — not to fail the whole post over it.
 */
export function normaliseSpecialEvent(
  input: Pick<
    CreateShiftInput,
    'eventKind' | 'specialEventType' | 'customSpecialEventName' | 'eventDrinkMenu'
  >,
  stored?: StoredSpecialEvent,
): NormalisedSpecialEvent {
  const touched =
    input.eventKind !== undefined ||
    input.specialEventType !== undefined ||
    input.customSpecialEventName !== undefined ||
    input.eventDrinkMenu !== undefined;
  if (stored && !touched) return {};

  const kind = input.eventKind ?? stored?.eventKind ?? 'normal';
  if (kind !== 'special') {
    return {
      columns: { specialEventType: null, customSpecialEventName: null },
      // A post has nothing to clear; an edit clears whatever a special night left.
      eventDrinkMenu: stored ? [] : undefined,
    };
  }

  const type =
    input.specialEventType !== undefined
      ? input.specialEventType
      : (stored?.specialEventType ?? null);
  const name =
    input.customSpecialEventName !== undefined
      ? input.customSpecialEventName
      : (stored?.customSpecialEventName ?? null);
  return {
    columns: {
      specialEventType: type ?? null,
      customSpecialEventName: type === 'other' ? name?.trim() || null : null,
    },
    eventDrinkMenu: input.eventDrinkMenu,
  };
}
