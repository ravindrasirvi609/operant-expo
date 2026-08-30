import { MongoServerError, ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { badRequest, conflict, created, ok, serverError } from "@/lib/http/responses";
import { venueSchema } from "@/lib/validation/exhibition";
import type { VenueDocument } from "@/models/exhibition";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:view");
    if (!auth.ok) return auth.response;

    const venues = await (await getDatabase())
      .collection<VenueDocument>("venues")
      .find({ organizationId: new ObjectId(organizationId) })
      .sort({ name: 1 })
      .toArray();

    return ok({ venues });
  } catch (cause) {
    return serverError(cause, "GET /api/organizations/[organizationId]/venues");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await params;
    // Creating a venue is exhibition setup, not organization administration. This previously
    // required "organization:manage", which only OWNER holds — so an ORGANIZER_ADMIN was shown
    // the venue form and got a permission error on submit.
    const auth = await requireApiPermission(organizationId, "exhibition:manage");
    if (!auth.ok) return auth.response;

    const parsed = venueSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the venue details.");

    const now = new Date();
    const venue: VenueDocument = {
      _id: new ObjectId(),
      organizationId: new ObjectId(organizationId),
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await (await getDatabase()).collection<VenueDocument>("venues").insertOne(venue);
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11000) {
        return conflict("A venue with that name already exists.", "VENUE_EXISTS", {
          name: ["A venue with that name already exists."],
        });
      }
      throw cause;
    }

    return created({ venue });
  } catch (cause) {
    return serverError(cause, "POST /api/organizations/[organizationId]/venues");
  }
}
