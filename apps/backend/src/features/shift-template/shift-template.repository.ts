import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import {
  ShiftTemplateTable,
  type ShiftTemplateInsertType,
  type ShiftTemplateType,
} from './shift-template.model';

export class ShiftTemplateRepositoryClass {
  /** An outlet's gallery, gallery order then name — stable for the picker. */
  listByOutletIds(outletIds: string[]): Promise<ShiftTemplateType[]> {
    if (outletIds.length === 0) return Promise.resolve([]);
    return db
      .select()
      .from(ShiftTemplateTable)
      .where(inArray(ShiftTemplateTable.outletId, outletIds))
      .orderBy(asc(ShiftTemplateTable.sortOrder), asc(ShiftTemplateTable.name));
  }

  async getById(id: string): Promise<ShiftTemplateType | null> {
    const [row] = await db
      .select()
      .from(ShiftTemplateTable)
      .where(eq(ShiftTemplateTable.id, id))
      .limit(1);
    return row ?? null;
  }

  async create(values: ShiftTemplateInsertType): Promise<ShiftTemplateType | null> {
    const [row] = await db.insert(ShiftTemplateTable).values(values).returning();
    return row ?? null;
  }

  async update(
    id: string,
    values: Partial<ShiftTemplateInsertType>,
  ): Promise<ShiftTemplateType | null> {
    const [row] = await db
      .update(ShiftTemplateTable)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(ShiftTemplateTable.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<ShiftTemplateType | null> {
    const [row] = await db
      .delete(ShiftTemplateTable)
      .where(eq(ShiftTemplateTable.id, id))
      .returning();
    return row ?? null;
  }
}

/**
 * Does this template belong to this outlet? Standalone (not on the class) so
 * the SHIFT controller can enforce it on `templateId` at post time without
 * growing its constructor — a forged id must not link a shift to another
 * venue's card.
 */
export async function shiftTemplateBelongsToOutlet(
  templateId: string,
  outletId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: ShiftTemplateTable.id })
    .from(ShiftTemplateTable)
    .where(
      and(eq(ShiftTemplateTable.id, templateId), eq(ShiftTemplateTable.outletId, outletId)),
    )
    .limit(1);
  return Boolean(row);
}
