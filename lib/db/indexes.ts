import type { Db } from "mongodb";

export async function ensureAuthIndexes(database: Db) {
  // A deployment that already ran an earlier version of this file has a TTL index
  // (expireAfterSeconds: 0) on reservationHolds.expiresAt under the same auto-generated name
  // (expiresAt_1) that createIndex() below now defines without expireAfterSeconds. MongoDB
  // rejects redefining an existing index under the same name with different options
  // (IndexOptionsConflict), so drop it first if present — createIndex a few lines down then
  // creates the corrected, non-TTL version. Safe to run on every boot: dropIndex on a
  // already-correct or already-absent index just rejects, which is swallowed below.
  await database.collection("reservationHolds").dropIndex("expiresAt_1").catch(() => undefined);

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
    database.collection("stalls").createIndex({ hallId: 1, stallNumber: 1 }, { unique: true }),
    database.collection("exhibitors").createIndex({ organizationId: 1, email: 1 }),
    // NOT a TTL index (no expireAfterSeconds) — a hold expiring must go through the
    // expire-holds job so the linked stall gets released back to AVAILABLE. A TTL index here
    // would let MongoDB's own background thread delete the hold document out from under that
    // job, silently skipping the stall-release side effect and stranding the stall at HELD
    // forever. Confirmed live: this was exactly the original bug (see git history / this index's
    // prior definition) before it was changed to a plain index.
    database.collection("reservationHolds").createIndex({ expiresAt: 1 }),
    database.collection("reservationHolds").createIndex({ stallId: 1, status: 1 }),
    database.collection("bookings").createIndex({ bookingNumber: 1 }, { unique: true }),
    database.collection("bookings").createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true }),
    database.collection("bookings").createIndex({ stallId: 1, status: 1 }),
    database.collection("bookings").createIndex({ stallId: 1 }, { unique: true, partialFilterExpression: { status: { $in: ["HELD", "PAYMENT_PENDING", "CONFIRMED"] } } }),
    database.collection("reservationHolds").createIndex({ stallId: 1 }, { unique: true, partialFilterExpression: { status: "ACTIVE" } }),
    database.collection("payments").createIndex({ provider: 1, providerReference: 1 }, { unique: true, sparse: true }),
    database.collection("invoices").createIndex({ organizationId: 1, invoiceNumber: 1 }, { unique: true }),
    database.collection("emailEvents").createIndex({ status: 1, createdAt: 1 }),
    database.collection("paymentWebhookEvents").createIndex({ eventId: 1 }, { unique: true }),
    database.collection("auditLogs").createIndex({ organizationId: 1, createdAt: -1 }),
    database.collection("auditLogs").createIndex({ entityType: 1, entityId: 1, createdAt: -1 }),
  ]);
}
