import { ObjectId, type Db } from "mongodb";

import { isBookingOpen, resolveAvailability, type Availability } from "@/lib/booking/availability";
import { sweepExpiredHolds } from "@/lib/booking/holds";
import type { ExhibitionDocument, HallDocument } from "@/models/exhibition";
import type { AssetDocument, FloorPlanDocument, MapElementDocument } from "@/models/map";
import type { BookingDocument, ReservationHoldDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";

export const PUBLIC_LIFECYCLES = ["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED"] as const;

export type PublicStall = {
  id: string;
  elementId: string;
  stallNumber: string;
  section?: string;
  stallType: string;
  area: number;
  basePrice: number;
  currency: string;
  amenities: string[];
  availability: Availability;
};

export type PublicElement = {
  id: string;
  type: string;
  label?: string;
  geometry: MapElementDocument["geometry"];
  /** Present only for stall rectangles that have bookable inventory behind them. */
  stallId?: string;
  /** The status the map should colour this rectangle with. */
  status?: string;
  bookable: boolean;
  reason?: string;
};

export type PublicHall = {
  id: string;
  name: string;
  canvas: { width: number; height: number } | null;
  backgroundUrl?: string;
  elements: PublicElement[];
  stalls: PublicStall[];
  /** Stall rectangles drawn on the plan that carry no inventory, so nothing can be booked on them. */
  unbookableCount: number;
};

export type PublicExhibitionView = {
  exhibition: {
    name: string;
    slug: string;
    description?: string;
    shortDescription?: string;
    startDate: Date;
    endDate: Date;
    timezone: string;
    lifecycle: ExhibitionDocument["lifecycle"];
  };
  bookingOpen: boolean;
  halls: PublicHall[];
  /** The stall this visitor is currently holding, if any, so the page can offer to continue. */
  yourHold: { stallId: string; stallNumber: string; expiresAt: Date } | null;
  totals: { available: number; total: number };
};

/**
 * Everything the public exhibition view needs, with availability already decided.
 *
 * Shared by the server-rendered page and the JSON feed so the two cannot disagree — previously each
 * built its own query and the page derived a stall's status by falling back to a field on the map
 * element, which meant a rectangle with no inventory rendered as though it were available.
 *
 * Expired holds are swept first. Expiry used to depend entirely on an external cron: without it,
 * stalls stayed HELD indefinitely and this view advertised availability that did not exist.
 */
export async function loadPublicExhibition(
  database: Db,
  { slug, visitorId }: { slug: string; visitorId?: string },
): Promise<PublicExhibitionView | null> {
  const exhibition = await database
    .collection<ExhibitionDocument>("exhibitions")
    .findOne({ slug, lifecycle: { $in: [...PUBLIC_LIFECYCLES] } });
  if (!exhibition?._id) return null;

  await sweepExpiredHolds(database, { exhibitionId: exhibition._id });

  const now = new Date();
  const bookingOpen = isBookingOpen(exhibition.lifecycle);

  const halls = await database
    .collection<HallDocument>("halls")
    .find({ exhibitionId: exhibition._id, status: "ACTIVE", publicVisibility: true })
    .sort({ name: 1 })
    .toArray();

  // One query each for the whole exhibition rather than per hall, so a ten-hall event is not
  // thirty round trips.
  const [allStalls, liveHolds, liveBookings] = await Promise.all([
    database
      .collection<StallDocument>("stalls")
      .find({ exhibitionId: exhibition._id, visibility: "PUBLIC" })
      .sort({ stallNumber: 1 })
      .toArray(),
    database
      .collection<ReservationHoldDocument>("reservationHolds")
      .find({ exhibitionId: exhibition._id, status: "ACTIVE", expiresAt: { $gt: now } })
      .toArray(),
    database
      .collection<BookingDocument>("bookings")
      .find({ exhibitionId: exhibition._id, status: { $in: ["HELD", "PAYMENT_PENDING", "CONFIRMED"] } })
      .toArray(),
  ]);

  const holdByStall = new Map(liveHolds.map((hold) => [hold.stallId.toString(), hold]));
  const bookingByStall = new Map(liveBookings.map((booking) => [booking.stallId.toString(), booking]));

  let available = 0;
  let yourHold: PublicExhibitionView["yourHold"] = null;

  const publicHalls: PublicHall[] = [];

  for (const hall of halls) {
    const plan = await database
      .collection<FloorPlanDocument>("floorPlans")
      .findOne({ hallId: hall._id!, status: "PUBLISHED" });

    if (!plan) {
      publicHalls.push({
        id: hall._id!.toString(),
        name: hall.name,
        canvas: null,
        elements: [],
        stalls: [],
        unbookableCount: 0,
      });
      continue;
    }

    const [elements, background] = await Promise.all([
      database
        .collection<MapElementDocument>("mapElements")
        .find({ floorPlanId: plan._id!, visible: true })
        .sort({ zIndex: 1 })
        .toArray(),
      plan.backgroundAssetId
        ? database.collection<AssetDocument>("assets").findOne({ _id: plan.backgroundAssetId })
        : null,
    ]);

    const hallStalls = allStalls.filter((stall) => stall.hallId.equals(hall._id!));
    const stallByElement = new Map(hallStalls.map((stall) => [stall.floorPlanElementId.toString(), stall]));

    const publicStalls: PublicStall[] = [];
    const publicElements: PublicElement[] = [];
    let unbookableCount = 0;

    for (const element of elements) {
      const stall = stallByElement.get(element._id!.toString());

      if (element.type !== "STALL") {
        publicElements.push({
          id: element._id!.toString(),
          type: element.type,
          label: element.label,
          geometry: element.geometry,
          bookable: false,
        });
        continue;
      }

      if (!stall) {
        // A rectangle with no inventory: drawn, but nothing to sell. Counted so the organizer can be
        // told, and rendered without a status so it cannot masquerade as available.
        unbookableCount += 1;
        publicElements.push({
          id: element._id!.toString(),
          type: element.type,
          label: element.label,
          geometry: element.geometry,
          bookable: false,
          reason: "NOT_BOOKABLE",
        });
        continue;
      }

      const availability = resolveAvailability({
        stall,
        lifecycle: exhibition.lifecycle,
        hold: holdByStall.get(stall._id!.toString()) ?? null,
        liveBooking: bookingByStall.get(stall._id!.toString()) ?? null,
        visitorId,
        now,
      });

      if (availability.reason === "AVAILABLE") available += 1;

      const hold = holdByStall.get(stall._id!.toString());
      if (hold && visitorId && hold.visitorId === visitorId) {
        yourHold = { stallId: stall._id!.toString(), stallNumber: stall.stallNumber, expiresAt: hold.expiresAt };
      }

      publicStalls.push({
        id: stall._id!.toString(),
        elementId: element._id!.toString(),
        stallNumber: stall.stallNumber,
        section: stall.section,
        stallType: stall.stallType,
        area: stall.area,
        basePrice: stall.basePrice,
        currency: stall.currency,
        amenities: stall.amenities,
        availability,
      });

      publicElements.push({
        id: element._id!.toString(),
        type: element.type,
        label: stall.stallNumber,
        geometry: element.geometry,
        stallId: stall._id!.toString(),
        // HELD_BY_YOU colours as available, because to this visitor it is theirs to continue.
        status: availability.reason === "HELD_BY_YOU" ? "AVAILABLE" : stall.status,
        bookable: availability.bookable,
        reason: availability.reason,
      });
    }

    publicHalls.push({
      id: hall._id!.toString(),
      name: hall.name,
      canvas: { width: plan.canvasWidth, height: plan.canvasHeight },
      backgroundUrl: background?.url,
      elements: publicElements,
      stalls: publicStalls,
      unbookableCount,
    });
  }

  return {
    exhibition: {
      name: exhibition.name,
      slug: exhibition.slug,
      description: exhibition.description,
      shortDescription: exhibition.shortDescription,
      startDate: exhibition.startDate,
      endDate: exhibition.endDate,
      timezone: exhibition.timezone,
      lifecycle: exhibition.lifecycle,
    },
    bookingOpen,
    halls: publicHalls,
    yourHold,
    totals: { available, total: publicHalls.reduce((sum, hall) => sum + hall.stalls.length, 0) },
  };
}

/** Narrow helper for the embed layout, which only needs to know the exhibition exists. */
export function isPublicLifecycle(lifecycle: string) {
  return (PUBLIC_LIFECYCLES as readonly string[]).includes(lifecycle);
}

export function toObjectId(value: string) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}
