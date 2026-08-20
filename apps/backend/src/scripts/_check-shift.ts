import 'dotenv/config';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/db/index';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftTemplateTable } from '@/features/shift-template/shift-template.model';

async function run() {
  const rows = await db
    .select({
      id: ShiftTable.id,
      event: ShiftTable.eventName,
      date: ShiftTable.shiftDate,
      slot: ShiftTable.slot,
      templateId: ShiftTable.templateId,
      createdAt: ShiftTable.createdAt,
    })
    .from(ShiftTable)
    .orderBy(desc(ShiftTable.createdAt))
    .limit(8);
  for (const r of rows) {
    let cover: string | null = null;
    if (r.templateId) {
      const [t] = await db.select({ c: ShiftTemplateTable.coverImage }).from(ShiftTemplateTable).where(eq(ShiftTemplateTable.id, r.templateId)).limit(1);
      cover = t?.c ?? '(template gone)';
    }
    console.log(`${String(r.date).slice(0,10)} | ${r.slot} | "${r.event}" | templateId=${r.templateId ?? 'NULL'} | cover=${cover ?? '—'}`);
  }
  process.exit(0);
}
run().catch((e) => { console.error(e); process.exit(1); });
