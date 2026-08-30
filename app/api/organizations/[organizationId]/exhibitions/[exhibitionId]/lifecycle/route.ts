import { ObjectId } from "mongodb";
import { z } from "zod";

import { requireApiPermission } from "@/lib/auth/authorization";
import { writeAudit } from "@/lib/audit";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { badRequest, notFoundJson, ok, serverError, unprocessable } from "@/lib/http/responses";
import type { ExhibitionDocument } from "@/models/exhibition";

/** Transitions an organizer may request. DRAFT and SETUP are entry states, not targets. */
const lifecycleSchema = z.object({
  lifecycle: z.enum(["PUBLISHED", "BOOKING_OPEN", "BOOKING_CLOSED", "COMPLETED", "ARCHIVED"], {
    error: "Choose a valid status for this exhibition.",
  }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> },
) {
  try {
    const { organizationId, exhibitionId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:manage");
    if (!auth.ok) return auth.response;
    if (!ObjectId.isValid(exhibitionId)) return notFoundJson("That exhibition could not be found.");

    const parsed = lifecycleSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Choose a valid status.");
    const next = parsed.data.lifecycle;

    const database = await getDatabase();
    const exhibition = await database
      .collection<ExhibitionDocument>("exhibitions")
      .findOne({ _id: new ObjectId(exhibitionId), organizationId: new ObjectId(organizationId) });
    if (!exhibition) return notFoundJson("That exhibition could not be found.");

    if (exhibition.lifecycle === next) {
      return unprocessable(`This exhibition is already ${next.toLowerCase().replace(/_/g, " ")}.`, "NO_CHANGE");
    }

    // Publishing puts the exhibition in front of visitors, so it needs somewhere for them to
    // look. A 422 rather than a 400: the request is well-formed, the resource just is not ready.
    if (next === "PUBLISHED") {
      const activeHall = await database.collection("halls").findOne({
        exhibitionId: exhibition._id,
        organizationId: exhibition.organizationId,
        status: "ACTIVE",
      });
      if (!activeHall) {
        return unprocessable("Add at least one active hall before publishing this exhibition.", "NO_ACTIVE_HALL");
      }
    }

    const result = await database
      .collection<ExhibitionDocument>("exhibitions")
      .findOneAndUpdate(
        { _id: exhibition._id, lifecycle: exhibition.lifecycle },
        { $set: { lifecycle: next, updatedAt: new Date() } },
        { returnDocument: "after" },
      );

    // Guarding on the previous lifecycle makes a concurrent change fail loudly instead of one
    // organizer silently overwriting another's transition.
    if (!result) {
      return unprocessable("Someone else just changed this exhibition. Reload and try again.", "STALE_LIFECYCLE");
    }

    await writeAudit(database, {
      organizationId: new ObjectId(organizationId),
      actorId: auth.context.user._id,
      action: "exhibition.lifecycle",
      entityType: "Exhibition",
      entityId: exhibitionId,
      before: { lifecycle: exhibition.lifecycle },
      after: { lifecycle: next },
    });

    return ok({ exhibition: result });
  } catch (cause) {
    return serverError(cause, "POST .../exhibitions/[exhibitionId]/lifecycle");
  }
}
