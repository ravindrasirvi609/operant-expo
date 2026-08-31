import { ObjectId } from "mongodb";

import { updateStallsBulk } from "@/lib/floor-plans/service";
import { floorPlanErrorResponse, loadPlan } from "@/lib/floor-plans/route-context";
import { readBody } from "@/lib/http/body";
import { badRequest, ok } from "@/lib/http/responses";
import { bulkPriceSchema } from "@/lib/validation/floor-plan";

type RouteParams = { params: Promise<{ organizationId: string; floorPlanId: string }> };

/** Reprices or retypes many stalls in one request, for the inventory surface. */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { organizationId, floorPlanId } = await params;
    const loaded = await loadPlan(organizationId, floorPlanId, "exhibition:manage");
    if ("response" in loaded) return loaded.response;

    const parsed = bulkPriceSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the values you are applying.");

    const { stallIds, ...patch } = parsed.data;
    const result = await updateStallsBulk(loaded.database, {
      plan: loaded.plan,
      organizationId: loaded.organizationId,
      stallIds: stallIds.map((id) => new ObjectId(id)),
      patch,
      actorId: loaded.context.user._id,
    });

    return ok(result);
  } catch (cause) {
    return floorPlanErrorResponse(cause, "PATCH .../floor-plans/[floorPlanId]/stalls/bulk-update");
  }
}
