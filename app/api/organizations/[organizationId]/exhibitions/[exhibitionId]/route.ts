import { ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { badRequest, notFoundJson, ok, serverError } from "@/lib/http/responses";
import { exhibitionUpdateSchema } from "@/lib/validation/exhibition";
import type { ExhibitionDocument } from "@/models/exhibition";

async function findExhibition(organizationId: string, exhibitionId: string) {
  if (!ObjectId.isValid(exhibitionId)) return null;
  return (await getDatabase())
    .collection<ExhibitionDocument>("exhibitions")
    .findOne({ _id: new ObjectId(exhibitionId), organizationId: new ObjectId(organizationId) });
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> },
) {
  try {
    const { organizationId, exhibitionId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:view");
    if (!auth.ok) return auth.response;

    const exhibition = await findExhibition(organizationId, exhibitionId);
    if (!exhibition) return notFoundJson("That exhibition could not be found.");

    return ok({ exhibition });
  } catch (cause) {
    return serverError(cause, "GET /api/organizations/[organizationId]/exhibitions/[exhibitionId]");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> },
) {
  try {
    const { organizationId, exhibitionId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:manage");
    if (!auth.ok) return auth.response;

    const existing = await findExhibition(organizationId, exhibitionId);
    if (!existing) return notFoundJson("That exhibition could not be found.");

    const parsed = exhibitionUpdateSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the exhibition details.");

    const { venueId, startDate, endDate, ...data } = parsed.data;
    if (venueId && !ObjectId.isValid(venueId)) return badRequest("That venue could not be found.");

    // A partial update must only compare against the stored dates when the payload omits one of
    // them, otherwise a caller could move the start date past an unchanged end date.
    const nextStart = startDate ? new Date(startDate) : existing.startDate;
    const nextEnd = endDate ? new Date(endDate) : existing.endDate;
    if (nextEnd < nextStart) {
      return badRequest("The end date must be on or after the start date.");
    }

    const updates = {
      ...data,
      ...(startDate ? { startDate: nextStart } : {}),
      ...(endDate ? { endDate: nextEnd } : {}),
      ...(venueId ? { venueId: new ObjectId(venueId) } : {}),
      updatedAt: new Date(),
    };

    await (await getDatabase())
      .collection<ExhibitionDocument>("exhibitions")
      .updateOne({ _id: existing._id }, { $set: updates });

    return ok({ exhibition: await findExhibition(organizationId, exhibitionId) });
  } catch (cause) {
    return serverError(cause, "PATCH /api/organizations/[organizationId]/exhibitions/[exhibitionId]");
  }
}
