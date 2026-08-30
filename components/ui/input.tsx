import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-[var(--line-strong)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--ink)] shadow-xs transition-[color,box-shadow] outline-none",
        "placeholder:text-[var(--ink-faint)]",
        "file:mr-3 file:inline-flex file:h-7 file:cursor-pointer file:rounded file:border-0 file:bg-[var(--paper-sunken)] file:px-3 file:text-xs file:font-medium file:text-[var(--ink)]",
        "focus-visible:border-[var(--brand)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--brand)_35%,transparent)]",
        "aria-invalid:border-[var(--status-booked)] aria-invalid:ring-2 aria-invalid:ring-[color-mix(in_srgb,var(--status-booked)_25%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
