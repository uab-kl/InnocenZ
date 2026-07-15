import { z } from 'zod';
import { outletTransactionStatusValues } from '@/features/outlet-transaction/outlet-transaction.model.js';

export const CreateOutletTransactionSchema = z.object({
  outletId: z.uuid(),
  outletName: z.string().min(1).max(255),
  amount: z.coerce.number().nonnegative(),
  currency: z.string().min(1).max(8).default('MYR'),
  type: z.string().min(1).max(50).default('payment_voucher'),
  status: z.enum(outletTransactionStatusValues).default('completed'),
  reference: z.string().max(100).optional().nullable(),
  occurredAt: z.coerce.date().optional(),
});
