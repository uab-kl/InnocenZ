import { eq, and, asc, desc, count, getTableColumns, ilike, inArray, SQL, sql, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { ActorUser, actorJoinOn, actorNameColumn } from '@/util/actor-name';
import { UserTable, UserType, UserInsertType, UserFilter } from './user.model';
import { DbTransaction } from '@/types/db-transaction';
import { logger } from '@/util/logger';
import { redactQueryError, safeErrorFields } from '@/features/auth/query-error-redaction';
import { buildPeriodDateWhere } from '@/util/filter-date-format';
import { UserRoleRepositoryClass } from '@/features/rbac/user-role/user-role.repository';

/**
 * A user row plus WHO LAST TOUCHED IT, by name — the admin archive screen's
 * "Deactivated by". Resolved through a join, never stored. The twin of
 * `AgencyWithActor` / `OutletWithActor`; see `util/actor-name.ts`.
 */
export type UserWithActor = UserType & { updatedByName: string | null };
import { UserProfileRepositoryClass } from '@/features/user/user-profile/user-profile.repository';

/**
 * The digit strings a typed phone number may legitimately mean.
 *
 * Malaysian numbers are written three ways for the same line: `+60123456789`
 * (stored), `60123456789` (what the sign-in placeholder shows), and
 * `0123456789` (what people actually say and write). Only the first ever matched,
 * which is why a PR could be refused a number that was correct.
 *
 * Deliberately narrow: it swaps a leading `0` for the `60` country code and back,
 * nothing else. Matching on a suffix — "the last 9 digits" — would let one
 * country's number open another's account.
 */
export function phoneLoginCandidates(value: string): string[] {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length < 6) return [];
  const forms = new Set<string>([digits]);
  if (digits.startsWith('0')) forms.add(`60${digits.slice(1)}`);
  if (digits.startsWith('60')) forms.add(`0${digits.slice(2)}`);
  return [...forms];
}

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
      // No values: the insert carries `passwordHash`. See updateUser.
      logger.info('[UserRepository.createUser] Creating user', {
        fields: Object.keys(user),
      });
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
      logger.info('[UserRepository.createUser] User created', { id: newUser.id });
      return newUser;
    } catch (error) {
      // The failed INSERT carries `passwordHash` among its bound values, and
      // drizzle prints those in the message, `params` and stack. Scrubbed in
      // place BEFORE the rethrow, so no caller further up can log them either.
      redactQueryError(error);
      logger.error('[UserRepository.createUser] Error:', safeErrorFields(error));
      throw error;
    }
  }

  /**
   * Count one failed login IN SQL, atomically.
   *
   * The controller used to compute `attempts + 1` in JS from a row read before
   * the bcrypt compare — so N concurrent wrong guesses all read the same
   * snapshot, all wrote the same value, and MAX_FAILED_ATTEMPTS never tripped.
   * Worse, the sub-threshold branch wrote `lockedUntil: null` unconditionally,
   * letting a request still inside bcrypt erase a lock two other requests had
   * just earned. The CASE keeps an existing lock (ELSE locked_until, never
   * NULL) and only ever extends, so concurrent failures can't unlock anyone.
   */
  async recordFailedLoginAttempt(
    id: string,
    maxAttempts: number,
    lockoutMinutes: number,
  ): Promise<{ attempts: number; lockedUntil: Date | null } | null> {
    try {
      const [row] = await db
        .update(UserTable)
        .set({
          failedLoginAttempts: sql`${UserTable.failedLoginAttempts} + 1`,
          lockedUntil: sql`CASE WHEN ${UserTable.failedLoginAttempts} + 1 >= ${maxAttempts} THEN now() + (${lockoutMinutes} * interval '1 minute') ELSE ${UserTable.lockedUntil} END`,
          updatedAt: new Date(),
          updatedBy: id,
        })
        .where(eq(UserTable.id, id))
        .returning({
          attempts: UserTable.failedLoginAttempts,
          lockedUntil: UserTable.lockedUntil,
        });
      return row ?? null;
    } catch (error) {
      logger.error('[UserRepository.recordFailedLoginAttempt] Error:', error);
      throw error;
    }
  }

  async updateUser(
    user: Partial<UserInsertType>,
    id: string,
    tx?: DbTransaction,
  ): Promise<UserType | null> {
    try {
      // Field NAMES only, never values or the returned row: a patch can carry
      // `passwordHash`, and the row always does. Both used to be printed whole
      // on every update, which put password hashes into the application log.
      logger.info('[UserRepository.updateUser] Updating user', {
        id,
        fields: Object.keys(user),
      });
      const dbClient = tx ?? db;
      const [updatedUser] = await dbClient
        .update(UserTable)
        .set({ ...user, updatedAt: new Date() })
        .where(eq(UserTable.id, id))
        .returning();
      logger.info('[UserRepository.updateUser] User updated', {
        id,
        found: Boolean(updatedUser),
      });
      return updatedUser ?? null;
    } catch (error) {
      // A patch can carry `passwordHash`; see createUser.
      logger.error('[UserRepository.updateUser] Error:', safeErrorFields(error));
      return null;
    }
  }

  async getUsersPaginated(params: {
    filter?: UserFilter;
    sort?: { field: 'email' | 'phoneNum' | 'username' | 'createdAt' | 'updatedAt'; direction: 'asc' | 'desc' };
    page: number;
    pageSize: number;
  }): Promise<{ users: UserWithActor[]; totalCount: number }> {
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
        .select({ ...getTableColumns(UserTable), updatedByName: actorNameColumn })
        .from(UserTable)
        // WHO SWITCHED IT OFF, by name. LEFT and cast uuid->text, so a row
        // stamped `'system'` still appears — see `util/actor-name.ts`.
        .leftJoin(ActorUser, actorJoinOn(UserTable.updatedBy))
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
        // CASE- AND SPACE-INSENSITIVE, because a person does not remember how
        // they capitalised an address. The exact match refused `Owner@x.com`
        // for an account stored as `owner@x.com` — at sign-in, at forgot
        // password, and (worst) at the "is this email free?" checks, which
        // then let a second account be created for the same mailbox.
        //
        // Every email writer stores lowercase now, but rows written before
        // that are matched on the normalised form too. Two rows that normalise
        // to one address are REFUSED rather than one being picked — the same
        // rule the phone branch below applies.
        const needle = (value ?? '').trim().toLowerCase();
        if (!needle) return null;
        users = await db
          .select()
          .from(UserTable)
          .where(sql`lower(btrim(${UserTable.email})) = ${needle}`)
          .limit(2);
        if (users.length > 1) {
          logger.error(
            '[UserRepository.getUserByLoginMethod] Refusing: that email matches more than one account',
          );
          return null;
        }
      } else if (method === 'phone') {
        // Compare DIGITS, not the string as typed.
        //
        // Every stored number carries a '+' and the sign-in field's own
        // placeholder does not, so an exact match refused numbers that were
        // right. The local form is accepted too (012… for +6012…), because that
        // is how a Malaysian number is written everywhere except this database.
        //
        // Fetches TWO rows and refuses on ambiguity rather than taking the
        // first: this is a login, and quietly choosing one of two accounts that
        // both match is the wrong way to resolve a duplicate.
        const candidates = phoneLoginCandidates(value);
        if (candidates.length === 0) return null;
        users = await db
          .select()
          .from(UserTable)
          .where(inArray(sql`regexp_replace(${UserTable.phoneNum}, '\\D', '', 'g')`, candidates))
          .limit(2);
        if (users.length > 1) {
          logger.error(
            '[UserRepository.getUserByLoginMethod] Refusing login: that number matches more than one account',
          );
          return null;
        }
      }
      // Deliberately NOT logging the rows: a UserType carries passwordHash, and
      // this used to print the whole record on every sign-in attempt.
      logger.info(
        `[UserRepository.getUserByLoginMethod] ${
          users.length === 1 ? `matched user ${users[0].id}` : 'no match'
        }`,
      );
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error('[UserRepository.getUserByLoginMethod] Error:', error);
      return null;
    }
  }
}
