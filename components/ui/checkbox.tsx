"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-sm border border-[var(--line-strong)] bg-[var(--card)] shadow-xs outline-none transition-shadow",
        "data-[state=checked]:border-[var(--brand)] data-[state=checked]:bg-[var(--brand)] data-[state=checked]:text-[var(--brand-ink)]",
        "focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--brand)_35%,transparent)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3.5" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
