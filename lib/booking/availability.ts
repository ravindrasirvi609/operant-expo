import type { ExhibitionLifecycle } from "@/types/domain";

/**
 * Why a stall can or cannot be reserved right now.
 *
 * The public map previously had no answer to this: it disabled BOOKED and BLOCKED, quietly did
 * nothing for a stall with no inventory behind it, and let a visitor click a PENDING stall and
 * receive "Stall is not available" from the hold endpoint. Every outcome is named here so the map,
 * the detail sheet and the API all explain the same thing in the same words.
 */
export type AvailabilityReason =
  | "AVAILABLE"
  | "HELD_BY_YOU"
  | "HELD_BY_OTHER"
  | "PENDING_PAYMENT"
  | "BOOKED"
  | "BLOCKED"
  | "NOT_BOOKABLE"
  | "BOOKING_NOT_OPEN"
  | "BOOKING_CLOSED";

export type Availability = {
  /** True only when this visitor can start or continue a reservation right now. */
  bookable: boolean;
  reason: AvailabilityReason;
  /** One sentence, written for a visitor. */
  message: string;
  /** Seconds until the blocking hold lapses, when that is what is in the way. */
  availableInSeconds?: number;
};

export type StallAvailabilityInput = {
  stall: { status: string; visibility: string; basePrice: number };
  lifecycle: ExhibitionLifecycle;
  /** The live hold on this stall, if any. Expired holds must be swept before calling. */
  hold?: { visitorId?: string; expiresAt: Date } | null;
  /**
   * The non-terminal booking on this stall, if any.
   *
   * Its status matters: a CONFIRMED booking means sold, while PAYMENT_PENDING means someone is
   * partway through paying. Collapsing both to "booked" would undo the distinction PENDING exists
   * to make — and would tell a visitor a stall is gone when it may yet come back.
   */
  liveBooking?: { status: string } | null;
  /** The current visitor, so their own hold reads as resumable rather than taken. */
  visitorId?: string;
  now: Date;
};

const MESSAGES: Record<AvailabilityReason, string> = {
  AVAILABLE: "Available to reserve.",
  HELD_BY_YOU: "You are reserving this stall. Continue to finish your booking.",
  HELD_BY_OTHER: "Someone else is completing their booking for this stall.",
  PENDING_PAYMENT: "Reserved while payment is confirmed.",
  BOOKED: "Already booked.",
  BLOCKED: "Not available for booking.",
  NOT_BOOKABLE: "This space is not bookable.",
  BOOKING_NOT_OPEN: "Booking has not opened for this exhibition yet.",
  BOOKING_CLOSED: "Booking has closed for this exhibition.",
};

function result(reason: AvailabilityReason, extra: Partial<Availability> = {}): Availability {
  return { bookable: reason === "AVAILABLE" || reason === "HELD_BY_YOU", reason, message: MESSAGES[reason], ...extra };
}

/** True when the exhibition's lifecycle permits new reservations at all. */
export function isBookingOpen(lifecycle: ExhibitionLifecycle) {
  return lifecycle === "BOOKING_OPEN";
}

/**
 * The single answer to "can this visitor reserve this stall".
 *
 * Deliberately pure: the map, the stall sheet, the hold endpoint and the booking endpoint all reach
 * the same verdict from the same inputs, so the reason a visitor is shown is the reason the API
 * will give. Order matters — a stall the visitor already holds must read as resumable even though
 * its stored status is HELD, and a closed exhibition must be reported as closed rather than as
 * whatever the individual stall happens to say.
 */
export function resolveAvailability({
  stall,
  lifecycle,
  hold,
  liveBooking = null,
  visitorId,
  now,
}: StallAvailabilityInput): Availability {
  if (stall.visibility !== "PUBLIC") return result("NOT_BOOKABLE");
  if (stall.status === "BLOCKED") return result("BLOCKED");

  if (liveBooking) {
    return result(liveBooking.status === "CONFIRMED" ? "BOOKED" : "PENDING_PAYMENT");
  }
  if (stall.status === "BOOKED") return result("BOOKED");

  const liveHold = hold && hold.expiresAt.getTime() > now.getTime() ? hold : null;
  const heldByVisitor = Boolean(liveHold && visitorId && liveHold.visitorId === visitorId);

  // A visitor returning to their own reservation is the case the old flow could not express: it
  // required status AVAILABLE, so reloading the booking page locked the visitor out of the stall
  // they were already holding for the rest of the 15 minutes.
  if (heldByVisitor) {
    return result("HELD_BY_YOU", {
      availableInSeconds: Math.max(0, Math.ceil((liveHold!.expiresAt.getTime() - now.getTime()) / 1000)),
    });
  }

  if (!isBookingOpen(lifecycle)) {
    return result(lifecycle === "BOOKING_CLOSED" ? "BOOKING_CLOSED" : "BOOKING_NOT_OPEN");
  }

  if (liveHold) {
    return result("HELD_BY_OTHER", {
      availableInSeconds: Math.max(0, Math.ceil((liveHold.expiresAt.getTime() - now.getTime()) / 1000)),
    });
  }

  if (stall.status === "PENDING") return result("PENDING_PAYMENT");
  if (stall.status === "HELD") {
    // Stored HELD with no live hold left is a stall the sweep has not caught up with yet. Treating
    // it as available is correct — the unique index is what actually prevents a double hold.
    return result("AVAILABLE");
  }
  if (stall.status !== "AVAILABLE") return result("NOT_BOOKABLE");

  return result("AVAILABLE");
}

/** Human phrasing for "try again in …", used by the map and the stall sheet. */
export function formatWaitHint(availableInSeconds?: number) {
  if (!availableInSeconds) return undefined;
  const minutes = Math.ceil(availableInSeconds / 60);
  return minutes <= 1 ? "Try again in about a minute." : `Try again in about ${minutes} minutes.`;
}
