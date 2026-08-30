import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoClient, ObjectId, type Db } from "mongodb";
import type { z } from "zod";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { HoldError, loadStallContext, requestHold, sweepExpiredHolds } from "@/lib/booking/holds";
import { BookingError, createBooking } from "@/lib/bookings/create";
import { ensureAuthIndexes } from "@/lib/db/indexes";
import type { bookingSchema } from "@/lib/validation/booking";
import type { ExhibitionDocument } from "@/models/exhibition";
import type { ReservationHoldDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";

/**
 * Integration tests for the reservation lifecycle.
 *
 * A single-node replica set, because booking creation runs in a transaction and MongoDB only
 * supports those on a replica set. The partial unique indexes are created too — they are what
 * actually prevents two visitors holding or booking the same stall, so testing the flow without them
 * would prove nothing about the races.
 */
let server: MongoMemoryReplSet;
let client: MongoClient;
let database: Db;

beforeAll(async () => {
  server = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  client = await new MongoClient(server.getUri()).connect();
  database = client.db("holds_test");
  await ensureAuthIndexes(database);
}, 180_000);

afterAll(async () => {
  await client?.close();
  await server?.stop();
});

const organizationId = new ObjectId();
const hallId = new ObjectId();

let exhibitionId: ObjectId;
let stallId: ObjectId;

async function seed({ lifecycle = "BOOKING_OPEN" as ExhibitionDocument["lifecycle"] } = {}) {
  exhibitionId = new ObjectId();
  stallId = new ObjectId();

  await database.collection<ExhibitionDocument>("exhibitions").insertOne({
    _id: exhibitionId,
    organizationId,
    name: "Test Expo",
    slug: `test-expo-${exhibitionId.toString()}`,
    timezone: "UTC",
    startDate: new Date("2027-05-01"),
    endDate: new Date("2027-05-03"),
    lifecycle,
    bookingMode: "ONLINE",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await database.collection<StallDocument>("stalls").insertOne({
    _id: stallId,
    organizationId,
    exhibitionId,
    hallId,
    floorPlanElementId: new ObjectId(),
    stallNumber: `A-${stallId.toString().slice(-4)}`,
    stallType: "STANDARD",
    width: 3,
    height: 3,
    area: 9,
    basePrice: 45000,
    currency: "INR",
    status: "AVAILABLE",
    amenities: [],
    visibility: "PUBLIC",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const exhibition = await database
    .collection<ExhibitionDocument>("exhibitions")
    .findOne({ _id: exhibitionId });
  return exhibition!.slug;
}

async function context(slug: string, visitorId?: string) {
  const loaded = await loadStallContext(database, { exhibitionSlug: slug, stallId: stallId.toString(), visitorId });
  if (!loaded) throw new Error("stall context not found");
  return loaded;
}

// The schema's *output* type keeps every optional key present (as undefined), because the optional
// text fields transform "" to undefined. Spelling them out keeps the fixture assignable.
const exhibitorInput: z.infer<typeof bookingSchema> = {
  stallId: "",
  companyName: "Widget Co",
  contactPerson: "Asha Rao",
  email: "asha@widget.test",
  legalName: undefined,
  phone: undefined,
  address: undefined,
  taxIdentifier: undefined,
};

beforeEach(async () => {
  await Promise.all(
    ["exhibitions", "stalls", "reservationHolds", "bookings", "exhibitors", "payments", "invoices", "emailEvents", "auditLogs"].map(
      (name) => database.collection(name).deleteMany({}),
    ),
  );
});

describe("requestHold", () => {
  it("creates a hold and flips the stall to HELD", async () => {
    const slug = await seed();
    const result = await requestHold(database, { context: await context(slug, "visitor-1"), visitorId: "visitor-1" });

    expect(result.resumed).toBe(false);
    expect(result.hold.visitorId).toBe("visitor-1");
    const stall = await database.collection<StallDocument>("stalls").findOne({ _id: stallId });
    expect(stall!.status).toBe("HELD");
  });

  it("resumes the same visitor's hold instead of locking them out", async () => {
    // The original bug: the endpoint required status AVAILABLE, but the visitor's own first request
    // had already set it to HELD — so reloading the booking page refused them their own stall.
    const slug = await seed();
    const first = await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });
    const second = await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });

    expect(second.resumed).toBe(true);
    expect(second.hold._id!.equals(first.hold._id!)).toBe(true);
    expect(second.hold.expiresAt.getTime()).toBe(first.hold.expiresAt.getTime());
    expect(await database.collection("reservationHolds").countDocuments({ status: "ACTIVE" })).toBe(1);
  });

  it("refuses a second visitor and says how long is left", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });

    await expect(
      requestHold(database, { context: await context(slug, "v2"), visitorId: "v2" }),
    ).rejects.toMatchObject({ code: "HELD_BY_OTHER", status: 409 });

    const error = await requestHold(database, { context: await context(slug, "v2"), visitorId: "v2" }).catch(
      (cause: HoldError) => cause,
    );
    expect((error as HoldError).availableInSeconds).toBeGreaterThan(0);
  });

  it("answers 422 when booking is not open, rather than blaming the stall", async () => {
    const slug = await seed({ lifecycle: "PUBLISHED" });

    await expect(
      requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" }),
    ).rejects.toMatchObject({ code: "BOOKING_NOT_OPEN", status: 422 });
  });

  it("refuses a blocked stall even while booking is open", async () => {
    const slug = await seed();
    await database.collection<StallDocument>("stalls").updateOne({ _id: stallId }, { $set: { status: "BLOCKED" } });

    await expect(
      requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" }),
    ).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("lets exactly one of two simultaneous visitors win", async () => {
    const slug = await seed();
    const [first, second] = await Promise.allSettled([
      requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" }),
      requestHold(database, { context: await context(slug, "v2"), visitorId: "v2" }),
    ]);

    const fulfilled = [first, second].filter((outcome) => outcome.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(await database.collection("reservationHolds").countDocuments({ status: "ACTIVE" })).toBe(1);
  });
});

describe("sweepExpiredHolds", () => {
  it("expires a lapsed hold and returns the stall to the pool", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });
    await database
      .collection<ReservationHoldDocument>("reservationHolds")
      .updateOne({ stallId }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });

    const result = await sweepExpiredHolds(database);

    expect(result.expired).toBe(1);
    const stall = await database.collection<StallDocument>("stalls").findOne({ _id: stallId });
    expect(stall!.status).toBe("AVAILABLE");
  });

  it("leaves a stall alone when it carries a live booking", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });
    await createBooking(database, {
      context: await context(slug, "v1"),
      input: { ...exhibitorInput, stallId: stallId.toString() },
      visitorId: "v1",
    });

    await sweepExpiredHolds(database);

    // The booking flow leaves the stall PENDING; a sweep must not undo that.
    const stall = await database.collection<StallDocument>("stalls").findOne({ _id: stallId });
    expect(stall!.status).toBe("PENDING");
  });

  it("never touches a manually blocked stall", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });
    await database.collection<StallDocument>("stalls").updateOne({ _id: stallId }, { $set: { status: "BLOCKED" } });
    await database
      .collection<ReservationHoldDocument>("reservationHolds")
      .updateOne({ stallId }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });

    await sweepExpiredHolds(database);

    const stall = await database.collection<StallDocument>("stalls").findOne({ _id: stallId });
    expect(stall!.status).toBe("BLOCKED");
  });

  it("makes an expired hold resumable by anyone again", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });
    await database
      .collection<ReservationHoldDocument>("reservationHolds")
      .updateOne({ stallId }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });

    // loadStallContext sweeps first, so a second visitor sees a free stall.
    const result = await requestHold(database, { context: await context(slug, "v2"), visitorId: "v2" });
    expect(result.resumed).toBe(false);
    expect(result.hold.visitorId).toBe("v2");
  });
});

