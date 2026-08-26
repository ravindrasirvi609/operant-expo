import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import type { BookingDocument } from "@/models/booking";

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; bookingId: string }> }) {
  const { organizationId, bookingId } = await params; await requireOrganizationPermission(organizationId, "booking:manage");
  if (!ObjectId.isValid(bookingId)) return NextResponse.json({ error: "Invalid booking" }, { status: 400 });
  const body = await readBody(request) as { status?: BookingDocument["status"] };
  if (!body.status || !["CONFIRMED", "CANCELLED"].includes(body.status)) return NextResponse.json({ error: "Only confirmation or cancellation is supported" }, { status: 400 });
  const database = await getDatabase(); const result = await database.collection<BookingDocument>("bookings").findOneAndUpdate({ _id: new ObjectId(bookingId), organizationId: new ObjectId(organizationId) }, { $set: { status: body.status, updatedAt: new Date() } }, { returnDocument: "after" });
  if (!result) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  return NextResponse.json({ booking: result });
}

