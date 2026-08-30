import { randomUUID } from "node:crypto";
import { ObjectId, type ClientSession, type Db } from "mongodb";
import type { z } from "zod";

import { writeAudit } from "@/lib/audit";
import { isDuplicateKeyError } from "@/lib/db/errors";
import { withTransaction } from "@/lib/db/transaction";
import { queueEmail } from "@/lib/email";
import { ManualPaymentProvider } from "@/lib/payments";
import { setStallStatus } from "@/lib/stalls/availability";
import type { StallContext } from "@/lib/booking/holds";
import type { bookingSchema } from "@/lib/validation/booking";
import type { BookingDocument, ExhibitorDocument, ReservationHoldDocument } from "@/models/booking";
import type { InvoiceDocument, PaymentDocument } from "@/models/commercial";

export class BookingError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, { status, code }: { status: number; code: string }) {
    super(message);
    this.name = "BookingError";
    this.status = status;
    this.code = code;
  }
}

export type BookingSummary = {
  id: string;
  bookingNumber: string;
  status: BookingDocument["status"];
  total: number;
  currency: string;
};

export type CreateBookingResult = {
  booking: BookingSummary;
  invoice: { invoiceNumber: string };
  payment: { status: string; provider: string };
  /** True when an earlier identical request produced this booking. */
  replayed: boolean;
};

function summarise(booking: BookingDocument): BookingSummary {
  return {
    id: booking._id!.toString(),
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    total: booking.commercialSnapshot.total,
    currency: booking.commercialSnapshot.currency,
  };
}

/** Returns the booking an earlier identical request already created, if there is one. */
export async function findReplay(database: Db, idempotencyKey?: string) {
  if (!idempotencyKey) return null;
  const existing = await database.collection<BookingDocument>("bookings").findOne({ idempotencyKey });
  return existing ? summarise(existing) : null;
}

/** Reuses the exhibitor record for a returning email, so one company is not duplicated per booking. */
async function upsertExhibitor(
  database: Db,
  {
    organizationId,
    input,
    now,
    session,
  }: {
    organizationId: ObjectId;
    input: z.infer<typeof bookingSchema>;
    now: Date;
    session: ClientSession;
  },
) {
  const email = input.email.toLowerCase();
  const existing = await database
    .collection<ExhibitorDocument>("exhibitors")
    .findOne({ organizationId, email }, { session });
  if (existing) return existing;

  const exhibitor: ExhibitorDocument = {
    _id: new ObjectId(),
    organizationId,
    companyName: input.companyName,
    legalName: input.legalName,
    contactPerson: input.contactPerson,
    email,
    phone: input.phone,
    address: input.address,
    taxIdentifier: input.taxIdentifier,
    createdAt: now,
    updatedAt: now,
  };
  await database.collection<ExhibitorDocument>("exhibitors").insertOne(exhibitor, { session });
  return exhibitor;
}

/**
 * Turns a held stall into a booking.
 *
 * Previously one 15-line-long statement whose catch-all answered every failure — including genuine
 * server faults — with 409 and the raw `error.message`, publishing internal driver text to anonymous
 * callers. Here each precondition is checked with the status it deserves, the writes stay in one
 * transaction, and anything unexpected propagates so the route can log it and say nothing.
 *
 * Preconditions, in order:
 *   1. the stall is still bookable by *this* visitor (their own hold counts);
 *   2. a live hold exists and belongs to them — a hold is not a bearer token, so another visitor's
 *      hold cannot be spent by whoever posts first.
 */
