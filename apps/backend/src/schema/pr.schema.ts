import { z } from 'zod';
import { prTierValues, prStatusValues } from '@/features/pr-personnel/pr.model';

export const CreatePrSchema = z.object({
  // Optional here: for agency callers it is derived from their own agency and
  // any client-supplied value is ignored. Admin callers must supply it (enforced
  // in the controller).
  agencyId: z.string().uuid('Invalid agency ID').optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  nickname: z.string().max(100, 'Nickname is too long').optional(),
  tier: z.enum(prTierValues).optional(),
  phone: z.string().max(50, 'Phone is too long').optional(),
  email: z.string().email('Invalid email').max(255, 'Email is too long').optional(),
  icNo: z.string().max(100, 'IC number is too long').optional(),
});

/**
 * The agency Manage-PR editor's fields that do NOT live on the `pr` row.
 *
 * Two different homes, and the split is not cosmetic:
 *   - identity (race, languages, dob, height, weight) is the PERSON, stored on
 *     `user_profile` and shared with the PR's own portal;
 *   - roster grading (place, yearsExp, kpiTier, payClass) is the PR *under this
 *     agency*, stored on `agency_pr` (0089).
 * Before this existed the editor collected all of them and the update route
 * silently stripped every one — zod drops unknown keys and still returns 200,
 * so the screen reported a save that never happened.
 */
export const UpdatePrSchema = CreatePrSchema.partial().extend({
  status: z.enum(prStatusValues).optional(),
  /**
   * Why a sign-up was declined — sent alongside `status: 'inactive'`. The
   * controller clears it when the PR is accepted, so callers never have to.
   */
  rejectReason: z.string().max(500, 'Reason is too long').optional(),

  // --- user_profile (requires the PR to have a linked user account) ---
  race: z.string().max(100, 'Race is too long').optional(),
  languages: z.array(z.string().min(1).max(50)).max(20, 'Too many languages').optional(),
  // ⚠️ `dob` is deliberately ABSENT, and this comment is the reason it must stay
  // absent. Age follows the PR's IC (owner's rule): a Malaysian NRIC's first six
  // digits ARE the birth date, so an editable age is a second, disagreeable copy
  // of a fact identity already carries — and one live PR's stored `dob` is
  // already a year off her own NRIC. It is derived on read in `ic-dob.ts`
  // instead. Zod drops unknown keys silently, so an editor that still sends
  // `dob` gets a 200 and no change rather than an error; the UI on both sides
  // renders age read-only so nothing sends it.
  comcardHeightCm: z.number().int().min(140).max(220).optional(),
  comcardWeightKg: z.number().int().min(35).max(120).optional(),

  // --- agency_pr (this agency's own grading of the PR) ---
  place: z.string().max(120, 'Place is too long').optional(),
  yearsExp: z.number().int().min(0).max(40).optional(),
  kpiTier: z.enum(['A', 'B', 'C']).optional(),
  payClass: z.enum(['basic', 'commission_only']).optional(),
});

export type CreatePrInput = z.infer<typeof CreatePrSchema>;
export type UpdatePrInput = z.infer<typeof UpdatePrSchema>;
