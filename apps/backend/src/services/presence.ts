/**
 * Online presence tracking (#13).
 *
 * Stores userId → socketId mapping in Redis with a 60-second TTL that is
 * refreshed on every heartbeat. Uses a Redis set per userId to support
 * multiple tabs/connections but counting as a single presence entry.
 *
 * - On connect:   add socketId to `presence:{userId}` set, set TTL 60s
 * - On heartbeat: refresh TTL to 60s
 * - On disconnect: remove socketId from set, if set empty → user_offline
 * - GET /users/:id/presence → { online: boolean, lastSeen?: string }
 *
 * User presence is derived from device presence: a user is online when any
 * non-expired device entry exists (Redis OR user_devices.lastSeenAt within
 * the window). When offline, lastSeen reflects the most recent device activity.
 */
import type { Redis } from 'ioredis';
import { isNull, eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userDevices } from '../db/schema.js';

const PRESENCE_TTL = 90; // seconds

function presenceKey(userId: string): string {
  return `presence:${userId}`;
}

/**
 * Register a socket connection for a user. Adds the socketId to the
 * user's presence set and sets/refreshes the TTL.
 */
export async function setOnline(redis: Redis, userId: string, socketId: string): Promise<void> {
  const key = presenceKey(userId);
  await redis.sadd(key, socketId);
  await redis.expire(key, PRESENCE_TTL);
}

/**
 * Refresh the presence TTL (called on heartbeat).
 */
export async function refreshPresence(redis: Redis, userId: string): Promise<void> {
  const key = presenceKey(userId);
  const exists = await redis.exists(key);
  if (exists) {
    await redis.expire(key, PRESENCE_TTL);
  }
}

/**
 * Remove a socket connection from the user's presence set.
 * Returns true if the user has gone fully offline (no remaining sockets).
 */
export async function setOffline(redis: Redis, userId: string, socketId: string): Promise<boolean> {
  const key = presenceKey(userId);
  await redis.srem(key, socketId);
  const remaining = await redis.scard(key);
  if (remaining === 0) {
    await redis.del(key);
    return true;
  }
  return false;
}

/**
 * Forcefully mark a user offline by deleting their presence key.
 * Used when a heartbeat timeout or device revocation occurs.
 */
export async function markDeviceOffline(redis: Redis, userId: string): Promise<void> {
  const key = presenceKey(userId);
  await redis.del(key);
}

/**
 * Check if a user is currently online.
 */
export async function isOnline(redis: Redis, userId: string): Promise<boolean> {
  const key = presenceKey(userId);
  const count = await redis.scard(key);
  return count > 0;
}

const DEVICE_PRESENCE_WINDOW_MS = 90_000;

/**
 * Derive user presence from device presence: a user is considered online
 * if any non-revoked device has a lastSeenAt within the presence window.
 * When offline, returns the most recent lastSeenAt across all devices.
 */
export async function deriveDevicePresence(
  userId: string,
): Promise<{ online: boolean; lastSeen: string | null }> {
  const windowStart = new Date(Date.now() - DEVICE_PRESENCE_WINDOW_MS);

  const activeDevice = await db.query.userDevices.findFirst({
    where: and(
      eq(userDevices.userId, userId),
      isNull(userDevices.revokedAt),
      gte(userDevices.lastSeenAt, windowStart),
    ),
    columns: { id: true },
  });

  if (activeDevice) {
    return { online: true, lastSeen: null };
  }

  const mostRecent = await db.query.userDevices.findFirst({
    where: and(eq(userDevices.userId, userId), isNull(userDevices.revokedAt)),
    orderBy: desc(userDevices.lastSeenAt),
    columns: { lastSeenAt: true },
  });

  return {
    online: false,
    lastSeen: mostRecent?.lastSeenAt?.toISOString() ?? null,
  };
}
