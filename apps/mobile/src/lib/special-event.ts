/**
 * WHICH SPECIAL NIGHT a shift is, in words — and the night's own prices — as
 * the PR app shows them.
 *
 * `GET /shift-assignment/mine` now carries a special night's sub-type the way
 * `GET /shift` does (0167): the shift's own pair (`specialEventType` +
 * `customSpecialEventName`) and the pair of the event card it was posted from
 * (`templateSpecialEventType` + `templateCustomEventName`). Until 29 Sep 2026
 * every screen printed a bare "Special event" for all of them, so a VIP night,
 * a product launch and "Other · Merdeka Celebration" read the same.
 *
 * Pure — no React Native — so every rule is unit-tested (`special-event.test.ts`).
 *
 * `eventPriceRows` names tonight's prices on a card; it feeds no amount itself.
 * Every figure the app logs is computed from `drinkMenu` (pr-rate.ts), which on a
 * special night with its own list IS that list — the server resolves it per shift
 * (owner, 29 Sep 2026: "Use event prices").
 */
import { formatMessage, type AppTranslations } from '../i18n';
import type { ShiftAssignmentRecord } from './api';

/**
 * What a shift must carry to be described — the /mine row, or any slice of it,
 * including the Payment week's `shifts[]` (`PrWeekShift`).
 *
 * `eventKind` may be absent: the week's shifts omit it on a backend that has not
 * restarted. Anything but 'special' describes as "Normal shift" — what every
 * screen printed for such a row before. (The column itself is NOT NULL.)
 */
export type SpecialEventFields = { eventKind?: string | null } &
  Partial<
    Pick<
      ShiftAssignmentRecord,
      | 'eventName'
      | 'specialEventType'
      | 'customSpecialEventName'
      | 'templateSpecialEventType'
      | 'templateCustomEventName'
    >
  >;

/**
 * The sub-types the Post Job composer offers, by its ids (the web's
 * `SHIFT_SPECIAL_EVENT_OPTIONS`, the server's `specialEventTypeValues`).
 * 'other' is absent on purpose — it prints the venue's own typed name.
 */
const SUBTYPE_LABEL: Record<string, (t: AppTranslations) => string> = {
  vip: (t) => t.shifts.subtypeVip,
  launch: (t) => t.shifts.subtypeLaunch,
  private_table: (t) => t.shifts.subtypePrivateTable,
  brand_activation: (t) => t.shifts.subtypeBrandActivation,
  corporate: (t) => t.shifts.subtypeCorporate,
};

/**
 * The sub-type pair a special shift SHOWS: its own when it has one, else its
 * event card's. A WHOLE pair from one source, never one field of each — an
 * "Other" name only means something beside the type it was typed for, so a VIP
 * night posted from a card that has since become "Other · Whisky" is a VIP night.
 *
 * Null on a normal shift (whatever a stale column holds), and on a special one
 * that names no sub-type anywhere.
 */
export function specialEventSubtype(
  shift: SpecialEventFields,
): { type: string; customName: string | null } | null {
  if (shift.eventKind !== 'special') return null;
  const own = shift.specialEventType?.trim();
  if (own) {
    return { type: own, customName: shift.customSpecialEventName?.trim() || null };
  }
  const card = shift.templateSpecialEventType?.trim();
  if (card) {
    return { type: card, customName: shift.templateCustomEventName?.trim() || null };
  }
  return null;
}

/**
 * The sub-type in words — "VIP night", or the name the venue typed for "Other"
 * (its own text, never translated). Null when there is nothing to say: a normal
 * shift, a special one with no sub-type, an "Other" with no name, or a type this
 * build does not know yet — a newer composer can add one, and the card then
 * says a bare "Special event" rather than printing a raw code.
 */
export function specialEventSubtypeLabel(
  shift: SpecialEventFields,
  t: AppTranslations,
): string | null {
  const sub = specialEventSubtype(shift);
  if (!sub) return null;
  if (sub.type === 'other') return sub.customName;
  return SUBTYPE_LABEL[sub.type]?.(t) ?? null;
}

/** Same words, ignoring case and the space around them. */
function sameWords(a: string, b: string | null | undefined): boolean {
  return !!b && a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * What a card prints for the night's kind — "Special event · VIP night", a bare
 * "Special event", or "Normal shift". Replaces the bare kind wherever a shift is
 * described (Today cards, the schedule's timetable and day sheet, Check-In).
 *
 * The sub-type is left off when it only repeats the event's own NAME: a shift
 * posted from the "Merdeka Celebration" card is named "Merdeka Celebration"
 * (live data, 29 Sep 2026), and "Merdeka Celebration · Special event · Merdeka
 * Celebration" says one thing twice.
 */
export function eventKindLabel(shift: SpecialEventFields, t: AppTranslations): string {
  if (shift.eventKind !== 'special') return t.shifts.normalShift;
  const sub = specialEventSubtypeLabel(shift, t);
  return sub && !sameWords(sub, shift.eventName)
    ? formatMessage(t.shifts.specialEventWithSub, { sub })
    : t.shifts.specialEvent;
}

/**
 * The name a special night goes by in a heading — its sub-type, else the bare
 * kind: "VIP night prices", "Merdeka Celebration prices", "Special event prices".
 */
export function specialEventName(shift: SpecialEventFields, t: AppTranslations): string {
  return specialEventSubtypeLabel(shift, t) ?? t.shifts.specialEvent;
}

/** One line of a special night's own price list, as the phone shows it. */
export type EventPriceRow = {
  /** The composer's slug — the venue row's own slug when the line was copied from it. */
  id: string;
  name: string;
  priceRm: number;
};

/** 'service' and 'tip' share the Tips page; everything else is a drink. */
function onPage(category: string | null | undefined, page: 'drinks' | 'tips'): boolean {
  const tipsSide = category === 'service' || category === 'tip';
  return page === 'tips' ? tipsSide : !tipsSide;
}

/**
 * A special night's OWN prices for one scan page, or null when there is nothing
 * to show: not a special shift, no list of its own (`[]` = priced from the
 * venue's list), or not known (the field is absent).
 *
 * Drinks page ↔ 'drink'; Tips page ↔ 'service' + 'tip' — the venue list's split,
 * WITHOUT its fall-back to the whole list (`menuForScanCategory`): that exists so
 * an untagged legacy menu can still be logged from, and every event line is
 * tagged, so borrowing it would only print drinks on the Tips page.
 *
 * For the card. The rows the PR taps, and every amount they log, come from
 * `drinkMenu` — which the server sends as this same list on such a night.
 */
export function eventPriceRows(
  shift:
    | (SpecialEventFields & Partial<Pick<ShiftAssignmentRecord, 'eventDrinkMenu'>>)
    | null
    | undefined,
  page: 'drinks' | 'tips',
): EventPriceRow[] | null {
  if (!shift || shift.eventKind !== 'special' || !shift.eventDrinkMenu?.length) return null;
  const rows = shift.eventDrinkMenu
    .filter((item) => onPage(item.category, page))
    .map((item) => ({ id: item.id, name: item.name, priceRm: Number(item.priceRm) || 0 }));
  return rows.length > 0 ? rows : null;
}
