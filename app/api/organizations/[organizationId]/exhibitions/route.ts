import { MongoServerError, ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { badRequest, conflict, created, ok, serverError } from "@/lib/http/responses";
import { exhibitionCreateSchema } from "@/lib/validation/exhibition";
import type { ExhibitionDocument } from "@/models/exhibition";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:view");
    if (!auth.ok) return auth.response;

    const exhibitions = await (await getDatabase())
      .collection<ExhibitionDocument>("exhibitions")
      .find({ organizationId: new ObjectId(organizationId) })
      .sort({ startDate: -1 })
      .toArray();

    return ok({ exhibitions });
  } catch (cause) {
    return serverError(cause, "GET /api/organizations/[organizationId]/exhibitions");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:manage");
    if (!auth.ok) return auth.response;

    const parsed = exhibitionCreateSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the exhibition details.");

    const database = await getDatabase();
    const { venueId, startDate, endDate, ...data } = parsed.data;

    // Both venue checks report against the `venueId` field so the form highlights the picker
    // rather than showing a sentence with nothing attached to it.
    if (venueId) {
      if (!ObjectId.isValid(venueId)) {
        return badRequest("That venue could not be found.");
      }
      const venue = await database
        .collection("venues")
        .findOne({ _id: new ObjectId(venueId), organizationId: new ObjectId(organizationId) });
      if (!venue) return badRequest("That venue belongs to a different organization.");
    }

    const now = new Date();
    const exhibition: ExhibitionDocument = {
      _id: new ObjectId(),
      organizationId: new ObjectId(organizationId),
      ...data,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      ...(venueId ? { venueId: new ObjectId(venueId) } : {}),
      lifecycle: "DRAFT",
      createdAt: now,
      updatedAt: now,
    };

    try {
      await database.collection<ExhibitionDocument>("exhibitions").insertOne(exhibition);
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11000) {
        return conflict("An exhibition with that URL already exists in this organization.", "SLUG_TAKEN", {
          slug: ["That URL is already used by another exhibition."],
        });
      }
      throw cause;
    }

    return created({ exhibition });
  } catch (cause) {
    return serverError(cause, "POST /api/organizations/[organizationId]/exhibitions");
  }
}
