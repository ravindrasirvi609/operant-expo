import { loadPublicExhibition } from "@/lib/booking/public-exhibition";
import { readVisitorId } from "@/lib/booking/visitor";
import { getDatabase } from "@/lib/db/client";
import { notFoundJson, ok, serverError } from "@/lib/http/responses";

type RouteParams = { params: Promise<{ exhibitionSlug: string }> };

/**
 * The public exhibition feed, used by the embeddable widget and any external integration.
 *
 * Availability is decided server-side and travels with each stall, so a consumer never has to
 * reimplement the rules — and cannot get them wrong the way the old page did by falling back to a
 * status field on the map element.
 */
export async function GET(_: Request, { params }: RouteParams) {
  try {
    const { exhibitionSlug } = await params;
    const visitorId = await readVisitorId();

    const database = await getDatabase();
    const view = await loadPublicExhibition(database, { slug: exhibitionSlug, visitorId });
    if (!view) return notFoundJson("That exhibition could not be found.");

    return ok(view);
  } catch (cause) {
    return serverError(cause, "GET /api/public/exhibitions/[slug]");
  }
}
