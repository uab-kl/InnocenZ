import { asc } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { ensureTipsMenuRow } from '@/features/outlet-workspace/tips-menu-row.js';

/**
 * Give every existing venue the tips row that new venues are now created with.
 *
 *   npx tsx src/scripts/backfill-tips-menu-row.ts          # dry run
 *   npx tsx src/scripts/backfill-tips-menu-row.ts --write  # apply
 *
 * Why this exists: the seed in `createDefaultRateCard` only fires for a venue
 * being created, and it returns early for anyone who already has a workspace —
 * which is every venue alive today. On 14 Sep 2026 that was 7 of 8 with no tips
 * row at all: they could be staffed and take tips with no price for the tip to
 * be logged against.
 *
 * ⚠️ SAFE TO RE-RUN, and safe because it delegates the decision.
 * `ensureTipsMenuRow` writes nothing for a venue that already has a tips row —
 * matched by slug, by the `tip` category, or by the name, so the venues that
 * added one themselves are recognised rather than given a duplicate. It never
 * touches a price, so a venue that has priced its tips is never reverted.
 */
async function main() {
  const write = process.argv.includes('--write');
  const actor = 'backfill-tips-menu-row';

  const outlets = await db
    .select({ id: OutletTable.id, name: OutletTable.name })
    .from(OutletTable)
    .orderBy(asc(OutletTable.name));

  let seeded = 0;
  let skipped = 0;

  for (const outlet of outlets) {
    let wrote = false;

    if (write) {
      wrote = await ensureTipsMenuRow({ outletId: outlet.id, actor });
    } else {
      // The dry run asks the same question the real path asks — it seeds inside
      // a transaction and rolls it back — so the preview cannot disagree with
      // what --write would then do.
      await db
        .transaction(async (tx) => {
          wrote = await ensureTipsMenuRow({ outletId: outlet.id, actor, tx });
          throw new Error('__rollback__');
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error) || error.message !== '__rollback__') {
            throw error;
          }
        });
    }

    if (wrote) seeded++;
    else skipped++;

    const verb = wrote
      ? write
        ? 'seeded Tips'
        : 'would seed Tips'
      : 'has one already — skip';
    console.log(`${verb.padEnd(24)} ${outlet.name}`);
  }

  console.log(
    `\n${write ? 'Wrote' : 'Would write'} a tips row for ${seeded} venue(s); left ${skipped} alone.`,
  );
  if (!write) console.log('Dry run — pass --write to apply.');
  process.exit(0);
}

main().catch((error) => {
  console.error('[backfill-tips-menu-row] failed', error);
  process.exit(1);
});
