import { Router } from 'express';
import type { IRouter } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { conversationMembers, messages } from '../db/schema.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { redis, CONV_CACHE_TTL, convCacheKey } from '../lib/redis.js';

export const conversationsRouter: IRouter = Router();

conversationsRouter.use(requireAuth);

const SEARCH_RESULT_LIMIT = 20;

// List all conversations the authenticated user belongs to
conversationsRouter.get('/', async (req: AuthRequest, res) => {
  const userId = req.auth!.userId;
  const key = convCacheKey(userId);

  // Cache read — skip on cache miss or Redis unavailable
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        res.json(JSON.parse(cached) as unknown);
        return;
      }
    } catch {
      // Fall through to DB on Redis error
    }
  }

  const memberships = await db.query.conversationMembers.findMany({
    where: eq(conversationMembers.userId, userId),
    with: {
      conversation: {
        with: {
          members: {
            with: {
              user: {
                columns: { id: true, username: true, avatarUrl: true },
                with: { wallets: { columns: { address: true, isPrimary: true } } },
              },
            },
          },
          messages: {
            orderBy: desc(messages.createdAt),
            limit: 1,
            with: { sender: { columns: { id: true, username: true, avatarUrl: true } } },
          },
        },
      },
    },
  });

  const result = memberships.map((m) => m.conversation);

  // Cache write with 30-second TTL
  if (redis) {
    try {
      await redis.setex(key, CONV_CACHE_TTL, JSON.stringify(result));
    } catch {
      // Ignore — response is already computed
    }
  }

  res.json(result);
});

conversationsRouter.get('/:id/search', async (req: AuthRequest, res) => {
  const userId = req.auth!.userId;
  const conversationId = req.params['id'] as string | undefined;
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (!conversationId) {
    res.status(400).json({ error: 'Conversation id is required' });
    return;
  }

  if (!query) {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  const membership = await db.query.conversationMembers.findFirst({
    where: and(
      eq(conversationMembers.conversationId, conversationId),
      eq(conversationMembers.userId, userId),
    ),
  });

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this conversation' });
    return;
  }

  const results = await db.execute<{
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    createdAt: Date;
    snippet: string;
    rank: string;
  }>(sql`
    WITH search_query AS (
      SELECT websearch_to_tsquery('english', ${query}) AS query
    )
    SELECT
      ${messages.id} AS "id",
      ${messages.conversationId} AS "conversationId",
      ${messages.senderId} AS "senderId",
      ${messages.content} AS "content",
      ${messages.createdAt} AS "createdAt",
      ts_headline(
        'english',
        ${messages.content},
        search_query.query,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=8, ShortWord=3, HighlightAll=false'
      ) AS "snippet",
      ts_rank_cd(to_tsvector('english', ${messages.content}), search_query.query) AS "rank"
    FROM ${messages}, search_query
    WHERE ${messages.conversationId} = ${conversationId}
      AND search_query.query @@ to_tsvector('english', ${messages.content})
    ORDER BY "rank" DESC, ${messages.createdAt} DESC
    LIMIT ${SEARCH_RESULT_LIMIT}
  `);

  res.json({ results });
});
