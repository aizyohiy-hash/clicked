import { createHash } from 'node:crypto';
import { Router } from 'express';
import type { Request, Response, IRouter } from 'express';
import { Keypair } from '@stellar/stellar-sdk';
import { db } from '../db/index.js';
import { users, wallets } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createNonce, consumeNonce } from '../lib/nonce.js';
import { signToken } from '../lib/jwt.js';
import { validate } from '../middleware/validate.js';
import {
  ChallengeSchema,
  VerifySchema,
  type ChallengeBody,
  type VerifyBody,
} from '../schemas/auth.schemas.js';

export const authRouter: IRouter = Router();

// Step 1: client requests a challenge nonce for a wallet address
authRouter.post('/challenge', validate(ChallengeSchema), (req: Request, res: Response) => {
  const { walletAddress } = req.body as ChallengeBody;

  const nonce = createNonce(walletAddress);
  const message = `Sign in to Clicked\nWallet: ${walletAddress}\nNonce: ${nonce}`;

  res.json({ message, nonce });
});

// Step 2: client signs the message and submits the signature
authRouter.post('/verify', validate(VerifySchema), async (req: Request, res: Response) => {
  const { walletAddress, signature, nonce } = req.body as VerifyBody;

  // Validate and consume nonce
  const valid = consumeNonce(walletAddress, nonce);
  if (!valid) {
    res.status(401).json({ error: 'Invalid or expired nonce' });
    return;
  }

  // Verify Stellar keypair signature
  try {
    const message = `Sign in to Clicked\nWallet: ${walletAddress}\nNonce: ${nonce}`;
    const rawMessageBytes = Buffer.from(message);
    const freighterMessageBytes = createHash('sha256')
      .update(`Stellar Signed Message:\n${message}`)
      .digest();
    const keypair = Keypair.fromPublicKey(walletAddress);
    const hexSignatureBytes = Buffer.from(signature, 'hex');
    const base64SignatureBytes = Buffer.from(signature, 'base64');

    const isValidSignature =
      keypair.verify(rawMessageBytes, hexSignatureBytes) ||
      keypair.verify(freighterMessageBytes, base64SignatureBytes);

    if (!isValidSignature) {
      res.status(401).json({ error: 'Signature verification failed' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Invalid signature or wallet address' });
    return;
  }

  // Upsert user + wallet
  let userId: string;

  const existingWallet = await db.query.wallets.findFirst({
    where: eq(wallets.address, walletAddress),
    with: { user: true },
  });

  if (existingWallet) {
    userId = existingWallet.userId;
  } else {
    const [newUser] = await db.insert(users).values({}).returning({ id: users.id });
    if (!newUser) {
      res.status(500).json({ error: 'Failed to create user' });
      return;
    }
    userId = newUser.id;
    await db.insert(wallets).values({ userId, address: walletAddress, isPrimary: true });
  }

  const token = signToken({ userId, walletAddress });
  res.json({ token });
});
