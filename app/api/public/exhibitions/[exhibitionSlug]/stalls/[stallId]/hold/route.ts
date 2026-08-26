import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { getDatabase } from "@/lib/db/client";
import type { ExhibitionDocument } from "@/models/exhibition";
import type { ReservationHoldDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";

export async function POST(_: Request, { params }: { params: Promise<{ exhibitionSlug: string; stallId: string }> }) {
  const { exhibitionSlug, stallId } = await params;
  if (!ObjectId.isValid(stallId)) return NextResponse.json({ error: "Invalid stall" }, { status: 400 });
  const database = await getDatabase(); const now = new Date();
  const exhibition = await database.collection<ExhibitionDocument>("exhibitions").findOne({ slug: exhibitionSlug, lifecycle: "BOOKING_OPEN" });
  const stall = exhibition?._id ? await database.collection<StallDocument>("stalls").findOne({ _id: new ObjectId(stallId), exhibitionId: exhibition._id, visibility: "PUBLIC", status: "AVAILABLE" }) : null;
  if (!exhibition?._id || !stall?._id) return NextResponse.json({ error: "Stall is not available" }, { status: 409 });
  await database.collection<ReservationHoldDocument>("reservationHolds").updateMany({ stallId: stall._id, status: "ACTIVE", expiresAt: { $lte: now } }, { $set: { status: "EXPIRED", releasedAt: now } });
  const existing = await database.collection<ReservationHoldDocument>("reservationHolds").findOne({ stallId: stall._id, status: "ACTIVE", expiresAt: { $gt: now } });
  if (existing) return NextResponse.json({ error: "Stall is currently being held by another exhibitor" }, { status: 409 });
  const hold: ReservationHoldDocument = { _id: new ObjectId(), organizationId: stall.organizationId, exhibitionId: stall.exhibitionId, hallId: stall.hallId, stallId: stall._id, status: "ACTIVE", expiresAt: new Date(now.getTime() + 15 * 60 * 1000), createdAt: now };
  await database.collection<ReservationHoldDocument>("reservationHolds").insertOne(hold);
  return NextResponse.json({ hold: { id: hold._id!.toString(), expiresAt: hold.expiresAt } }, { status: 201 });
}
