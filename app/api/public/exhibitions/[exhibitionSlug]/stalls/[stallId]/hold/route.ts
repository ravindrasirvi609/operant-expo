import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { isDuplicateKeyError } from "@/lib/db/errors";
import { getDatabase } from "@/lib/db/client";
import { setStallStatus } from "@/lib/stalls/availability";
import type { ExhibitionDocument } from "@/models/exhibition";
import type { ReservationHoldDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";

const HOLD_DURATION_MS = 15 * 60 * 1000;

export async function POST(_: Request, { params }: { params: Promise<{ exhibitionSlug: string; stallId: string }> }) {
  const { exhibitionSlug, stallId } = await params;
  if (!ObjectId.isValid(stallId)) return NextResponse.json({ error: "Invalid stall" }, { status: 400 });

  const database = await getDatabase();
  const now = new Date();
  const exhibition = await database.collection<ExhibitionDocument>("exhibitions").findOne({ slug: exhibitionSlug, lifecycle: "BOOKING_OPEN" });
  const stall = exhibition?._id
    ? await database.collection<StallDocument>("stalls").findOne({ _id: new ObjectId(stallId), exhibitionId: exhibition._id, visibility: "PUBLIC", status: "AVAILABLE" })
    : null;
  if (!exhibition?._id || !stall?._id) return NextResponse.json({ error: "Stall is not available" }, { status: 409 });

  await database.collection<ReservationHoldDocument>("reservationHolds").updateMany(
    { stallId: stall._id, status: "ACTIVE", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED", releasedAt: now } },
  );

  const hold: ReservationHoldDocument = {
    _id: new ObjectId(),
    organizationId: stall.organizationId,
    exhibitionId: stall.exhibitionId,
    hallId: stall.hallId,
    stallId: stall._id,
    status: "ACTIVE",
    expiresAt: new Date(now.getTime() + HOLD_DURATION_MS),
    createdAt: now,
  };

  try {
    await database.collection<ReservationHoldDocument>("reservationHolds").insertOne(hold);
  } catch (error) {
    if (isDuplicateKeyError(error)) return NextResponse.json({ error: "Stall is currently being held by another exhibitor" }, { status: 409 });
    throw error;
  }

  await setStallStatus(database, stall._id, "HELD");
  return NextResponse.json({ hold: { id: hold._id!.toString(), expiresAt: hold.expiresAt } }, { status: 201 });
}
