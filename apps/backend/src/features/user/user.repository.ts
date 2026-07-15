import { eq, and, asc, desc, count, ilike, inArray, SQL, sql, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable, UserType, UserInsertType, UserFilter } from './user.model';
import { DbTransaction } from '@/types/db-transaction';
import { logger } from '@/util/logger';
import { buildPeriodDateWhere } from '@/util/filter-date-format';
import { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository';
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository';

export class UserRepositoryClass {
  constructor(
    private userRoleRepository: UserRoleRepositoryClass,
    private userProfileRepository: UserProfileRepositoryClass,
  ) {}

  async createUser(
    user: Omit<UserInsertType, 'id' | 'createdAt' | 'updatedAt'>,
    tx?: DbTransaction,
  ): Promise<UserType> {
    try {
      logger.info('[UserRepository.createUser] Creating user:', user);
      const dbClient = tx || db;
      const [newUser] = await dbClient
        .insert(UserTable)
        .values({
          ...user,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      await this.userProfileRepository.createEmpty(newUser.id, user.createdBy, tx);
      logger.info('[UserRepository.createUser] User successfully created:', newUser);
      return newUser;
    } catch (error) {
      logger.error('[UserRepository.createUser] Error:', error);
      throw error;
    }
  }

  async updateUser(
    user: Partial<UserInsertType>,
    id: string,
    tx?: DbTransaction,
  ): Promise<UserType | null> {
    try {
      logger.info('[UserRepository.updateUser] Updating user:', user);
      const dbClient = tx ?? db;
      const [updatedUser] = await dbClient
        .update(UserTable)
        .set({ ...user, updatedAt: new Date() })
        .where(eq(UserTable.id, id))
        .returning();
      logger.info('[UserRepository.updateUser] User successfully updated:', updatedUser);
      return updatedUser ?? null;
    } catch (error) {
      logger.error('[UserRepository.updateUser] Error:', error);
      return null;
    }
  }

  async getUsersPaginated(params: {
    filter?: UserFilter;
    sort?: { field: 'email' | 'phoneNum' | 'username' | 'createdAt' | 'updatedAt'; direction: 'asc' | 'desc' };
    page: number;
    pageSize: number;
  }): Promise<{ users: UserType[]; totalCount: number }> {
    try {
      const { filter, sort, page, pageSize } = params;
      const conditions: Array<SQL | undefined> = [];

      if (filter?.phoneNum && filter?.username && filter.phoneNum === filter.username) {
        const term = `${filter.phoneNum}%`;
        conditions.push(or(ilike(UserTable.phoneNum, term), ilike(UserTable.username, term)));
      } else {
        if (filter?.phoneNum) {
          conditions.push(ilike(UserTable.phoneNum, `%${filter.phoneNum}%`));
        }
        if (filter?.username) {
          conditions.push(ilike(UserTable.username, `%${filter.username}%`));
        }
      }

      if (filter?.email && filter?.username && filter.email === filter.username) {
        const term = `${filter.email}%`;
        conditions.push(or(ilike(UserTable.email, term), ilike(UserTable.username, term)));
      } else {
        if (filter?.email) {
          conditions.push(ilike(UserTable.email, `%${filter.email}%`));
        }
        if (filter?.username) {
          conditions.push(ilike(UserTable.username, `%${filter.username}%`));
        }
      }

      if (filter?.status) {
        conditions.push(eq(UserTable.status, filter.status));
      }

      if (filter?.roleId) {
        const userIdsWithRole = await this.userRoleRepository.getUserIdsByRoleId(filter.roleId);
        if (userIdsWithRole.length === 0) {
          logger.info('[UserRepository.getUsersPaginated] No users found with role:', filter.roleId);
          return { users: [], totalCount: 0 };
        }
        conditions.push(inArray(UserTable.id, userIdsWithRole));
      }

      const createdAtFilter = buildPeriodDateWhere(
        UserTable.createdAt,
        filter?.startDate ?? undefined,
        filter?.endDate ?? undefined,
      );
      if (createdAtFilter) {
        conditions.push(createdAtFilter);
      }

      const whereConditions = conditions.filter(
        (condition): condition is SQL => condition !== undefined,
      )
      const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

      const sortColumn = sort?.field === 'email' ? UserTable.email
        : sort?.field === 'phoneNum' ? UserTable.phoneNum
          : sort?.field === 'username' ? UserTable.username
            : sort?.field === 'updatedAt' ? UserTable.updatedAt
              : UserTable.createdAt;
      const sortDirection = sort?.direction === 'desc' ? asc : desc;

      const [countRow] = await db.select({ value: sql<number>`count(*)::int` as SQL<number> }).from(UserTable).where(whereClause);
      const totalCount = Number(countRow?.value ?? 0);

      const users = await db
        .select()
        .from(UserTable)
        .where(whereClause)
        .orderBy(sortDirection(sortColumn))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      logger.info('[UserRepository.getUsersPaginated] Fetched page', page, 'totalCount:', totalCount);

      return { users, totalCount };
    } catch (error) {
      logger.error('[UserRepository.getUsersPaginated] Error:', error);
      return { users: [], totalCount: 0 };
    }
  }

  async getUserById(id: string): Promise<UserType | null> {
    try {
      const users = await db
        .select()
        .from(UserTable)
        .where(eq(UserTable.id, id))
        .limit(1);

      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error('[UserRepository.getUserById] Error:', error);
      return null;
    }
  }

  async getUsersByIds(ids: string[]): Promise<UserType[]> {
    if (ids.length === 0) return [];
    try {
      const users = await db
        .select()
        .from(UserTable)
        .where(inArray(UserTable.id, ids));
      return users;
    } catch (error) {
      logger.error('[UserRepository.getUsersByIds] Error:', error);
      return [];
    }
  }

  async getUserByLoginMethod(method: 'email' | 'phone', value: string): Promise<UserType | null> {
    try {
      logger.info('[UserRepository.getUserByLoginMethod] Getting user by login method:', method);
      let users: UserType[] = [];

      if (method === 'email') {
        logger.debug('[UserRepository.getUserByLoginMethod] Getting user by email:', value);
        users = await db.select().from(UserTable).where(eq(UserTable.email, value)).limit(1);
      } else if (method === 'phone') {
        logger.debug('[UserRepository.getUserByLoginMethod] Getting user by phone:', value);
        users = await db.select().from(UserTable).where(eq(UserTable.phoneNum, value)).limit(1);
      }
      logger.info('[UserRepository.getUserByLoginMethod] Users:', users);
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error('[UserRepository.getUserByLoginMethod] Error:', error);
      return null;
    }
  }
}
