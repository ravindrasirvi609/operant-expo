import { ObjectId, type ClientSession, type Db } from "mongodb";
import type { z } from "zod";

import { writeAudit } from "@/lib/audit";
import { withTransaction } from "@/lib/db/transaction";
import { fitsInCanvas, generateGrid, gridFootprint, type Rect } from "@/lib/floor-plans/geometry";
import { DEFAULT_GRID_SIZE, canvasSizeForHall, unitsToMetres } from "@/lib/floor-plans/units";
import type {
  bulkStallSchema,
  planStallCreateSchema,
  planStallUpdateSchema,
} from "@/lib/validation/floor-plan";
import type { FloorPlanDocument, MapElementDocument } from "@/models/map";
import type { HallDocument } from "@/models/exhibition";
import type { StallDocument } from "@/models/stall";
import type { BookingDocument, ReservationHoldDocument } from "@/models/booking";

/** A failure the caller should report to the user, with the HTTP shape it deserves. */
export class FloorPlanError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    message: string,
    { status = 409, code = "CONFLICT", fieldErrors }: { status?: number; code?: string; fieldErrors?: Record<string, string[]> } = {},
  ) {
    super(message);
    this.name = "FloorPlanError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export type PlanStall = { element: MapElementDocument; stall: StallDocument };

/* ---------------------------------------------------------------------------
   Plan lifecycle
   --------------------------------------------------------------------------- */

/**
 * Returns the hall's floor plan, creating it if absent.
 *
 * Idempotent by design. The old endpoint minted a new version on every call, so re-entering the
 * setup form produced an empty draft that the editor then loaded in preference to the real layout.
 * Here a second call returns the same document, and the canvas defaults to the hall's own
 * dimensions rather than a hardcoded size unrelated to the room.
 */
export async function ensureFloorPlan(
  database: Db,
  {
    organizationId,
    exhibitionId,
    hall,
    createdBy,
    canvasWidth,
    canvasHeight,
    gridSize,
    backgroundAssetId,
  }: {
    organizationId: ObjectId;
    exhibitionId: ObjectId;
    hall: HallDocument;
    createdBy: ObjectId;
    canvasWidth?: number;
    canvasHeight?: number;
    gridSize?: number;
    backgroundAssetId?: ObjectId;
  },
): Promise<{ plan: FloorPlanDocument; created: boolean }> {
  const existing = await database
    .collection<FloorPlanDocument>("floorPlans")
    .findOne({ hallId: hall._id!, organizationId });

  if (existing) {
    // A repeat call may still carry a background the organizer has just uploaded.
    if (backgroundAssetId && !existing.backgroundAssetId?.equals(backgroundAssetId)) {
      const updated = await database.collection<FloorPlanDocument>("floorPlans").findOneAndUpdate(
        { _id: existing._id },
        { $set: { backgroundAssetId, updatedAt: new Date() } },
        { returnDocument: "after" },
      );
      return { plan: updated ?? existing, created: false };
    }
    return { plan: existing, created: false };
  }

  const derived = canvasSizeForHall(hall);
  const now = new Date();
  const plan: FloorPlanDocument = {
    _id: new ObjectId(),
    organizationId,
    exhibitionId,
    hallId: hall._id!,
    revision: 1,
    canvasWidth: canvasWidth ?? derived.canvasWidth,
    canvasHeight: canvasHeight ?? derived.canvasHeight,
    gridSize: gridSize ?? DEFAULT_GRID_SIZE,
    ...(backgroundAssetId ? { backgroundAssetId } : {}),
    status: "DRAFT",
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await database.collection<FloorPlanDocument>("floorPlans").insertOne(plan);
  } catch (cause) {
    // The unique index on hallId turns a concurrent create into a duplicate-key error; the other
    // request won, so return its document rather than failing the organizer's click.
    const raced = await database
      .collection<FloorPlanDocument>("floorPlans")
      .findOne({ hallId: hall._id!, organizationId });
    if (raced) return { plan: raced, created: false };
    throw cause;
  }

  return { plan, created: true };
}

export type ReadinessCheck = { id: string; label: string; ok: boolean; detail?: string };

/**
 * The checklist shown on the review step and enforced by publish.
 *
 * Every failing item names what to do about it. Publishing a plan a visitor cannot book from is
 * the single most confusing state this app had, so it is refused rather than warned about.
 */
export async function floorPlanReadiness(database: Db, plan: FloorPlanDocument): Promise<ReadinessCheck[]> {
  const elements = await database
    .collection<MapElementDocument>("mapElements")
    .find({ floorPlanId: plan._id! })
    .toArray();
  const stalls = await database
    .collection<StallDocument>("stalls")
    .find({ hallId: plan.hallId })
    .toArray();

  const stallElementIds = new Set(stalls.map((stall) => stall.floorPlanElementId.toString()));
  const stallElements = elements.filter((element) => element.type === "STALL");
  const unlinked = stallElements.filter((element) => !stallElementIds.has(element._id!.toString()));
  const unpriced = stalls.filter((stall) => stall.basePrice <= 0);
  const outside = elements.filter((element) => !fitsInCanvas(element.geometry, plan));
  const publicStalls = stalls.filter((stall) => stall.visibility === "PUBLIC");

  return [
    {
      id: "has-stalls",
      label: "At least one stall is placed",
      ok: stalls.length > 0,
      detail: stalls.length === 0 ? "Add stalls on the layout step." : `${stalls.length} placed.`,
    },
    {
      id: "all-linked",
      label: "Every stall rectangle is priced inventory",
      ok: unlinked.length === 0,
      detail:
        unlinked.length > 0
          ? `${unlinked.length} rectangle${unlinked.length === 1 ? "" : "s"} on the plan ${unlinked.length === 1 ? "is" : "are"} not bookable. Give ${unlinked.length === 1 ? "it" : "them"} a stall number and price.`
          : undefined,
    },
    {
      id: "all-priced",
      label: "Every stall has a price",
      ok: unpriced.length === 0,
      detail:
        unpriced.length > 0
          ? `${unpriced.map((stall) => stall.stallNumber).slice(0, 5).join(", ")}${unpriced.length > 5 ? ` and ${unpriced.length - 5} more` : ""} cost nothing. Set a price on the pricing step.`
          : undefined,
    },
    {
      id: "inside-canvas",
      label: "Everything fits on the canvas",
      ok: outside.length === 0,
      detail:
        outside.length > 0
          ? `${outside.length} element${outside.length === 1 ? "" : "s"} sit outside the canvas and would not be visible. Move ${outside.length === 1 ? "it" : "them"} or enlarge the canvas.`
          : undefined,
    },
    {
      id: "publicly-visible",
      label: "At least one stall is public",
      ok: publicStalls.length > 0,
      detail:
        publicStalls.length === 0
          ? "Every stall is private, so visitors would see an empty map. Make at least one public."
          : `${publicStalls.length} visible to visitors.`,
    },
  ];
}

export async function publishFloorPlan(
  database: Db,
  { plan, organizationId, actorId }: { plan: FloorPlanDocument; organizationId: ObjectId; actorId?: ObjectId },
) {
  const checks = await floorPlanReadiness(database, plan);
  const failing = checks.filter((check) => !check.ok);
  if (failing.length > 0) {
    throw new FloorPlanError(
      `This plan is not ready to publish: ${failing[0].detail ?? failing[0].label}`,
      { status: 422, code: "PLAN_NOT_READY" },
    );
  }

  const now = new Date();
  const updated = await withTransaction(database, async (session) => {
    const result = await database.collection<FloorPlanDocument>("floorPlans").findOneAndUpdate(
      { _id: plan._id!, organizationId },
      {
        $set: { status: "PUBLISHED", publishedAt: now, updatedAt: now },
        // Publishing is what advances the revision counter; it is display and audit only.
        $inc: { revision: plan.status === "PUBLISHED" ? 1 : 0 },
      },
      { returnDocument: "after", session },
    );
    if (!result) throw new FloorPlanError("That floor plan no longer exists.", { status: 404, code: "NOT_FOUND" });

    await writeAudit(
      database,
      {
        organizationId,
        actorId,
        action: "floorPlan.published",
        entityType: "FloorPlan",
        entityId: plan._id!.toString(),
        before: { status: plan.status, revision: plan.revision },
        after: { status: "PUBLISHED", revision: result.revision },
      },
      session,
    );
    return result;
  });

  return { plan: updated, checks };
}

/* ---------------------------------------------------------------------------
   Stalls — element and inventory record created, updated and removed together
   --------------------------------------------------------------------------- */

function assertFitsCanvas(geometry: Rect, plan: FloorPlanDocument) {
  if (!fitsInCanvas(geometry, plan)) {
    throw new FloorPlanError(
      `That position falls outside the ${plan.canvasWidth} x ${plan.canvasHeight} canvas.`,
      { status: 400, code: "OUTSIDE_CANVAS", fieldErrors: { geometry: ["Move it inside the canvas."] } },
    );
  }
}

function stallDimensions(geometry: Rect) {
  const width = Number(unitsToMetres(geometry.width).toFixed(2));
  const height = Number(unitsToMetres(geometry.height).toFixed(2));
  return { width, height, area: Number((width * height).toFixed(2)) };
}

function duplicateStallNumberError(stallNumber: string) {
  return new FloorPlanError(`Stall ${stallNumber} already exists in this hall.`, {
    status: 409,
    code: "STALL_NUMBER_TAKEN",
    fieldErrors: { stallNumber: ["Already used by another stall in this hall."] },
  });
}

function isDuplicateKey(cause: unknown) {
  return typeof cause === "object" && cause !== null && (cause as { code?: number }).code === 11000;
}

/**
 * Creates a stall: one map element plus its bookable inventory record, in one transaction.
 *
 * These were two separate actions on two separate screens. The editor wrote only the element, so a
 * published map drew rectangles with no stall behind them — clicking one did nothing at all, which
 * is the second reason booking appeared broken. Creating them together means a placed stall is
 * bookable by construction.
 */
export async function createPlanStall(
  database: Db,
  {
    plan,
    organizationId,
    input,
    actorId,
    session,
  }: {
    plan: FloorPlanDocument;
    organizationId: ObjectId;
    input: z.infer<typeof planStallCreateSchema>;
    actorId?: ObjectId;
    session?: ClientSession;
  },
): Promise<PlanStall> {
  assertFitsCanvas(input.geometry, plan);

  const now = new Date();
  const elementId = new ObjectId();
  const { width, height, area } = stallDimensions(input.geometry);

  const element: MapElementDocument = {
    _id: elementId,
    organizationId,
    exhibitionId: plan.exhibitionId,
    hallId: plan.hallId,
    floorPlanId: plan._id!,
    type: "STALL",
    geometry: input.geometry,
    label: input.label ?? input.stallNumber,
    locked: false,
    visible: true,
    zIndex: 1,
    createdAt: now,
    updatedAt: now,
  };

  const stall: StallDocument = {
    _id: new ObjectId(),
    organizationId,
    exhibitionId: plan.exhibitionId,
    hallId: plan.hallId,
    floorPlanElementId: elementId,
    stallNumber: input.stallNumber,
    section: input.section,
    stallType: input.stallType,
    width,
    height,
    area,
    basePrice: input.basePrice,
    currency: input.currency,
    status: "AVAILABLE",
    description: input.description,
    amenities: input.amenities,
    visibility: input.visibility,
    createdAt: now,
    updatedAt: now,
  };

  const run = async (activeSession: ClientSession) => {
    await database.collection<MapElementDocument>("mapElements").insertOne(element, { session: activeSession });
    await database.collection<StallDocument>("stalls").insertOne(stall, { session: activeSession });
    await writeAudit(
      database,
      {
        organizationId,
        actorId,
        action: "stall.created",
        entityType: "Stall",
        entityId: stall._id!.toString(),
        after: { stallNumber: stall.stallNumber, basePrice: stall.basePrice },
      },
      activeSession,
    );
  };

  try {
    if (session) await run(session);
    else await withTransaction(database, run);
  } catch (cause) {
    if (isDuplicateKey(cause)) throw duplicateStallNumberError(input.stallNumber);
    throw cause;
  }

  return { element, stall };
}

export async function updatePlanStall(
  database: Db,
  {
    plan,
    stallId,
    organizationId,
    patch,
    actorId,
  }: {
    plan: FloorPlanDocument;
    stallId: ObjectId;
    organizationId: ObjectId;
    patch: z.infer<typeof planStallUpdateSchema>;
    actorId?: ObjectId;
  },
): Promise<PlanStall> {
  const stall = await database
    .collection<StallDocument>("stalls")
    .findOne({ _id: stallId, organizationId, hallId: plan.hallId });
  if (!stall) throw new FloorPlanError("That stall no longer exists.", { status: 404, code: "NOT_FOUND" });

  if (patch.geometry) assertFitsCanvas(patch.geometry, plan);

  const now = new Date();
  const elementUpdates: Partial<MapElementDocument> = { updatedAt: now };
  if (patch.geometry) elementUpdates.geometry = patch.geometry;
  if (patch.label !== undefined) elementUpdates.label = patch.label;
  else if (patch.stallNumber !== undefined) elementUpdates.label = patch.stallNumber;
  if (patch.locked !== undefined) elementUpdates.locked = patch.locked;
  if (patch.visible !== undefined) elementUpdates.visible = patch.visible;

  const stallUpdates: Partial<StallDocument> = { updatedAt: now };
  for (const key of ["stallNumber", "section", "stallType", "basePrice", "currency", "description", "amenities", "visibility"] as const) {
    if (patch[key] !== undefined) Object.assign(stallUpdates, { [key]: patch[key] });
  }
  // Dimensions are never sent directly — they follow the rectangle.
  if (patch.geometry) Object.assign(stallUpdates, stallDimensions(patch.geometry));

  if (patch.status !== undefined) {
    // AVAILABLE and BLOCKED are the organizer's to set. HELD, PENDING and BOOKED are owned by the
    // booking flow, and letting a form overwrite them would desynchronise the live map.
    if (stall.status !== "AVAILABLE" && stall.status !== "BLOCKED") {
      throw new FloorPlanError(
        `Stall ${stall.stallNumber} is ${stall.status.toLowerCase()} because of a live hold or booking, so its status cannot be changed here.`,
        { status: 409, code: "STALL_IN_USE" },
      );
    }
    stallUpdates.status = patch.status;
  }

  const result = await withTransaction(database, async (session) => {
    if (Object.keys(elementUpdates).length > 1) {
      await database
        .collection<MapElementDocument>("mapElements")
        .updateOne({ _id: stall.floorPlanElementId, organizationId }, { $set: elementUpdates }, { session });
    }
    const updatedStall = await database
      .collection<StallDocument>("stalls")
      .findOneAndUpdate({ _id: stallId, organizationId }, { $set: stallUpdates }, { returnDocument: "after", session });
    if (!updatedStall) throw new FloorPlanError("That stall no longer exists.", { status: 404, code: "NOT_FOUND" });

    const updatedElement = await database
      .collection<MapElementDocument>("mapElements")
      .findOne({ _id: stall.floorPlanElementId }, { session });

    await writeAudit(
      database,
      {
        organizationId,
        actorId,
        action: "stall.updated",
        entityType: "Stall",
        entityId: stallId.toString(),
        before: { stallNumber: stall.stallNumber, basePrice: stall.basePrice, status: stall.status },
        after: { stallNumber: updatedStall.stallNumber, basePrice: updatedStall.basePrice, status: updatedStall.status },
      },
      session,
    );

    return { element: updatedElement!, stall: updatedStall };
  }).catch((cause) => {
    if (isDuplicateKey(cause) && patch.stallNumber) throw duplicateStallNumberError(patch.stallNumber);
    throw cause;
  });

  return result;
}

/**
 * Deletes a stall and its rectangle together, unless money is riding on it.
 *
 * A stall with a live hold or a non-terminal booking is refused: the exhibitor on the other end has
 * a reservation, and silently removing the stall would leave a booking pointing at nothing.
 */
export async function deletePlanStall(
  database: Db,
  {
    plan,
    stallId,
    organizationId,
    actorId,
  }: { plan: FloorPlanDocument; stallId: ObjectId; organizationId: ObjectId; actorId?: ObjectId },
) {
  const stall = await database
    .collection<StallDocument>("stalls")
    .findOne({ _id: stallId, organizationId, hallId: plan.hallId });
  if (!stall) throw new FloorPlanError("That stall no longer exists.", { status: 404, code: "NOT_FOUND" });

  const [activeHold, liveBooking] = await Promise.all([
    database
      .collection<ReservationHoldDocument>("reservationHolds")
      .findOne({ stallId, status: "ACTIVE", expiresAt: { $gt: new Date() } }),
    database
      .collection<BookingDocument>("bookings")
      .findOne({ stallId, status: { $in: ["HELD", "PAYMENT_PENDING", "CONFIRMED"] } }),
  ]);

  if (liveBooking) {
    throw new FloorPlanError(
      `Stall ${stall.stallNumber} has booking ${liveBooking.bookingNumber} against it. Cancel that booking before removing the stall.`,
      { status: 409, code: "STALL_IN_USE" },
    );
  }
  if (activeHold) {
    throw new FloorPlanError(
      `Stall ${stall.stallNumber} is being reserved by a visitor right now. Try again once the hold expires.`,
      { status: 409, code: "STALL_IN_USE" },
    );
  }

  await withTransaction(database, async (session) => {
    await database.collection<StallDocument>("stalls").deleteOne({ _id: stallId, organizationId }, { session });
    await database
      .collection<MapElementDocument>("mapElements")
      .deleteOne({ _id: stall.floorPlanElementId, organizationId }, { session });
    await writeAudit(
      database,
      {
        organizationId,
        actorId,
        action: "stall.deleted",
        entityType: "Stall",
        entityId: stallId.toString(),
        before: { stallNumber: stall.stallNumber, basePrice: stall.basePrice },
      },
      session,
    );
  });

  return { stallNumber: stall.stallNumber };
}

/**
 * Generates a grid of stalls in one transaction, all or nothing.
 *
 * This is what turns laying out a hall from a hundred drag-and-type actions into one dialog. Every
 * generated stall is validated against the canvas and against existing numbers *before* anything is
 * written, so a request that would half-succeed is refused with the reason instead.
 */
export async function createStallGrid(
  database: Db,
  {
    plan,
    organizationId,
    request,
    actorId,
  }: {
    plan: FloorPlanDocument;
    organizationId: ObjectId;
    request: z.infer<typeof bulkStallSchema>;
    actorId?: ObjectId;
  },
) {
  const total = request.rows * request.columns;
  if (total > 600) {
    throw new FloorPlanError(`That would create ${total} stalls. Generate at most 600 at a time.`, {
      status: 400,
      code: "TOO_MANY_STALLS",
    });
  }

  const footprint = gridFootprint(request);
  if (
    request.originX + footprint.width > plan.canvasWidth ||
    request.originY + footprint.height > plan.canvasHeight
  ) {
    throw new FloorPlanError(
      `That grid needs ${Math.round(footprint.width)} x ${Math.round(footprint.height)} plan units from the chosen offset, which does not fit the ${plan.canvasWidth} x ${plan.canvasHeight} canvas. Reduce the rows, columns or aisles, or enlarge the canvas.`,
      { status: 400, code: "GRID_TOO_LARGE" },
    );
  }

  const generated = generateGrid(request);

  const existingNumbers = new Set(
    (
      await database
        .collection<StallDocument>("stalls")
        .find({ hallId: plan.hallId }, { projection: { stallNumber: 1 } })
        .toArray()
    ).map((stall) => stall.stallNumber),
  );
  const clashes = generated.filter((stall) => existingNumbers.has(stall.stallNumber));
  if (clashes.length > 0) {
    throw new FloorPlanError(
      `${clashes.length} generated number${clashes.length === 1 ? "" : "s"} already exist in this hall (${clashes
        .slice(0, 4)
        .map((stall) => stall.stallNumber)
        .join(", ")}${clashes.length > 4 ? "…" : ""}). Change the prefix or the starting number.`,
      { status: 409, code: "STALL_NUMBER_TAKEN", fieldErrors: { prefix: ["Produces numbers that already exist."] } },
    );
  }

  const created: PlanStall[] = [];
  await withTransaction(database, async (session) => {
    for (const item of generated) {
      created.push(
        await createPlanStall(database, {
          plan,
          organizationId,
          actorId,
          session,
          input: {
            geometry: { type: "rect", ...item.geometry },
            stallNumber: item.stallNumber,
            section: item.section,
            // The rectangle label mirrors the stall number, as it does for a single stall.
            label: item.stallNumber,
            stallType: request.stallType,
            basePrice: request.basePrice,
            currency: request.currency,
            amenities: request.amenities,
            visibility: request.visibility,
            description: request.description,
          },
        }),
      );
    }
  });

  return created;
}
