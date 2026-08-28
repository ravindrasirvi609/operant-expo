# Production Readiness Roadmap — Exhibition & Stall Booking SaaS

> **For agentic workers:** This is a Level-0 roadmap, not a single executable plan. It decomposes the remaining work into independent workstreams per the Scope Check in `superpowers:writing-plans`. Each P0/P1 workstream below must get its own bite-sized, TDD-structured plan (via `superpowers:writing-plans`) before a worker executes it with `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Do not attempt to execute this document directly — use it to pick the next workstream, then write that workstream's detailed plan.

**Goal:** Take the current prototype-grade Next.js exhibition/stall-booking SaaS to a production-grade state that can safely run a real, paid exhibition pilot.

**Architecture:** Next.js 16 App Router + TypeScript + MongoDB (native driver, no ORM) + Cloudflare R2 (S3-compatible) + Resend + a provider-agnostic payment adapter. Business logic lives inline in route handlers today; this roadmap does not mandate extracting a `services/` layer, but several workstreams (transactions, audit, state machine) push logic toward `lib/*` modules already.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 5, MongoDB driver 7.6.0 (native, transactions require replica set), Zod 4.4.3, pdf-lib 1.17.1, @aws-sdk/client-s3 (R2), Resend HTTP API (raw fetch, no SDK).

**Spec:** `SRS_REQUIREMENTS_AND_IMPLEMENTATION_STATUS.md` and `EXHIBITION_SAAS_IMPLEMENTATION_PLAN.md` (both at repo root) — this roadmap corrects and supersedes their status claims where verified against code (see §1).

## Global Constraints

- MongoDB transactions require a replica set — confirm the target deployment (Atlas or self-hosted) supports this before relying on `lib/db/transaction.ts` in new workstreams.
- No ORM: all model access is hand-written against the native driver in `models/*.ts` + `lib/db/client.ts`. Follow this convention; do not introduce Mongoose.
- Zod is the validation standard (`lib/validation/*.ts`). Any new route must validate input with Zod, not manual checks (some existing routes violate this — see §1, flagged for cleanup).
- No test framework is installed yet (§1.11). The first workstream that touches any P0 area must also install and wire one — do not write more untested business logic on top of the existing untested surface.
- Every new/modified mutation on tenant-scoped resources must go through `lib/auth/authorization.ts` (`requireOrganizationPermission`) — never trust a client-supplied `organizationId` alone.

---

## 1. Verified Current State (2026-08-28, HEAD `be17322`)

A code-level audit (not just the SRS status doc, which was one commit stale on booking/audit/invoice work) confirmed the following. Full detail is in the audit; key deltas from what the SRS doc claims:

| Area | SRS doc claim | Verified code reality |
|---|---|---|
| Org + owner creation | "not atomic" | **Confirmed still true** — `app/api/organizations/route.ts:11` and `app/api/auth/register/route.ts:29-31` do sequential unguarded `insertOne` calls, no `withTransaction`, even after the `be17322` org-creation UI was added. |
| Booking transactions | "pending" | **Now implemented** — `app/api/public/exhibitions/[exhibitionSlug]/bookings/route.ts:16-28` wraps exhibitor upsert + booking insert + hold release + payment intent + invoice + email queue + audit in one `withTransaction` (`lib/db/transaction.ts:4-7`). |
| Booking idempotency | "TODO" | **Implemented** — `idempotency-key` header checked against `bookings.idempotencyKey` before the transaction; duplicate-key (E11000) errors converted to clean 409s. |
| Double-booking prevention | "needs tests" | **DB-enforced** via partial unique indexes: `bookings` on `{stallId:1}` scoped to `status ∈ {HELD,PAYMENT_PENDING,CONFIRMED}`, `reservationHolds` on `{stallId:1}` scoped to `status:"ACTIVE"` (`lib/db/indexes.ts:26-27`). Robust but genuinely untested (no test suite exists). |
| Audit logging | "pending" | **Partially implemented** — `lib/audit/index.ts` `writeAudit` is wired into booking creation, booking status change, and the payment webhook's PAID branch. Not wired into org creation, registration, stall CRUD, floor-plan publish, membership/invitations, or map edits. |
| Payment webhook idempotency | "TODO" | **Implemented** — unique `paymentWebhookEvents.eventId` collection checked before processing. But the webhook's 4 writes (booking, payment, invoice, audit) are **not** wrapped in `withTransaction`, and auth is a static shared-secret header, not a signature/HMAC. |
| Stall bulk ops / delete | "pending" | **Confirmed still pending** — stalls API has GET/POST/PATCH only, no DELETE, no bulk import/export. |
| Tests / CI | "pending" | **Confirmed zero** — no test files, no test framework in `package.json`, no `.github/workflows`. |
| Rate limiting / CSP / middleware | "pending" | **Confirmed absent** — no `middleware.ts`, no rate-limit dependency, `next.config.ts` is an empty config object. |

**Two correctness bugs found that neither doc mentions**, because they only show up by reading the code:

1. **`stall.status` is a phantom field.** Nothing in the booking/hold flow ever transitions it — availability is derived purely from the `reservationHolds`/`bookings` partial-unique indexes. Only the organizer's manual stall-edit PATCH writes `stall.status`, as an arbitrary admin edit. Any UI or query that trusts `stall.status` for availability (the public map viewer does — see `components/exhibition-map/viewer.tsx`) can show stale/wrong availability.
2. **Reservation-hold creation has a TOCTOU gap.** `app/api/public/exhibitions/[exhibitionSlug]/stalls/[stallId]/hold/route.ts:9-22` does a `findOne` check then an `insertOne`, relying on the partial unique index to stop a race — but there's no `try/catch` around the resulting E11000, so a genuine race surfaces to the user as an unhandled 500 instead of a clean "someone else just held this stall" 409.

Also found: floor-plan publish (`.../floor-plans/[floorPlanId]/publish/route.ts`) does "archive old published plan" then "set new plan published" as two separate un-sessioned writes — a brief window where two plans could read as published for the same hall.

---

## 2. Phase 0 Decisions (answer before writing detailed plans for anything payment- or auth-adjacent)

These are the SRS's own "Phase 0: Product Decisions" items, still open:

1. **Auth**: keep the custom cookie-session implementation (add password reset, email verification, MFA, session listing/revocation, brute-force protection) or migrate to a mature provider (Auth.js, Clerk, WorkOS)? This blocks the Security workstream (§4).
2. **Payment gateway**: Stripe, Razorpay, or other — the `PaymentProvider` adapter interface already exists (`lib/payments/index.ts`) with only a manual/mock implementation behind it. Blocks the Payments workstream (§9).
3. **Test framework**: Vitest (fast, ESM-native, works well with Next 16) vs Jest. Recommend Vitest + Playwright for E2E — no existing convention to preserve either way.
4. **MongoDB deployment**: confirm production target is a replica set (Atlas minimum M10, or self-hosted RS) — transactions do not work on a standalone instance, and several existing routes already depend on `withTransaction`.

---

## 3. Workstreams, Prioritized

Each workstream is sized to be its own bite-sized implementation plan (a handful to ~15 tasks). **P0 workstreams are correctness/security fixes on already-shipped code or foundational gaps that block safe iteration — they come first regardless of "new feature" appeal.**

### P0 — Blocks a real pilot

| # | Workstream | Why P0 | Rough scope |
|---|---|---|---|
| 0.1 | **Test & CI foundation** | Zero tests exist; every fix below needs a way to verify it stays fixed. | Install Vitest, add `test`/`test:watch` scripts, write first tests against `lib/bookings/state-machine.ts` and `lib/db/indexes.ts` (pure logic, no DB needed), add `.github/workflows/ci.yml` running lint+typecheck+test+build. |
| 0.2 | **Tenant/booking correctness fixes** | Live bugs in shipped code: non-atomic org creation, hold-creation TOCTOU 500, non-transactional publish, phantom `stall.status`. | Wrap org+membership creation and register flow in `withTransaction`; add try/catch around hold insert E11000 → 409; wrap floor-plan publish archive+set in one transaction; decide `stall.status` semantics (either derive it live from holds/bookings on read, or transition it transactionally alongside hold/booking writes) and fix the public map viewer accordingly. |
| 0.3 | **Payment webhook hardening** | Webhook writes 4 documents outside a transaction; auth is a static secret, not verifiable. | Wrap booking/payment/invoice/audit updates in `withTransaction`; add HMAC/signature verification abstraction on the `PaymentProvider` interface (even for the manual provider, to establish the pattern before a real gateway lands). |
| 0.4 | **Security baseline** | No `middleware.ts`, no rate limiting, no CSP/security headers, unvalidated env vars beyond 3 fields. | Add `middleware.ts` for security headers; add rate limiting (public hold/booking endpoints and auth endpoints are the priority targets); extend `lib/config.ts` Zod schema to cover Resend/R2/payment/job secrets so boot fails loudly on misconfiguration; add `.env.example`. |
| 0.5 | **Audit logging completion** | Currently only booking + payment-webhook paths are audited. | Wire `writeAudit` into org creation, registration, stall CRUD, floor-plan publish, membership/invitation changes, map element edits. |
| 0.6 | **Stall inventory completion** | No delete, no bulk ops — organizers can't correct mistakes or onboard a large hall efficiently. | Add DELETE (with booking-history guard — never hard-delete a stall with any booking), bulk create/update, CSV import/export, list filters. |

### P1 — Required for a strong MVP

| # | Workstream | Scope |
|---|---|---|
| 1.1 | **Real payment gateway** | Implement chosen provider (per §2.2) behind the existing `PaymentProvider` interface; real webhook signature verification; reconciliation job. |
| 1.2 | **Map editor completion** | Undo/redo (command history), snap-to-grid, rotate control, multi-select, delete, keyboard nudge — current editor only has drag-move and drag-resize. |
| 1.3 | **Email templates & reliable delivery** | Replace hardcoded HTML strings in `lib/email/index.ts` with React Email templates; real retry/backoff; wire something (Vercel Cron, or documented external scheduler) to actually call `app/api/internal/jobs/process-emails`. |
| 1.4 | **Organizer dashboards & reports** | Occupancy/revenue/booking-count aggregations, booking detail page, exhibitor management screens. |
| 1.5 | **Public stall discovery** | Search/filter/list view synchronized with the map (currently map-click only). |
| 1.6 | **Invoice completion** | Listing/search API, guaranteed sequential numbering (currently derived from `bookingNumber` string), floor-plan version history/revert. |
| 1.7 | **Asset security** | SVG sanitization on upload, private-object signed URLs, deletion. |
| 1.8 | **Accessibility pass** | Keyboard map-editor flow, screen-reader labeling audit against WCAG 2.1 AA. |

### P2 — Roadmap (explicitly deferred, do not plan yet)

Add-ons (electricity/furniture/branding), polygon/custom-shape geometry, custom domains & white-labeling, subscription billing, multi-currency settlement, CAD/BIM import, native mobile apps, advanced analytics, Abstract+Registration product integration.

---

## 4. Recommended Sequencing

```text
0.1 Test & CI foundation        (must be first — nothing else is verifiable without it)
0.2 Tenant/booking correctness  (fixes bugs in code already handling money)
0.3 Payment webhook hardening   (same transaction pattern as 0.2, do together)
0.4 Security baseline           (middleware/rate-limit/env validation — cross-cutting, do before opening real payments)
0.5 Audit logging completion    (small, mechanical, do once transaction patterns from 0.2/0.3 are settled)
0.6 Stall inventory completion  (organizer-facing gap, independent of the above)
---
1.1 Real payment gateway        (needs Phase 0 decision §2.2 + 0.3's hardened webhook pattern)
1.2 Map editor completion
1.3 Email templates & delivery
1.4 Organizer dashboards
1.5 Public stall discovery
1.6 Invoice completion
1.7 Asset security
1.8 Accessibility pass
---
Staging deployment, backup/restore drill, load test, pilot exhibition
```

0.2 and 0.3 share the transaction-wrapping pattern and touch adjacent code (`lib/db/transaction.ts`, payment/booking routes) — plan and execute them back-to-back, ideally as one plan if scope stays small, or two plans executed consecutively.

---

## 5. Acceptance Criteria (repo-wide "production-ready" bar)

Carried forward from the SRS doc's §8, still accurate as a checklist:

- Tenant data cannot cross organization boundaries (needs isolation tests — currently untested).
- Concurrent users cannot confirm the same stall (DB-enforced today; needs a concurrency test proving it).
- Every commercial state change is audited (currently partial — closed by workstream 0.5).
- CI passes lint, typecheck, tests, and production build on every change (currently no CI — closed by workstream 0.1).
- Backups and restore procedures are documented and tested (not started).
- Monitoring and production error reporting are active (not started — no observability workstream has been scoped yet; add one once P0/P1 lands and real traffic patterns are known).

---

## 6. Next Step

Pick one P0 workstream above and write its detailed, bite-sized implementation plan with `superpowers:writing-plans` (file tasks, failing tests first, exact code). Recommended starting point is **0.1 (Test & CI foundation)** since every other workstream benefits from having a real verification loop before it starts.
