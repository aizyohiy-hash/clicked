"use client";

import { useMemo, useRef, useState } from "react";

const MAX_CHARS = 2000;
const SOFT_COUNT_THRESHOLD = 1800;
const MAX_LINES = 4;
const LINE_HEIGHT = 24;

type MessageInputProps = {
  disabled: boolean;
  isSending: boolean;
  onSend: (message: string) => Promise<void>;
};

export function MessageInput({ disabled, isSending, onSend }: MessageInputProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const showCharacterCount = value.length > SOFT_COUNT_THRESHOLD;
  const remainingChars = MAX_CHARS - value.length;

  const hasReachedMaxLines = useMemo(() => {
    const lines = value.split("\n").length;
    return lines >= MAX_LINES;
  }, [value]);

  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, LINE_HEIGHT * MAX_LINES)}px`;
  };

  const handleChange = (nextValue: string) => {
    if (nextValue.length > MAX_CHARS) {
      return;
    }
    setValue(nextValue);
    setError(null);
    requestAnimationFrame(resizeTextarea);
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isSending) {
      return;
    }

    setError(null);

    try {
      await onSend(trimmed);
      setValue("");
      requestAnimationFrame(resizeTextarea);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Failed to send message");
    }
  };

  return (
    <div className="rounded-2xl border border-[#0F172A]/10 bg-white p-3">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        disabled={disabled || isSending}
        placeholder="Type your message…"
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
            return;
          }

          if (event.key === "Enter" && event.shiftKey && hasReachedMaxLines) {
            event.preventDefault();
          }
        }}
        className="max-h-24 min-h-6 w-full resize-none bg-transparent text-sm text-[#0F172A] outline-none placeholder:text-[#64748B] disabled:cursor-not-allowed disabled:opacity-70"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-xs text-[#64748B]">
          {showCharacterCount ? (
            <span className={remainingChars < 0 ? "text-red-600" : undefined}>
              {value.length}/{MAX_CHARS}
            </span>
          ) : null}
          {error ? <span className="ml-2 text-red-600">{error}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || isSending || !value.trim()}
          className="inline-flex items-center gap-2 rounded-full bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1E293B] disabled:cursor-not-allowed disabled:bg-[#94A3B8]"
        >
          {isSending ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
