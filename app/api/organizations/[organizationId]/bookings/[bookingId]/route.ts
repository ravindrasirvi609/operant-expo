import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import type { BookingDocument } from "@/models/booking";
import { assertBookingTransition } from "@/lib/bookings/state-machine";
import { setStallStatus } from "@/lib/stalls/availability";
import { writeAudit } from "@/lib/audit";
import { withTransaction } from "@/lib/db/transaction";

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; bookingId: string }> }) {
  const { organizationId, bookingId } = await params;
  const auth = await requireApiPermission(organizationId, "booking:manage");
  if (!auth.ok) return auth.response;
  if (!ObjectId.isValid(bookingId)) return NextResponse.json({ error: "Invalid booking" }, { status: 400 });

  const body = (await readBody(request)) as { status?: BookingDocument["status"] };
  if (!body.status || !["CONFIRMED", "CANCELLED"].includes(body.status)) {
    return NextResponse.json({ error: "Only confirmation or cancellation is supported" }, { status: 400 });
  }
  const nextStatus = body.status;

  const database = await getDatabase();
  const existing = await database.collection<BookingDocument>("bookings").findOne({ _id: new ObjectId(bookingId), organizationId: new ObjectId(organizationId) });
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  try {
    assertBookingTransition(existing.status, nextStatus);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid booking transition" }, { status: 409 });
  }

  const result = await withTransaction(database, async (session) => {
    const updated = await database.collection<BookingDocument>("bookings").findOneAndUpdate(
      { _id: existing._id, organizationId: new ObjectId(organizationId), status: existing.status },
      { $set: { status: nextStatus, updatedAt: new Date() } },
      { returnDocument: "after", session },
    );
    if (!updated) throw new Error("Booking changed; reload and try again");

    if (nextStatus === "CONFIRMED") {
      await database.collection("payments").updateOne({ bookingId: existing._id }, { $set: { status: "PAID", updatedAt: new Date(), paidAt: new Date() } }, { session });
      await database.collection("invoices").updateOne({ bookingId: existing._id }, { $set: { status: "PAID" } }, { session });
    }
    await setStallStatus(database, existing.stallId, nextStatus === "CONFIRMED" ? "BOOKED" : "AVAILABLE", session);

    await writeAudit(database, {
      organizationId: new ObjectId(organizationId),
      action: `booking.${nextStatus.toLowerCase()}`,
      entityType: "Booking",
      entityId: bookingId,
      before: { status: existing.status },
      after: { status: nextStatus },
    }, session);

    return updated;
  });

  return NextResponse.json({ booking: result });
}
