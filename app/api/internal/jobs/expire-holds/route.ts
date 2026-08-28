import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { setStallStatus } from "@/lib/stalls/availability";
import type { ReservationHoldDocument } from "@/models/booking";

export async function POST(request: Request) {
  if (!process.env.JOB_SECRET || request.headers.get("x-job-secret") !== process.env.JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const database = await getDatabase();
  const now = new Date();
  const expiring = await database.collection<ReservationHoldDocument>("reservationHolds")
    .find({ status: "ACTIVE", expiresAt: { $lte: now } })
    .toArray();

  for (const hold of expiring) {
    const result = await database.collection<ReservationHoldDocument>("reservationHolds").updateOne(
      { _id: hold._id, status: "ACTIVE" },
      { $set: { status: "EXPIRED", releasedAt: now } },
    );
    if (result.modifiedCount) await setStallStatus(database, hold.stallId, "AVAILABLE");
  }

  return NextResponse.json({ expired: expiring.length });
}
