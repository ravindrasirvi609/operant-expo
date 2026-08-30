import { ObjectId, type Db } from "mongodb";

import { isDuplicateKeyError } from "@/lib/db/errors";
import { resolveAvailability, type Availability } from "@/lib/booking/availability";
import { setStallStatus } from "@/lib/stalls/availability";
import type { BookingDocument, ReservationHoldDocument } from "@/models/booking";
import type { ExhibitionDocument } from "@/models/exhibition";
import type { StallDocument } from "@/models/stall";

/** Configurable so an organizer-facing setting can be added later without touching the flow. */
export function holdDurationMs() {
  const minutes = Number(process.env.HOLD_DURATION_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 15) * 60 * 1000;
}

export class HoldError extends Error {
  readonly status: number;
  readonly code: string;
  readonly availableInSeconds?: number;

  constructor(
    message: string,
    { status, code, availableInSeconds }: { status: number; code: string; availableInSeconds?: number },
  ) {
    super(message);
    this.name = "HoldError";
    this.status = status;
    this.code = code;
    this.availableInSeconds = availableInSeconds;
  }
}

/**
 * Expires lapsed holds and releases the stalls they were holding.
 *
 * Called at the start of every public read, not only by the cron job. Expiry used to depend
 * entirely on an external schedule: if nothing called it, stalls stayed HELD forever and the public
 * map advertised availability that did not exist. The cron endpoint remains as a backstop for stalls
 * nobody happens to look at.
 *
 * Scoped to one exhibition where possible so a busy deployment is not sweeping globally on every
 * page view.
 */
export async function sweepExpiredHolds(database: Db, { exhibitionId }: { exhibitionId?: ObjectId } = {}) {
  const now = new Date();
  const filter = {
    status: "ACTIVE" as const,
    expiresAt: { $lte: now },
    ...(exhibitionId ? { exhibitionId } : {}),
  };

  const lapsed = await database
    .collection<ReservationHoldDocument>("reservationHolds")
    .find(filter, { projection: { _id: 1, stallId: 1 } })
    .toArray();
  if (lapsed.length === 0) return { expired: 0 };

  const result = await database
    .collection<ReservationHoldDocument>("reservationHolds")
    .updateMany(
      { _id: { $in: lapsed.map((hold) => hold._id!) }, status: "ACTIVE" },
      { $set: { status: "EXPIRED", releasedAt: now } },
    );

  // Only release stalls that have no *other* live hold or booking; a stall re-held in the interim
  // must not be dragged back to AVAILABLE underneath its new holder.
  for (const hold of lapsed) {
    const [stillHeld, booked] = await Promise.all([
      database
        .collection<ReservationHoldDocument>("reservationHolds")
        .findOne({ stallId: hold.stallId, status: "ACTIVE", expiresAt: { $gt: now } }),
      database
        .collection<BookingDocument>("bookings")
        .findOne({ stallId: hold.stallId, status: { $in: ["HELD", "PAYMENT_PENDING", "CONFIRMED"] } }),
    ]);
    if (!stillHeld && !booked) await setStallStatus(database, hold.stallId, "AVAILABLE");
  }

  return { expired: result.modifiedCount };
}

export type StallContext = {
  exhibition: ExhibitionDocument;
  stall: StallDocument;
  hold: ReservationHoldDocument | null;
  liveBooking: BookingDocument | null;
  availability: Availability;
};

/**
 * Loads everything needed to judge one stall, having first swept expired holds for its exhibition.
 * Shared by the stall detail endpoint, the hold endpoint and the booking endpoint so all three agree.
 */
export async function loadStallContext(
  database: Db,
  { exhibitionSlug, stallId, visitorId }: { exhibitionSlug: string; stallId: string; visitorId?: string },
): Promise<StallContext | null> {
  if (!ObjectId.isValid(stallId)) return null;

  const exhibition = await database
    .collection<ExhibitionDocument>("exhibitions")
    .findOne({ slug: exhibitionSlug, lifecycle: { $in: ["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"] } });
  if (!exhibition?._id) return null;

  await sweepExpiredHolds(database, { exhibitionId: exhibition._id });

  const stall = await database
    .collection<StallDocument>("stalls")
    .findOne({ _id: new ObjectId(stallId), exhibitionId: exhibition._id });
  if (!stall?._id) return null;

  const now = new Date();
  const [hold, liveBooking] = await Promise.all([
    database
      .collection<ReservationHoldDocument>("reservationHolds")
      .findOne({ stallId: stall._id, status: "ACTIVE", expiresAt: { $gt: now } }),
    database
      .collection<BookingDocument>("bookings")
      .findOne({ stallId: stall._id, status: { $in: ["HELD", "PAYMENT_PENDING", "CONFIRMED"] } }),
  ]);

  return {
    exhibition,
    stall,
    hold,
    liveBooking,
    availability: resolveAvailability({
      stall,
      lifecycle: exhibition.lifecycle,
      hold,
      liveBooking,
      visitorId,
      now,
    }),
  };
}

export type HoldResult = {
  hold: ReservationHoldDocument;
  /** True when an existing hold was returned rather than a new one created. */
  resumed: boolean;
};

/**
 * Starts or resumes this visitor's reservation of a stall.
 *
 * The three outcomes the old endpoint collapsed into one 409:
 *   - the visitor already holds it   -> return that hold, unchanged, so a reload continues rather
 *                                       than locking them out for the rest of the window;
 *   - somebody else holds it         -> 409, saying how long is left;
 *   - booking is not open            -> 422, saying so, instead of blaming the stall.
 */
export async function requestHold(
  database: Db,
  { context, visitorId }: { context: StallContext; visitorId: string },
): Promise<HoldResult> {
  const { stall, exhibition, hold, availability } = context;

  if (hold && hold.visitorId === visitorId) {
    return { hold, resumed: true };
  }

  if (!availability.bookable) {
    const status = availability.reason === "BOOKING_NOT_OPEN" || availability.reason === "BOOKING_CLOSED" ? 422 : 409;
    throw new HoldError(availability.message, {
      status,
      code: availability.reason,
      availableInSeconds: availability.availableInSeconds,
    });
  }

  const now = new Date();
  const newHold: ReservationHoldDocument = {
    _id: new ObjectId(),
    organizationId: stall.organizationId,
    exhibitionId: exhibition._id!,
    hallId: stall.hallId,
    stallId: stall._id!,
    visitorId,
    status: "ACTIVE",
    expiresAt: new Date(now.getTime() + holdDurationMs()),
    createdAt: now,
  };

  try {
    await database.collection<ReservationHoldDocument>("reservationHolds").insertOne(newHold);
  } catch (cause) {
    // The partial unique index on active holds is what actually prevents two visitors holding one
    // stall; losing that race is a normal outcome, not a server fault.
    if (isDuplicateKeyError(cause)) {
      const winner = await database
        .collection<ReservationHoldDocument>("reservationHolds")
        .findOne({ stallId: stall._id!, status: "ACTIVE" });
      if (winner?.visitorId === visitorId) return { hold: winner, resumed: true };
      throw new HoldError("Someone else just reserved this stall. Try another, or check back shortly.", {
        status: 409,
        code: "HELD_BY_OTHER",
      });
    }
    throw cause;
  }

  await setStallStatus(database, stall._id!, "HELD");
  return { hold: newHold, resumed: false };
}
