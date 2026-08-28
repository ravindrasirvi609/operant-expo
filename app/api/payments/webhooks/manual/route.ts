import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { assertBookingTransition } from "@/lib/bookings/state-machine";
import { setStallStatus } from "@/lib/stalls/availability";
import { writeAudit } from "@/lib/audit";
import type { BookingDocument } from "@/models/booking";

export async function POST(request: Request) {
  if (!process.env.PAYMENT_WEBHOOK_SECRET || request.headers.get("x-payment-secret") !== process.env.PAYMENT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { bookingId?: string; status?: "PAID" | "FAILED"; eventId?: string };
  if (!body.bookingId || !ObjectId.isValid(body.bookingId) || !body.status || !body.eventId) {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }

  const database = await getDatabase();
  const already = await database.collection("paymentWebhookEvents").findOne({ eventId: body.eventId });
  if (already) return NextResponse.json({ received: true, replay: true });

  const booking = await database.collection<BookingDocument>("bookings").findOne({ _id: new ObjectId(body.bookingId) });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  if (body.status === "PAID") {
    try {
      assertBookingTransition(booking.status, "CONFIRMED");
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid booking state" }, { status: 409 });
    }
    await withTransaction(database, async (session) => {
      await database.collection<BookingDocument>("bookings").updateOne(
        { _id: booking._id, status: booking.status },
        { $set: { status: "CONFIRMED", updatedAt: new Date() } },
        { session },
      );
      await database.collection("payments").updateOne({ bookingId: booking._id }, { $set: { status: "PAID", updatedAt: new Date(), paidAt: new Date() } }, { session });
      await database.collection("invoices").updateOne({ bookingId: booking._id }, { $set: { status: "PAID" } }, { session });
      await setStallStatus(database, booking.stallId, "BOOKED", session);
      await writeAudit(database, { organizationId: booking.organizationId, action: "payment.paid", entityType: "Booking", entityId: booking._id!.toString(), before: { status: booking.status }, after: { status: "CONFIRMED" }, metadata: { eventId: body.eventId } }, session);
      await database.collection("paymentWebhookEvents").insertOne({ eventId: body.eventId, bookingId: booking._id, status: body.status, receivedAt: new Date() }, { session });
    });
  } else {
    await withTransaction(database, async (session) => {
      await database.collection("payments").updateOne({ bookingId: booking._id }, { $set: { status: "FAILED", updatedAt: new Date() } }, { session });
      await database.collection("paymentWebhookEvents").insertOne({ eventId: body.eventId, bookingId: booking._id, status: body.status, receivedAt: new Date() }, { session });
    });
  }

  return NextResponse.json({ received: true });
}
