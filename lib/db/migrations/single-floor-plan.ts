import { ObjectId, type Db } from "mongodb";

import { DEFAULT_GRID_SIZE, MAX_CANVAS_UNITS } from "@/lib/floor-plans/units";
import type { FloorPlanDocument, MapElementDocument } from "@/models/map";
import type { StallDocument } from "@/models/stall";

/**
 * The pre-migration shape: versioned sibling documents per hall, with an ARCHIVED state and no
 * `revision` or `gridSize`. Written as an Omit rather than an intersection so the wider `status`
 * union actually applies instead of being narrowed back by the current model.
 */
type LegacyFloorPlan = Omit<FloorPlanDocument, "status" | "revision" | "gridSize"> & {
  version?: number;
  revision?: number;
  gridSize?: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

export type MigrationAction =
  | { kind: "keep-plan"; hallId: string; planId: string; status: string; revision: number }
  | { kind: "delete-plan"; hallId: string; planId: string; reason: string }
  | { kind: "reparent-element"; elementId: string; fromPlanId: string; toPlanId: string; reason: string }
  | { kind: "delete-element"; elementId: string; planId: string; reason: string }
  | { kind: "grow-canvas"; planId: string; from: string; to: string; reason: string }
  | { kind: "backfill-plan"; planId: string; fields: string[] };

export type MigrationWarning = { kind: string; detail: string; ids: string[] };

export type MigrationReport = {
  applied: boolean;
  hallsInspected: number;
  hallsWithMultiplePlans: number;
  actions: MigrationAction[];
  warnings: MigrationWarning[];
};

/**
 * Collapses the versioned floor-plan model down to one living plan per hall.
 *
 * Ordering of concerns, highest first:
 *   1. Never lose a stall. Any element a stall points at is re-parented onto the surviving plan,
 *      even if that element came from an old version — dropping it would strand a stall that may
 *      already carry a booking.
 *   2. Never lose the live layout. A PUBLISHED plan always wins the survivor election.
 *   3. Prefer the layout with real work in it, so a hall whose latest version is an empty draft
 *      (the state the old setup form produced on every visit) recovers its stalls.
 *
 * Anything it cannot resolve safely — two stalls claiming one element, a stall pointing at an
 * element that no longer exists — is reported rather than guessed at.
 *
 * Dry run by default: pass `{ apply: true }` to write.
 */
export async function migrateToSingleFloorPlan(
  database: Db,
  { apply = false }: { apply?: boolean } = {},
): Promise<MigrationReport> {
  const actions: MigrationAction[] = [];
  const warnings: MigrationWarning[] = [];

  const plans = (await database
    .collection<LegacyFloorPlan>("floorPlans")
    .find({})
    .toArray()) as LegacyFloorPlan[];

  const byHall = new Map<string, LegacyFloorPlan[]>();
  for (const plan of plans) {
    const key = plan.hallId.toString();
    const list = byHall.get(key) ?? [];
    list.push(plan);
    byHall.set(key, list);
  }

  // Element -> stall references, so the survivor election can protect linked elements.
  const stalls = await database.collection<StallDocument>("stalls").find({}).toArray();
  const stallsByElement = new Map<string, StallDocument[]>();
  for (const stall of stalls) {
    if (!stall.floorPlanElementId) continue;
    const key = stall.floorPlanElementId.toString();
    const list = stallsByElement.get(key) ?? [];
    list.push(stall);
    stallsByElement.set(key, list);
  }

  const duplicateElementRefs = Array.from(stallsByElement.entries()).filter(([, list]) => list.length > 1);
  if (duplicateElementRefs.length > 0) {
    warnings.push({
      kind: "duplicate-element-reference",
      detail:
        "These floor-plan elements are claimed by more than one stall. The one-stall-per-element index cannot be created until each element has a single stall. Decide which stall to keep — the migration will not delete a stall for you.",
      ids: duplicateElementRefs.map(
        ([elementId, list]) => `${elementId} <- ${list.map((stall) => stall.stallNumber).join(", ")}`,
      ),
    });
  }

  let hallsWithMultiplePlans = 0;

  for (const [hallId, hallPlans] of byHall) {
    const elementCounts = new Map<string, number>();
    for (const plan of hallPlans) {
      elementCounts.set(
        plan._id!.toString(),
        await database.collection<MapElementDocument>("mapElements").countDocuments({ floorPlanId: plan._id }),
      );
    }

    const byVersionDescending = [...hallPlans].sort((a, b) => (b.version ?? b.revision ?? 0) - (a.version ?? a.revision ?? 0));
    const published = byVersionDescending.filter((plan) => plan.status === "PUBLISHED");
    const withMostElements = [...byVersionDescending].sort(
      (a, b) => (elementCounts.get(b._id!.toString()) ?? 0) - (elementCounts.get(a._id!.toString()) ?? 0),
    );

    const keeper =
      published[0] ??
      (elementCounts.get(withMostElements[0]._id!.toString()) ? withMostElements[0] : byVersionDescending[0]);
    const keeperId = keeper._id!;
    const discarded = hallPlans.filter((plan) => !plan._id!.equals(keeperId));
    if (hallPlans.length > 1) hallsWithMultiplePlans += 1;

    const revision = Math.max(...hallPlans.map((plan) => plan.version ?? plan.revision ?? 1), 1);
    actions.push({
      kind: "keep-plan",
      hallId,
      planId: keeperId.toString(),
      status: keeper.status === "ARCHIVED" ? "DRAFT" : keeper.status,
      revision,
    });

    let canvasWidth = keeper.canvasWidth;
    let canvasHeight = keeper.canvasHeight;

    for (const plan of discarded) {
      const elements = await database
        .collection<MapElementDocument>("mapElements")
        .find({ floorPlanId: plan._id })
        .toArray();

      const keeperHasElements = (elementCounts.get(keeperId.toString()) ?? 0) > 0;

      for (const element of elements) {
        const linked = stallsByElement.has(element._id!.toString());
        // A linked element must survive. An unlinked one only survives when the keeper is empty,
        // which is how a hall left holding an empty newest draft gets its layout back.
        const shouldKeep = linked || !keeperHasElements;

        if (!shouldKeep) {
          actions.push({
            kind: "delete-element",
            elementId: element._id!.toString(),
            planId: plan._id!.toString(),
            reason: "on a superseded plan and not linked to any stall",
          });
          if (apply) {
            await database.collection<MapElementDocument>("mapElements").deleteOne({ _id: element._id });
          }
          continue;
        }

        actions.push({
          kind: "reparent-element",
          elementId: element._id!.toString(),
          fromPlanId: plan._id!.toString(),
          toPlanId: keeperId.toString(),
          reason: linked ? "linked to a stall" : "recovering the layout of an empty surviving plan",
        });
        if (apply) {
          await database
            .collection<MapElementDocument>("mapElements")
            .updateOne({ _id: element._id }, { $set: { floorPlanId: keeperId, updatedAt: new Date() } });
        }

        // Geometry came from the donor's coordinate space, so the survivor must be at least large
        // enough to contain it, or the element would sit outside its own canvas.
        canvasWidth = Math.min(MAX_CANVAS_UNITS, Math.max(canvasWidth, element.geometry.x + element.geometry.width));
        canvasHeight = Math.min(MAX_CANVAS_UNITS, Math.max(canvasHeight, element.geometry.y + element.geometry.height));
      }

      actions.push({
        kind: "delete-plan",
        hallId,
        planId: plan._id!.toString(),
        reason: `superseded by plan ${keeperId.toString()}`,
      });
      if (apply) {
        await database.collection<FloorPlanDocument>("floorPlans").deleteOne({ _id: plan._id });
      }
    }

    if (canvasWidth !== keeper.canvasWidth || canvasHeight !== keeper.canvasHeight) {
      actions.push({
        kind: "grow-canvas",
        planId: keeperId.toString(),
        from: `${keeper.canvasWidth}x${keeper.canvasHeight}`,
        to: `${canvasWidth}x${canvasHeight}`,
        reason: "to contain elements recovered from a superseded plan",
      });
    }

    const backfilled: string[] = [];
    if (keeper.revision !== revision) backfilled.push("revision");
    if (keeper.gridSize === undefined) backfilled.push("gridSize");
    if (keeper.status === "ARCHIVED") backfilled.push("status");
    if (backfilled.length > 0) {
      actions.push({ kind: "backfill-plan", planId: keeperId.toString(), fields: backfilled });
    }

    if (apply) {
      await database.collection<FloorPlanDocument>("floorPlans").updateOne(
        { _id: keeperId },
        {
          $set: {
            revision,
            gridSize: keeper.gridSize ?? DEFAULT_GRID_SIZE,
            status: keeper.status === "ARCHIVED" ? "DRAFT" : keeper.status,
            canvasWidth,
            canvasHeight,
            updatedAt: new Date(),
          },
          $unset: { version: "" },
        },
      );
    }
  }

  // Stalls whose element no longer resolves are unbookable and invisible on the map; naming them
  // is more useful than deleting them, since they may carry pricing worth re-linking.
  const elementIds = new Set(
    (await database.collection<MapElementDocument>("mapElements").find({}, { projection: { _id: 1 } }).toArray()).map(
      (element) => element._id!.toString(),
    ),
  );
  const orphanedStalls = stalls.filter(
    (stall) => !stall.floorPlanElementId || !elementIds.has(stall.floorPlanElementId.toString()),
  );
  if (orphanedStalls.length > 0) {
    warnings.push({
      kind: "orphaned-stall",
      detail:
        "These stalls point at a floor-plan element that does not exist, so they cannot appear on the map or be booked. Re-link them in the floor-plan editor, or delete them.",
      ids: orphanedStalls.map((stall) => `${stall.stallNumber} (${stall._id!.toString()})`),
    });
  }

  return {
    applied: apply,
    hallsInspected: byHall.size,
    hallsWithMultiplePlans,
    actions,
    warnings,
  };
}

/** Convenience for the route: is anything still blocking the unique indexes? */
export function migrationIsBlocked(report: MigrationReport) {
  return report.warnings.some((warning) => warning.kind === "duplicate-element-reference");
}

export function toObjectId(value: string) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}