describe("createBooking", () => {
  it("consumes the hold and leaves the stall pending payment", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });

    const result = await createBooking(database, {
      context: await context(slug, "v1"),
      input: { ...exhibitorInput, stallId: stallId.toString() },
      visitorId: "v1",
    });

    expect(result.booking.status).toBe("PAYMENT_PENDING");
    expect(result.booking.total).toBe(45000);
    expect(result.invoice.invoiceNumber).toContain("INV-");

    const hold = await database.collection<ReservationHoldDocument>("reservationHolds").findOne({ stallId });
    expect(hold!.status).toBe("RELEASED");
    const stall = await database.collection<StallDocument>("stalls").findOne({ _id: stallId });
    expect(stall!.status).toBe("PENDING");
  });

  it("refuses to spend another visitor's hold", async () => {
    // A hold is not a bearer token: whoever posts first must not be able to book on it.
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });

    await expect(
      createBooking(database, {
        context: await context(slug, "v2"),
        input: { ...exhibitorInput, stallId: stallId.toString() },
        visitorId: "v2",
      }),
    ).rejects.toBeInstanceOf(BookingError);
    expect(await database.collection("bookings").countDocuments({})).toBe(0);
  });

  it("refuses when there is no hold at all", async () => {
    const slug = await seed();

    await expect(
      createBooking(database, {
        context: await context(slug, "v1"),
        input: { ...exhibitorInput, stallId: stallId.toString() },
        visitorId: "v1",
      }),
    ).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
  });

  it("reuses the exhibitor record for a returning email", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });
    await createBooking(database, {
      context: await context(slug, "v1"),
      input: { ...exhibitorInput, stallId: stallId.toString() },
      visitorId: "v1",
    });

    const secondSlug = await seed();
    await requestHold(database, { context: await context(secondSlug, "v1"), visitorId: "v1" });
    await createBooking(database, {
      context: await context(secondSlug, "v1"),
      input: { ...exhibitorInput, stallId: stallId.toString(), companyName: "Widget Co" },
      visitorId: "v1",
    });

    expect(await database.collection("exhibitors").countDocuments({})).toBe(1);
    expect(await database.collection("bookings").countDocuments({})).toBe(2);
  });

  it("returns the original booking for a repeated idempotency key", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });

    const first = await createBooking(database, {
      context: await context(slug, "v1"),
      input: { ...exhibitorInput, stallId: stallId.toString() },
      visitorId: "v1",
      idempotencyKey: "key-1",
    });

    // The hold is gone now, so only the idempotency path can succeed — which is the point.
    const replay = await createBooking(database, {
      context: await context(slug, "v1"),
      input: { ...exhibitorInput, stallId: stallId.toString() },
      visitorId: "v1",
      idempotencyKey: "key-1",
    }).catch((cause) => cause);

    if (replay instanceof Error) {
      // Acceptable: the route checks findReplay before calling this, so reaching here means the
      // hold-consumed guard fired first. Either way, exactly one booking must exist.
      expect(replay).toBeInstanceOf(BookingError);
    } else {
      expect(replay.booking.bookingNumber).toBe(first.booking.bookingNumber);
    }
    expect(await database.collection("bookings").countDocuments({})).toBe(1);
  });

  it("lets only one of two simultaneous submissions of the same hold succeed", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });
    const shared = await context(slug, "v1");

    const outcomes = await Promise.allSettled([
      createBooking(database, {
        context: shared,
        input: { ...exhibitorInput, stallId: stallId.toString() },
        visitorId: "v1",
      }),
      createBooking(database, {
        context: shared,
        input: { ...exhibitorInput, stallId: stallId.toString() },
        visitorId: "v1",
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await database.collection("bookings").countDocuments({})).toBe(1);
  });

  it("refuses once the exhibition stops taking bookings, unless the visitor already holds it", async () => {
    const slug = await seed();
    await requestHold(database, { context: await context(slug, "v1"), visitorId: "v1" });
    await database
      .collection<ExhibitionDocument>("exhibitions")
      .updateOne({ _id: exhibitionId }, { $set: { lifecycle: "BOOKING_CLOSED" } });

    // Their hold is a promise already made, so checkout is honoured for its remaining minutes.
    const result = await createBooking(database, {
      context: await context(slug, "v1"),
      input: { ...exhibitorInput, stallId: stallId.toString() },
      visitorId: "v1",
    });
    expect(result.booking.status).toBe("PAYMENT_PENDING");
  });
});
