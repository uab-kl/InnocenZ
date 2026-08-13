import { date, integer, jsonb, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';
// Leaf (no feature imports of its own) — safe to reach for from a model file.
import { derivedAge } from '@/features/pr-personnel/ic-dob';

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
  /** Spoken languages, e.g. ['English','Mandarin'] — editable from the PR profile. */
  languages: jsonb('languages').$type<string[]>(),
  portfolioPhotos: jsonb('portfolio_photos').$type<(string | null)[]>(),
  /** Public path to the saved auto-generated photo comcard image. */
  comcardImage: varchar('comcard_image'),
  comcardHeightCm: integer('comcard_height_cm'),
  comcardWeightKg: integer('comcard_weight_kg'),
  /** Standard comcard 3-size (BWH), centimetres. */
  comcardBustCm: integer('comcard_bust_cm'),
  comcardWaistCm: integer('comcard_waist_cm'),
  comcardHipCm: integer('comcard_hip_cm'),
  idType: idTypeEnum('id_type'),
  idNo: varchar('id_no', { length: 32 }),
  dob: date('dob'),
  addressLine1: varchar('address_line_1', { length: 255 }),
  addressLine2: varchar('address_line_2', { length: 255 }),
  city: varchar('city', { length: 100 }),
  postcode: varchar('postcode', { length: 20 }),
  state: varchar('state', { length: 100 }),
  country: varchar('country', { length: 100 }),
  idPhotoFront: varchar('id_photo_front'),
  idPhotoBack: varchar('id_photo_back'),
  /**
   * Where this person is actually paid (migration 0077). Until these existed the
   * payment voucher printed an em dash for both and no bank could act on it —
   * the document was complete except for the parts that make it a payment.
   *
   * Here rather than on `pr` because a bank account is a fact about the PERSON,
   * and this table already holds that class of fact (IC/passport, DOB, address).
   * It is also the table already blanked for outlet callers, so a venue cannot
   * see a worker's account number. ⚠️ **Any new sensitive column added here must
   * be added to `redactIdentityDocsForOutlet` in the same commit** — that helper
   * blanks a named list, so a field it does not name is a field it leaks.
   */
  bankName: varchar('bank_name', { length: 255 }),
  bankAccountNo: varchar('bank_account_no', { length: 50 }),
  /**
   * The signature this person has on file, as vector ink ({w,h,strokes}) —
   * the same shape `payment_voucher.finance_head_signature` stores (0111).
   *
   * Kept so signing a voucher is a TAP rather than a redraw. The voucher still
   * takes its own copy of the strokes at sign time: a signature already applied
   * to a money document must not change because the signer later updated the
   * one on file. This column is the source for the next signature, never the
   * record of a past one.
   *
   * Sensitive in the same sense as the documents above — a signature image is
   * forgeable — so it is named in `IDENTITY_DOC_FIELDS`.
   */
  signatureInk: text('signature_ink'),
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
  languages: string[] | null;
  portfolioPhotos: (string | null)[] | null;
  comcardImage: string | null;
  comcardHeightCm: number | null;
  comcardWeightKg: number | null;
  comcardBustCm: number | null;
  comcardWaistCm: number | null;
  comcardHipCm: number | null;
  idType: IdType | null;
  idNo: string | null;
  dob: string | null;
  /**
   * Whole years, DERIVED from the IC (falling back to `dob`) — never stored and
   * never settable. Served here so the PR's own app and the agency portal
   * render one number rather than each computing its own; the mobile profile
   * used to do `Math.max(18, thisYear - birthYear)`, which ignored the month
   * and invented 18 for anyone younger. See `features/pr-personnel/ic-dob.ts`.
   */
  age: number | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  state: string | null;
  country: string | null;
  idPhotoFront: string | null;
  idPhotoBack: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  signatureInk: string | null;
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
    languages: null,
    portfolioPhotos: null,
    comcardImage: null,
    // No identity yet, so no age to derive.
    age: null,
    comcardHeightCm: null,
    comcardWeightKg: null,
    comcardBustCm: null,
    comcardWaistCm: null,
    comcardHipCm: null,
    idType: null,
    idNo: null,
    dob: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postcode: null,
    state: null,
    country: null,
    idPhotoFront: null,
    idPhotoBack: null,
    bankName: null,
    bankAccountNo: null,
    signatureInk: null,
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
    languages: profile.languages,
    portfolioPhotos: profile.portfolioPhotos,
    comcardImage: profile.comcardImage,
    comcardHeightCm: profile.comcardHeightCm,
    comcardWeightKg: profile.comcardWeightKg,
    comcardBustCm: profile.comcardBustCm,
    comcardWaistCm: profile.comcardWaistCm,
    comcardHipCm: profile.comcardHipCm,
    idType: profile.idType,
    idNo: profile.idNo,
    // The IC's date wins over the stored one — same rule, same helper, as the
    // agency-facing read.
    ...derivedAge({ idNo: profile.idNo, dob: profile.dob }),
    addressLine1: profile.addressLine1,
    addressLine2: profile.addressLine2,
    city: profile.city,
    postcode: profile.postcode,
    state: profile.state,
    country: profile.country,
    idPhotoFront: profile.idPhotoFront,
    idPhotoBack: profile.idPhotoBack,
    bankName: profile.bankName,
    bankAccountNo: profile.bankAccountNo,
    signatureInk: profile.signatureInk,
    verificationStatus: profile.verificationStatus,
    verifiedAt: profile.verifiedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    createdBy: profile.createdBy,
    updatedBy: profile.updatedBy,
  };
}
