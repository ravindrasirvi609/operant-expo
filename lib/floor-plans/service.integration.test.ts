import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { ensureAuthIndexes } from "@/lib/db/indexes";
import { metresToUnits } from "@/lib/floor-plans/units";
import {
  FloorPlanError,
  createPlanStall,
  createStallGrid,
  deletePlanStall,
  ensureFloorPlan,
  floorPlanReadiness,
  publishFloorPlan,
  updatePlanStall,
  updateStallsBulk,
} from "@/lib/floor-plans/service";
import type { HallDocument } from "@/models/exhibition";
import type { FloorPlanDocument, MapElementDocument } from "@/models/map";
import type { BookingDocument, ReservationHoldDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";

/**
 * Integration tests for the stall write path — the invariant the whole floor-plan model rests on:
 * a stall and its rectangle are created, moved and removed together, and never separately.
 *
 * A replica set, because these run in transactions, with the real indexes so the uniqueness rules
 * are the ones production enforces.
 */
let server: MongoMemoryReplSet;
let client: MongoClient;
let database: Db;

beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  client = await new MongoClient(server.getUri()).connect();
  database = client.db("plan_service_test");
  await ensureAuthIndexes(database);
}, 180_000);

afterAll(async () => {
  await client?.close();
  await server?.stop();
});

const organizationId = new ObjectId();
const exhibitionId = new ObjectId();
const createdBy = new ObjectId();

let hall: HallDocument;
let plan: FloorPlanDocument;

const stallInput = {
  stallType: "STANDARD" as const,
  basePrice: 45000,
  currency: "INR",
  amenities: [] as string[],
  visibility: "PUBLIC" as const,
  description: undefined,
  section: undefined,
  label: undefined,
};

function rect(x: number, y: number, size = 60) {
  return { type: "rect" as const, x, y, width: size, height: size };
}

beforeEach(async () => {
  await Promise.all(
    ["halls", "floorPlans", "mapElements", "stalls", "reservationHolds", "bookings", "auditLogs"].map((name) =>
      database.collection(name).deleteMany({}),
    ),
  );

  hall = {
    _id: new ObjectId(),
    organizationId,
    exhibitionId,
    name: "Hall A",
    code: `HA-${Date.now()}`,
    width: 40,
    height: 25,
    status: "ACTIVE",
    publicVisibility: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await database.collection<HallDocument>("halls").insertOne(hall);

  const ensured = await ensureFloorPlan(database, { organizationId, exhibitionId, hall, createdBy });
  plan = ensured.plan;
});

describe("ensureFloorPlan", () => {
  it("derives the canvas from the hall dimensions", () => {
    // 40 m x 25 m at 20 plan units per metre. Nothing linked these before the units were fixed.
    expect(plan.canvasWidth).toBe(800);
    expect(plan.canvasHeight).toBe(500);
    expect(plan.status).toBe("DRAFT");
    expect(plan.revision).toBe(1);
  });

  it("is idempotent, so re-entering the wizard cannot orphan a layout", async () => {
    const again = await ensureFloorPlan(database, { organizationId, exhibitionId, hall, createdBy });
    expect(again.created).toBe(false);
    expect(again.plan._id!.equals(plan._id!)).toBe(true);
    expect(await database.collection("floorPlans").countDocuments({ hallId: hall._id })).toBe(1);
  });
});

describe("createPlanStall", () => {
  it("creates the rectangle and the bookable record together", async () => {
    const result = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });

    expect(await database.collection("mapElements").countDocuments({})).toBe(1);
    expect(await database.collection("stalls").countDocuments({})).toBe(1);
    expect(result.stall.floorPlanElementId.equals(result.element._id!)).toBe(true);
    expect(result.element.label).toBe("A-1");
  });

  it("derives the stall footprint from its rectangle", async () => {
    const result = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: { type: "rect", x: 20, y: 20, width: 120, height: 60 }, stallNumber: "A-2" },
    });

    // 120 x 60 plan units at 20 per metre.
    expect(result.stall.width).toBe(6);
    expect(result.stall.height).toBe(3);
    expect(result.stall.area).toBe(18);
  });

  it("refuses a rectangle that falls outside the canvas", async () => {
    await expect(
      createPlanStall(database, {
        plan,
        organizationId,
        input: { ...stallInput, geometry: rect(790, 20), stallNumber: "A-3" },
      }),
    ).rejects.toMatchObject({ code: "OUTSIDE_CANVAS", status: 400 });
  });

  it("refuses a duplicate stall number and leaves nothing behind", async () => {
    await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });

    await expect(
      createPlanStall(database, {
        plan,
        organizationId,
        input: { ...stallInput, geometry: rect(100, 20), stallNumber: "A-1" },
      }),
    ).rejects.toMatchObject({ code: "STALL_NUMBER_TAKEN", status: 409 });

    // The transaction must have rolled back the element too, or the plan would keep an orphan.
    expect(await database.collection("mapElements").countDocuments({})).toBe(1);
    expect(await database.collection("stalls").countDocuments({})).toBe(1);
  });

  it("keeps one stall per rectangle", async () => {
    const created = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });

    // Writing a second stall against the same element directly is what the old per-hall endpoint
    // allowed; the unique index is what makes it impossible now.
    await expect(
      database.collection<StallDocument>("stalls").insertOne({
        ...created.stall,
        _id: new ObjectId(),
        stallNumber: "A-9",
      }),
    ).rejects.toThrow();
  });
});

