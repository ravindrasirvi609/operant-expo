import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { randomUUID } from "node:crypto";

import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { bookingSchema } from "@/lib/validation/booking";
import type { ExhibitorDocument, BookingDocument, ReservationHoldDocument } from "@/models/booking";
import type { ExhibitionDocument } from "@/models/exhibition";
import type { StallDocument } from "@/models/stall";

export async function POST(request: Request, { params }: { params: Promise<{ exhibitionSlug: string }> }) {
  const { exhibitionSlug } = await params; const parsed = bookingSchema.safeParse(await readBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking details", details: parsed.error.flatten() }, { status: 400 });
  if (!ObjectId.isValid(parsed.data.stallId)) return NextResponse.json({ error: "Invalid stall" }, { status: 400 });
  const database = await getDatabase(); const now = new Date();
  const exhibition = await database.collection<ExhibitionDocument>("exhibitions").findOne({ slug: exhibitionSlug, lifecycle: "BOOKING_OPEN" });
  const stall = exhibition?._id ? await database.collection<StallDocument>("stalls").findOne({ _id: new ObjectId(parsed.data.stallId), exhibitionId: exhibition._id, status: "AVAILABLE", visibility: "PUBLIC" }) : null;
  if (!exhibition?._id || !stall?._id) return NextResponse.json({ error: "Stall is no longer available" }, { status: 409 });
  const hold = await database.collection<ReservationHoldDocument>("reservationHolds").findOne({ stallId: stall._id, status: "ACTIVE", expiresAt: { $gt: now } });
  if (!hold) return NextResponse.json({ error: "Your reservation has expired. Please reserve the stall again." }, { status: 409 });
  const existing = await database.collection<ExhibitorDocument>("exhibitors").findOne({ organizationId: stall.organizationId, email: parsed.data.email.toLowerCase() });
  const exhibitor: ExhibitorDocument = existing ?? { _id: new ObjectId(), organizationId: stall.organizationId, companyName: parsed.data.companyName, legalName: parsed.data.legalName, contactPerson: parsed.data.contactPerson, email: parsed.data.email.toLowerCase(), phone: parsed.data.phone, address: parsed.data.address, taxIdentifier: parsed.data.taxIdentifier, createdAt: now, updatedAt: now };
  if (!existing) await database.collection<ExhibitorDocument>("exhibitors").insertOne(exhibitor);
  const booking: BookingDocument = { _id: new ObjectId(), organizationId: stall.organizationId, exhibitionId: stall.exhibitionId, hallId: stall.hallId, stallId: stall._id, exhibitorId: exhibitor._id!, bookingNumber: `BK-${randomUUID().slice(0, 8).toUpperCase()}`, status: "PAYMENT_PENDING", commercialSnapshot: { basePrice: stall.basePrice, tax: 0, fees: 0, discounts: 0, total: stall.basePrice, currency: stall.currency }, createdAt: now, updatedAt: now };
  try { await database.collection<BookingDocument>("bookings").insertOne(booking); await database.collection<ReservationHoldDocument>("reservationHolds").updateOne({ _id: hold._id }, { $set: { status: "RELEASED", releasedAt: now } }); return NextResponse.json({ booking: { id: booking._id!.toString(), bookingNumber: booking.bookingNumber, status: booking.status, total: booking.commercialSnapshot.total, currency: booking.commercialSnapshot.currency } }, { status: 201 }); } catch { return NextResponse.json({ error: "Unable to create booking; the stall may have just been booked" }, { status: 409 }); }
}
