import { createStallGrid } from "@/lib/floor-plans/service";
import { floorPlanErrorResponse, loadPlan } from "@/lib/floor-plans/route-context";
import { readBody } from "@/lib/http/body";
import { badRequest, created } from "@/lib/http/responses";
import { bulkStallSchema } from "@/lib/validation/floor-plan";

type RouteParams = { params: Promise<{ organizationId: string; floorPlanId: string }> };

/**
 * Generates a grid of numbered, priced stalls in one transaction.
 *
 * This is the difference between laying out a hall in one dialog and doing it one rectangle at a
 * time. All or nothing: the whole request is validated against the canvas and against existing
 * stall numbers before anything is written.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { organizationId, floorPlanId } = await params;
    const loaded = await loadPlan(organizationId, floorPlanId, "map:edit");
    if ("response" in loaded) return loaded.response;

    const parsed = bulkStallSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the grid settings.");

    const results = await createStallGrid(loaded.database, {
      plan: loaded.plan,
      organizationId: loaded.organizationId,
      request: parsed.data,
      actorId: loaded.context.user._id,
    });

    return created({
      count: results.length,
      stalls: results.map((result) => result.stall),
      elements: results.map((result) => result.element),
    });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "POST .../floor-plans/[floorPlanId]/stalls/bulk");
  }
}
