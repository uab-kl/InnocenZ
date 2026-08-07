import { z } from 'zod';
import { idTypeValues } from '@/features/user/user-profile/user-profile.model';

const NRIC_LENGTH = 12;

function digitsOnlyNric(value: string): string {
  return value.replace(/\D/g, '').slice(0, NRIC_LENGTH);
}

function dobToNricPrefix(dob: string): string {
  const [year, month, day] = dob.split('-');
  if (!year || !month || !day) return '';
  return `${year.slice(-2)}${month}${day}`;
}

function nricMatchesDob(dob: string, idNo: string): boolean {
  const prefix = dobToNricPrefix(dob);
  const digits = digitsOnlyNric(idNo);
  return Boolean(prefix) && digits.length === NRIC_LENGTH && digits.startsWith(prefix);
}

/** Fields stored on the `user` table */
const userAccountFields = {
  username: z.string().min(1, 'Username is required'),
  email: z.email('Invalid email format').optional(),
  phoneNum: z.string().min(1, 'Phone number is required'),
  profileImage: z.string().optional(),
};

/** Fields stored on `user_profile` only */
const profileOnlyFields = {
  fullName: z.string().min(1, 'Full name is required'),
  nationality: z.string().min(1, 'Nationality is required'),
  idType: z.enum(idTypeValues),
  idNo: z.string().min(1, 'ID number is required'),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  postcode: z.string().min(1, 'Postcode is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  idPhotoFront: z.string().optional(),
  idPhotoBack: z.string().optional(),
};

type ProfileOnlyBody = z.infer<z.ZodObject<typeof profileOnlyFields>>;

function profileRefinements(data: ProfileOnlyBody, ctx: z.RefinementCtx) {
  if (data.idType === 'NRIC') {
    if (data.nationality.trim().toLowerCase() !== 'malaysian') {
      ctx.addIssue({
        code: 'custom',
        message: 'NRIC is only for Malaysian nationality',
        path: ['idType'],
      });
    }
    if (data.idNo && data.dob) {
      const digits = digitsOnlyNric(data.idNo);
      if (digits.length !== NRIC_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          message: `NRIC must be ${NRIC_LENGTH} digits`,
          path: ['idNo'],
        });
      } else if (!nricMatchesDob(data.dob, data.idNo)) {
        ctx.addIssue({
          code: 'custom',
          message: 'First 6 NRIC digits must match date of birth (YYMMDD)',
          path: ['idNo'],
        });
      }
    }
  }
}

export const UserProfileCreateSchema = z
  .object({ ...userAccountFields, ...profileOnlyFields })
  .superRefine((data, ctx) => profileRefinements(data, ctx));

export const UserProfileUpdateSchema = UserProfileCreateSchema.partial().superRefine((data, ctx) => {
  if (data.idType === 'NRIC') {
    profileRefinements(
      {
        fullName: data.fullName ?? '',
        nationality: data.nationality ?? '',
        idType: data.idType,
        idNo: data.idNo ?? '',
        dob: data.dob ?? '',
        addressLine1: data.addressLine1 ?? '',
        city: data.city ?? '',
        postcode: data.postcode ?? '',
        state: data.state ?? '',
        country: data.country ?? '',
        addressLine2: data.addressLine2,
        idPhotoFront: data.idPhotoFront,
        idPhotoBack: data.idPhotoBack,
      },
      ctx,
    );
  }
});

export const UserProfileSubmitSchema = UserProfileCreateSchema.superRefine((data, ctx) => {
  if (!data.idPhotoFront) {
    ctx.addIssue({ code: 'custom', message: 'Front ID photo is required', path: ['idPhotoFront'] });
  }
  if (!data.idPhotoBack) {
    ctx.addIssue({ code: 'custom', message: 'Back ID photo is required', path: ['idPhotoBack'] });
  }
  if (!data.profileImage) {
    ctx.addIssue({ code: 'custom', message: 'Profile photo is required', path: ['profileImage'] });
  }
});

export type UserProfileBody = z.infer<typeof UserProfileCreateSchema>;
