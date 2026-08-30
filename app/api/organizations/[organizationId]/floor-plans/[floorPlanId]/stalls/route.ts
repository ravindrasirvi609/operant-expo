import { createPlanStall } from "@/lib/floor-plans/service";
import { floorPlanErrorResponse, loadPlan } from "@/lib/floor-plans/route-context";
import { readBody } from "@/lib/http/body";
import { badRequest, created } from "@/lib/http/responses";
import { planStallCreateSchema } from "@/lib/validation/floor-plan";

type RouteParams = { params: Promise<{ organizationId: string; floorPlanId: string }> };

/**
 * Places one stall: its rectangle and its bookable inventory record, together in one transaction.
 *
 * Previously two separate actions on two separate screens, which is how a published map came to
 * show rectangles that nobody could book.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { organizationId, floorPlanId } = await params;
    const loaded = await loadPlan(organizationId, floorPlanId, "map:edit");
    if ("response" in loaded) return loaded.response;

    const parsed = planStallCreateSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the stall details.");

    const result = await createPlanStall(loaded.database, {
      plan: loaded.plan,
      organizationId: loaded.organizationId,
      input: parsed.data,
      actorId: loaded.context.user._id,
    });

    return created({ stall: result.stall, element: result.element });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "POST .../floor-plans/[floorPlanId]/stalls");
  }
}
