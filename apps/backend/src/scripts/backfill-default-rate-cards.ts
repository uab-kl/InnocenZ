import { asc } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { createDefaultRateCard } from '@/features/outlet-workspace/default-rate-card.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';

/**
 * Give every venue that has NO workspace the default rate card.
 *
 *   npx tsx src/scripts/backfill-default-rate-cards.ts          # dry run
 *   npx tsx src/scripts/backfill-default-rate-cards.ts --write  # apply
 *
 * Why this exists: `createDefaultRateCard` now runs at outlet creation, but
 * venues created BEFORE that got no `outlet_workspace` row at all and were
 * silently rendering `apps/web`'s demo fallback — RM 40/50/55 with 0% on every
 * commission column, under the name "Velvet 23". Nothing server-side could read
 * those numbers, and the venue could not edit them because no row existed.
 *
 * ⚠️ SAFE TO RE-RUN, and safe precisely because it delegates the decision.
 * `createDefaultRateCard` returns 0 and writes nothing for any venue that
 * already has a workspace — so a venue that has since priced its own tiers is
 * never reverted, and a venue that deliberately deleted tiers does not get them
 * back. This script must never grow its own "should I overwrite?" logic; one
 * rule, one place.
 */
async function main() {
  const write = process.argv.includes('--write');

  const outlets = await db
    .select({ id: OutletTable.id, name: OutletTable.name })
    .from(OutletTable)
    .orderBy(asc(OutletTable.name));

  let seeded = 0;
  let skipped = 0;

  for (const outlet of outlets) {
    let tiers = 0;

    if (write) {
      tiers = await createDefaultRateCard({
        outletId: outlet.id,
        actor: 'backfill-default-rate-cards',
      });
    } else {
      // The dry run asks the same question the real path asks — it seeds inside
      // a transaction and rolls it back — so the preview cannot disagree with
      // what --write would then do.
      await db
        .transaction(async (tx) => {
          tiers = await createDefaultRateCard({
            outletId: outlet.id,
            actor: 'backfill-default-rate-cards',
            tx,
          });
          throw new Error('__rollback__');
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error) || error.message !== '__rollback__') {
            throw error;
          }
        });
    }

    if (tiers > 0) seeded++;
    else skipped++;

    const verb = tiers > 0 ? (write ? `seeded ${tiers} rows` : 'would seed') : 'has a workspace — skip';
    console.log(`${verb.padEnd(24)} ${outlet.name}`);
  }

  console.log(
    `\n${write ? 'Wrote' : 'Would write'} a rate card for ${seeded} venue(s); left ${skipped} alone.`,
  );
  if (!write) console.log('Dry run — pass --write to apply.');
  process.exit(0);
}

main().catch((error) => {
  console.error('[backfill-default-rate-cards] failed', error);
  process.exit(1);
});
