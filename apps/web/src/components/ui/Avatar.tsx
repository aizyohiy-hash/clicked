"use client";

import { useMemo, useState } from "react";

const SIZE_MAP = {
  sm: 24,
  md: 36,
  lg: 48,
} as const;

type Size = keyof typeof SIZE_MAP;

function getInitials(value: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    return "?";
  }

  const parts = cleaned
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

  if (parts.length === 0) {
    return cleaned.slice(0, 2).toUpperCase();
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getColor(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 64%, 45%)`;
}

interface AvatarProps {
  src?: string;
  fallback: string;
  size: Size;
}

export function Avatar({ src, fallback, size }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const initials = useMemo(() => getInitials(fallback), [fallback]);
  const backgroundColor = useMemo(() => getColor(fallback), [fallback]);
  const dimension = SIZE_MAP[size];
  const ariaLabel = `Avatar for ${fallback}`;
  const showImage = Boolean(src && src !== failedSrc);

  const style = {
    width: dimension,
    height: dimension,
    minWidth: dimension,
    minHeight: dimension,
  } as const;

  return (
    <div
      className="relative inline-flex shrink-0 overflow-hidden rounded-full bg-[var(--border)]"
      style={style}
      aria-label={ariaLabel}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={ariaLabel}
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-semibold uppercase text-white"
          style={{ backgroundColor }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
