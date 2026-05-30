"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./AuthContext";

const TOKEN_STORAGE_KEY = "clicked_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    const frameId = window.requestAnimationFrame(() => {
      if (storedToken) {
        setTokenState(storedToken);
      }

      setLoading(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  const setToken = useCallback((nextToken: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
    }

    setTokenState(nextToken);
  }, []);

  const clearToken = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }

    setTokenState(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      loading,
      setToken,
      clearToken,
    }),
    [clearToken, loading, setToken, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
