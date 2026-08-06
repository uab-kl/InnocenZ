import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import {
  OrgMemberInviteInsertType,
  OrgMemberInviteTable,
  OrgMemberInviteType,
} from './org-member-invite.model';

export class OrgMemberInviteRepositoryClass {
  async create(
    data: Omit<OrgMemberInviteInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<OrgMemberInviteType> {
    const dbClient = tx ?? db;
    const [row] = await dbClient.insert(OrgMemberInviteTable).values(data).returning();
    return row;
  }

  async update(
    id: string,
    data: Partial<OrgMemberInviteInsertType>,
    tx?: DbTransaction,
  ): Promise<OrgMemberInviteType | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient
        .update(OrgMemberInviteTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(OrgMemberInviteTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[OrgMemberInviteRepository.update] Error:', error);
      return null;
    }
  }

  async getByToken(tokenHash: string): Promise<OrgMemberInviteType | null> {
    try {
      const [row] = await db
        .select()
        .from(OrgMemberInviteTable)
        .where(eq(OrgMemberInviteTable.token, tokenHash))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[OrgMemberInviteRepository.getByToken] Error:', error);
      return null;
    }
  }

  async listPendingByOutlet(outletId: string): Promise<OrgMemberInviteType[]> {
    try {
      return await db
        .select()
        .from(OrgMemberInviteTable)
        .where(
          and(
            eq(OrgMemberInviteTable.outletId, outletId),
            eq(OrgMemberInviteTable.status, 'pending'),
          ),
        )
        .orderBy(desc(OrgMemberInviteTable.createdAt));
    } catch (error) {
      logger.error('[OrgMemberInviteRepository.listPendingByOutlet] Error:', error);
      return [];
    }
  }

  async listPendingByAgency(agencyId: string): Promise<OrgMemberInviteType[]> {
    try {
      return await db
        .select()
        .from(OrgMemberInviteTable)
        .where(
          and(
            eq(OrgMemberInviteTable.agencyId, agencyId),
            eq(OrgMemberInviteTable.status, 'pending'),
          ),
        )
        .orderBy(desc(OrgMemberInviteTable.createdAt));
    } catch (error) {
      logger.error('[OrgMemberInviteRepository.listPendingByAgency] Error:', error);
      return [];
    }
  }

  async findPendingByOrgEmail(input: {
    email: string;
    outletId?: string;
    agencyId?: string;
  }): Promise<OrgMemberInviteType | null> {
    try {
      const email = input.email.trim().toLowerCase();
      const conditions = [
        eq(OrgMemberInviteTable.email, email),
        eq(OrgMemberInviteTable.status, 'pending'),
      ];
      if (input.outletId) {
        conditions.push(eq(OrgMemberInviteTable.outletId, input.outletId));
      } else if (input.agencyId) {
        conditions.push(eq(OrgMemberInviteTable.agencyId, input.agencyId));
      } else {
        return null;
      }
      const [row] = await db
        .select()
        .from(OrgMemberInviteTable)
        .where(and(...conditions))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[OrgMemberInviteRepository.findPendingByOrgEmail] Error:', error);
      return null;
    }
  }
}
