import { ObjectId } from "mongodb";

import { fitsInCanvas } from "@/lib/floor-plans/geometry";
import { floorPlanErrorResponse, loadPlan } from "@/lib/floor-plans/route-context";
import { readBody } from "@/lib/http/body";
import { badRequest, created, ok } from "@/lib/http/responses";
import { nonStallElementSchema } from "@/lib/validation/floor-plan";
import type { MapElementDocument } from "@/models/map";

type RouteParams = { params: Promise<{ organizationId: string; floorPlanId: string }> };

export async function GET(_: Request, { params }: RouteParams) {
  try {
    const { organizationId, floorPlanId } = await params;
    const loaded = await loadPlan(organizationId, floorPlanId, "exhibition:view");
    if ("response" in loaded) return loaded.response;

    const elements = await loaded.database
      .collection<MapElementDocument>("mapElements")
      .find({ floorPlanId: loaded.plan._id! })
      .sort({ zIndex: 1 })
      .toArray();

    return ok({ elements });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "GET .../floor-plans/[floorPlanId]/elements");
  }
}

/**
 * Adds a non-stall element: an entrance, exit, zone, stage or walkway.
 *
 * Stalls go through .../stalls instead, which creates the bookable record alongside the rectangle.
 * This endpoint used to accept type STALL too, which is exactly how unbookable rectangles were
 * created — so it now rejects that with a pointer to the right endpoint.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { organizationId, floorPlanId } = await params;
    const loaded = await loadPlan(organizationId, floorPlanId, "map:edit");
    if ("response" in loaded) return loaded.response;

    const parsed = nonStallElementSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the element details.");

    if (!fitsInCanvas(parsed.data.geometry, loaded.plan)) {
      return badRequest(
        `That position falls outside the ${loaded.plan.canvasWidth} x ${loaded.plan.canvasHeight} canvas.`,
      );
    }

    const now = new Date();
    const element: MapElementDocument = {
      _id: new ObjectId(),
      organizationId: loaded.organizationId,
      exhibitionId: loaded.plan.exhibitionId,
      hallId: loaded.plan.hallId,
      floorPlanId: loaded.plan._id!,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    };

    await loaded.database.collection<MapElementDocument>("mapElements").insertOne(element);
    return created({ element });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "POST .../floor-plans/[floorPlanId]/elements");
  }
}
