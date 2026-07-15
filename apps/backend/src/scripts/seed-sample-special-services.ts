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
  assignedAgency?: string;
  scheduledFor?: string;
};

const SEEDS: Seed[] = [
  { outletName: 'Neon Sky Club', title: 'VIP escort — Saturday night', category: 'vip_escort', budget: '3500.00', status: 'open', scheduledFor: '2026-07-19' },
  { outletName: 'Velvet Lounge', title: 'Shift pickup & late-night return', category: 'transportation', budget: '2000.00', status: 'assigned', assignedAgency: 'Starlight Staffing', scheduledFor: '2026-07-18' },
  { outletName: 'Aurora Rooftop', title: 'Emergency floor cover before event', category: 'emergency_cover', budget: '1200.00', status: 'in_progress', assignedAgency: 'Prime Talent Agency', scheduledFor: '2026-07-15' },
  { outletName: 'Skyline Bar', title: 'Soft glam makeup crew', category: 'makeup', budget: '5000.00', status: 'completed', assignedAgency: 'Elite Crew Co', scheduledFor: '2026-07-05' },
  { outletName: 'Neon Sky Club', title: 'Uniform & documents run', category: 'uniform', budget: '800.00', status: 'open', scheduledFor: '2026-07-25' },
  { outletName: 'Velvet Lounge', title: 'Coat check staff', category: 'others', budget: '600.00', status: 'cancelled' },
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
    const agency = s.assignedAgency ? await agencyByName(s.assignedAgency) : null;
    await db.insert(SpecialServiceTable).values({
      outletId: await outletIdByName(s.outletName),
      outletName: s.outletName,
      title: s.title,
      category: s.category,
      budget: s.budget,
      currency: 'MYR',
      status: s.status,
      assignedAgencyId: agency?.id ?? null,
      assignedAgencyName: agency?.name ?? null,
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
