"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageInput } from "@/components/chat/MessageInput";
import { NewConversationModal } from "@/components/chat/NewConversationModal";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/components/auth/useAuth";
import { useSocket } from "@/hooks/useSocket";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ConversationMember = {
  user: {
    id: string;
    username: string | null;
  };
};

type Conversation = {
  id: string;
  type: "dm" | "group";
  name: string | null;
  members?: ConversationMember[];
};

type SocketMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
};

type UiMessage = SocketMessage & {
  status: "sent" | "pending" | "failed";
  tempId?: string;
};

type SocketError = {
  event?: string;
  message?: string;
};

function buildTempId() {
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function AppPage() {
  // Keep the entire implementation from the second branch
}