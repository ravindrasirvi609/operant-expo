import { publishFloorPlan } from "@/lib/floor-plans/service";
import { floorPlanErrorResponse, loadPlan } from "@/lib/floor-plans/route-context";
import { ok } from "@/lib/http/responses";

type RouteParams = { params: Promise<{ organizationId: string; floorPlanId: string }> };

/**
 * Publishes the hall's plan, after the readiness checklist passes.
 *
 * With one plan per hall there is no longer any archiving of siblings to do — the previous handler
 * flipped every other published plan for the hall to ARCHIVED, a step that only existed because a
 * hall could hold several. Refusing to publish a plan visitors could not book from is new: that
 * state is what made the public map look broken.
 */
export async function POST(_: Request, { params }: RouteParams) {
  try {
    const { organizationId, floorPlanId } = await params;
    const loaded = await loadPlan(organizationId, floorPlanId, "map:edit");
    if ("response" in loaded) return loaded.response;

    const result = await publishFloorPlan(loaded.database, {
      plan: loaded.plan,
      organizationId: loaded.organizationId,
      actorId: loaded.context.user._id,
    });

    return ok({ floorPlan: result.plan, readiness: result.checks });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "POST .../floor-plans/[floorPlanId]/publish");
  }
}
