import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 rounded-lg border p-4 text-sm",
  {
    variants: {
      variant: {
        info: "border-[var(--line)] bg-[var(--paper-sunken)] text-[var(--ink)]",
        success:
          "border-[var(--status-available)] bg-[color-mix(in_srgb,var(--status-available)_10%,transparent)] text-[var(--status-available-ink)]",
        warning:
          "border-[var(--status-held)] bg-[color-mix(in_srgb,var(--status-held)_10%,transparent)] text-[var(--status-held-ink)]",
        destructive:
          "border-[var(--status-booked)] bg-[color-mix(in_srgb,var(--status-booked)_10%,transparent)] text-[var(--status-booked-ink)]",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
} as const;

export function Alert({
  className,
  variant = "info",
  icon = true,
  children,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants> & { icon?: boolean }) {
  const Icon = ICONS[variant ?? "info"];
  return (
    <div
      data-slot="alert"
      // A destructive alert is an assertive announcement; the rest are polite status updates.
      role={variant === "destructive" ? "alert" : "status"}
      className={cn(alertVariants({ variant }), !icon && "grid-cols-1", className)}
      {...props}
    >
      {icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="alert-title" className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="alert-description" className={cn("text-sm opacity-90 [&_p]:leading-relaxed", className)} {...props} />
  );
}
