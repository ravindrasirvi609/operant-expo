import { describe, expect, it } from "vitest";

import { formatWaitHint, isBookingOpen, resolveAvailability } from "@/lib/booking/availability";

const now = new Date("2027-05-01T10:00:00Z");
const inFiveMinutes = new Date("2027-05-01T10:05:00Z");
const fiveMinutesAgo = new Date("2027-05-01T09:55:00Z");

const openStall = { status: "AVAILABLE", visibility: "PUBLIC", basePrice: 1000 };
const base = { stall: openStall, lifecycle: "BOOKING_OPEN" as const, now };

describe("resolveAvailability", () => {
  it("allows an available public stall while booking is open", () => {
    const result = resolveAvailability(base);
    expect(result.bookable).toBe(true);
    expect(result.reason).toBe("AVAILABLE");
  });

  it("reports the visitor's own hold as resumable, not as taken", () => {
    // The old flow required status AVAILABLE, so reloading the booking page locked a visitor out of
    // the stall they were already holding for the rest of the window.
    const result = resolveAvailability({
      ...base,
      stall: { ...openStall, status: "HELD" },
      hold: { visitorId: "visitor-1", expiresAt: inFiveMinutes },
      visitorId: "visitor-1",
    });
    expect(result.reason).toBe("HELD_BY_YOU");
    expect(result.bookable).toBe(true);
    expect(result.availableInSeconds).toBe(300);
  });

  it("reports another visitor's hold as unavailable, with a wait time", () => {
    const result = resolveAvailability({
      ...base,
      stall: { ...openStall, status: "HELD" },
      hold: { visitorId: "someone-else", expiresAt: inFiveMinutes },
      visitorId: "visitor-1",
    });
    expect(result.reason).toBe("HELD_BY_OTHER");
    expect(result.bookable).toBe(false);
    expect(result.availableInSeconds).toBe(300);
  });

  it("treats an anonymous visitor as not the holder", () => {
    const result = resolveAvailability({
      ...base,
      stall: { ...openStall, status: "HELD" },
      hold: { visitorId: "someone-else", expiresAt: inFiveMinutes },
    });
    expect(result.reason).toBe("HELD_BY_OTHER");
  });

  it("ignores an expired hold, so a stall the sweep has not reached is still offered", () => {
    const result = resolveAvailability({
      ...base,
      stall: { ...openStall, status: "HELD" },
      hold: { visitorId: "someone-else", expiresAt: fiveMinutesAgo },
      visitorId: "visitor-1",
    });
    expect(result.reason).toBe("AVAILABLE");
    expect(result.bookable).toBe(true);
  });

  it("explains that booking has not opened rather than blaming the stall", () => {
    // This is the mismatch behind the original complaint: the map rendered for a merely-published
    // exhibition, and clicking a stall answered "Stall is not available".
    const result = resolveAvailability({ ...base, lifecycle: "PUBLISHED" });
    expect(result.reason).toBe("BOOKING_NOT_OPEN");
    expect(result.bookable).toBe(false);
    expect(result.message).toContain("not opened");
  });

  it("distinguishes closed from not yet open", () => {
    expect(resolveAvailability({ ...base, lifecycle: "BOOKING_CLOSED" }).reason).toBe("BOOKING_CLOSED");
    expect(resolveAvailability({ ...base, lifecycle: "DRAFT" }).reason).toBe("BOOKING_NOT_OPEN");
  });

  it("still lets a visitor finish a reservation started before booking closed", () => {
    // Their hold is a promise already made; withdrawing it mid-checkout would be worse than
    // honouring it for the few minutes it has left.
    const result = resolveAvailability({
      ...base,
      lifecycle: "BOOKING_CLOSED",
      stall: { ...openStall, status: "HELD" },
      hold: { visitorId: "visitor-1", expiresAt: inFiveMinutes },
      visitorId: "visitor-1",
    });
    expect(result.reason).toBe("HELD_BY_YOU");
    expect(result.bookable).toBe(true);
  });

  it("reports a stall mid-payment as pending, distinct from booked", () => {
    const result = resolveAvailability({ ...base, stall: { ...openStall, status: "PENDING" } });
    expect(result.reason).toBe("PENDING_PAYMENT");
    expect(result.bookable).toBe(false);
  });

  it("reports booked and blocked separately", () => {
    expect(resolveAvailability({ ...base, stall: { ...openStall, status: "BOOKED" } }).reason).toBe("BOOKED");
    expect(resolveAvailability({ ...base, stall: { ...openStall, status: "BLOCKED" } }).reason).toBe("BLOCKED");
  });

  it("calls a payment-pending booking pending, not booked", () => {
    // Collapsing both into "booked" would undo the distinction PENDING exists to make, and would
    // tell a visitor a stall is gone when an unpaid booking may yet be cancelled.
    const result = resolveAvailability({ ...base, liveBooking: { status: "PAYMENT_PENDING" } });
    expect(result.reason).toBe("PENDING_PAYMENT");
    expect(result.bookable).toBe(false);
  });

  it("calls a confirmed booking booked", () => {
    const result = resolveAvailability({ ...base, liveBooking: { status: "CONFIRMED" } });
    expect(result.reason).toBe("BOOKED");
    expect(result.bookable).toBe(false);
  });

  it("lets a live booking override a stall status that has not caught up", () => {
    const result = resolveAvailability({
      ...base,
      stall: { ...openStall, status: "AVAILABLE" },
      liveBooking: { status: "CONFIRMED" },
    });
    expect(result.reason).toBe("BOOKED");
  });

  it("never offers a private stall", () => {
    const result = resolveAvailability({ ...base, stall: { ...openStall, visibility: "PRIVATE" } });
    expect(result.reason).toBe("NOT_BOOKABLE");
    expect(result.bookable).toBe(false);
  });

  it("puts blocked ahead of the lifecycle, so an organizer's decision is never overridden", () => {
    const result = resolveAvailability({
      ...base,
      lifecycle: "BOOKING_OPEN",
      stall: { ...openStall, status: "BLOCKED" },
    });
    expect(result.reason).toBe("BLOCKED");
  });

  it("gives every reason a message a visitor could read", () => {
    const cases = [
      base,
      { ...base, lifecycle: "PUBLISHED" as const },
      { ...base, stall: { ...openStall, status: "BOOKED" } },
      { ...base, stall: { ...openStall, status: "PENDING" } },
      { ...base, stall: { ...openStall, status: "BLOCKED" } },
      { ...base, stall: { ...openStall, visibility: "PRIVATE" } },
    ];
    for (const input of cases) {
      const result = resolveAvailability(input);
      expect(result.message.length, result.reason).toBeGreaterThan(10);
    }
  });
});

describe("isBookingOpen", () => {
  it("is true only for BOOKING_OPEN", () => {
    expect(isBookingOpen("BOOKING_OPEN")).toBe(true);
    for (const lifecycle of ["DRAFT", "SETUP", "PUBLISHED", "BOOKING_CLOSED", "COMPLETED", "ARCHIVED"] as const) {
      expect(isBookingOpen(lifecycle), lifecycle).toBe(false);
    }
  });
});

describe("formatWaitHint", () => {
  it("rounds up to whole minutes", () => {
    expect(formatWaitHint(30)).toBe("Try again in about a minute.");
    expect(formatWaitHint(61)).toBe("Try again in about 2 minutes.");
  });

  it("says nothing when there is nothing to wait for", () => {
    expect(formatWaitHint(undefined)).toBeUndefined();
    expect(formatWaitHint(0)).toBeUndefined();
  });
});