describe("updatePlanStall", () => {
  it("moves the rectangle and recomputes the footprint", async () => {
    const created = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });

    const updated = await updatePlanStall(database, {
      plan,
      stallId: created.stall._id!,
      organizationId,
      patch: { geometry: { type: "rect", x: 40, y: 40, width: 40, height: 40 } },
    });

    expect(updated.element.geometry.x).toBe(40);
    expect(updated.stall.width).toBe(2);
    expect(updated.stall.area).toBe(4);
  });

  it("refuses to overwrite a status the booking flow owns", async () => {
    const created = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });
    await database
      .collection<StallDocument>("stalls")
      .updateOne({ _id: created.stall._id }, { $set: { status: "HELD" } });

    await expect(
      updatePlanStall(database, {
        plan,
        stallId: created.stall._id!,
        organizationId,
        patch: { status: "AVAILABLE" },
      }),
    ).rejects.toMatchObject({ code: "STALL_IN_USE" });
  });

  it("still allows repricing a held stall", async () => {
    const created = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });
    await database
      .collection<StallDocument>("stalls")
      .updateOne({ _id: created.stall._id }, { $set: { status: "HELD" } });

    const updated = await updatePlanStall(database, {
      plan,
      stallId: created.stall._id!,
      organizationId,
      patch: { basePrice: 60000 },
    });
    expect(updated.stall.basePrice).toBe(60000);
  });
});

describe("deletePlanStall", () => {
  it("removes the rectangle and the record together", async () => {
    const created = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });

    await deletePlanStall(database, { plan, stallId: created.stall._id!, organizationId });

    expect(await database.collection("stalls").countDocuments({})).toBe(0);
    expect(await database.collection("mapElements").countDocuments({})).toBe(0);
  });

  it("refuses while a visitor is holding it", async () => {
    const created = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });
    await database.collection<ReservationHoldDocument>("reservationHolds").insertOne({
      organizationId,
      exhibitionId,
      hallId: hall._id!,
      stallId: created.stall._id!,
      visitorId: "v1",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 600_000),
      createdAt: new Date(),
    });

    await expect(
      deletePlanStall(database, { plan, stallId: created.stall._id!, organizationId }),
    ).rejects.toMatchObject({ code: "STALL_IN_USE" });
    expect(await database.collection("stalls").countDocuments({})).toBe(1);
  });

  it("refuses while a booking depends on it, and names the booking", async () => {
    const created = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });
    await database.collection<BookingDocument>("bookings").insertOne({
      organizationId,
      exhibitionId,
      hallId: hall._id!,
      stallId: created.stall._id!,
      exhibitorId: new ObjectId(),
      bookingNumber: "BK-TEST01",
      status: "PAYMENT_PENDING",
      commercialSnapshot: { basePrice: 1, tax: 0, fees: 0, discounts: 0, total: 1, currency: "INR" },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const error = await deletePlanStall(database, {
      plan,
      stallId: created.stall._id!,
      organizationId,
    }).catch((cause: FloorPlanError) => cause);

    expect((error as FloorPlanError).code).toBe("STALL_IN_USE");
    expect((error as FloorPlanError).message).toContain("BK-TEST01");
  });
});

