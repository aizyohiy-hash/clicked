import { z } from 'zod';

export const ChallengeSchema = z.object({
  walletAddress: z.string().min(1, 'walletAddress is required'),
});

export const VerifySchema = z.object({
  walletAddress: z.string().min(1, 'walletAddress is required'),
  signature: z.string().min(1, 'signature is required'),
  nonce: z.string().min(1, 'nonce is required'),
});

export type ChallengeBody = z.infer<typeof ChallengeSchema>;
export type VerifyBody = z.infer<typeof VerifySchema>;
