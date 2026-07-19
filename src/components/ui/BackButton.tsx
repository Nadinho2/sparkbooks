"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  label?: string;
  className?: string;
}

export function BackButton({ label = "Back", className = "" }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className={`inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors ${className}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 13L5 8l5-5" />
      </svg>
      {label}
    </button>
  );
}
