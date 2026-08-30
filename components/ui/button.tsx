import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--brand)] text-[var(--brand-ink)] font-semibold shadow-sm hover:bg-[color-mix(in_srgb,var(--brand)_88%,var(--ink))]",
        secondary:
          "bg-[var(--paper-sunken)] text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--paper-sunken)_80%,var(--ink))]",
        outline:
          "border border-[var(--line-strong)] bg-transparent text-[var(--ink)] hover:bg-[var(--paper-sunken)]",
        ghost: "text-[var(--ink)] hover:bg-[var(--paper-sunken)]",
        destructive:
          "border border-[var(--status-booked)] bg-transparent text-[var(--status-booked-ink)] hover:bg-[color-mix(in_srgb,var(--status-booked)_12%,transparent)]",
        solidDestructive:
          "bg-[var(--status-booked)] text-white font-semibold shadow-sm hover:bg-[color-mix(in_srgb,var(--status-booked)_88%,black)]",
        ink: "bg-[var(--ink)] text-[var(--paper)] font-semibold shadow-sm hover:bg-[color-mix(in_srgb,var(--ink)_88%,var(--paper))]",
        link: "text-[var(--brand-quiet)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
        iconSm: "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /**
     * Shows a spinner and disables the button. Kept as a first-class prop because every
     * mutation in this app needs it, and hand-rolling it per call site is how you end up with
     * buttons that stay clickable during a request and double-submit a booking.
     */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Component>
  );
}

export { buttonVariants };
