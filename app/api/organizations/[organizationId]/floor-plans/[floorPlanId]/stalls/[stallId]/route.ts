import { ObjectId } from "mongodb";

import { deletePlanStall, updatePlanStall } from "@/lib/floor-plans/service";
import { floorPlanErrorResponse, loadPlan } from "@/lib/floor-plans/route-context";
import { readBody } from "@/lib/http/body";
import { badRequest, notFoundJson, ok } from "@/lib/http/responses";
import { planStallUpdateSchema } from "@/lib/validation/floor-plan";

type RouteParams = { params: Promise<{ organizationId: string; floorPlanId: string; stallId: string }> };

/** Moves, resizes, renames or reprices a stall. Geometry and commercial fields in one call. */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { organizationId, floorPlanId, stallId } = await params;
    if (!ObjectId.isValid(stallId)) return notFoundJson("That stall could not be found.");

    const loaded = await loadPlan(organizationId, floorPlanId, "map:edit");
    if ("response" in loaded) return loaded.response;

    const parsed = planStallUpdateSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the stall details.");

    const result = await updatePlanStall(loaded.database, {
      plan: loaded.plan,
      stallId: new ObjectId(stallId),
      organizationId: loaded.organizationId,
      patch: parsed.data,
      actorId: loaded.context.user._id,
    });

    return ok({ stall: result.stall, element: result.element });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "PATCH .../floor-plans/[floorPlanId]/stalls/[stallId]");
  }
}

/** Removes a stall and its rectangle, unless a hold or booking depends on it. */
export async function DELETE(_: Request, { params }: RouteParams) {
  try {
    const { organizationId, floorPlanId, stallId } = await params;
    if (!ObjectId.isValid(stallId)) return notFoundJson("That stall could not be found.");

    const loaded = await loadPlan(organizationId, floorPlanId, "map:edit");
    if ("response" in loaded) return loaded.response;

    const result = await deletePlanStall(loaded.database, {
      plan: loaded.plan,
      stallId: new ObjectId(stallId),
      organizationId: loaded.organizationId,
      actorId: loaded.context.user._id,
    });

    return ok({ deleted: true, stallNumber: result.stallNumber });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "DELETE .../floor-plans/[floorPlanId]/stalls/[stallId]");
  }
}