describe("createStallGrid", () => {
  const gridRequest = {
    rows: 2,
    columns: 3,
    stallWidth: metresToUnits(3),
    stallHeight: metresToUnits(3),
    gapX: 0,
    gapY: metresToUnits(2),
    originX: metresToUnits(1),
    originY: metresToUnits(1),
    scheme: "ROW_LETTER" as const,
    start: 1,
    prefix: undefined,
    ...stallInput,
  };

  it("creates every stall with its rectangle", async () => {
    const created = await createStallGrid(database, { plan, organizationId, request: gridRequest });

    expect(created).toHaveLength(6);
    expect(await database.collection("stalls").countDocuments({})).toBe(6);
    expect(await database.collection("mapElements").countDocuments({})).toBe(6);
    expect(created.map((item) => item.stall.stallNumber)).toEqual(["A-1", "A-2", "A-3", "B-1", "B-2", "B-3"]);
  });

  it("refuses a grid that will not fit the canvas, before writing anything", async () => {
    // 20 x 20 stalls of 3 m with 2 m aisles needs far more than the 40 x 25 m hall provides, while
    // staying under the 600-stall ceiling, so this exercises the footprint check specifically.
    await expect(
      createStallGrid(database, {
        plan,
        organizationId,
        request: { ...gridRequest, rows: 20, columns: 20 },
      }),
    ).rejects.toMatchObject({ code: "GRID_TOO_LARGE" });
    expect(await database.collection("stalls").countDocuments({})).toBe(0);
  });

  it("refuses an unreasonable number of stalls in one request", async () => {
    await expect(
      createStallGrid(database, {
        plan,
        organizationId,
        request: { ...gridRequest, rows: 30, columns: 30 },
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_STALLS" });
    expect(await database.collection("stalls").countDocuments({})).toBe(0);
  });

  it("is all or nothing when a number already exists", async () => {
    await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(600, 400, 40), stallNumber: "A-2" },
    });

    await expect(
      createStallGrid(database, { plan, organizationId, request: gridRequest }),
    ).rejects.toMatchObject({ code: "STALL_NUMBER_TAKEN" });

    // Only the pre-existing stall survives; no partial grid is left behind.
    expect(await database.collection("stalls").countDocuments({})).toBe(1);
  });
});

describe("updateStallsBulk", () => {
  it("applies one change to many stalls", async () => {
    const created = await createStallGrid(database, {
      plan,
      organizationId,
      request: {
        rows: 1,
        columns: 3,
        stallWidth: 60,
        stallHeight: 60,
        gapX: 0,
        gapY: 0,
        originX: 20,
        originY: 20,
        scheme: "ROW_LETTER" as const,
        start: 1,
        prefix: undefined,
        ...stallInput,
        basePrice: 1000,
      },
    });

    const result = await updateStallsBulk(database, {
      plan,
      organizationId,
      stallIds: created.map((item) => item.stall._id!),
      patch: { basePrice: 75000, visibility: "PRIVATE" },
    });

    expect(result.updated).toBe(3);
    const stalls = await database.collection<StallDocument>("stalls").find({}).toArray();
    expect(stalls.every((stall) => stall.basePrice === 75000)).toBe(true);
    expect(stalls.every((stall) => stall.visibility === "PRIVATE")).toBe(true);
  });

  it("reports ids that are not in this hall rather than failing the batch", async () => {
    const created = await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });
    const stranger = new ObjectId();

    const result = await updateStallsBulk(database, {
      plan,
      organizationId,
      stallIds: [created.stall._id!, stranger],
      patch: { basePrice: 500 },
    });

    expect(result.updated).toBe(1);
    expect(result.skipped).toEqual([stranger.toString()]);
  });

  it("refuses a request that changes nothing", async () => {
    await expect(
      updateStallsBulk(database, { plan, organizationId, stallIds: [new ObjectId()], patch: {} }),
    ).rejects.toMatchObject({ code: "NOTHING_TO_CHANGE" });
  });
});

describe("publish readiness", () => {
  it("refuses to publish a plan with no stalls", async () => {
    await expect(publishFloorPlan(database, { plan, organizationId })).rejects.toMatchObject({
      code: "PLAN_NOT_READY",
      status: 422,
    });
  });

  it("refuses while a stall costs nothing, and names it", async () => {
    await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, basePrice: 0, geometry: rect(20, 20), stallNumber: "FREE-1" },
    });

    const error = await publishFloorPlan(database, { plan, organizationId }).catch(
      (cause: FloorPlanError) => cause,
    );
    expect((error as FloorPlanError).message).toContain("FREE-1");
  });

  it("flags a rectangle with no inventory behind it", async () => {
    await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });
    // A bare STALL element is exactly what the old editor produced on its own.
    await database.collection<MapElementDocument>("mapElements").insertOne({
      organizationId,
      exhibitionId,
      hallId: hall._id!,
      floorPlanId: plan._id!,
      type: "STALL",
      geometry: rect(200, 200),
      locked: false,
      visible: true,
      zIndex: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const checks = await floorPlanReadiness(database, plan);
    const linked = checks.find((check) => check.id === "all-linked");
    expect(linked!.ok).toBe(false);
    expect(linked!.detail).toContain("not bookable");
  });

  it("publishes once every check passes", async () => {
    await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });

    const result = await publishFloorPlan(database, { plan, organizationId });
    expect(result.plan!.status).toBe("PUBLISHED");
    expect(result.plan!.publishedAt).toBeInstanceOf(Date);
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it("bumps the revision when republishing", async () => {
    await createPlanStall(database, {
      plan,
      organizationId,
      input: { ...stallInput, geometry: rect(20, 20), stallNumber: "A-1" },
    });

    const first = await publishFloorPlan(database, { plan, organizationId });
    const second = await publishFloorPlan(database, { plan: first.plan!, organizationId });

    expect(second.plan!.revision).toBe(first.plan!.revision + 1);
  });
});
