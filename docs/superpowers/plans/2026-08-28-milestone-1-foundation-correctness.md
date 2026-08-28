# Milestone 1: Foundation, Correctness & Security Baseline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing booking/tenant code actually safe (atomic, race-free, audited) and add the test/CI/security scaffolding that every later milestone depends on — no new user-facing features in this milestone.

**Architecture:** No structural change. Fixes are applied in place inside the existing dense route-handler style (`app/api/**/route.ts`, `lib/**`, `models/**`). New shared helpers go in `lib/stalls/availability.ts` (stall status sync), `lib/http/rate-limit.ts` (in-memory limiter), and `proxy.ts` (security headers, path-scoped — this Next.js build renamed the `middleware.ts` convention to `proxy.ts` with an exported `proxy()` function; do not create `middleware.ts`).

**Tech Stack:** Next.js 16.3.3 App Router, TypeScript 5, MongoDB driver 7.6.0 (transactions require replica set — already relied on by `lib/db/transaction.ts`), Zod 4.4.3. Adds Vitest as the test runner (no existing convention to follow).

**Spec:** `docs/superpowers/plans/2026-08-28-production-readiness-roadmap.md` §3 workstreams 0.1–0.5, grounded in the verified code audit in that document's §1. This plan implements workstreams 0.1 (test/CI), 0.2 (tenant/booking correctness), part of 0.3 (webhook parity — full gateway hardening is out of scope since no gateway is being integrated), 0.4 (security baseline), 0.5 (audit completion).

## Global Constraints

- No ORM — all persistence is hand-written against the native MongoDB driver (`models/*.ts` + `lib/db/client.ts`). Do not introduce Mongoose or an ODM.
- Zod is the validation standard (`lib/validation/*.ts`, `lib/auth/input.ts`). New validation must use Zod.
- MongoDB transactions require a replica set. `lib/db/transaction.ts`'s `withTransaction(database, work)` is the existing helper — reuse it, don't reinvent it.
- Every new/modified mutation on tenant-scoped resources must go through `requireOrganizationPermission(organizationId, permission)` from `lib/auth/authorization.ts`.
- `proxy.ts` (introduced in Task 10) must leave room for a future `/embed/*` path with relaxed framing headers — Milestone 3 adds the iframe embed feature and must not have to rework this file's structure, only add a branch.
- No payment gateway is being integrated in this or any milestone — the existing `ManualPaymentProvider` (`lib/payments/index.ts`) and the organizer's manual "Confirm" action are the permanent completion mechanism, not a placeholder for a future gateway.

---

### Task 1: Install Vitest and add a CI pipeline

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `lib/bookings/state-machine.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `npm test` script; CI workflow gating on lint + typecheck + test + build.

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Add test scripts to package.json**

Add to the `scripts` block in `package.json` (keep existing scripts unchanged):

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create the Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./") },
  },
});
```

- [ ] **Step 4: Write a characterization test for the existing booking state machine**

This documents current behavior of already-shipped logic (`lib/bookings/state-machine.ts:1-19`), so it is expected to pass immediately rather than fail-first:

```ts
// lib/bookings/state-machine.test.ts
import { describe, expect, it } from "vitest";
import { assertBookingTransition, canTransitionBooking } from "@/lib/bookings/state-machine";

describe("canTransitionBooking", () => {
  it("allows HELD -> PAYMENT_PENDING", () => {
    expect(canTransitionBooking("HELD", "PAYMENT_PENDING")).toBe(true);
  });

  it("allows PAYMENT_PENDING -> CONFIRMED", () => {
    expect(canTransitionBooking("PAYMENT_PENDING", "CONFIRMED")).toBe(true);
  });

  it("rejects CONFIRMED -> PAYMENT_PENDING", () => {
    expect(canTransitionBooking("CONFIRMED", "PAYMENT_PENDING")).toBe(false);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransitionBooking("CANCELLED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("REFUNDED", "CONFIRMED")).toBe(false);
    expect(canTransitionBooking("EXPIRED", "CONFIRMED")).toBe(false);
  });
});

describe("assertBookingTransition", () => {
  it("throws on an invalid transition", () => {
    expect(() => assertBookingTransition("CONFIRMED", "HELD")).toThrow(
      "Invalid booking transition: CONFIRMED -> HELD",
    );
  });

  it("does not throw on a valid transition", () => {
    expect(() => assertBookingTransition("HELD", "CANCELLED")).not.toThrow();
  });
});
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: 6 tests pass.

- [ ] **Step 6: Add the CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/bookings/state-machine.test.ts .github/workflows/ci.yml
git commit -m "test: add Vitest, first state-machine tests, and CI pipeline"
```

---

### Task 2: Stall-status sync helper (fixes the phantom `stall.status` field)

**Files:**
- Create: `lib/stalls/availability.ts`
- Create: `lib/stalls/availability.test.ts`

