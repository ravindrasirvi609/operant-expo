import * as React from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-[var(--line-strong)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--ink)] shadow-xs transition-[color,box-shadow] outline-none",
        "placeholder:text-[var(--ink-faint)]",
        "focus-visible:border-[var(--brand)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--brand)_35%,transparent)]",
        "aria-invalid:border-[var(--status-booked)] aria-invalid:ring-2 aria-invalid:ring-[color-mix(in_srgb,var(--status-booked)_25%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
