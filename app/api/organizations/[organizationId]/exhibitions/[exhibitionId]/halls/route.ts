import { MongoServerError, ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import { badRequest, conflict, created, notFoundJson, ok, serverError } from "@/lib/http/responses";
import { hallSchema } from "@/lib/validation/exhibition";
import type { ExhibitionDocument, HallDocument } from "@/models/exhibition";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> },
) {
  try {
    const { organizationId, exhibitionId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:view");
    if (!auth.ok) return auth.response;
    if (!ObjectId.isValid(exhibitionId)) return notFoundJson("That exhibition could not be found.");

    const halls = await (await getDatabase())
      .collection<HallDocument>("halls")
      .find({ organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId) })
      .sort({ name: 1 })
      .toArray();

    return ok({ halls });
  } catch (cause) {
    return serverError(cause, "GET .../exhibitions/[exhibitionId]/halls");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string; exhibitionId: string }> },
) {
  try {
    const { organizationId, exhibitionId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:manage");
    if (!auth.ok) return auth.response;
    if (!ObjectId.isValid(exhibitionId)) return notFoundJson("That exhibition could not be found.");

    const database = await getDatabase();
    const exhibition = await database
      .collection<ExhibitionDocument>("exhibitions")
      .findOne({ _id: new ObjectId(exhibitionId), organizationId: new ObjectId(organizationId) });
    if (!exhibition) return notFoundJson("That exhibition could not be found.");

    const parsed = hallSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the hall details.");

    const now = new Date();
    const hall: HallDocument = {
      _id: new ObjectId(),
      organizationId: new ObjectId(organizationId),
      exhibitionId: new ObjectId(exhibitionId),
      ...parsed.data,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    try {
      await database.collection<HallDocument>("halls").insertOne(hall);
    } catch (cause) {
      // The unique index is on { exhibitionId, code }, so the clash is always the code.
      if (cause instanceof MongoServerError && cause.code === 11000) {
        return conflict("This exhibition already has a hall with that code.", "HALL_CODE_TAKEN", {
          code: ["This exhibition already has a hall with that code."],
        });
      }
      throw cause;
    }

    return created({ hall });
  } catch (cause) {
    return serverError(cause, "POST .../exhibitions/[exhibitionId]/halls");
  }
}