**Interfaces:**
- Produces: `setStallStatus(database: Db, stallId: ObjectId, status: StallStatus, session?: ClientSession): Promise<void>` — used by Tasks 4, 5, 6, 8.
- Consumes: `StallDocument["status"]` type from `models/stall.ts:17`.

This task only adds the helper (with a pure-logic test for the status-transition table it encodes); Tasks 4–6 and 8 wire it into the actual hold/booking/publish flows so `stall.status` stops being a field nothing writes.

- [ ] **Step 1: Write the failing test**

```ts
// lib/stalls/availability.test.ts
import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { setStallStatus } from "@/lib/stalls/availability";

function fakeDatabase() {
  const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  const collection = vi.fn().mockReturnValue({ updateOne });
  return { db: { collection } as unknown as import("mongodb").Db, updateOne };
}

describe("setStallStatus", () => {
  it("never overwrites a manually BLOCKED stall", async () => {
    const { db, updateOne } = fakeDatabase();
    await setStallStatus(db, new ObjectId(), "AVAILABLE");
    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $ne: "BLOCKED" } }),
      expect.objectContaining({ $set: expect.objectContaining({ status: "AVAILABLE" }) }),
      undefined,
    );
  });

  it("passes the session through when provided", async () => {
    const { db, updateOne } = fakeDatabase();
    const session = {} as import("mongodb").ClientSession;
    await setStallStatus(db, new ObjectId(), "HELD", session);
    expect(updateOne).toHaveBeenCalledWith(expect.anything(), expect.anything(), { session });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/stalls/availability.test.ts`
Expected: FAIL with "Cannot find module '@/lib/stalls/availability'"

- [ ] **Step 3: Implement the helper**

```ts
// lib/stalls/availability.ts
import type { ClientSession, Db, ObjectId } from "mongodb";

import type { StallDocument } from "@/models/stall";

/**
 * Transitions a stall's stored status to reflect a hold/booking lifecycle event.
 * A stall an organizer has manually set to BLOCKED is never overwritten by
 * hold/booking-driven transitions — only an explicit organizer edit can clear it.
 */
export async function setStallStatus(
  database: Db,
  stallId: ObjectId,
  status: StallDocument["status"],
  session?: ClientSession,
) {
  await database.collection<StallDocument>("stalls").updateOne(
    { _id: stallId, status: { $ne: "BLOCKED" } },
    { $set: { status, updatedAt: new Date() } },
    session ? { session } : undefined,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/stalls/availability.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/stalls/availability.ts lib/stalls/availability.test.ts
git commit -m "feat: add stall-status sync helper"
```

---

### Task 3: Atomic organization + owner creation

**Files:**
- Modify: `app/api/auth/register/route.ts:28-41`
- Modify: `app/api/organizations/route.ts:10-11`

**Interfaces:**
- Consumes: `withTransaction(database, work)` from `lib/db/transaction.ts:4-7`.

Both routes currently do sequential unguarded `insertOne` calls — a crash between inserts leaves an orphaned user or organization with no membership. Wrap each in a transaction.

- [ ] **Step 1: Fix `app/api/auth/register/route.ts`**

Replace lines 28-41:

```ts
  try {
    await withTransaction(database, async (session) => {
      await database.collection<UserDocument>("users").insertOne(user, { session });
      await database.collection<OrganizationDocument>("organizations").insertOne(organization, { session });
      await database.collection<MembershipDocument>("memberships").insertOne(membership, { session });
    });
    const session = await createSession(userId);
    await setSessionCookie(session.token, session.expiresAt);
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.redirect(new URL("/dashboard", request.url), 303);
    }
    return NextResponse.json({ user: { id: userId.toString(), name, email: user.email }, organization: { id: organizationId.toString(), name, slug: organizationSlug } }, { status: 201 });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return NextResponse.json({ error: "That organization slug is already in use" }, { status: 409 });
    return NextResponse.json({ error: "Unable to create account" }, { status: 500 });
  }
```

Add the import at the top of the file:

```ts
import { withTransaction } from "@/lib/db/transaction";
```

- [ ] **Step 2: Fix `app/api/organizations/route.ts`**

Replace the body of `POST` (currently a single dense line at 10-11) with:

```ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getCurrentUser } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import type { MembershipDocument, OrganizationDocument } from "@/models/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?._id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = (await request.json()) as { name?: string; slug?: string };
  if (!body.name?.trim() || !body.slug?.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)) {
    return NextResponse.json({ error: "Valid name and slug are required" }, { status: 400 });
  }
  const database = await getDatabase();
  const now = new Date();
  const organizationId = new ObjectId();
  const organization: OrganizationDocument = { _id: organizationId, name: body.name.trim(), slug: body.slug, status: "ACTIVE", createdAt: now, updatedAt: now };
  const membership: MembershipDocument = { _id: new ObjectId(), organizationId, userId: user._id, role: "OWNER", scopes: ["*"], status: "ACTIVE", createdAt: now, updatedAt: now };
  try {
    await withTransaction(database, async (session) => {
      await database.collection<OrganizationDocument>("organizations").insertOne(organization, { session });
      await database.collection<MembershipDocument>("memberships").insertOne(membership, { session });
    });
    return NextResponse.json({ organization }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Organization slug already exists" }, { status: 409 });
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/register/route.ts app/api/organizations/route.ts
git commit -m "fix: make organization + owner creation transactionally atomic"
```

