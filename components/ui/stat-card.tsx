import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("corner-marks p-5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular text-[var(--ink)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--ink-faint)]">{hint}</p>}
    </Card>
  );
}
