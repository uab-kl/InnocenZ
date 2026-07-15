import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';

export const UserTable = MainSchema.table('user', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    email: varchar('email').unique(),
    phoneNum: varchar('phone_num').unique(),
    profileImage: varchar('profile_image'),
    username: varchar('username', { length: 100 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    status: varchar('status', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
});

export type UserSortField = 'CREATED_AT' | 'UPDATED_AT' | 'USERNAME' | 'EMAIL' | 'STATUS';

export type UserSort = {
    field?: UserSortField;
    direction?: 'ASC' | 'DESC';
};

export type UserFilter = {
    id?: string;
    email?: string;
    phoneNum?: string;
    username?: string;
    status?: string;
    roleId?: string;
    /** Joined on/after this date (start of day). Use with endDate for a period filter. */
    startDate?: Date | string | null;
    /** Joined on/before this date (end of day). Use with startDate for a period filter. */
    endDate?: Date | string | null;
};

export type UserType = typeof UserTable.$inferSelect;
export type UserInsertType = typeof UserTable.$inferInsert;
