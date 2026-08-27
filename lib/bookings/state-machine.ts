import type { BookingStatus } from "@/types/domain";

const transitions: Record<string, BookingStatus[]> = {
  HELD: ["PAYMENT_PENDING", "EXPIRED", "CANCELLED"],
  PAYMENT_PENDING: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["CANCELLED", "REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus) {
  return transitions[from]?.includes(to) ?? false;
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus) {
  if (!canTransitionBooking(from, to)) throw new Error(`Invalid booking transition: ${from} -> ${to}`);
}

