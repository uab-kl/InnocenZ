import { integer, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { OutletTable } from '@/features/outlet/outlet.model';
import { shiftEventKindEnum } from '@/features/shift/shift.model';

/**
 * A reusable event card — the picker step BEFORE the Post Job form (0128).
 *
 * The card carries what the composer would otherwise ask again every night:
 * the event kind, the special sub-type (finally a stored fact — it used to
 * die in browser state), the cover picture, and the form defaults. Picking a
 * card pre-fills the composer; posting records `shift.template_id`, so a
 * shift can always answer "what kind of night was this" — including to the
 * PR's phone, which joins through it for the picture.
 *
 * `cover_image` is an R2 object key under the venue's own folder:
 * `outlet/<slug>-<uuid>/event-type/<normal|special>/<name>-<ts>.<ext>` —
 * the eventType folder split the owner asked for, one object per template,
 * replaced on edit, deleted with the row.
 */
export const ShiftTemplateTable = MainSchema.table(
  'shift_template',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    outletId: uuid('outlet_id')
      .notNull()
      .references(() => OutletTable.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    eventKind: shiftEventKindEnum('event_kind').notNull().default('normal'),
    /** vip | launch | private_table | brand_activation | corporate | other */
    specialEventType: varchar('special_event_type', { length: 30 }),
    customSpecialEventName: varchar('custom_special_event_name', { length: 120 }),
    /** R2 object key — never a URL; clients resolve via the public base. */
    coverImage: varchar('cover_image'),
    /** Default window, same shape as `shift.slot` — "22:00 - 04:00". */
    slot: varchar('slot', { length: 100 }),
    quantity: integer('quantity'),
    /** Comma-joined, same storage shape as `shift.languages`. */
    languages: varchar('languages', { length: 255 }),
    dressCode: varchar('dress_code', { length: 60 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => [unique('shift_template_outlet_id_name_unique').on(table.outletId, table.name)],
);

export type ShiftTemplateType = typeof ShiftTemplateTable.$inferSelect;
export type ShiftTemplateInsertType = typeof ShiftTemplateTable.$inferInsert;
