import { describe, expect, it } from "vitest";

import { PUBLIC_LEGEND_STATUSES, statusColor, statusInk, statusLabel, statusMeta } from "@/lib/ui/status";

describe("status table", () => {
  it("gives PENDING its own colour rather than sharing BOOKED", () => {
    // These were the same red, so a stall someone was mid-payment on was indistinguishable from
    // a sold one, with no explanation offered to the visitor.
    expect(statusColor("PENDING")).not.toBe(statusColor("BOOKED"));
    expect(statusMeta("PENDING").tone).toBe("pending");
    expect(statusMeta("BOOKED").tone).toBe("booked");
  });

  it("includes PENDING in the public legend", () => {
    expect(PUBLIC_LEGEND_STATUSES).toContain("PENDING");
  });

  it("explains every legend status to a visitor", () => {
    for (const status of PUBLIC_LEGEND_STATUSES) {
      expect(statusMeta(status).publicHint, `${status} needs a public hint`).toBeTruthy();
    }
  });

  it("uses a distinct text colour from the marker colour, for contrast on paper", () => {
    expect(statusInk("HELD")).not.toBe(statusColor("HELD"));
  });

  it("maps booking and lifecycle statuses onto the same tone vocabulary", () => {
    expect(statusMeta("PAYMENT_PENDING").tone).toBe("pending");
    expect(statusMeta("CONFIRMED").tone).toBe("available");
    expect(statusMeta("BOOKING_OPEN").tone).toBe("available");
    expect(statusMeta("BOOKING_CLOSED").tone).toBe("blocked");
  });

  it("gives readable labels instead of raw enum names", () => {
    expect(statusLabel("PAYMENT_PENDING")).toBe("Payment pending");
    expect(statusLabel("BOOKING_OPEN")).toBe("Booking open");
  });

  it("degrades gracefully for an unknown status", () => {
    expect(statusMeta("SOMETHING_NEW").tone).toBe("neutral");
    expect(statusLabel("SOMETHING_NEW")).toBe("something new");
    expect(statusColor("SOMETHING_NEW")).toBe("var(--ink-faint)");
  });
});
