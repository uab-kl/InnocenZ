import { db } from '@/db/index';
import { ShiftTemplateTable } from '@/features/shift-template/shift-template.model';
import type { DbTransaction } from '@/types/db-transaction';

/**
 * The event cards a brand-new venue starts with.
 *
 * They are EXAMPLES, not fixtures (owner, 9 Sep 2026). A venue is meant to
 * rename, re-cover and delete them freely — deleting one is safe, because
 * `shift.template_id` carries an ON DELETE SET NULL foreign key, every read
 * path LEFT joins, and a shift keeps its own `event_name` / `event_kind`.
 *
 * ⚠️ Which is exactly why this must run ONCE, at creation, and never again.
 * Nothing may call it on boot, on login, or from a periodic job: a second run
 * would re-insert the cards a venue deliberately removed, and the venue would
 * have no way to make them stay gone. That is the failure `initRoles()` already
 * has with roles, where a deleted role reappears on the next backend start.
 * `onConflictDoNothing` protects against a duplicate, NOT against resurrection.
 *
 * No cover pictures. The gallery renders a styled placeholder until the venue
 * uploads its own through the edit pencil, which is the owner's stated flow —
 * and it keeps venue creation free of an R2 round-trip that could fail.
 */
export const STARTER_EVENT_TEMPLATES: ReadonlyArray<{
  name: string;
  eventKind: 'normal' | 'special';
  specialEventType?: string;
  customSpecialEventName?: string;
}> = [
  { name: 'Friday Lounge', eventKind: 'normal' },
  { name: 'Weekend Party', eventKind: 'normal' },
  { name: 'Ladies Night', eventKind: 'normal' },
  { name: 'VIP Night', eventKind: 'special', specialEventType: 'vip' },
  { name: 'Product Launch', eventKind: 'special', specialEventType: 'launch' },
  { name: 'Private Table Buyout', eventKind: 'special', specialEventType: 'private_table' },
  { name: 'Brand Activation', eventKind: 'special', specialEventType: 'brand_activation' },
  { name: 'Corporate Night', eventKind: 'special', specialEventType: 'corporate' },
  {
    name: 'Chinese New Year',
    eventKind: 'special',
    specialEventType: 'other',
    customSpecialEventName: 'Chinese New Year',
  },
  {
    name: 'Halloween',
    eventKind: 'special',
    specialEventType: 'other',
    customSpecialEventName: 'Halloween',
  },
  {
    name: 'New Year Countdown',
    eventKind: 'special',
    specialEventType: 'other',
    customSpecialEventName: 'New Year Countdown',
  },
  {
    name: 'Merdeka Celebration',
    eventKind: 'special',
    specialEventType: 'other',
    customSpecialEventName: 'Merdeka Celebration',
  },
];

/** Default window on a starter card, same shape as `shift.slot`. */
export const STARTER_TEMPLATE_SLOT = '22:00 - 04:00';

/**
 * The rows as they will be inserted — separated from the write so a test can
 * assert the shape without a database.
 */
export function starterTemplateRows(outletId: string, actor: string) {
  return STARTER_EVENT_TEMPLATES.map((tpl, i) => ({
    outletId,
    name: tpl.name,
    eventKind: tpl.eventKind,
    specialEventType: tpl.specialEventType ?? null,
    customSpecialEventName: tpl.customSpecialEventName ?? null,
    slot: STARTER_TEMPLATE_SLOT,
    sortOrder: i,
    createdBy: actor,
    updatedBy: actor,
  }));
}

/**
 * Give a newly created venue its starter cards. Returns how many were inserted.
 *
 * Call this ONCE, immediately after the venue row exists — see the warning on
 * `STARTER_EVENT_TEMPLATES` for why it must never be re-run.
 *
 * Deliberately NOT part of the caller's transaction by default. The venue, its
 * first member and its plan commit together because a venue that outlives its
 * plan cannot be billed; example cards carry no such weight, and rolling back
 * somebody's whole registration because a convenience insert failed would trade
 * a real account for a cosmetic one. Callers wrap this in its own try/catch and
 * log — a venue with no cards is a venue whose Post Job picker offers only
 * "New template", which is recoverable by making one.
 */
export async function createStarterTemplates(params: {
  outletId: string;
  actor: string;
  tx?: DbTransaction;
}): Promise<number> {
  const client = params.tx ?? db;
  const rows = await client
    .insert(ShiftTemplateTable)
    .values(starterTemplateRows(params.outletId, params.actor))
    // unique(outlet_id, name) — a retry cannot double the gallery.
    .onConflictDoNothing()
    .returning({ id: ShiftTemplateTable.id });
  return rows.length;
}
