const STATUS_COLOR_VAR: Record<string, string> = {
  AVAILABLE: "var(--available)",
  HELD: "var(--held)",
  BOOKED: "var(--booked)",
  BLOCKED: "var(--blocked)",
  PENDING: "var(--pending)",
  PAYMENT_PENDING: "var(--pending)",
  CONFIRMED: "var(--available)",
  CANCELLED: "var(--blocked)",
  EXPIRED: "var(--blocked)",
  REFUND_PENDING: "var(--held)",
  REFUNDED: "var(--blocked)",
};

/** Single source of truth for stall/booking/hold status colors — used by StatusBadge itself,
 * the map viewer, the map editor, and the public legend, so a color always means the same thing. */
export function statusColor(status: string) {
  return STATUS_COLOR_VAR[status] ?? "var(--ink-faint)";
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tabular"
      style={{ borderColor: color, color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {(label ?? status).replace(/_/g, " ")}
    </span>
  );
}
