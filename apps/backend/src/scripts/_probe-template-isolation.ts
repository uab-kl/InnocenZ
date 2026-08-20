import 'dotenv/config';

import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { OutletTable } from '@/features/outlet/outlet.model';
import { ShiftTemplateTable } from '@/features/shift-template/shift-template.model';

// Throwaway isolation probe (owner's ask, 20 Aug): NO data may be shared
// between outlets. Read-only + refusal-only — nothing is created; every
// "attack" is expected to be refused before any write.
const API = 'http://localhost:7777/api/v1';

async function run(): Promise<void> {
  // Velvet = the attacker's own venue; Emhub = the victim.
  const [velvet] = await db
    .select({ id: OutletTable.id, name: OutletTable.name })
    .from(OutletTable)
    .where(eq(OutletTable.name, 'Velvet 23'))
    .limit(1);
  const [emhubTpl] = await db
    .select({ id: ShiftTemplateTable.id, outletId: ShiftTemplateTable.outletId })
    .from(ShiftTemplateTable)
    .innerJoin(OutletTable, eq(OutletTable.id, ShiftTemplateTable.outletId))
    .where(and(eq(OutletTable.name, 'Emhub Testing'), isNotNull(ShiftTemplateTable.coverImage)))
    .limit(1);
  if (!velvet || !emhubTpl) {
    console.error('fixtures missing', { velvet: !!velvet, emhubTpl: !!emhubTpl });
    process.exit(1);
  }

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@velvet23.my', password: 'Password123!' }),
  }).then((r) => r.json());
  const token = login?.data?.accessToken ?? login?.data?.token;
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  // 1. Template list: ONLY Velvet's rows.
  const list = await fetch(`${API}/shift-template`, { headers: auth }).then((r) => r.json());
  const rows: Array<{ outletId: string }> = list?.data ?? [];
  const foreignTemplates = rows.filter((t) => t.outletId !== velvet.id).length;
  console.log(`1. list: ${rows.length} templates, foreign rows: ${foreignTemplates} (want 0)`);

  // 2. Edit Emhub's template as Velvet → 404 (indistinguishable from missing).
  const put = await fetch(`${API}/shift-template/${emhubTpl.id}`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ name: 'HACKED' }),
  });
  console.log(`2. PUT foreign template: ${put.status} (want 404)`);

  // 3. Delete Emhub's template as Velvet → 404.
  const del = await fetch(`${API}/shift-template/${emhubTpl.id}`, {
    method: 'DELETE',
    headers: auth,
  });
  console.log(`3. DELETE foreign template: ${del.status} (want 404)`);

  // 4. Post a shift on VELVET'S OWN outlet but naming EMHUB'S template →
  //    400 refusal, fired before any insert.
  const post = await fetch(`${API}/shift`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      outletId: velvet.id,
      shiftDate: '2027-01-15',
      slot: '22:00 - 04:00',
      quantity: 1,
      templateId: emhubTpl.id,
    }),
  });
  const postBody = await post.json();
  console.log(`4. POST shift with foreign templateId: ${post.status} (want 400) — "${postBody?.message}"`);

  // 5. Shift list: every row must belong to Velvet.
  const shifts = await fetch(`${API}/shift?pageSize=100`, { headers: auth }).then((r) => r.json());
  const srows: Array<{ outletId: string }> = shifts?.data ?? [];
  const foreignShifts = srows.filter((sh) => sh.outletId !== velvet.id).length;
  console.log(`5. shift list: ${srows.length} rows, foreign rows: ${foreignShifts} (want 0)`);

  // 6. Emhub's template untouched?
  const [after] = await db
    .select({ id: ShiftTemplateTable.id, name: ShiftTemplateTable.name })
    .from(ShiftTemplateTable)
    .where(eq(ShiftTemplateTable.id, emhubTpl.id))
    .limit(1);
  console.log(`6. Emhub template still exists: ${Boolean(after)}, name untouched: ${after?.name !== 'HACKED'}`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
