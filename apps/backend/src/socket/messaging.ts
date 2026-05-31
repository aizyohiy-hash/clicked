import type { Server } from 'socket.io';
import { and, eq, lt, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { conversations, conversationMembers, messages } from '../db/schema.js';
import type { AuthSocket } from '../middleware/socketAuth.js';
import { redis, convCacheKey } from '../lib/redis.js';

const PAGE_SIZE = 30;

export function registerMessagingHandlers(io: Server, socket: AuthSocket): void {
  const userId = socket.auth!.userId;

  // ── join_room ──────────────────────────────────────────────────────────────
  // Payload: { conversationId: string }
  // Guards that the caller is a member before subscribing them to the room.
  socket.on('join_room', async (payload: { conversationId: string }) => {
    const { conversationId } = payload;

    const membership = await db.query.conversationMembers.findFirst({
      where: and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    });

    if (!membership) {
      socket.emit('error', { event: 'join_room', message: 'Not a member of this conversation' });
      return;
    }

    await socket.join(conversationId);
    socket.emit('room_joined', { conversationId });
  });

  // ── send_message ───────────────────────────────────────────────────────────
  // Payload: { conversationId: string; content: string }
  // Persists the message and broadcasts it to all room members.
  socket.on('send_message', async (payload: { conversationId: string; content: string }) => {
    const { conversationId, content } = payload;

    if (!content?.trim()) {
      socket.emit('error', { event: 'send_message', message: 'Content must not be empty' });
      return;
    }

    const membership = await db.query.conversationMembers.findFirst({
      where: and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    });

    if (!membership) {
      socket.emit('error', { event: 'send_message', message: 'Not a member of this conversation' });
      return;
    }

    const [message] = await db
      .insert(messages)
      .values({ conversationId, senderId: userId, content: content.trim() })
      .returning();

    io.to(conversationId).emit('new_message', message);

    // Invalidate conversation-list cache for all members so next fetch is fresh
    if (redis) {
      const members = await db.query.conversationMembers.findMany({
        where: eq(conversationMembers.conversationId, conversationId),
      });
      await Promise.allSettled(members.map((m) => redis!.del(convCacheKey(m.userId))));
    }
  });

  // ── message_history ────────────────────────────────────────────────────────
  // Payload: { conversationId: string; before?: string } (before = message id cursor)
  // Returns the last PAGE_SIZE messages, optionally before a cursor for pagination.
  socket.on('message_history', async (payload: { conversationId: string; before?: string }) => {
    const { conversationId, before } = payload;

    const membership = await db.query.conversationMembers.findFirst({
      where: and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId),
      ),
    });

    if (!membership) {
      socket.emit('error', {
        event: 'message_history',
        message: 'Not a member of this conversation',
      });
      return;
    }

    let cursor: Date | undefined;
    if (before) {
      const ref = await db.query.messages.findFirst({
        where: eq(messages.id, before),
      });
      cursor = ref?.createdAt;
    }

    const history = await db.query.messages.findMany({
      where: cursor
        ? and(eq(messages.conversationId, conversationId), lt(messages.createdAt, cursor))
        : eq(messages.conversationId, conversationId),
      orderBy: desc(messages.createdAt),
      limit: PAGE_SIZE,
      with: { sender: { columns: { id: true, username: true, avatarUrl: true } } },
    });

    socket.emit('message_history', { conversationId, messages: history.reverse() });
  });

  // ── message_read ───────────────────────────────────────────────────────────
  // Payload: { conversationId: string; lastReadMessageId: string }
  // Persists the caller's read position and broadcasts to the room.
  socket.on(
    'message_read',
    async (payload: { conversationId: string; lastReadMessageId: string }) => {
      const { conversationId, lastReadMessageId } = payload;

      const membership = await db.query.conversationMembers.findFirst({
        where: and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
        ),
      });

      if (!membership) {
        socket.emit('error', { event: 'message_read', message: 'Not a member of this conversation' });
        return;
      }

      // Ensure message exists in this conversation (prevents spoofed reads)
      const message = await db.query.messages.findFirst({
        where: and(
          eq(messages.id, lastReadMessageId),
          eq(messages.conversationId, conversationId),
        ),
      });

      if (!message) {
        socket.emit('error', { event: 'message_read', message: 'Message not found in conversation' });
        return;
      }

      await db
        .update(conversationMembers)
        .set({ lastReadMessageId })
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.userId, userId),
          ),
        );

      io.to(conversationId).emit('read_receipt', { userId, lastReadMessageId });
    },
  );

  // ── create_conversation ────────────────────────────────────────────────────
  // Payload: { type: 'dm'|'group'; name?: string; memberIds: string[] }
  // Creates a conversation and adds all members (including caller).
  socket.on(
    'create_conversation',
    async (payload: { type: 'dm' | 'group'; name?: string; memberIds: string[] }) => {
      const { type, name, memberIds } = payload;

      const allMembers = Array.from(new Set([userId, ...memberIds]));

      const [conversation] = await db.insert(conversations).values({ type, name }).returning();

      if (!conversation) {
        socket.emit('error', {
          event: 'create_conversation',
          message: 'Failed to create conversation',
        });
        return;
      }

      await db
        .insert(conversationMembers)
        .values(allMembers.map((uid) => ({ conversationId: conversation.id, userId: uid })));

      socket.emit('conversation_created', conversation);

      // Invalidate conversation-list cache for all new members
      if (redis) {
        await Promise.allSettled(allMembers.map((uid) => redis!.del(convCacheKey(uid))));
      }
    },
  );
}
