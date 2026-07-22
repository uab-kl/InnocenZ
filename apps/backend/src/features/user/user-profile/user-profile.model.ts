import { date, integer, jsonb, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';

export const idTypeValues = ['NRIC', 'Passport', 'Work permit'] as const;
export type IdType = (typeof idTypeValues)[number];
export const idTypeEnum = MainSchema.enum('user_profile_id_type', idTypeValues);

export const verificationStatusValues = ['draft', 'pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof verificationStatusValues)[number];
export const verificationStatusEnum = MainSchema.enum(
  'user_profile_verification_status',
  verificationStatusValues,
);

export const UserProfileTable = MainSchema.table('user_profile', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  userId: uuid('user_id')
    .references(() => UserTable.id)
    .notNull()
    .unique(),
  fullName: varchar('full_name', { length: 255 }),
  nationality: varchar('nationality', { length: 100 }),
  gender: varchar('gender', { length: 20 }),
  race: varchar('race', { length: 50 }),
  portfolioPhotos: jsonb('portfolio_photos').$type<(string | null)[]>(),
  /** Public path to the saved auto-generated photo comcard image. */
  comcardImage: varchar('comcard_image'),
  comcardHeightCm: integer('comcard_height_cm'),
  comcardWeightKg: integer('comcard_weight_kg'),
  idType: idTypeEnum('id_type'),
  idNo: varchar('id_no', { length: 32 }),
  dob: date('dob'),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  postcode: varchar('postcode', { length: 20 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }),
  idPhotoFront: varchar('id_photo_front'),
  idPhotoBack: varchar('id_photo_back'),
  verificationStatus: verificationStatusEnum('verification_status').default('draft'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by'),
  updatedBy: varchar('updated_by'),
});

export type UserProfileType = typeof UserProfileTable.$inferSelect;
export type UserProfileInsertType = typeof UserProfileTable.$inferInsert;

export type UserProfileFilter = {
  userId?: string;
  nationality?: string;
  verificationStatus?: VerificationStatus;
};

export type UserProfileResponse = {
  id: string | null;
  userId: string;
  fullName: string | null;
  nationality: string | null;
  gender: string | null;
  race: string | null;
  portfolioPhotos: (string | null)[] | null;
  comcardImage: string | null;
  comcardHeightCm: number | null;
  comcardWeightKg: number | null;
  idType: IdType | null;
  idNo: string | null;
  dob: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postcode: string | null;
  state: string | null;
  country: string | null;
  idPhotoFront: string | null;
  idPhotoBack: string | null;
  verificationStatus: VerificationStatus | null;
  verifiedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
};

export function emptyUserProfileResponse(userId: string): UserProfileResponse {
  return {
    id: null,
    userId,
    fullName: null,
    nationality: null,
    gender: null,
    race: null,
    portfolioPhotos: null,
    comcardImage: null,
    comcardHeightCm: null,
    comcardWeightKg: null,
    idType: null,
    idNo: null,
    dob: null,
    addressLine1: null,
    addressLine2: null,
    postcode: null,
    state: null,
    country: null,
    idPhotoFront: null,
    idPhotoBack: null,
    verificationStatus: 'draft',
    verifiedAt: null,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null,
  };
}

export function toUserProfileResponse(profile: UserProfileType): UserProfileResponse {
  return {
    id: profile.id,
    userId: profile.userId,
    fullName: profile.fullName,
    nationality: profile.nationality,
    gender: profile.gender,
    race: profile.race,
    portfolioPhotos: profile.portfolioPhotos,
    comcardImage: profile.comcardImage,
    comcardHeightCm: profile.comcardHeightCm,
    comcardWeightKg: profile.comcardWeightKg,
    idType: profile.idType,
    idNo: profile.idNo,
    dob: profile.dob,
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    postcode: profile.postcode,
    state: profile.state,
    country: profile.country,
    idPhotoFront: profile.idPhotoFront,
    idPhotoBack: profile.idPhotoBack,
    verificationStatus: profile.verificationStatus,
    verifiedAt: profile.verifiedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    createdBy: profile.createdBy,
    updatedBy: profile.updatedBy,
  };
}
