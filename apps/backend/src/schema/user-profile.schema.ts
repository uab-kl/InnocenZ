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

const acknowledgementsSchema = z.object({
  acceptPrivacy: z.boolean(),
  acceptTruth: z.boolean(),
  acceptAgencyShare: z.boolean(),
  acceptTerms: z.boolean(),
});

/** Fields stored on the `user` table */
const userAccountFields = {
  username: z.string().min(1, 'Username is required'),
  email: z.email('Invalid email format').optional(),
  phoneNum: z.string().min(1, 'Phone number is required'),
  profileImage: z.string().optional(),
};

/** Fields stored on `user_profile` only */
const profileOnlyFields = {
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  nationality: z.string().min(1, 'Nationality is required'),
  idType: z.enum(idTypeValues),
  idNo: z.string().min(1, 'ID number is required'),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  postcode: z.string().min(1, 'Postcode is required'),
  state: z.string().min(1, 'State is required'),
  country: z.string().min(1, 'Country is required'),
  underAgency: z.boolean().nullable(),
  agencyId: z.string().optional(),
  idPhotoFront: z.string().optional(),
  idPhotoBack: z.string().optional(),
};

type ProfileOnlyBody = z.infer<z.ZodObject<typeof profileOnlyFields>>;

function profileRefinements(data: ProfileOnlyBody, ctx: z.RefinementCtx) {
  if (data.idType === 'NRIC' && data.idNo && data.dob) {
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

  if (data.underAgency === null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Please indicate whether you are under an agency',
      path: ['underAgency'],
    });
  }

  if (data.underAgency === true && !data.agencyId?.trim()) {
    ctx.addIssue({
      code: 'custom',
      message: 'Agency is required when under an agency',
      path: ['agencyId'],
    });
  }
}

export const UserProfileCreateSchema = z
  .object({ ...userAccountFields, ...profileOnlyFields })
  .extend(acknowledgementsSchema.shape)
  .superRefine((data, ctx) => profileRefinements(data, ctx));

export const UserProfileUpdateSchema = UserProfileCreateSchema.partial().superRefine((data, ctx) => {
  if (data.idType === 'NRIC' && data.idNo && data.dob) {
    profileRefinements(
      {
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        nationality: data.nationality ?? '',
        idType: data.idType,
        idNo: data.idNo,
        dob: data.dob,
        addressLine1: data.addressLine1 ?? '',
        postcode: data.postcode ?? '',
        state: data.state ?? '',
        country: data.country ?? '',
        underAgency: data.underAgency ?? null,
        agencyId: data.agencyId,
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
  if (!data.acceptPrivacy || !data.acceptTruth || !data.acceptAgencyShare || !data.acceptTerms) {
    ctx.addIssue({
      code: 'custom',
      message: 'All acknowledgements and terms must be accepted',
      path: ['acceptTerms'],
    });
  }
});

export type UserProfileBody = z.infer<typeof UserProfileCreateSchema>;
