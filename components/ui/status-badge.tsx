import { cn } from "@/lib/utils";
import { statusColor, statusInk, statusLabel } from "@/lib/ui/status";

/**
 * Status pill used across the dashboard, the map legend and the public stall list.
 *
 * The dot carries the fill colour and the text carries the contrast-corrected ink colour, so a
 * label like "Payment pending" stays legible on paper instead of being rendered in the same
 * light amber as its own marker.
 */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const fill = statusColor(status);
  const ink = statusInk(status);

  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap",
        className,
      )}
      style={{
        borderColor: fill,
        color: ink,
        backgroundColor: `color-mix(in srgb, ${fill} 12%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: fill }} aria-hidden />
      {label ?? statusLabel(status)}
    </span>
  );
}

/** Re-exported so existing imports of `statusColor` from this module keep working. */
export { statusColor, statusInk, statusLabel } from "@/lib/ui/status";
