import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The screen a user sees before they have any data — which, for a new organizer, is most
 * screens. Each one names the thing that's missing and offers the single action that fixes it,
 * rather than the bare "No stalls configured." sentences these replaced.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span className="flex size-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--paper-sunken)]">
          <Icon className="size-5 text-[var(--ink-soft)]" />
        </span>
      )}
      <div className="space-y-1">
        <p className="font-display text-base font-semibold text-[var(--ink)]">{title}</p>
        {description && <p className="mx-auto max-w-md text-sm text-[var(--ink-soft)]">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
