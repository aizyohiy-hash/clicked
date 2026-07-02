'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

interface Sender {
  id: string;
  username: string | null;
  avatarUrl: string | null;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender: Sender;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={32}
        height={32}
        className="h-8 w-8 rounded-full object-cover flex-shrink-0"
      />
    );
  }
  return (
    <div className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold bg-[var(--accent)] text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();

  // TODO: replace with real auth token from your auth context/store
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  // TODO: replace with real current user id from your auth context/store
  const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

  const socket = useSocket(token);
  const [messages, setMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom only when user is already near the bottom
  const scrollToBottom = useCallback((force = false) => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (force || atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.emit('join_room', { conversationId: id });
    socket.emit('message_history', { conversationId: id });

    socket.on('message_history', (data: { conversationId: string; messages: Message[] }) => {
      if (data.conversationId === id) {
        setMessages(data.messages);
        // Force scroll on initial load
        setTimeout(() => scrollToBottom(true), 50);
      }
    });

    socket.on('new_message', (msg: Message) => {
      if (msg.conversationId === id) {
        setMessages((prev) => [...prev, msg]);
        scrollToBottom();
      }
    });

    return () => {
      socket.off('message_history');
      socket.off('new_message');
    };
  }, [socket, id, scrollToBottom]);

  // ── Group messages by day ──────────────────────────────────────────────────
  const grouped: { label: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const key = dayKey(msg.createdAt);
    const last = grouped[grouped.length - 1];
    if (last && dayKey(last.messages[0].createdAt) === key) {
      last.messages.push(msg);
    } else {
      grouped.push({ label: formatDateLabel(msg.createdAt), messages: [msg] });
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-[var(--border)] px-4 py-3 bg-[var(--card)]">
        <h1 className="text-sm font-semibold text-[var(--foreground)]">Conversation</h1>
      </header>

      {/* Message thread */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {grouped.map((group) => (
          <div key={group.label}>
            {/* Date separator */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-xs text-[var(--muted)] font-medium px-2">{group.label}</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            <div className="space-y-3">
              {group.messages.map((msg) => {
                const isSelf = msg.senderId === currentUserId;
                const name = msg.sender.username ?? 'Unknown';

                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {!isSelf && <Avatar src={msg.sender.avatarUrl} name={name} />}

                    <div
                      className={`flex flex-col max-w-[70%] ${isSelf ? 'items-end' : 'items-start'}`}
                    >
                      {!isSelf && (
                        <span className="text-xs text-[var(--muted)] mb-1 px-1">{name}</span>
                      )}
                      <div
                        className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                          isSelf
                            ? 'bg-[var(--accent)] text-white rounded-br-sm'
                            : 'bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-bl-sm'
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-[var(--muted)] mt-1 px-1">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>

                    {isSelf && <Avatar src={msg.sender.avatarUrl} name={name} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
