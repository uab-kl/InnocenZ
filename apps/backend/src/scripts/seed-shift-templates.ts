import 'dotenv/config';

import { readFileSync, existsSync } from 'node:fs';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { OutletTable } from '@/features/outlet/outlet.model';
import { ShiftTemplateTable } from '@/features/shift-template/shift-template.model';
import { logger } from '@/util/logger';
import { orgFolder } from '@/util/org-logo';
import { sanitizePathSegment } from '@/util/profile-image';
import { r2Configured, r2PutObject } from '@/util/r2';

// Starter event cards for every ACTIVE outlet (0128) — the owner's list,
// split by kind exactly as the picker shows them. No cover pictures here:
// the gallery renders a styled placeholder until the venue uploads its own
// (edit pencil on the card), which is the owner's stated flow.
//
// Idempotent: unique(outlet_id, name) + onConflictDoNothing, so re-running
// tops up missing cards and never duplicates or overwrites an edited one.
const ACTOR = 'seed-shift-templates';
const SLOT = '22:00 - 04:00';
const COVERS_DIR = process.env.SEED_COVERS_DIR ?? 'C:/Users/jinkg/Pictures';

const DEFAULTS: Array<{
  name: string;
  eventKind: 'normal' | 'special';
  specialEventType?: string;
  customSpecialEventName?: string;
  /** Default cover under COVERS_DIR — fills NULL covers only. */
  coverFile?: string;
}> = [
  { name: 'Friday Lounge', eventKind: 'normal', coverFile: 'normal/friday.jpg' },
  { name: 'Weekend Party', eventKind: 'normal', coverFile: 'normal/weekend.jpg' },
  { name: 'Ladies Night', eventKind: 'normal', coverFile: 'normal/ladies night.jpg' },
  { name: 'VIP Night', eventKind: 'special', specialEventType: 'vip', coverFile: 'special/vip.jpg' },
  { name: 'Product Launch', eventKind: 'special', specialEventType: 'launch' },
  { name: 'Private Table Buyout', eventKind: 'special', specialEventType: 'private_table' },
  { name: 'Brand Activation', eventKind: 'special', specialEventType: 'brand_activation' },
  { name: 'Corporate Night', eventKind: 'special', specialEventType: 'corporate' },
  { name: 'Chinese New Year', eventKind: 'special', specialEventType: 'other', customSpecialEventName: 'Chinese New Year', coverFile: 'special/cny.jpg' },
  { name: 'Halloween', eventKind: 'special', specialEventType: 'other', customSpecialEventName: 'Halloween', coverFile: 'special/halloween.jpg' },
  { name: 'New Year Countdown', eventKind: 'special', specialEventType: 'other', customSpecialEventName: 'New Year Countdown', coverFile: 'special/newyear.jpg' },
  { name: 'Merdeka Celebration', eventKind: 'special', specialEventType: 'other', customSpecialEventName: 'Merdeka Celebration', coverFile: 'special/merdeka.jpg' },
];

async function run(): Promise<void> {
  const outlets = await db
    .select({ id: OutletTable.id, name: OutletTable.name })
    .from(OutletTable)
    .where(eq(OutletTable.status, 'active'));

  let inserted = 0;
  let covered = 0;
  for (const outlet of outlets) {
    for (const [i, tpl] of DEFAULTS.entries()) {
      const rows = await db
        .insert(ShiftTemplateTable)
        .values({
          outletId: outlet.id,
          name: tpl.name,
          eventKind: tpl.eventKind,
          specialEventType: tpl.specialEventType ?? null,
          customSpecialEventName: tpl.customSpecialEventName ?? null,
          slot: SLOT,
          sortOrder: i,
          createdBy: ACTOR,
          updatedBy: ACTOR,
        })
        .onConflictDoNothing()
        .returning({ id: ShiftTemplateTable.id });
      inserted += rows.length;

      // DEFAULT COVER (owner's pictures): only when the card has none — an
      // outlet's own upload is never replaced, and each outlet gets its OWN
      // object (delete-isolation: removing one venue's card must not strip
      // another's picture).
      if (tpl.coverFile && r2Configured()) {
        const [row] = await db
          .select({ id: ShiftTemplateTable.id, coverImage: ShiftTemplateTable.coverImage })
          .from(ShiftTemplateTable)
          .where(and(eq(ShiftTemplateTable.outletId, outlet.id), eq(ShiftTemplateTable.name, tpl.name)))
          .limit(1);
        const file = `${COVERS_DIR}/${tpl.coverFile}`;
        if (row && !row.coverImage && existsSync(file)) {
          const key = `outlet/${orgFolder(outlet.id, outlet.name)}/event-type/${tpl.eventKind}-event/${sanitizePathSegment(tpl.name)}-${Date.now()}.jpg`;
          await r2PutObject({ key, body: readFileSync(file), contentType: 'image/jpeg' });
          await db
            .update(ShiftTemplateTable)
            .set({ coverImage: key, updatedBy: ACTOR, updatedAt: new Date() })
            .where(eq(ShiftTemplateTable.id, row.id));
          covered += 1;
        }
      }
    }
  }
  logger.info(
    `[seed-shift-templates] Done — ${outlets.length} active outlets, ${inserted} cards inserted, ${covered} default covers filled.`,
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-shift-templates] Error:', error);
    process.exit(1);
  });
