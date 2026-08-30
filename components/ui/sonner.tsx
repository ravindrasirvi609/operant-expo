"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

/**
 * App-wide toast host. Mounted once in the root layout.
 *
 * Every mutation in the app reports through this instead of the ad-hoc inline paragraphs it
 * replaces — those were inconsistent between screens and several were never cleared, so a stale
 * "Stall A-12 updated." could sit on screen through three later failures.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-lg !border !border-[var(--line)] !bg-[var(--card)] !text-[var(--ink)] !shadow-lg !font-sans",
          title: "!font-medium !text-[var(--ink)]",
          description: "!text-[var(--ink-soft)]",
          actionButton: "!bg-[var(--brand)] !text-[var(--brand-ink)] !font-semibold",
          cancelButton: "!bg-[var(--paper-sunken)] !text-[var(--ink)]",
          closeButton: "!bg-[var(--card)] !border-[var(--line)] !text-[var(--ink-soft)]",
          success: "!border-[var(--status-available)]",
          error: "!border-[var(--status-booked)]",
          warning: "!border-[var(--status-held)]",
          info: "!border-[var(--line-strong)]",
        },
      }}
    />
  );
}
