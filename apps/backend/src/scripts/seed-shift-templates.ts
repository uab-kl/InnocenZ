import 'dotenv/config';

import { readFileSync, existsSync } from 'node:fs';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { OutletTable } from '@/features/outlet/outlet.model';
import { ShiftTemplateTable } from '@/features/shift-template/shift-template.model';
import {
  STARTER_EVENT_TEMPLATES,
  STARTER_TEMPLATE_SLOT,
} from '@/features/shift-template/starter-templates';
import { logger } from '@/util/logger';
import { orgFolder } from '@/util/org-logo';
import { sanitizePathSegment } from '@/util/profile-image';
import { r2Configured, r2PutObject } from '@/util/r2';

// Tops up the starter event cards for every ACTIVE outlet, and fills their
// default covers from a local picture folder.
//
// ⚠️ The CARDS themselves no longer need this script: `createStarterTemplates`
// now runs when a venue is created, on BOTH paths (sign-up and admin), so a new
// venue arrives with its gallery already made. What is left here is the covers
// — which creation deliberately skips, because it will not make a venue's
// registration wait on an R2 upload.
//
// ⚠️ Re-running this RESURRECTS cards a venue deliberately deleted. They are
// examples the venue owns, not fixtures (owner, 9 Sep 2026). Run it to fill
// covers or to backfill a venue that predates creation-time seeding — never on
// a schedule, and never from boot.
//
// The list itself lives in features/shift-template/starter-templates.ts. It used
// to be written out again here, which is how a card added in one place would
// quietly not exist in the other.
const ACTOR = 'seed-shift-templates';
const COVERS_DIR = process.env.SEED_COVERS_DIR ?? 'C:/Users/jinkg/Pictures';

/** Default cover per card, relative to COVERS_DIR. Only fills NULL covers. */
const COVER_FILE_BY_NAME: Readonly<Record<string, string>> = {
  'Friday Lounge': 'normal/friday.jpg',
  'Weekend Party': 'normal/weekend.jpg',
  'Ladies Night': 'normal/ladies night.jpg',
  'VIP Night': 'special/vip.jpg',
  'Chinese New Year': 'special/cny.jpg',
  Halloween: 'special/halloween.jpg',
  'New Year Countdown': 'special/newyear.jpg',
  'Merdeka Celebration': 'special/merdeka.jpg',
};

async function run(): Promise<void> {
  const outlets = await db
    .select({ id: OutletTable.id, name: OutletTable.name })
    .from(OutletTable)
    .where(eq(OutletTable.status, 'active'));

  let inserted = 0;
  let covered = 0;
  for (const outlet of outlets) {
    for (const [i, tpl] of STARTER_EVENT_TEMPLATES.entries()) {
      const rows = await db
        .insert(ShiftTemplateTable)
        .values({
          outletId: outlet.id,
          name: tpl.name,
          eventKind: tpl.eventKind,
          specialEventType: tpl.specialEventType ?? null,
          customSpecialEventName: tpl.customSpecialEventName ?? null,
          slot: STARTER_TEMPLATE_SLOT,
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
      const coverFile = COVER_FILE_BY_NAME[tpl.name];
      if (coverFile && r2Configured()) {
        const [row] = await db
          .select({ id: ShiftTemplateTable.id, coverImage: ShiftTemplateTable.coverImage })
          .from(ShiftTemplateTable)
          .where(and(eq(ShiftTemplateTable.outletId, outlet.id), eq(ShiftTemplateTable.name, tpl.name)))
          .limit(1);
        const file = `${COVERS_DIR}/${coverFile}`;
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
