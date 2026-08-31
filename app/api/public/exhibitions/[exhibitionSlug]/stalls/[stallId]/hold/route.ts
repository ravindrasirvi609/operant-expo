import { HoldError, loadStallContext, requestHold } from "@/lib/booking/holds";
import { readVisitorId } from "@/lib/booking/visitor";
import { getDatabase } from "@/lib/db/client";
import { conflict, created, notFoundJson, ok, serverError, unprocessable } from "@/lib/http/responses";

type RouteParams = { params: Promise<{ exhibitionSlug: string; stallId: string }> };

/**
 * Starts or resumes this visitor's reservation.
 *
 * Reloading this endpoint used to lock the visitor out of their own stall: it demanded status
 * AVAILABLE, and their first request had already flipped the stall to HELD. Now their own hold is
 * returned unchanged, somebody else's hold is a 409 that says how long is left, and an exhibition
 * that is not open for booking answers 422 saying so rather than blaming the stall.
 */
export async function POST(_: Request, { params }: RouteParams) {
  try {
    const { exhibitionSlug, stallId } = await params;
    const visitorId = await readVisitorId();
    if (!visitorId) {
      // The proxy mints this on every public path, so its absence means cookies are blocked.
      return unprocessable(
        "Your browser is blocking cookies, which are needed to hold a stall for you. Enable them and try again.",
        "NO_VISITOR_COOKIE",
      );
    }

    const database = await getDatabase();
    const context = await loadStallContext(database, { exhibitionSlug, stallId, visitorId });
    if (!context) return notFoundJson("That stall could not be found.");

    const result = await requestHold(database, { context, visitorId });
    const body = {
      hold: {
        id: result.hold._id!.toString(),
        expiresAt: result.hold.expiresAt,
        resumed: result.resumed,
      },
      stall: {
        id: context.stall._id!.toString(),
        stallNumber: context.stall.stallNumber,
        basePrice: context.stall.basePrice,
        currency: context.stall.currency,
      },
    };

    // A resumed hold is not a new resource, so it answers 200 rather than 201.
    return result.resumed ? ok(body) : created(body);
  } catch (cause) {
    if (cause instanceof HoldError) {
      return cause.status === 422
        ? unprocessable(cause.message, cause.code)
        : conflict(cause.message, cause.code);
    }
    return serverError(cause, "POST /api/public/exhibitions/[slug]/stalls/[stallId]/hold");
  }
}
