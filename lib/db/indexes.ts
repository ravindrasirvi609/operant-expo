import type { Db } from "mongodb";

export async function ensureAuthIndexes(database: Db) {
  await Promise.all([
    database.collection("users").createIndex({ email: 1 }, { unique: true }),
    database.collection("organizations").createIndex({ slug: 1 }, { unique: true }),
    database.collection("memberships").createIndex(
      { organizationId: 1, userId: 1 },
      { unique: true },
    ),
    database.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    database.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection("venues").createIndex({ organizationId: 1, name: 1 }),
    database.collection("exhibitions").createIndex({ organizationId: 1, slug: 1 }, { unique: true }),
    database.collection("halls").createIndex({ exhibitionId: 1, code: 1 }, { unique: true }),
    database.collection("floorPlans").createIndex({ hallId: 1, version: -1 }),
    database.collection("mapElements").createIndex({ floorPlanId: 1, zIndex: 1 }),
    database.collection("assets").createIndex({ organizationId: 1, checksum: 1 }),
  ]);
}
