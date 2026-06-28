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
 * - GET /users/:id/presence → { online: boolean }
 */
import type { Redis } from 'ioredis';

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
