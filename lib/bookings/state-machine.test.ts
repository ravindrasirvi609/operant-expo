import { describe, expect, it } from "vitest";
import { assertBookingTransition, canTransitionBooking } from "@/lib/bookings/state-machine";

describe("canTransitionBooking", () => {
  it("allows HELD -> PAYMENT_PENDING", () => {
    expect(canTransitionBooking("HELD", "PAYMENT_PENDING")).toBe(true);
  });

  it("allows PAYMENT_PENDING -> CONFIRMED", () => {
    expect(canTransitionBooking("PAYMENT_PENDING", "CONFIRMED")).toBe(true);
  });

  it("rejects CONFIRMED -> PAYMENT_PENDING", () => {
    expect(canTransitionBooking("CONFIRMED", "PAYMENT_PENDING")).toBe(false);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransitionBooking("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("REFUNDED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("EXPIRED", "CONFIRMED")).toBe(false);
  });
});

describe("assertBookingTransition", () => {
  it("throws on an invalid transition", () => {
    expect(() => assertBookingTransition("CONFIRMED", "HELD")).toThrow(
      "Invalid booking transition: CONFIRMED -> HELD",
    );
  });

  it("does not throw on a valid transition", () => {
    expect(() => assertBookingTransition("HELD", "CANCELLED")).not.toThrow();
  });
});
