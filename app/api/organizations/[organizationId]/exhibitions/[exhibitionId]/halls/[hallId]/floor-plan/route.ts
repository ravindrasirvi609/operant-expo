import { ObjectId } from "mongodb";

import { requireApiPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { ensureFloorPlan, floorPlanReadiness } from "@/lib/floor-plans/service";
import { floorPlanErrorResponse } from "@/lib/floor-plans/route-context";
import { readBody } from "@/lib/http/body";
import { assetStorageStatus } from "@/lib/storage";
import { badRequest, created, notFoundJson, ok, serverError } from "@/lib/http/responses";
import { floorPlanCreateSchema, floorPlanUpdateSchema } from "@/lib/validation/floor-plan";
import type { HallDocument } from "@/models/exhibition";
import type { AssetDocument, FloorPlanDocument, MapElementDocument } from "@/models/map";
import type { StallDocument } from "@/models/stall";

type RouteParams = { params: Promise<{ organizationId: string; exhibitionId: string; hallId: string }> };

async function findHall(organizationId: string, exhibitionId: string, hallId: string) {
  if (![exhibitionId, hallId].every(ObjectId.isValid)) return null;
  const database = await getDatabase();
  return database.collection<HallDocument>("halls").findOne({
    _id: new ObjectId(hallId),
    exhibitionId: new ObjectId(exhibitionId),
    organizationId: new ObjectId(organizationId),
  });
}

/**
 * The whole editing surface for a hall in one read: the plan, its elements, the stalls those
 * elements represent, the background URL and the publish checklist.
 *
 * The editor previously made three round trips and still could not tell which rectangles were
 * bookable, because stalls were fetched by hall while elements came from a plan version.
 */
export async function GET(_: Request, { params }: RouteParams) {
  try {
    const { organizationId, exhibitionId, hallId } = await params;
    const auth = await requireApiPermission(organizationId, "exhibition:view");
    if (!auth.ok) return auth.response;

    const hall = await findHall(organizationId, exhibitionId, hallId);
    if (!hall) return notFoundJson("That hall could not be found.");

    const database = await getDatabase();
    const plan = await database
      .collection<FloorPlanDocument>("floorPlans")
      .findOne({ hallId: hall._id!, organizationId: new ObjectId(organizationId) });

    if (!plan) {
      // Not an error: the wizard's first step exists precisely to create it.
      return ok({
        hall,
        floorPlan: null,
        elements: [],
        stalls: [],
        background: null,
        readiness: [],
        storage: { driver: assetStorageStatus().driver },
      });
    }

    const [elements, stalls, background, readiness] = await Promise.all([
      database.collection<MapElementDocument>("mapElements").find({ floorPlanId: plan._id! }).sort({ zIndex: 1 }).toArray(),
      database.collection<StallDocument>("stalls").find({ hallId: hall._id! }).sort({ stallNumber: 1 }).toArray(),
      plan.backgroundAssetId
        ? database.collection<AssetDocument>("assets").findOne({ _id: plan.backgroundAssetId })
        : null,
      floorPlanReadiness(database, plan),
    ]);

    return ok({
      hall,
      floorPlan: plan,
      elements,
      stalls,
      background: background ? { url: background.url, filename: background.filename } : null,
      readiness,
      storage: { driver: assetStorageStatus().driver },
    });
  } catch (cause) {
    return serverError(cause, "GET .../halls/[hallId]/floor-plan");
  }
}

/** Creates the hall's plan, or returns the existing one. Safe to call repeatedly. */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { organizationId, exhibitionId, hallId } = await params;
    const auth = await requireApiPermission(organizationId, "map:edit");
    if (!auth.ok) return auth.response;

    const hall = await findHall(organizationId, exhibitionId, hallId);
    if (!hall) return notFoundJson("That hall could not be found.");

    const parsed = floorPlanCreateSchema.safeParse(await readBody(request).catch(() => ({})));
    if (!parsed.success) return badRequest(parsed.error, "Check the canvas details.");

    const database = await getDatabase();

    let backgroundAssetId: ObjectId | undefined;
    if (parsed.data.backgroundAssetId) {
      const asset = await database.collection<AssetDocument>("assets").findOne({
        _id: new ObjectId(parsed.data.backgroundAssetId),
        organizationId: new ObjectId(organizationId),
      });
      if (!asset) return badRequest("That background image could not be found.");
      backgroundAssetId = asset._id!;
    }

    const { plan, created: wasCreated } = await ensureFloorPlan(database, {
      organizationId: new ObjectId(organizationId),
      exhibitionId: new ObjectId(exhibitionId),
      hall,
      createdBy: auth.context.user._id!,
      canvasWidth: parsed.data.canvasWidth,
      canvasHeight: parsed.data.canvasHeight,
      gridSize: parsed.data.gridSize,
      backgroundAssetId,
    });

    return wasCreated ? created({ floorPlan: plan, created: true }) : ok({ floorPlan: plan, created: false });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "POST .../halls/[hallId]/floor-plan");
  }
}

