import type { ClientSession, Db, ObjectId } from "mongodb";

import type { StallDocument } from "@/models/stall";

/**
 * Transitions a stall's stored status to reflect a hold/booking lifecycle event.
 * A stall an organizer has manually set to BLOCKED is never overwritten by
 * hold/booking-driven transitions — only an explicit organizer edit can clear it.
 */
export async function setStallStatus(
  database: Db,
  stallId: ObjectId,
  status: StallDocument["status"],
  session?: ClientSession,
) {
  await database.collection<StallDocument>("stalls").updateOne(
    { _id: stallId, status: { $ne: "BLOCKED" } },
    { $set: { status, updatedAt: new Date() } },
    session ? { session } : undefined,
  );
}
