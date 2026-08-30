import { BookingError, createBooking, findReplay } from "@/lib/bookings/create";
import { loadStallContext } from "@/lib/booking/holds";
import { readVisitorId } from "@/lib/booking/visitor";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { badRequest, conflict, created, notFoundJson, ok, serverError, unprocessable } from "@/lib/http/responses";
import { bookingSchema } from "@/lib/validation/booking";

type RouteParams = { params: Promise<{ exhibitionSlug: string }> };

/**
 * Turns this visitor's held stall into a booking.
 *
 * The logic lives in lib/bookings/create.ts; this handler is the HTTP edge. The previous version was
 * one 15-line-long statement whose catch-all mapped every failure to 409 and echoed the raw
 * `error.message` to anonymous callers, so a driver or transaction fault was published verbatim and
 * reported as a conflict.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { exhibitionSlug } = await params;

    const parsed = bookingSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check your details.");

    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || undefined;
    const database = await getDatabase();

    // Answered before any state is touched, so a retried submission cannot double-book.
    const replay = await findReplay(database, idempotencyKey);
    if (replay) return ok({ booking: replay, idempotentReplay: true });

    const visitorId = await readVisitorId();
    const context = await loadStallContext(database, {
      exhibitionSlug,
      stallId: parsed.data.stallId,
      visitorId,
    });
    if (!context) return notFoundJson("That stall could not be found.");

    const result = await createBooking(database, {
      context,
      input: parsed.data,
      visitorId,
      idempotencyKey,
    });

    const body = {
      booking: result.booking,
      invoice: result.invoice,
      payment: result.payment,
      ...(result.replayed ? { idempotentReplay: true } : {}),
    };
    return result.replayed ? ok(body) : created(body);
  } catch (cause) {
    if (cause instanceof BookingError) {
      return cause.status === 422
        ? unprocessable(cause.message, cause.code)
        : conflict(cause.message, cause.code);
    }
    return serverError(cause, "POST /api/public/exhibitions/[slug]/bookings");
  }
}