/** Updates the canvas, the grid pitch, or the background image. */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { organizationId, exhibitionId, hallId } = await params;
    const auth = await requireApiPermission(organizationId, "map:edit");
    if (!auth.ok) return auth.response;

    const hall = await findHall(organizationId, exhibitionId, hallId);
    if (!hall) return notFoundJson("That hall could not be found.");

    const parsed = floorPlanUpdateSchema.safeParse(await readBody(request));
    if (!parsed.success) return badRequest(parsed.error, "Check the canvas details.");

    const database = await getDatabase();
    const organizationObjectId = new ObjectId(organizationId);
    const plan = await database
      .collection<FloorPlanDocument>("floorPlans")
      .findOne({ hallId: hall._id!, organizationId: organizationObjectId });
    if (!plan) return notFoundJson("This hall does not have a floor plan yet.");

    const { backgroundAssetId, ...rest } = parsed.data;
    const updates: Partial<FloorPlanDocument> = { ...rest, updatedAt: new Date() };
    const unset: Record<string, ""> = {};

    if (backgroundAssetId === null) {
      unset.backgroundAssetId = "";
    } else if (backgroundAssetId !== undefined) {
      const asset = await database
        .collection<AssetDocument>("assets")
        .findOne({ _id: new ObjectId(backgroundAssetId), organizationId: organizationObjectId });
      if (!asset) return badRequest("That background image could not be found.");
      updates.backgroundAssetId = asset._id!;
    }

    // Shrinking the canvas below existing content would hide it, which the review checklist would
    // then flag as an error the organizer did not knowingly cause. Refuse up front instead.
    if (rest.canvasWidth !== undefined || rest.canvasHeight !== undefined) {
      const nextWidth = rest.canvasWidth ?? plan.canvasWidth;
      const nextHeight = rest.canvasHeight ?? plan.canvasHeight;
      const elements = await database
        .collection<MapElementDocument>("mapElements")
        .find({ floorPlanId: plan._id! })
        .toArray();
      const spilling = elements.filter(
        (element) =>
          element.geometry.x + element.geometry.width > nextWidth ||
          element.geometry.y + element.geometry.height > nextHeight,
      );
      if (spilling.length > 0) {
        return badRequest(
          `${spilling.length} element${spilling.length === 1 ? "" : "s"} would fall outside a ${nextWidth} x ${nextHeight} canvas. Move ${spilling.length === 1 ? "it" : "them"} first, or choose a larger canvas.`,
        );
      }
    }

    const result = await database
      .collection<FloorPlanDocument>("floorPlans")
      .findOneAndUpdate(
        { _id: plan._id! },
        { $set: updates, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
        { returnDocument: "after" },
      );

    return ok({ floorPlan: result });
  } catch (cause) {
    return floorPlanErrorResponse(cause, "PATCH .../halls/[hallId]/floor-plan");
  }
}
