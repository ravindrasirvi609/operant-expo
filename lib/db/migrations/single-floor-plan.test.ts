import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { migrateToSingleFloorPlan, migrationIsBlocked } from "@/lib/db/migrations/single-floor-plan";

/**
 * Runs against a real MongoDB. The migration itself uses no transactions, so a standalone instance
 * is enough — no replica set needed, which keeps this test dependable in CI.
 */
let server: MongoMemoryServer;
let client: MongoClient;
let database: Db;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = await new MongoClient(server.getUri()).connect();
  database = client.db("migration_test");
}, 120_000);

afterAll(async () => {
  await client?.close();
  await server?.stop();
});

beforeEach(async () => {
  await Promise.all(
    ["floorPlans", "mapElements", "stalls"].map((name) => database.collection(name).deleteMany({})),
  );
});

const hallId = new ObjectId();
const organizationId = new ObjectId();
const exhibitionId = new ObjectId();

function legacyPlan(version: number, status: "DRAFT" | "PUBLISHED" | "ARCHIVED", canvas = 800) {
  return {
    _id: new ObjectId(),
    organizationId,
    exhibitionId,
    hallId,
    version,
    status,
    canvasWidth: canvas,
    canvasHeight: canvas,
    createdBy: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function element(floorPlanId: ObjectId, x = 10, y = 10) {
  return {
    _id: new ObjectId(),
    organizationId,
    exhibitionId,
    hallId,
    floorPlanId,
    type: "STALL" as const,
    geometry: { type: "rect" as const, x, y, width: 60, height: 60 },
    locked: false,
    visible: true,
    zIndex: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function stall(floorPlanElementId: ObjectId, stallNumber: string) {
  return {
    _id: new ObjectId(),
    organizationId,
    exhibitionId,
    hallId,
    floorPlanElementId,
    stallNumber,
    stallType: "STANDARD" as const,
    width: 3,
    height: 3,
    area: 9,
    basePrice: 1000,
    currency: "INR",
    status: "AVAILABLE" as const,
    amenities: [],
    visibility: "PUBLIC" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("migrateToSingleFloorPlan", () => {
  it("changes nothing on a dry run", async () => {
    const older = legacyPlan(1, "PUBLISHED");
    const newer = legacyPlan(2, "DRAFT");
    await database.collection("floorPlans").insertMany([older, newer]);

    const report = await migrateToSingleFloorPlan(database, { apply: false });

    expect(report.applied).toBe(false);
    expect(report.hallsWithMultiplePlans).toBe(1);
    expect(await database.collection("floorPlans").countDocuments({})).toBe(2);
  });

  it("keeps the published plan and deletes the empty newer draft", async () => {
    // Exactly the state the old setup form produced: every visit minted a newer empty draft, which
    // the editor then loaded in preference to the live layout.
    const published = legacyPlan(1, "PUBLISHED");
    const emptyDraft = legacyPlan(2, "DRAFT");
    await database.collection("floorPlans").insertMany([published, emptyDraft]);
    const liveElement = element(published._id);
    await database.collection("mapElements").insertOne(liveElement);
    await database.collection("stalls").insertOne(stall(liveElement._id, "A-1"));

    await migrateToSingleFloorPlan(database, { apply: true });

    const remaining = await database.collection("floorPlans").find({}).toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]._id.equals(published._id)).toBe(true);
    expect(remaining[0].status).toBe("PUBLISHED");
    expect(remaining[0].revision).toBe(2);
    expect(remaining[0].version).toBeUndefined();
    expect(remaining[0].gridSize).toBeGreaterThan(0);
  });

  it("recovers the layout when the surviving plan is empty and the discarded one holds the work", async () => {
    const oldWithWork = legacyPlan(1, "DRAFT");
    const newerEmpty = legacyPlan(2, "DRAFT");
    await database.collection("floorPlans").insertMany([oldWithWork, newerEmpty]);
    await database.collection("mapElements").insertMany([element(oldWithWork._id, 10), element(oldWithWork._id, 100)]);

    await migrateToSingleFloorPlan(database, { apply: true });

    const plans = await database.collection("floorPlans").find({}).toArray();
    expect(plans).toHaveLength(1);
    // No published plan existed, so the one carrying real work wins the election.
    expect(plans[0]._id.equals(oldWithWork._id)).toBe(true);
    expect(await database.collection("mapElements").countDocuments({ floorPlanId: plans[0]._id })).toBe(2);
  });

  it("never orphans a stall: an element a stall points at is re-parented onto the survivor", async () => {
    const published = legacyPlan(2, "PUBLISHED");
    const archived = legacyPlan(1, "ARCHIVED");
    await database.collection("floorPlans").insertMany([published, archived]);

    const survivingElement = element(published._id, 10);
    const bookedElement = element(archived._id, 200);
    await database.collection("mapElements").insertMany([survivingElement, bookedElement]);
    await database.collection("stalls").insertMany([
      stall(survivingElement._id, "A-1"),
      stall(bookedElement._id, "OLD-1"),
    ]);

    await migrateToSingleFloorPlan(database, { apply: true });

    const moved = await database.collection("mapElements").findOne({ _id: bookedElement._id });
    expect(moved).not.toBeNull();
    expect(moved!.floorPlanId.equals(published._id)).toBe(true);
    expect(await database.collection("stalls").countDocuments({})).toBe(2);
  });

  it("grows the surviving canvas so a re-parented element still fits inside it", async () => {
    const published = legacyPlan(2, "PUBLISHED", 300);
    const archived = legacyPlan(1, "ARCHIVED", 1200);
    await database.collection("floorPlans").insertMany([published, archived]);
    await database.collection("mapElements").insertOne(element(published._id, 10));

    const farElement = element(archived._id, 1000);
    await database.collection("mapElements").insertOne(farElement);
    await database.collection("stalls").insertOne(stall(farElement._id, "FAR-1"));

    await migrateToSingleFloorPlan(database, { apply: true });

    const survivor = await database.collection("floorPlans").findOne({ _id: published._id });
    // 1000 + 60 wide; a canvas left at 300 would put the recovered stall outside its own plan.
    expect(survivor!.canvasWidth).toBeGreaterThanOrEqual(1060);
  });

  it("deletes an unlinked element from a discarded plan when the survivor already has work", async () => {
    const published = legacyPlan(2, "PUBLISHED");
    const archived = legacyPlan(1, "ARCHIVED");
    await database.collection("floorPlans").insertMany([published, archived]);
    await database.collection("mapElements").insertOne(element(published._id, 10));
    const decorative = element(archived._id, 400);
    await database.collection("mapElements").insertOne(decorative);

    await migrateToSingleFloorPlan(database, { apply: true });

    expect(await database.collection("mapElements").findOne({ _id: decorative._id })).toBeNull();
  });

  it("reports two stalls claiming one element instead of deleting either", async () => {
    const plan = legacyPlan(1, "PUBLISHED");
    await database.collection("floorPlans").insertOne(plan);
    const shared = element(plan._id);
    await database.collection("mapElements").insertOne(shared);
    await database.collection("stalls").insertMany([stall(shared._id, "A-1"), stall(shared._id, "A-2")]);

    const report = await migrateToSingleFloorPlan(database, { apply: true });

    expect(migrationIsBlocked(report)).toBe(true);
    const warning = report.warnings.find((item) => item.kind === "duplicate-element-reference");
    expect(warning!.ids[0]).toContain("A-1");
    // Both survive: choosing which stall to lose is not a decision a migration should make.
    expect(await database.collection("stalls").countDocuments({})).toBe(2);
  });

  it("names stalls whose element no longer exists rather than deleting them", async () => {
    const plan = legacyPlan(1, "PUBLISHED");
    await database.collection("floorPlans").insertOne(plan);
    await database.collection("stalls").insertOne(stall(new ObjectId(), "GHOST-1"));

    const report = await migrateToSingleFloorPlan(database, { apply: true });

    const warning = report.warnings.find((item) => item.kind === "orphaned-stall");
    expect(warning!.ids[0]).toContain("GHOST-1");
    expect(await database.collection("stalls").countDocuments({})).toBe(1);
  });

  it("is idempotent: a second run finds nothing left to do", async () => {
    await database.collection("floorPlans").insertMany([legacyPlan(1, "PUBLISHED"), legacyPlan(2, "DRAFT")]);

    await migrateToSingleFloorPlan(database, { apply: true });
    const second = await migrateToSingleFloorPlan(database, { apply: true });

    expect(second.hallsWithMultiplePlans).toBe(0);
    expect(second.actions.filter((action) => action.kind === "delete-plan")).toHaveLength(0);
    expect(await database.collection("floorPlans").countDocuments({})).toBe(1);
  });

  it("leaves a hall that already has exactly one plan alone", async () => {
    const only = legacyPlan(1, "PUBLISHED");
    await database.collection("floorPlans").insertOne(only);

    const report = await migrateToSingleFloorPlan(database, { apply: true });

    expect(report.hallsWithMultiplePlans).toBe(0);
    expect(await database.collection("floorPlans").countDocuments({ _id: only._id })).toBe(1);
  });

  it("allows the unique index to be created afterwards", async () => {
    await database.collection("floorPlans").insertMany([legacyPlan(1, "PUBLISHED"), legacyPlan(2, "DRAFT")]);
    await migrateToSingleFloorPlan(database, { apply: true });

    // The whole point of the migration: this is what boot-time index creation attempts.
    await expect(
      database.collection("floorPlans").createIndex({ hallId: 1 }, { unique: true, name: "hallId_unique" }),
    ).resolves.toBe("hallId_unique");
  });
});
