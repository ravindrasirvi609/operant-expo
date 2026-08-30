import { loadStallContext } from "@/lib/booking/holds";
import { readVisitorId } from "@/lib/booking/visitor";
import { getDatabase } from "@/lib/db/client";
import { notFoundJson, ok, serverError } from "@/lib/http/responses";
import type { HallDocument } from "@/models/exhibition";

type RouteParams = { params: Promise<{ exhibitionSlug: string; stallId: string }> };

/**
 * One stall, for the detail sheet a visitor sees before committing to anything.
 *
 * The booking page used to ask for company details without ever naming the stall, its size or its
 * price. Nothing is held by reading this — a reservation starts only when the visitor asks.
 */
export async function GET(_: Request, { params }: RouteParams) {
  try {
    const { exhibitionSlug, stallId } = await params;
    const visitorId = await readVisitorId();

    const database = await getDatabase();
    const context = await loadStallContext(database, { exhibitionSlug, stallId, visitorId });
    if (!context) return notFoundJson("That stall could not be found.");

    const { stall, exhibition, availability, hold } = context;
    if (stall.visibility !== "PUBLIC") return notFoundJson("That stall could not be found.");

    const hall = await database.collection<HallDocument>("halls").findOne({ _id: stall.hallId });

    return ok({
      stall: {
        id: stall._id!.toString(),
        stallNumber: stall.stallNumber,
        section: stall.section,
        stallType: stall.stallType,
        width: stall.width,
        height: stall.height,
        area: stall.area,
        areaLabel: `${stall.area} m²`,
        basePrice: stall.basePrice,
        currency: stall.currency,
        amenities: stall.amenities,
        description: stall.description,
        hallName: hall?.name ?? null,
      },
      exhibition: { name: exhibition.name, slug: exhibition.slug, lifecycle: exhibition.lifecycle },
      availability,
      // Present only when it is this visitor's own hold, so the sheet can offer "continue".
      yourHold:
        hold && hold.visitorId === visitorId ? { expiresAt: hold.expiresAt, id: hold._id!.toString() } : null,
    });
  } catch (cause) {
    return serverError(cause, "GET /api/public/exhibitions/[slug]/stalls/[stallId]");
  }
}
