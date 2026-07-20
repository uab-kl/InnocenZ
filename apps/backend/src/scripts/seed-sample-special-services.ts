import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { OutletTable } from '@/features/outlet/outlet.model';
import { AgencyTable } from '@/features/agency/agency.model';
import { SpecialServiceTable } from '@/features/special-service/special-service.model';
import { logger } from '@/util/logger';

// Demo special-service orders so the admin Special Services page shows real rows.
// Idempotent: rows are stamped createdBy='seed-sample' and re-running wipes them first.
const ACTOR = 'seed-sample';

type Seed = {
  outletName: string;
  title: string;
  category:
    | 'transportation'
    | 'delivery'
    | 'wardrobe'
    | 'makeup'
    | 'vip_escort'
    | 'uniform'
    | 'emergency_cover'
    | 'training'
    | 'others';
  budget: string;
  status: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  /** Who posted the job. Outlet posts go live; agency posts need admin review. */
  initiatedBy?: 'outlet' | 'agency';
  /** Admin review gate for agency posts: 'pending' shows in the Pending-review queue. */
  adminAccepted?: 'n_a' | 'pending' | 'accepted' | 'declined';
  /** Posting agency name (for initiatedBy='agency'); shown as the Source. */
  postingAgency?: string;
  /** External third party InnocenZ found to fulfil the job (not an InnocenZ agency). */
  thirdParty?: string;
  scheduledFor?: string;
};

const SEEDS: Seed[] = [
  { outletName: 'Velvet 23', title: 'VIP escort — Saturday night', category: 'vip_escort', budget: '3500.00', status: 'open', scheduledFor: '2026-07-19' },
  { outletName: 'Urban Soul', title: 'Shift pickup & late-night return', category: 'transportation', budget: '2000.00', status: 'assigned', thirdParty: 'MetroRide Transport', scheduledFor: '2026-07-18' },
  { outletName: 'Mermate', title: 'Emergency floor cover before event', category: 'emergency_cover', budget: '1200.00', status: 'in_progress', thirdParty: 'RapidCover Staffing', scheduledFor: '2026-07-15' },
  { outletName: 'Bear Lounge', title: 'Soft glam makeup crew', category: 'makeup', budget: '5000.00', status: 'completed', thirdParty: 'Glow & Co Makeup Studio', scheduledFor: '2026-07-05' },
  { outletName: 'Velvet 23', title: 'Uniform & documents run', category: 'uniform', budget: '800.00', status: 'open', scheduledFor: '2026-07-25' },
  { outletName: 'Urban Soul', title: 'Coat check staff', category: 'others', budget: '600.00', status: 'cancelled' },
  // Agency-initiated postings — these route through admin accept/decline first.
  // adminAccepted: 'pending' = the "Pending review" queue in the admin page.
  { outletName: 'Velvet 23', title: 'PR transport pool — Friday', category: 'transportation', budget: '1500.00', status: 'open', initiatedBy: 'agency', postingAgency: 'Atlas Agency', adminAccepted: 'pending', scheduledFor: '2026-07-24' },
  { outletName: 'Mermate', title: 'Glam team for gala night', category: 'makeup', budget: '4000.00', status: 'open', initiatedBy: 'agency', postingAgency: 'Delta Agency', adminAccepted: 'pending', scheduledFor: '2026-07-26' },
  { outletName: 'Urban Soul', title: 'Wardrobe styling top-up', category: 'wardrobe', budget: '2500.00', status: 'assigned', initiatedBy: 'agency', postingAgency: 'Starline PR', adminAccepted: 'accepted', thirdParty: 'Atelier Threads', scheduledFor: '2026-07-20' },
  { outletName: 'Bear Lounge', title: 'Training top-up session', category: 'training', budget: '900.00', status: 'cancelled', initiatedBy: 'agency', postingAgency: 'Atlas Agency', adminAccepted: 'declined' },
];

async function outletIdByName(name: string): Promise<string | null> {
  const [row] = await db.select({ id: OutletTable.id }).from(OutletTable).where(eq(OutletTable.name, name)).limit(1);
  return row?.id ?? null;
}

async function agencyByName(name: string): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: AgencyTable.id, name: AgencyTable.name })
    .from(AgencyTable)
    .where(eq(AgencyTable.name, name))
    .limit(1);
  return row ?? null;
}

export async function seedSampleSpecialServices(): Promise<void> {
  await db.delete(SpecialServiceTable).where(eq(SpecialServiceTable.createdBy, ACTOR));

  for (const s of SEEDS) {
    const postingAgency = s.postingAgency ? await agencyByName(s.postingAgency) : null;
    await db.insert(SpecialServiceTable).values({
      outletId: await outletIdByName(s.outletName),
      title: s.title,
      category: s.category,
      budget: s.budget,
      currency: 'MYR',
      status: s.status,
      initiatedBy: s.initiatedBy ?? 'outlet',
      adminAccepted: s.adminAccepted ?? 'n_a',
      postingAgencyId: postingAgency?.id ?? null,
      postingAgencyName: s.postingAgency ?? null,
      // Third parties are external vendors, not InnocenZ agencies → no agency id.
      vendorName: s.thirdParty ?? null,
      scheduledFor: s.scheduledFor ? new Date(s.scheduledFor) : null,
      createdBy: ACTOR,
      updatedBy: ACTOR,
    });
  }

  logger.info(`[seed-sample-special-services] Done. ${SEEDS.length} orders.`);
}

seedSampleSpecialServices()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[seed-sample-special-services] Error:', error);
    process.exit(1);
  });
