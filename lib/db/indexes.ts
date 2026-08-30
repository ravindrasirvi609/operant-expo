import type { Db } from "mongodb";

/**
 * Indexes whose absence would be a correctness bug, not a performance one.
 *
 * These are the partial unique indexes the booking flow relies on to make double-booking
 * impossible, plus the auth uniques. A failure here must stop the app rather than let it serve
 * traffic without the protection.
 */
async function ensureRequiredIndexes(database: Db) {
  // A deployment that ran an earlier version of this file has a TTL index (expireAfterSeconds: 0)
  // on reservationHolds.expiresAt under the auto-generated name (expiresAt_1) that createIndex
  // below now defines without it. MongoDB rejects redefining an index under the same name with
  // different options, so drop it first; the create a few lines down installs the corrected,
  // non-TTL version. Safe on every boot — dropping an absent index just rejects, and is swallowed.
  await database.collection("reservationHolds").dropIndex("expiresAt_1").catch(() => undefined);

  await Promise.all([
    database.collection("users").createIndex({ email: 1 }, { unique: true }),
    database.collection("organizations").createIndex({ slug: 1 }, { unique: true }),
    database.collection("memberships").createIndex({ organizationId: 1, userId: 1 }, { unique: true }),
    database.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true }),
    database.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection("venues").createIndex({ organizationId: 1, name: 1 }),
    database.collection("exhibitions").createIndex({ organizationId: 1, slug: 1 }, { unique: true }),
    database.collection("halls").createIndex({ exhibitionId: 1, code: 1 }, { unique: true }),
    database.collection("mapElements").createIndex({ floorPlanId: 1, zIndex: 1 }),
    database.collection("assets").createIndex({ organizationId: 1, checksum: 1 }),
    database.collection("stalls").createIndex({ hallId: 1, stallNumber: 1 }, { unique: true }),
    database.collection("exhibitors").createIndex({ organizationId: 1, email: 1 }),

    // NOT a TTL index. A hold expiring must go through the expire-holds sweep so the linked stall
    // is released back to AVAILABLE; letting MongoDB's own background thread delete the hold would
    // skip that side effect and strand the stall at HELD forever.
    database.collection("reservationHolds").createIndex({ expiresAt: 1 }),
    database.collection("reservationHolds").createIndex({ stallId: 1, status: 1 }),
    database.collection("reservationHolds").createIndex({ visitorId: 1, status: 1 }),

    database.collection("bookings").createIndex({ bookingNumber: 1 }, { unique: true }),
    database.collection("bookings").createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true }),
    database.collection("bookings").createIndex({ stallId: 1, status: 1 }),

    // The two indexes that actually prevent double-booking.
    database
      .collection("bookings")
      .createIndex(
        { stallId: 1 },
        { unique: true, partialFilterExpression: { status: { $in: ["HELD", "PAYMENT_PENDING", "CONFIRMED"] } } },
      ),
    database
      .collection("reservationHolds")
      .createIndex({ stallId: 1 }, { unique: true, partialFilterExpression: { status: "ACTIVE" } }),

    database.collection("payments").createIndex({ provider: 1, providerReference: 1 }, { unique: true, sparse: true }),
    database.collection("invoices").createIndex({ organizationId: 1, invoiceNumber: 1 }, { unique: true }),
    database.collection("emailEvents").createIndex({ status: 1, createdAt: 1 }),
    database.collection("paymentWebhookEvents").createIndex({ eventId: 1 }, { unique: true }),
    database.collection("auditLogs").createIndex({ organizationId: 1, createdAt: -1 }),
    database.collection("auditLogs").createIndex({ entityType: 1, entityId: 1, createdAt: -1 }),
  ]);
}

/**
 * Indexes that enforce the single-plan-per-hall and one-stall-per-element invariants.
 *
 * Data written by an earlier version can violate both — a hall may hold several floor-plan
 * versions, and two stalls may point at the same element. Creating these must therefore not be
 * able to stop the app from booting: a violated invariant is reported with the command that fixes
 * it, and the app runs (correctly, just unprotected against a new violation) until it is run.
 */
const INVARIANT_INDEXES: Array<{
  collection: string;
  keys: Record<string, 1 | -1>;
  name: string;
  explanation: string;
}> = [
  {
    collection: "floorPlans",
    keys: { hallId: 1 },
    name: "hallId_unique",
    explanation: "a hall still has more than one floor plan",
  },
  {
    collection: "stalls",
    keys: { floorPlanElementId: 1 },
    name: "floorPlanElementId_unique",
    explanation: "more than one stall points at the same floor-plan element",
  },
];

async function ensureInvariantIndexes(database: Db) {
  for (const index of INVARIANT_INDEXES) {
    try {
      await database.collection(index.collection).createIndex(index.keys, { unique: true, name: index.name });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message.split("\n")[0] : String(cause);
      console.warn(
        [
          `[db] Could not create unique index ${index.collection}.${index.name} — ${index.explanation}.`,
          `     Run the single-floor-plan migration to resolve it:`,
          `       POST /api/internal/jobs/migrate-floor-plans  (x-job-secret: $JOB_SECRET)`,
          `     Mongo said: ${reason}`,
        ].join("\n"),
      );
    }
  }
}

export async function ensureAuthIndexes(database: Db) {
  await ensureRequiredIndexes(database);

  // The superseded index from the versioned-plan model. Dropping it is harmless if absent.
  await database.collection("floorPlans").dropIndex("hallId_1_version_-1").catch(() => undefined);

  await ensureInvariantIndexes(database);
}
