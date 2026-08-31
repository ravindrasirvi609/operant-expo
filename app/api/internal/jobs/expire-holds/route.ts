import { sweepExpiredHolds } from "@/lib/booking/holds";
import { getDatabase } from "@/lib/db/client";
import { ok, serverError, unauthorizedJson } from "@/lib/http/responses";

/**
 * Releases lapsed reservations across every exhibition.
 *
 * Public reads now sweep their own exhibition, so the map stays honest even if this schedule lapses.
 * This remains the backstop for stalls nobody happens to look at — without it, a held stall in an
 * exhibition with no traffic would never return to the pool.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.JOB_SECRET || request.headers.get("x-job-secret") !== process.env.JOB_SECRET) {
      return unauthorizedJson("This endpoint requires a valid x-job-secret header.");
    }

    const result = await sweepExpiredHolds(await getDatabase());
    return ok(result);
  } catch (cause) {
    return serverError(cause, "POST /api/internal/jobs/expire-holds");
  }
}
