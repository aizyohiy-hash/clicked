import { Router } from 'express';
import type { IRouter } from 'express';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { pushSubscriptions } from '../db/schema.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

export const pushRouter: IRouter = Router();
pushRouter.use(requireAuth);

pushRouter.post('/subscriptions', async (req: AuthRequest, res) => {
  const deviceId = req.auth!.deviceId;
  const { endpoint, keys } = req.body;

  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    res.status(400).json({ error: 'Missing endpoint or keys' });
    return;
  }

  try {
    // Upsert subscription
    await db
      .insert(pushSubscriptions)
      .values({
        deviceId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.endpoint],
        set: {
          deviceId,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      });

    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to register subscription' });
  }
});

pushRouter.delete('/subscriptions', async (req: AuthRequest, res) => {
  const deviceId = req.auth!.deviceId;
  const { endpoint } = req.body;

  if (!endpoint) {
    res.status(400).json({ error: 'Endpoint is required' });
    return;
  }

  try {
    await db
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.deviceId, deviceId)),
      );
    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});
