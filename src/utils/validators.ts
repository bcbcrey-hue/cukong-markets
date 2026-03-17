import { z } from 'zod';
import type { LegacyUploadedAccount } from '../core/types';

export const legacyAccountSchema = z.object({
  name: z.string().trim().min(1).max(64),
  apiKey: z.string().trim().min(1),
  apiSecret: z.string().trim().min(1),
});

export const legacyAccountsArraySchema = z.array(legacyAccountSchema).min(1);

export type ValidAccountInput = z.infer<typeof legacyAccountSchema>;

export function parseLegacyAccounts(input: unknown): LegacyUploadedAccount[] {
  return legacyAccountsArraySchema.parse(input);
}
