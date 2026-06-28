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

const PRESENCE_TTL = 60; // seconds

function presenceKey(userId: string): string {
  return `presence:${userId}`;
}

export async function setOnline(redis: Redis, userId: string, socketId: string): Promise<boolean> {
  const key = presenceKey(userId);
  const debounceKey = `presence_debounce:${userId}`;

  const count = await redis.scard(key);
  await redis.sadd(key, socketId);
  await redis.expire(key, PRESENCE_TTL);

  if (count === 0) {
    const debouncing = await redis.del(debounceKey);
    if (debouncing === 1) {
      return false; // Flap detected, don't broadcast online
    }
    return true; // First socket connected
  }
  return false;
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

export async function setOffline(redis: Redis, userId: string, socketId: string): Promise<boolean> {
  const key = presenceKey(userId);
  const debounceKey = `presence_debounce:${userId}`;

  await redis.srem(key, socketId);
  const remaining = await redis.scard(key);
  if (remaining === 0) {
    await redis.del(key);
    await redis.set(debounceKey, '1', 'EX', 3);
    return true;
  }
  return false;
}

/**
 * Check if a user is currently online.
 */
export async function isOnline(redis: Redis, userId: string): Promise<boolean> {
  const key = presenceKey(userId);
  const count = await redis.scard(key);
  return count > 0;
}
