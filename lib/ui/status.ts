/**
 * One table describing every status the app displays — stall, booking, hold and exhibition
 * lifecycle — with its colour, its human label and, where it matters, why a visitor can't act
 * on it.
 *
 * Colour, label and meaning were previously spread across a badge component, the map viewer's
 * own legend array and ad-hoc strings in each screen. They disagreed: PENDING shared BOOKED's
 * red and was missing from the legend entirely, so a stall someone was mid-payment on looked
 * identical to a sold one with no explanation offered.
 */
export type StatusTone = "available" | "held" | "pending" | "booked" | "blocked" | "neutral";

export type StatusMeta = {
  tone: StatusTone;
  label: string;
  /** Shown to visitors on the public map. Absent for organizer-only statuses. */
  publicHint?: string;
};

const TONE_VARS: Record<StatusTone, { fill: string; ink: string }> = {
  available: { fill: "var(--status-available)", ink: "var(--status-available-ink)" },
  held: { fill: "var(--status-held)", ink: "var(--status-held-ink)" },
  pending: { fill: "var(--status-pending)", ink: "var(--status-pending-ink)" },
  booked: { fill: "var(--status-booked)", ink: "var(--status-booked-ink)" },
  blocked: { fill: "var(--status-blocked)", ink: "var(--status-blocked-ink)" },
  neutral: { fill: "var(--ink-faint)", ink: "var(--ink-soft)" },
};

const STATUS_META: Record<string, StatusMeta> = {
  // Stall availability
  AVAILABLE: { tone: "available", label: "Available", publicHint: "Ready to reserve." },
  HELD: {
    tone: "held",
    label: "Held",
    publicHint: "Someone is completing their booking. Check back in a few minutes.",
  },
  PENDING: {
    tone: "pending",
    label: "Payment pending",
    publicHint: "Reserved while payment is confirmed.",
  },
  BOOKED: { tone: "booked", label: "Booked", publicHint: "Already taken." },
  BLOCKED: { tone: "blocked", label: "Blocked", publicHint: "Not available for booking." },

  // Booking lifecycle
  PAYMENT_PENDING: { tone: "pending", label: "Payment pending" },
  CONFIRMED: { tone: "available", label: "Confirmed" },
  BOOKING_REQUEST: { tone: "held", label: "Requested" },
  CANCELLED: { tone: "blocked", label: "Cancelled" },
  EXPIRED: { tone: "blocked", label: "Expired" },
  REFUND_PENDING: { tone: "held", label: "Refund pending" },
  REFUNDED: { tone: "blocked", label: "Refunded" },
  RELEASED: { tone: "blocked", label: "Released" },

  // Exhibition lifecycle
  DRAFT: { tone: "neutral", label: "Draft" },
  SETUP: { tone: "held", label: "Setup" },
  PUBLISHED: { tone: "pending", label: "Published" },
  BOOKING_OPEN: { tone: "available", label: "Booking open" },
  BOOKING_CLOSED: { tone: "blocked", label: "Booking closed" },
  COMPLETED: { tone: "neutral", label: "Completed" },
  ARCHIVED: { tone: "neutral", label: "Archived" },

  // Floor-plan status
  ACTIVE: { tone: "available", label: "Active" },
  INACTIVE: { tone: "blocked", label: "Inactive" },
};

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { tone: "neutral", label: status.replace(/_/g, " ").toLowerCase() };
}

/** Marker/fill colour for a status — used for map rectangles, dots and legend swatches. */
export function statusColor(status: string) {
  return TONE_VARS[statusMeta(status).tone].fill;
}

/** Text colour for a status, contrast-corrected for use on paper backgrounds. */
export function statusInk(status: string) {
  return TONE_VARS[statusMeta(status).tone].ink;
}

export function statusLabel(status: string) {
  return statusMeta(status).label;
}

/** The statuses a public map legend explains, in the order a visitor cares about them. */
export const PUBLIC_LEGEND_STATUSES = ["AVAILABLE", "HELD", "PENDING", "BOOKED", "BLOCKED"] as const;
