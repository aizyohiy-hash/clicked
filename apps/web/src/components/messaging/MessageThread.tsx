"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import type { ChatMessage } from "@/hooks/useMessageHistory";

export interface MessageThreadProps {
  /**
   * Messages in oldest-first order. The component renders them top-to-bottom
   * and treats prepended items (lower index than before) as "older messages".
   */
  messages: ChatMessage[];
  /**
   * True while the older-messages fetch is in flight. Drives the top spinner.
   */
  loadingOlder: boolean;
  /**
   * `true` when the server returned an empty page, meaning the user has
   * scrolled all the way to the start of the thread.
   */
  hasReachedStart: boolean;
  /**
   * Called when the user scrolls to (or near) the top of the list. The
   * caller is expected to dispatch a `message_history` socket event with
   * the oldest visible message id as the `before` cursor. The component
   * debounces by only calling once per "near-top" entry — it will not
   * fire again until the user scrolls down and back up.
   */
  onLoadOlder: () => void;
  /**
   * How many pixels from the top of the scroll container counts as
   * "near the top". Defaults to 120, which works well for both desktop
   * and mobile thumbs.
   */
  triggerDistance?: number;
  /**
   * Render override for a single message row. Defaults to a minimal
   * `<div>` that prints sender + content + relative timestamp.
   */
  renderMessage?: (message: ChatMessage) => React.ReactNode;
}

/**
 * Issue #32 — message thread with top-anchored infinite scroll.
 *
 * The interesting work happens in two places:
 *
 * - `onScroll` watches `scrollTop` against `triggerDistance`. The first
 *   time it crosses the threshold we call `onLoadOlder` and arm a guard
 *   so we don't double-fire on every pixel of scroll. The guard is
 *   released the moment `loadingOlder` flips back to `false` after the
 *   user scrolls *down* (away from the trigger band) — that combination
 *   matches the "scrolled to top once, then again" UX.
 *
 * - The `useLayoutEffect` captures `scrollHeight` *before* the DOM
 *   commit and, after the prepend, restores `scrollTop` so the user
 *   stays anchored on the same message instead of being yanked to the
 *   top. This is the canonical fix for scroll jumps on prepend.
 *
 * No external dependency. Pair with `useMessageHistory` (or anything
 * that vends `messages` + `loadingOlder` + `hasReachedStart`) to wire
 * to the backend's `message_history` socket event.
 */
export function MessageThread({
  messages,
  loadingOlder,
  hasReachedStart,
  onLoadOlder,
  triggerDistance = 120,
  renderMessage,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousHeightRef = useRef<number | null>(null);
  const previousFirstIdRef = useRef<string | null>(null);
  const triggeredRef = useRef(false);

  // Capture scroll metrics BEFORE the next paint so we can restore scrollTop
  // after older messages are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const firstId = messages[0]?.id ?? null;
    const previousFirstId = previousFirstIdRef.current;
    const previousHeight = previousHeightRef.current;

    // Only adjust on a real prepend: a different head-of-list id AND we
    // had a prior height to compare against.
    if (
      previousFirstId !== null &&
      firstId !== null &&
      previousFirstId !== firstId &&
      previousHeight !== null
    ) {
      const delta = el.scrollHeight - previousHeight;
      if (delta > 0) {
        el.scrollTop = el.scrollTop + delta;
      }
    }

    previousHeightRef.current = el.scrollHeight;
    previousFirstIdRef.current = firstId;
  }, [messages]);

  // Re-arm the load-older trigger when the user scrolls back down.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleScroll() {
      if (!el) return;
      const nearTop = el.scrollTop <= triggerDistance;
      if (!nearTop) {
        triggeredRef.current = false;
        return;
      }
      if (triggeredRef.current || loadingOlder || hasReachedStart) return;
      triggeredRef.current = true;
      onLoadOlder();
    }
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [triggerDistance, loadingOlder, hasReachedStart, onLoadOlder]);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      className="flex h-full flex-col gap-2 overflow-y-auto px-4 py-3"
    >
      {/* Top indicators: spinner while loading, "no more messages" once we hit the start. */}
      <div className="flex flex-col items-center gap-1 py-2 text-xs text-gray-500">
        {loadingOlder ? (
          <span
            role="status"
            aria-label="Loading older messages"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
          />
        ) : hasReachedStart ? (
          <span>No more messages</span>
        ) : null}
      </div>

      {messages.map((message) =>
        renderMessage ? (
          <div key={message.id}>{renderMessage(message)}</div>
        ) : (
          <DefaultMessageRow key={message.id} message={message} />
        ),
      )}
    </div>
  );
}

function DefaultMessageRow({ message }: { message: ChatMessage }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
      <div className="text-xs font-semibold text-gray-700">{message.senderId}</div>
      <div className="text-gray-900">{message.content}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">
        {new Date(message.createdAt).toLocaleString()}
      </div>
    </div>
  );
}
