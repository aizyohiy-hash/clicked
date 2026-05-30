"use client";

import { useEffect, useMemo } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

export function useSocket(token: string | null) {
  const socket = useMemo<Socket | null>(() => {
    if (!token) {
      return null;
    }

    return io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
    });
  }, [token]);

  useEffect(() => {
    if (!socket) {
      return;
    }
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return socket;
}
