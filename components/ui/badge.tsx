import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] text-[var(--brand-quiet)]",
        outline: "border-[var(--line-strong)] text-[var(--ink-soft)]",
        muted: "border-transparent bg-[var(--paper-sunken)] text-[var(--ink-soft)]",
        ink: "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "span";
  return <Component data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
