/**
 * Online presence tracking.
 *
 * Stores a Redis hash for each user with deviceId → lastSeen values. Each
 * device also has a small per-device key with its own TTL so heartbeat timeouts
 * can remove that device entry without forcing the whole user offline.
 *
 * - On connect: upsert device entry in `presence:user:{userId}` and refresh TTL
 * - On heartbeat: update lastSeen and refresh the device TTL
 * - On disconnect/timeout: remove that device entry; if none remain → user offline
 * - GET /users/:id/presence → { online: boolean }
 */
import type { Redis } from 'ioredis';

const PRESENCE_TTL = 90; // seconds

function presenceHashKey(userId: string): string {
  return `presence:user:${userId}`;
}

function presenceDeviceKey(userId: string, deviceId: string): string {
  return `presence:user:${userId}:device:${deviceId}`;
}

/**
 * Register a device connection for a user. Adds or updates the device entry and
 * sets/refreshes the per-device TTL.
 */
export async function setOnline(
  redis: Redis,
  userId: string,
  deviceId: string,
  lastSeen = String(Date.now()),
): Promise<boolean> {
  const hashKey = presenceHashKey(userId);
  const deviceKey = presenceDeviceKey(userId, deviceId);
  const wasOnline = (await redis.hlen(hashKey)) > 0;

  await redis.hset(hashKey, { [deviceId]: lastSeen });
  await redis.hset(deviceKey, { lastSeen });
  await redis.expire(deviceKey, PRESENCE_TTL);

  return !wasOnline;
}

/**
 * Refresh the presence timestamp and TTL for a specific device (called on heartbeat).
 */
export async function refreshPresence(
  redis: Redis,
  userId: string,
  deviceId: string,
  lastSeen = String(Date.now()),
): Promise<void> {
  const hashKey = presenceHashKey(userId);
  const deviceKey = presenceDeviceKey(userId, deviceId);

  await redis.hset(hashKey, { [deviceId]: lastSeen });
  await redis.hset(deviceKey, { lastSeen });
  await redis.expire(deviceKey, PRESENCE_TTL);
}

/**
 * Remove a device connection from the user's presence hash.
 * Returns true if the user has gone fully offline (no remaining devices).
 */
export async function setOffline(redis: Redis, userId: string, deviceId: string): Promise<boolean> {
  const hashKey = presenceHashKey(userId);
  const deviceKey = presenceDeviceKey(userId, deviceId);

  await redis.hdel(hashKey, deviceId);
  await redis.del(deviceKey);

  const remaining = await redis.hlen(hashKey);
  if (remaining === 0) {
    await redis.del(hashKey);
    return true;
  }
  return false;
}

/**
 * Forcefully mark a device offline and remove it from the per-user hash.
 * Used when a heartbeat timeout or device revocation occurs.
 */
export async function markDeviceOffline(
  redis: Redis,
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const hashKey = presenceHashKey(userId);
  const deviceKey = presenceDeviceKey(userId, deviceId);

  await redis.hdel(hashKey, deviceId);
  await redis.del(deviceKey);

  const remaining = await redis.hlen(hashKey);
  if (remaining === 0) {
    await redis.del(hashKey);
    return true;
  }
  return false;
}

/**
 * Check if a user is currently online.
 */
export async function isOnline(redis: Redis, userId: string): Promise<boolean> {
  const key = presenceHashKey(userId);
  const count = await redis.hlen(key);
  return count > 0;
}
