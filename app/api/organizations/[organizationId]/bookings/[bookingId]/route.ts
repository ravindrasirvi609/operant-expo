import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import type { BookingDocument } from "@/models/booking";
import { assertBookingTransition } from "@/lib/bookings/state-machine";
import { writeAudit } from "@/lib/audit";
import { withTransaction } from "@/lib/db/transaction";

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; bookingId: string }> }) {
  const { organizationId, bookingId } = await params; await requireOrganizationPermission(organizationId, "booking:manage");
  if (!ObjectId.isValid(bookingId)) return NextResponse.json({ error: "Invalid booking" }, { status: 400 });
  const body = await readBody(request) as { status?: BookingDocument["status"] };
  if (!body.status || !["CONFIRMED", "CANCELLED"].includes(body.status)) return NextResponse.json({ error: "Only confirmation or cancellation is supported" }, { status: 400 });
  const nextStatus = body.status;
  const database = await getDatabase(); const existing = await database.collection<BookingDocument>("bookings").findOne({ _id: new ObjectId(bookingId), organizationId: new ObjectId(organizationId) });
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  try { assertBookingTransition(existing.status, nextStatus); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid booking transition" }, { status: 409 }); }
  const result = await withTransaction(database, async (session) => { const updated = await database.collection<BookingDocument>("bookings").findOneAndUpdate({ _id: existing._id, organizationId: new ObjectId(organizationId), status: existing.status }, { $set: { status: nextStatus, updatedAt: new Date() } }, { returnDocument: "after", session }); if (!updated) throw new Error("Booking changed; reload and try again"); await writeAudit(database, { organizationId: new ObjectId(organizationId), action: `booking.${nextStatus.toLowerCase()}`, entityType: "Booking", entityId: bookingId, before: { status: existing.status }, after: { status: nextStatus } }); return updated; });
  return NextResponse.json({ booking: result });
}
