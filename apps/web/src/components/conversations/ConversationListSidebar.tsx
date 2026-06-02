"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonLoader } from "@/components/ui/SkeletonLoader";

interface Wallet {
  address?: string;
  isPrimary?: boolean;
}

interface Member {
  user?: {
    id?: string;
    username?: string | null;
    wallets?: Wallet[];
  };
}

interface Message {
  content: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  type: "dm" | "group";
  name?: string | null;
  createdAt?: string;
  members?: Member[];
  messages?: Message[];
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function relativeTime(value?: string) {
  if (!value) return "";

  const diffSeconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const units = [
    ["y", 31536000],
    ["mo", 2592000],
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
  ] as const;

  for (const [label, seconds] of units) {
    if (diffSeconds >= seconds) return `${Math.floor(diffSeconds / seconds)}${label} ago`;
  }

  return "just now";
}

function conversationTitle(conversation: Conversation, walletAddress?: string) {
  if (conversation.name) return conversation.name;

  const peer = conversation.members
    ?.flatMap((member) => member.user?.wallets ?? [])
    .find((wallet) => wallet.address && wallet.address !== walletAddress);

  return peer?.address ?? "Direct message";
}

export function ConversationListSidebar() {
  const params = useParams<{ id?: string }>();
  const { token, user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadConversations() {
      if (!token) {
        setConversations([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new Error("Unable to fetch conversations");
        }

        const data = (await response.json()) as Conversation[];
        if (!cancelled) setConversations(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load conversations");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadConversations();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const selectedId = useMemo(() => params?.id, [params]);

  return (
    <aside className="flex h-full w-full max-w-sm flex-col border-r border-[var(--border)] bg-[var(--card)]/60">
      <div className="border-b border-[var(--border)] px-4 py-5">
        <h2 className="text-lg font-semibold">Conversations</h2>
        <p className="text-sm text-[var(--foreground)]/45">Your latest chats</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? <ConversationSkeleton /> : null}
        {!isLoading && error ? <p className="p-4 text-sm text-red-300">{error}</p> : null}
        {!isLoading && !error && conversations.length === 0 ? (
          <EmptyState
            icon="💬"
            title="No conversations yet."
            description="Start a new chat to see messages here."
          />
        ) : null}

        <div className="flex flex-col gap-2">
          {conversations.map((conversation) => {
            const lastMessage = conversation.messages?.[0];
            const isSelected = selectedId === conversation.id;

            return (
              <Link
                key={conversation.id}
                href={`/app/conversations/${conversation.id}`}
                className={`rounded-2xl border p-4 transition-colors ${
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent)]/15"
                    : "border-transparent hover:border-[var(--border)] hover:bg-[var(--background)]/60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="truncate text-sm font-semibold">
                    {conversationTitle(conversation, user?.walletAddress)}
                  </h3>
                  <span className="shrink-0 text-xs text-[var(--foreground)]/35">
                    {relativeTime(lastMessage?.createdAt ?? conversation.createdAt)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-[var(--foreground)]/45">
                  {lastMessage ? truncate(lastMessage.content, 40) : "No messages yet"}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-label="Loading conversations">
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonLoader key={index} variant="card" />
      ))}
    </div>
  );
}