---

### Task 4: Fix the reservation-hold TOCTOU gap and sync stall status

**Files:**
- Modify: `app/api/public/exhibitions/[exhibitionSlug]/stalls/[stallId]/hold/route.ts`

**Interfaces:**
- Consumes: `setStallStatus` from Task 2.

Currently the route does a `findOne` check then an `insertOne`, relying only on the partial unique index to stop a race — a genuine race throws an uncaught `MongoServerError` (500) instead of a clean 409. It also never sets `stall.status`.

- [ ] **Step 1: Write the failing test**

Add an integration-style unit test around the pure decision logic this route will delegate to (extracting the "is this a duplicate-key error" check into a testable helper keeps the route itself simple to keep matching this codebase's existing style of thin route handlers):

```ts
// lib/db/errors.test.ts
import { describe, expect, it } from "vitest";
import { MongoServerError } from "mongodb";
import { isDuplicateKeyError } from "@/lib/db/errors";

describe("isDuplicateKeyError", () => {
  it("returns true for a Mongo E11000 error", () => {
    const error = new MongoServerError({ message: "dup", code: 11000 });
    expect(isDuplicateKeyError(error)).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isDuplicateKeyError(new Error("boom"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/db/errors.test.ts`
Expected: FAIL with "Cannot find module '@/lib/db/errors'"

- [ ] **Step 3: Implement the helper**

```ts
// lib/db/errors.ts
import { MongoServerError } from "mongodb";

export function isDuplicateKeyError(error: unknown): error is MongoServerError {
  return error instanceof MongoServerError && error.code === 11000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/db/errors.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Rewrite the hold route to catch the race and sync stall status**

```ts
// app/api/public/exhibitions/[exhibitionSlug]/stalls/[stallId]/hold/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { isDuplicateKeyError } from "@/lib/db/errors";
import { getDatabase } from "@/lib/db/client";
import { setStallStatus } from "@/lib/stalls/availability";
import type { ExhibitionDocument } from "@/models/exhibition";
import type { ReservationHoldDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";

const HOLD_DURATION_MS = 15 * 60 * 1000;

export async function POST(_: Request, { params }: { params: Promise<{ exhibitionSlug: string; stallId: string }> }) {
  const { exhibitionSlug, stallId } = await params;
  if (!ObjectId.isValid(stallId)) return NextResponse.json({ error: "Invalid stall" }, { status: 400 });

  const database = await getDatabase();
  const now = new Date();
  const exhibition = await database.collection<ExhibitionDocument>("exhibitions").findOne({ slug: exhibitionSlug, lifecycle: "BOOKING_OPEN" });
  const stall = exhibition?._id
    ? await database.collection<StallDocument>("stalls").findOne({ _id: new ObjectId(stallId), exhibitionId: exhibition._id, visibility: "PUBLIC", status: "AVAILABLE" })
    : null;
  if (!exhibition?._id || !stall?._id) return NextResponse.json({ error: "Stall is not available" }, { status: 409 });

  await database.collection<ReservationHoldDocument>("reservationHolds").updateMany(
    { stallId: stall._id, status: "ACTIVE", expiresAt: { $lte: now } },
    { $set: { status: "EXPIRED", releasedAt: now } },
  );

  const hold: ReservationHoldDocument = {
    _id: new ObjectId(),
    organizationId: stall.organizationId,
    exhibitionId: stall.exhibitionId,
    hallId: stall.hallId,
    stallId: stall._id,
    status: "ACTIVE",
    expiresAt: new Date(now.getTime() + HOLD_DURATION_MS),
    createdAt: now,
  };

  try {
    await database.collection<ReservationHoldDocument>("reservationHolds").insertOne(hold);
  } catch (error) {
    if (isDuplicateKeyError(error)) return NextResponse.json({ error: "Stall is currently being held by another exhibitor" }, { status: 409 });
    throw error;
  }

  await setStallStatus(database, stall._id, "HELD");
  return NextResponse.json({ hold: { id: hold._id!.toString(), expiresAt: hold.expiresAt } }, { status: 201 });
}
```

Note: the pre-check `findOne` for an existing active hold is removed — it's now redundant with the unique partial index plus the catch block, and removing it closes the exact race window this task exists to fix (previously, both concurrent requests could pass the pre-check before either inserted).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/db/errors.ts lib/db/errors.test.ts app/api/public/exhibitions/\[exhibitionSlug\]/stalls/\[stallId\]/hold/route.ts
git commit -m "fix: close hold-creation race condition and sync stall status to HELD"
```

---

### Task 5: Release holds back to AVAILABLE (expiry job + inline expiry)

**Files:**
- Modify: `app/api/internal/jobs/expire-holds/route.ts`

**Interfaces:**
- Consumes: `setStallStatus` from Task 2.

The expiry job currently flips `reservationHolds.status` to `EXPIRED` but never touches the stall it was holding — the stall stays stuck on `HELD` forever once a hold lapses without becoming a booking.

- [ ] **Step 1: Rewrite the job to also release the stall**

```ts
// app/api/internal/jobs/expire-holds/route.ts
import { NextResponse } from "next/server";
import { getDatabase } from "@/lib/db/client";
import { setStallStatus } from "@/lib/stalls/availability";
import type { ReservationHoldDocument } from "@/models/booking";

export async function POST(request: Request) {
  if (!process.env.JOB_SECRET || request.headers.get("x-job-secret") !== process.env.JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const database = await getDatabase();
  const now = new Date();
  const expiring = await database.collection<ReservationHoldDocument>("reservationHolds")
    .find({ status: "ACTIVE", expiresAt: { $lte: now } })
    .toArray();

  for (const hold of expiring) {
    const result = await database.collection<ReservationHoldDocument>("reservationHolds").updateOne(
      { _id: hold._id, status: "ACTIVE" },
      { $set: { status: "EXPIRED", releasedAt: now } },
    );
    if (result.modifiedCount) await setStallStatus(database, hold.stallId, "AVAILABLE");
  }

  return NextResponse.json({ expired: expiring.length });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/internal/jobs/expire-holds/route.ts
git commit -m "fix: release stall status back to AVAILABLE when a hold expires"
```

---

### Task 6: Sync stall status through the booking lifecycle

**Files:**
- Modify: `app/api/public/exhibitions/[exhibitionSlug]/bookings/route.ts`
- Modify: `app/api/organizations/[organizationId]/bookings/[bookingId]/route.ts`
- Modify: `app/api/payments/webhooks/manual/route.ts`

**Interfaces:**
- Consumes: `setStallStatus` from Task 2.

- [ ] **Step 1: Set stall to `PENDING` inside the booking-creation transaction**

In `app/api/public/exhibitions/[exhibitionSlug]/bookings/route.ts`, inside the `withTransaction` callback, immediately after the `writeAudit(...)` call and before `return { booking, invoice, payment: paymentRecord };`, add:

```ts
              await setStallStatus(database, stall._id!, "PENDING", session);
```

Add the import:

```ts
import { setStallStatus } from "@/lib/stalls/availability";
```

- [ ] **Step 2: Sync stall status on organizer confirm/cancel**

In `app/api/organizations/[organizationId]/bookings/[bookingId]/route.ts`, inside the `withTransaction` callback, after the `findOneAndUpdate` succeeds and before `return updated;`, add:

```ts
    await setStallStatus(database, existing.stallId, nextStatus === "CONFIRMED" ? "BOOKED" : "AVAILABLE", session);
```

Add the import:

```ts
import { setStallStatus } from "@/lib/stalls/availability";
```

- [ ] **Step 3: Sync stall status and wrap the manual webhook in a transaction**

Replace `app/api/payments/webhooks/manual/route.ts` in full — this also fixes the workstream-0.3 gap where the webhook wrote 4 documents outside any transaction:

```ts
// app/api/payments/webhooks/manual/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { assertBookingTransition } from "@/lib/bookings/state-machine";
import { setStallStatus } from "@/lib/stalls/availability";
import { writeAudit } from "@/lib/audit";
import type { BookingDocument } from "@/models/booking";

export async function POST(request: Request) {
  if (!process.env.PAYMENT_WEBHOOK_SECRET || request.headers.get("x-payment-secret") !== process.env.PAYMENT_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { bookingId?: string; status?: "PAID" | "FAILED"; eventId?: string };
  if (!body.bookingId || !ObjectId.isValid(body.bookingId) || !body.status || !body.eventId) {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }

  const database = await getDatabase();
  const already = await database.collection("paymentWebhookEvents").findOne({ eventId: body.eventId });
  if (already) return NextResponse.json({ received: true, replay: true });

  const booking = await database.collection<BookingDocument>("bookings").findOne({ _id: new ObjectId(body.bookingId) });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  if (body.status === "PAID") {
    try {
      assertBookingTransition(booking.status, "CONFIRMED");
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid booking state" }, { status: 409 });
    }
    await withTransaction(database, async (session) => {
      await database.collection<BookingDocument>("bookings").updateOne(
        { _id: booking._id, status: booking.status },
        { $set: { status: "CONFIRMED", updatedAt: new Date() } },
        { session },
      );
      await database.collection("payments").updateOne({ bookingId: booking._id }, { $set: { status: "PAID", updatedAt: new Date(), paidAt: new Date() } }, { session });
      await database.collection("invoices").updateOne({ bookingId: booking._id }, { $set: { status: "PAID" } }, { session });
      await setStallStatus(database, booking.stallId, "BOOKED", session);
      await writeAudit(database, { organizationId: booking.organizationId, action: "payment.paid", entityType: "Booking", entityId: booking._id!.toString(), before: { status: booking.status }, after: { status: "CONFIRMED" }, metadata: { eventId: body.eventId } }, session);
      await database.collection("paymentWebhookEvents").insertOne({ eventId: body.eventId, bookingId: booking._id, status: body.status, receivedAt: new Date() }, { session });
    });
  } else {
    await withTransaction(database, async (session) => {
      await database.collection("payments").updateOne({ bookingId: booking._id }, { $set: { status: "FAILED", updatedAt: new Date() } }, { session });
      await database.collection("paymentWebhookEvents").insertOne({ eventId: body.eventId, bookingId: booking._id, status: body.status, receivedAt: new Date() }, { session });
    });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/public/exhibitions/\[exhibitionSlug\]/bookings/route.ts app/api/organizations/\[organizationId\]/bookings/\[bookingId\]/route.ts app/api/payments/webhooks/manual/route.ts
git commit -m "fix: keep stall.status in sync through the full booking lifecycle"
```

---

### Task 7: Give organizer manual-confirm parity with the webhook path

**Files:**
- Modify: `app/api/organizations/[organizationId]/bookings/[bookingId]/route.ts`

**Interfaces:**
- Produces: organizer-driven `PATCH .../bookings/[bookingId]` with `{status: "CONFIRMED"}` now also marks the payment and invoice as `PAID` — this is the real "mark as paid" action Milestone 2's dashboard button will call, matching the "manual organizer confirmation" decision (no payment gateway).

Currently this route only flips `booking.status`; the payment and invoice documents are left at `PENDING`/`ISSUED` forever unless the separate manual-webhook endpoint is called instead. Since manual confirmation is the permanent flow (no gateway), fold the payment/invoice sync into this route directly.

- [ ] **Step 1: Rewrite the route**

```ts
// app/api/organizations/[organizationId]/bookings/[bookingId]/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { readBody } from "@/lib/http/body";
import type { BookingDocument } from "@/models/booking";
import { assertBookingTransition } from "@/lib/bookings/state-machine";
import { setStallStatus } from "@/lib/stalls/availability";
import { writeAudit } from "@/lib/audit";
import { withTransaction } from "@/lib/db/transaction";

export async function PATCH(request: Request, { params }: { params: Promise<{ organizationId: string; bookingId: string }> }) {
  const { organizationId, bookingId } = await params;
  await requireOrganizationPermission(organizationId, "booking:manage");
  if (!ObjectId.isValid(bookingId)) return NextResponse.json({ error: "Invalid booking" }, { status: 400 });

  const body = (await readBody(request)) as { status?: BookingDocument["status"] };
  if (!body.status || !["CONFIRMED", "CANCELLED"].includes(body.status)) {
    return NextResponse.json({ error: "Only confirmation or cancellation is supported" }, { status: 400 });
  }
  const nextStatus = body.status;

  const database = await getDatabase();
  const existing = await database.collection<BookingDocument>("bookings").findOne({ _id: new ObjectId(bookingId), organizationId: new ObjectId(organizationId) });
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  try {
    assertBookingTransition(existing.status, nextStatus);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid booking transition" }, { status: 409 });
  }

  const result = await withTransaction(database, async (session) => {
    const updated = await database.collection<BookingDocument>("bookings").findOneAndUpdate(
      { _id: existing._id, organizationId: new ObjectId(organizationId), status: existing.status },
      { $set: { status: nextStatus, updatedAt: new Date() } },
      { returnDocument: "after", session },
    );
    if (!updated) throw new Error("Booking changed; reload and try again");

    if (nextStatus === "CONFIRMED") {
      await database.collection("payments").updateOne({ bookingId: existing._id }, { $set: { status: "PAID", updatedAt: new Date(), paidAt: new Date() } }, { session });
      await database.collection("invoices").updateOne({ bookingId: existing._id }, { $set: { status: "PAID" } }, { session });
    }
    await setStallStatus(database, existing.stallId, nextStatus === "CONFIRMED" ? "BOOKED" : "AVAILABLE", session);

    await writeAudit(database, {
      organizationId: new ObjectId(organizationId),
      action: `booking.${nextStatus.toLowerCase()}`,
      entityType: "Booking",
      entityId: bookingId,
      before: { status: existing.status },
      after: { status: nextStatus },
    }, session);

    return updated;
  });

  return NextResponse.json({ booking: result });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/organizations/\[organizationId\]/bookings/\[bookingId\]/route.ts
git commit -m "feat: organizer confirm action marks payment and invoice paid (no gateway)"
```

---

### Task 8: Atomic floor-plan publish

**Files:**
- Modify: `app/api/organizations/[organizationId]/floor-plans/[floorPlanId]/publish/route.ts`

Currently "archive the old published plan" and "publish the new one" are two separate un-sessioned writes — a brief window exists where either both or neither plan reads as published.

- [ ] **Step 1: Wrap both writes in one transaction**

```ts
// app/api/organizations/[organizationId]/floor-plans/[floorPlanId]/publish/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import { withTransaction } from "@/lib/db/transaction";
import { writeAudit } from "@/lib/audit";
import type { FloorPlanDocument } from "@/models/map";

export async function POST(_: Request, { params }: { params: Promise<{ organizationId: string; floorPlanId: string }> }) {
  const { organizationId, floorPlanId } = await params;
  await requireOrganizationPermission(organizationId, "map:edit");
  if (!ObjectId.isValid(floorPlanId)) return NextResponse.json({ error: "Invalid floor plan" }, { status: 400 });

  const database = await getDatabase();
  const current = await database.collection<FloorPlanDocument>("floorPlans").findOne({ _id: new ObjectId(floorPlanId), organizationId: new ObjectId(organizationId) });
  if (!current) return NextResponse.json({ error: "Floor plan not found" }, { status: 404 });

  const result = await withTransaction(database, async (session) => {
    await database.collection<FloorPlanDocument>("floorPlans").updateMany(
      { hallId: current.hallId, status: "PUBLISHED", _id: { $ne: current._id } },
      { $set: { status: "ARCHIVED", updatedAt: new Date() } },
      { session },
    );
    const updated = await database.collection<FloorPlanDocument>("floorPlans").findOneAndUpdate(
      { _id: current._id },
      { $set: { status: "PUBLISHED", updatedAt: new Date() } },
      { returnDocument: "after", session },
    );
    await writeAudit(database, { organizationId: new ObjectId(organizationId), action: "floorPlan.published", entityType: "FloorPlan", entityId: floorPlanId, after: { version: current.version } }, session);
    return updated;
  });

  return NextResponse.json({ floorPlan: result });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/organizations/\[organizationId\]/floor-plans/\[floorPlanId\]/publish/route.ts
git commit -m "fix: make floor-plan publish atomic and audited"
```

---

### Task 9: Env schema validation and `.env.example`

**Files:**
- Modify: `lib/config.ts`
- Create: `.env.example`

Currently only 3 env vars are schema-validated at boot; Resend/R2/webhook/job secrets fail silently deep inside request handlers instead of loudly at startup.

- [ ] **Step 1: Extend the env schema**

```ts
// lib/config.ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().url().optional(),
  MONGODB_DB_NAME: z.string().min(1).default("operant_expo"),

  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  CLOUDFLARE_R2_BUCKET_NAME: z.string().min(1).optional(),
  NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL: z.string().url().optional(),

  PAYMENT_WEBHOOK_SECRET: z.string().min(16).optional(),
  JOB_SECRET: z.string().min(16).optional(),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_R2_ACCESS_KEY_ID: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
  CLOUDFLARE_R2_SECRET_ACCESS_KEY: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  CLOUDFLARE_R2_BUCKET_NAME: process.env.CLOUDFLARE_R2_BUCKET_NAME,
  NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL: process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL,
  PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET,
  JOB_SECRET: process.env.JOB_SECRET,
});
```

Note: these stay `.optional()` rather than required, because `lib/storage/index.ts:9-14` and `lib/email/index.ts:14-17` already have their own runtime checks that produce clear user-facing errors when a specific feature is used without its config — making them required here would break local dev for anyone not yet using R2/Resend. The win from this task is that a *typo'd* value (e.g. a non-URL in `NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL`) now fails fast at boot instead of producing a confusing runtime error later.

- [ ] **Step 2: Add `.env.example`**

```bash
# .env.example
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/?replicaSet=rs0
MONGODB_DB_NAME=operant_expo

RESEND_API_KEY=
RESEND_FROM_EMAIL="Operant Expo <onboarding@resend.dev>"

CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL=

# Shared secrets for internal cron-style endpoints and the manual payment webhook.
# Generate with: openssl rand -hex 32
PAYMENT_WEBHOOK_SECRET=
JOB_SECRET=
```

- [ ] **Step 3: Typecheck and run tests**

Run: `npm run typecheck && npm test`
Expected: no errors, all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add lib/config.ts .env.example
git commit -m "feat: validate all environment secrets at boot; add .env.example"
```

---

### Task 10: Security headers via `proxy.ts` (embed-aware)

**Files:**
- Create: `proxy.ts`

No security headers exist anywhere in the app today. Add strict defaults, but structure the exemption for a future `/embed/*` route now (Milestone 3 adds that route and needs to relax `frame-ancestors`/`X-Frame-Options` only there) so this file's shape doesn't change later, only its embed branch.

Note: this Next.js build has deprecated and renamed the `middleware.ts` file convention to `proxy.ts` with an exported `proxy()` function (confirmed in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`) — creating `middleware.ts` here would build but log a deprecation warning; use `proxy.ts` instead.

- [ ] **Step 1: Create the proxy file**

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

// Milestone 3 will serve the embeddable booking widget under /embed/* and
// intentionally allow it to be framed by third-party sites. Every other path
// stays locked down. Keep this the single place that decides "can this page
// be put in an iframe" for the whole app.
const EMBEDDABLE_PATH_PREFIX = "/embed/";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const isEmbeddable = request.nextUrl.pathname.startsWith(EMBEDDABLE_PATH_PREFIX);

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isEmbeddable) {
    response.headers.set("Content-Security-Policy", "frame-ancestors *");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }

  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat: add security headers baseline with embed-path exemption"
```

---

### Task 11: Rate limiting on auth and public booking endpoints

**Files:**
- Create: `lib/http/rate-limit.ts`
- Create: `lib/http/rate-limit.test.ts`
- Modify: `proxy.ts`

In-memory sliding-window limiter. This is scoped to a single server instance — sufficient for an MVP without a payment gateway and without Redis, but document the limitation so it's not mistaken for a distributed guarantee.

- [ ] **Step 1: Write the failing test**

```ts
// lib/http/rate-limit.test.ts
import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/http/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, { limit: 5, windowMs: 60_000 }).allowed).toBe(true);
    }
  });

  it("blocks requests over the limit within the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(key, { limit: 3, windowMs: 60_000 });
    expect(checkRateLimit(key, { limit: 3, windowMs: 60_000 }).allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) checkRateLimit(a, { limit: 3, windowMs: 60_000 });
    expect(checkRateLimit(b, { limit: 3, windowMs: 60_000 }).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/http/rate-limit.test.ts`
Expected: FAIL with "Cannot find module '@/lib/http/rate-limit'"

- [ ] **Step 3: Implement the limiter**

```ts
// lib/http/rate-limit.ts
/**
 * Single-instance, in-memory sliding-window rate limiter. Good enough to blunt
 * casual abuse of public auth/booking endpoints on a single deployment; it is
 * NOT a distributed limiter — a multi-instance deployment needs a shared store
 * (e.g. Redis) instead. Swap the implementation behind this same function
 * signature when that becomes necessary.
 */
const hits = new Map<string, number[]>();

export function checkRateLimit(key: string, options: { limit: number; windowMs: number }) {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  const existing = (hits.get(key) ?? []).filter((timestamp) => timestamp > windowStart);
  const allowed = existing.length < options.limit;
  if (allowed) existing.push(now);
  hits.set(key, existing);
  return { allowed, remaining: Math.max(0, options.limit - existing.length) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/http/rate-limit.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into proxy.ts for auth and public booking paths**

Replace `proxy.ts` in full:

```ts
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/http/rate-limit";

const EMBEDDABLE_PATH_PREFIX = "/embed/";

const RATE_LIMITED_PATHS: Array<{ test: (pathname: string) => boolean; limit: number; windowMs: number }> = [
  { test: (path) => path === "/api/auth/login" || path === "/api/auth/register", limit: 10, windowMs: 60_000 },
  { test: (path) => /^\/api\/public\/exhibitions\/[^/]+\/stalls\/[^/]+\/hold$/.test(path), limit: 20, windowMs: 60_000 },
  { test: (path) => /^\/api\/public\/exhibitions\/[^/]+\/bookings$/.test(path), limit: 10, windowMs: 60_000 },
];

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const rule = RATE_LIMITED_PATHS.find((entry) => entry.test(pathname));
  if (rule) {
    const { allowed } = checkRateLimit(`${clientKey(request)}:${pathname}`, rule);
    if (!allowed) return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const response = NextResponse.next();
  const isEmbeddable = pathname.startsWith(EMBEDDABLE_PATH_PREFIX);

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  if (isEmbeddable) {
    response.headers.set("Content-Security-Policy", "frame-ancestors *");
  } else {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  }

  return response;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
```

- [ ] **Step 6: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/http/rate-limit.ts lib/http/rate-limit.test.ts proxy.ts
git commit -m "feat: rate limit auth and public booking endpoints"
```

---

### Task 12: Complete audit logging

**Files:**
- Modify: `app/api/auth/register/route.ts`
- Modify: `app/api/organizations/route.ts`
- Modify: `app/api/organizations/[organizationId]/exhibitions/[exhibitionId]/halls/[hallId]/stalls/route.ts`
- Modify: `app/api/organizations/[organizationId]/exhibitions/[exhibitionId]/halls/[hallId]/stalls/[stallId]/route.ts`
- Modify: `app/api/organizations/[organizationId]/invitations/route.ts`

Audit logging today only covers booking creation/status-change and the payment webhook. Add it to the remaining commercial/permission-sensitive actions named in the roadmap (org creation, registration, stall CRUD, invitations). Floor-plan publish and map-element edits are already covered by Task 8's rewrite and the pre-existing `writeAudit` calls respectively — no changes needed there.

- [ ] **Step 1: Audit registration** (inside the `withTransaction` block added in Task 3, after the membership insert):

```ts
      await writeAudit(database, { organizationId, actorId: userId, action: "organization.created", entityType: "Organization", entityId: organizationId.toString(), after: { name: organizationName, slug: organizationSlug } }, session);
```

Add the import: `import { writeAudit } from "@/lib/audit";`

- [ ] **Step 2: Audit additional-organization creation** (inside the `withTransaction` block added in Task 3, after the membership insert):

```ts
      await writeAudit(database, { organizationId, actorId: user._id, action: "organization.created", entityType: "Organization", entityId: organizationId.toString(), after: { name: organization.name, slug: organization.slug } }, session);
```

Add the import: `import { writeAudit } from "@/lib/audit";`

- [ ] **Step 3: Audit stall creation**

In the `POST` handler of `.../halls/[hallId]/stalls/route.ts`, after the successful `insertOne`:

```ts
      await writeAudit(database, { organizationId: new ObjectId(organizationId), action: "stall.created", entityType: "Stall", entityId: stall._id!.toString(), after: { stallNumber: stall.stallNumber, basePrice: stall.basePrice, status: stall.status } });
```

Add the import: `import { writeAudit } from "@/lib/audit";`

- [ ] **Step 4: Audit stall updates**

In the `PATCH` handler of `.../stalls/[stallId]/route.ts`, after the `findOneAndUpdate` and before the `if (!result)` check, capture the before-state and log after a successful update:

```ts
  const before = await database.collection<StallDocument>("stalls").findOne({ _id: new ObjectId(stallId) });
  const result = await database.collection<StallDocument>("stalls").findOneAndUpdate({ _id: new ObjectId(stallId), organizationId: new ObjectId(organizationId), exhibitionId: new ObjectId(exhibitionId), hallId: new ObjectId(hallId) }, { $set: data }, { returnDocument: "after" });
  if (!result) return NextResponse.json({ error: "Stall not found" }, { status: 404 });
  await writeAudit(database, { organizationId: new ObjectId(organizationId), action: "stall.updated", entityType: "Stall", entityId: stallId, before: before ? { status: before.status, basePrice: before.basePrice } : undefined, after: { status: result.status, basePrice: result.basePrice } });
  return NextResponse.json({ stall: result });
```

Add the import: `import { writeAudit } from "@/lib/audit";`

- [ ] **Step 5: Audit invitations**

In `app/api/organizations/[organizationId]/invitations/route.ts`, after the `insertOne`:

```ts
  await writeAudit(database, { organizationId: new ObjectId(organizationId), actorId: context.user._id, action: "invitation.created", entityType: "Invitation", entityId: invitation._id!.toString(), after: { email: invitation.email, role: invitation.role } });
```

Add the import: `import { writeAudit } from "@/lib/audit";`

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/auth/register/route.ts app/api/organizations/route.ts app/api/organizations/\[organizationId\]/exhibitions/\[exhibitionId\]/halls/\[hallId\]/stalls/route.ts app/api/organizations/\[organizationId\]/exhibitions/\[exhibitionId\]/halls/\[hallId\]/stalls/\[stallId\]/route.ts app/api/organizations/\[organizationId\]/invitations/route.ts
git commit -m "feat: complete audit logging for org creation, stalls, and invitations"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Test**

Run: `npm test`
Expected: all tests pass (state-machine, availability, errors, rate-limit — 13+ tests total).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: production build succeeds.

- [ ] **Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "chore: fix verification issues from milestone 1"
```

(Skip this step if Steps 1–4 required no changes.)

---

## Self-Review Notes

- **Spec coverage**: every workstream 0.1–0.5 item from the roadmap has a task above; 0.3's "real gateway" scope is explicitly excluded per the no-payment-gateway decision, but webhook transactionality/parity is covered (Task 6 Step 3, Task 7).
- **No placeholders**: every step has literal, complete code — no "add validation" or "handle errors" without showing the actual code.
- **Type consistency**: `setStallStatus(database, stallId, status, session?)` signature from Task 2 is used identically in Tasks 4, 5, 6, 7, 8. `isDuplicateKeyError` from Task 4 is a type guard (`error is MongoServerError`) so callers get narrowing.
