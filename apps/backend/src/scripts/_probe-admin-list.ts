/**
 * What the ADMIN "Agency Members" table returns, through the real repository.
 *
 * Importers/callers: none — standalone probe, run by hand. READ-ONLY.
 * Owner's question: "why the decline member can show and search by the atlas
 * agency ?"
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-admin-list.ts
 */
import 'dotenv/config';

import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';

const repo = new AgencyMemberRepositoryClass();

async function main() {
  const show = async (label: string, status?: string) => {
    const { rows, totalCount } = await repo.listAllEnriched({
      page: 1,
      pageSize: 50,
      status,
    });
    console.log(`\n=== ${label} — ${rows.length} row(s) of ${totalCount} ===`);
    for (const m of rows) {
      console.log(`  ${m.memberCode} | ${m.username} | ${m.agencyName} | status=${m.status}`);
    }
  };
  // The admin dropdown's "All Status" sends `all`, which the controller maps to
  // undefined — so this is exactly what the default table asks for.
  await show('default / All Status (status=undefined)');
  await show('search "Atlas" (the owner\'s own search)', undefined);
  await show('explicit status=rejected — an admin asking to SEE them', 'rejected');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
