"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export type Step = {
  id: string;
  title: string;
  /** Short hint shown under the title on wide screens. */
  hint?: string;
};

/**
 * Horizontal progress indicator for the floor-plan wizard.
 *
 * Completed steps stay clickable so an organizer can go back and change the canvas without
 * losing placed stalls; steps ahead of the current one are disabled until their prerequisites
 * are met, which the parent decides via `furthestReachable`.
 */
export function Stepper({
  steps,
  currentId,
  furthestReachable,
  onSelect,
  className,
}: {
  steps: Step[];
  currentId: string;
  /** Index of the furthest step the user may jump to. Defaults to the current step. */
  furthestReachable?: number;
  onSelect?: (stepId: string) => void;
  className?: string;
}) {
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === currentId));
  const reachable = furthestReachable ?? currentIndex;

  return (
    <ol
      data-slot="stepper"
      className={cn("flex w-full flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0", className)}
    >
      {steps.map((step, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        const selectable = Boolean(onSelect) && index <= reachable && !active;

        return (
          <li key={step.id} className="flex flex-1 items-center gap-3 sm:flex-col sm:items-start sm:gap-0">
            <div className="flex w-full items-center gap-3">
              <button
                type="button"
                disabled={!selectable}
                onClick={selectable ? () => onSelect?.(step.id) : undefined}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular transition-colors",
                  complete && "border-[var(--status-available)] bg-[var(--status-available)] text-white",
                  active && "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]",
                  !complete && !active && "border-[var(--line-strong)] text-[var(--ink-faint)]",
                  selectable && "cursor-pointer hover:opacity-85",
                  !selectable && "cursor-default",
                )}
              >
                {complete ? <Check className="size-4" aria-hidden /> : index + 1}
                <span className="sr-only">
                  {step.title}
                  {complete ? " (completed)" : active ? " (current step)" : ""}
                </span>
              </button>
              <span
                aria-hidden
                className={cn(
                  "hidden h-px flex-1 sm:block",
                  complete ? "bg-[var(--status-available)]" : "bg-[var(--line)]",
                  index === steps.length - 1 && "sm:hidden",
                )}
              />
            </div>
            <div className="min-w-0 sm:mt-2 sm:pr-6">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  active ? "text-[var(--ink)]" : "text-[var(--ink-soft)]",
                )}
              >
                {step.title}
              </p>
              {step.hint && <p className="hidden text-xs text-[var(--ink-faint)] sm:block">{step.hint}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