export async function createBooking(
  database: Db,
  {
    context,
    input,
    visitorId,
    idempotencyKey,
  }: {
    context: StallContext;
    input: z.infer<typeof bookingSchema>;
    visitorId?: string;
    idempotencyKey?: string;
  },
): Promise<CreateBookingResult> {
  const { stall, exhibition, hold, availability } = context;

  if (!availability.bookable) {
    const status = availability.reason === "BOOKING_NOT_OPEN" || availability.reason === "BOOKING_CLOSED" ? 422 : 409;
    throw new BookingError(availability.message, { status, code: availability.reason });
  }

  if (!hold?._id) {
    throw new BookingError("Your reservation has expired. Go back and reserve the stall again.", {
      status: 409,
      code: "HOLD_EXPIRED",
    });
  }

  if (hold.visitorId && hold.visitorId !== visitorId) {
    throw new BookingError("This stall is reserved by someone else right now.", {
      status: 409,
      code: "HELD_BY_OTHER",
    });
  }

  const now = new Date();
  const organizationId = stall.organizationId;

  try {
    const result = await withTransaction(database, async (session) => {
      const exhibitor = await upsertExhibitor(database, { organizationId, input, now, session });

      const booking: BookingDocument = {
        _id: new ObjectId(),
        organizationId,
        exhibitionId: exhibition._id!,
        hallId: stall.hallId,
        stallId: stall._id!,
        exhibitorId: exhibitor._id!,
        bookingNumber: `BK-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: "PAYMENT_PENDING",
        ...(idempotencyKey ? { idempotencyKey } : {}),
        commercialSnapshot: {
          basePrice: stall.basePrice,
          tax: 0,
          fees: 0,
          discounts: 0,
          total: stall.basePrice,
          currency: stall.currency,
        },
        createdAt: now,
        updatedAt: now,
      };
      await database.collection<BookingDocument>("bookings").insertOne(booking, { session });

      // Consuming the hold is guarded on it still being ACTIVE, so two concurrent submissions of
      // the same reservation cannot both produce a booking.
      const released = await database
        .collection<ReservationHoldDocument>("reservationHolds")
        .updateOne({ _id: hold._id, status: "ACTIVE" }, { $set: { status: "RELEASED", releasedAt: now } }, { session });
      if (!released.modifiedCount) {
        throw new BookingError("Your reservation was already used or has expired.", {
          status: 409,
          code: "HOLD_CONSUMED",
        });
      }

      const payment = await new ManualPaymentProvider().createPaymentIntent({
        amount: booking.commercialSnapshot.total,
        currency: booking.commercialSnapshot.currency,
        idempotencyKey: booking._id!.toString(),
      });
      const paymentRecord: PaymentDocument = {
        _id: new ObjectId(),
        organizationId,
        bookingId: booking._id!,
        provider: payment.provider,
        status: "PENDING",
        amount: payment.amount,
        currency: payment.currency,
        providerReference: payment.reference,
        idempotencyKey: booking._id!.toString(),
        createdAt: now,
        updatedAt: now,
      };
      await database.collection<PaymentDocument>("payments").insertOne(paymentRecord, { session });

      const invoice: InvoiceDocument = {
        _id: new ObjectId(),
        organizationId,
        bookingId: booking._id!,
        invoiceNumber: `INV-${booking.bookingNumber.slice(3)}`,
        status: "ISSUED",
        subtotal: stall.basePrice,
        tax: 0,
        fees: 0,
        total: stall.basePrice,
        currency: stall.currency,
        issuedAt: now,
        createdAt: now,
      };
      await database.collection<InvoiceDocument>("invoices").insertOne(invoice, { session });

      await queueEmail(
        database,
        {
          organizationId,
          bookingId: booking._id,
          recipient: exhibitor.email,
          template: "booking-confirmation",
        },
        session,
      );

      await writeAudit(
        database,
        {
          organizationId,
          action: "booking.created",
          entityType: "Booking",
          entityId: booking._id!.toString(),
          after: {
            status: booking.status,
            stallNumber: stall.stallNumber,
            total: booking.commercialSnapshot.total,
          },
        },
        session,
      );

      // PENDING, not BOOKED: the organizer confirms once payment arrives.
      await setStallStatus(database, stall._id!, "PENDING", session);

      return { booking, invoice, payment: paymentRecord };
    });

    return {
      booking: summarise(result.booking),
      invoice: { invoiceNumber: result.invoice.invoiceNumber },
      payment: { status: result.payment.status, provider: result.payment.provider },
      replayed: false,
    };
  } catch (cause) {
    if (cause instanceof BookingError) throw cause;
    if (isDuplicateKeyError(cause)) {
      // Either the idempotency key or the one-live-booking-per-stall index. Both mean the same
      // thing to the visitor: this reservation has already been turned into a booking.
      const replay = await findReplay(database, idempotencyKey);
      if (replay) {
        return {
          booking: replay,
          invoice: { invoiceNumber: `INV-${replay.bookingNumber.slice(3)}` },
          payment: { status: "PENDING", provider: "manual" },
          replayed: true,
        };
      }
      throw new BookingError("This stall has just been booked by someone else.", {
        status: 409,
        code: "ALREADY_BOOKED",
      });
    }
    throw cause;
  }
}
