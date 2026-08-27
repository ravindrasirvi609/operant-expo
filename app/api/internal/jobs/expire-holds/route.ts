import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import type { ReservationHoldDocument } from "@/models/booking";

export async function POST(request: Request) {
  if (!process.env.JOB_SECRET || request.headers.get("x-job-secret") !== process.env.JOB_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const database = await getDatabase(); const result = await database.collection<ReservationHoldDocument>("reservationHolds").updateMany({ status: "ACTIVE", expiresAt: { $lte: new Date() } }, { $set: { status: "EXPIRED", releasedAt: new Date() } });
  return NextResponse.json({ expired: result.modifiedCount });
}

