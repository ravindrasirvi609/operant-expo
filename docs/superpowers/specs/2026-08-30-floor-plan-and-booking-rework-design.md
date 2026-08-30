# Floor Plan & Booking Rework — Design

Date: 30 August 2026
Status: awaiting review
Supersedes status claims in `docs/superpowers/plans/2026-08-28-production-readiness-roadmap.md` where they conflict with §1 below (several items that roadmap lists as broken have since been fixed; several it does not mention are broken).

## 1. Verified Problems (read from code at HEAD `19a2c0c`)

### 1.1 Creating a floor plan is impossible

| # | Defect | Evidence |
|---|---|---|
| F1 | Background upload is **mandatory**, and the uploader cannot succeed because R2 is unconfigured. Every floor-plan creation dies at step one with a generic 400. | `map/setup/page.tsx:25,80` → `assets/route.ts:16` → `lib/storage/index.ts:13` throws `"R2 storage is not configured"`; `.env.local` has no `CLOUDFLARE_*` keys |
| F2 | The map editor is **unreachable from the UI**. Only `/map/setup` and `/map` are linked. | `grep -rn "map/edit" app components` → no matches; links at `dashboard/exhibitions/page.tsx:164-165` |
| F3 | Editor renders `"Loading map editor…"` **forever** when the hall has no plan — no error, no CTA. | `map/edit/page.tsx:43` bare `return`, `:228` loading guard |
| F4 | `organizationId` is read only from `?organizationId=`. Without it the submit button is permanently disabled with no explanation. | `map/setup/page.tsx:15,25,94` |
| F5 | Each setup submit creates a **new empty DRAFT version**; the editor then loads `floorPlans[0]` (newest), silently orphaning all previously placed elements. | `floor-plans/route.ts:28-29`, `map/edit/page.tsx:42` |
| F6 | The organizer map view prefers the newest of `{PUBLISHED, DRAFT}`, so a new draft **masks the live published plan**. | `map/page.tsx:20` |
| F7 | Canvas size is disconnected from hall size — hall carries `width`/`height`, the plan hardcodes 1600×2200. The numbers mean nothing to each other. | `hallSchema` in `lib/validation/exhibition.ts:31-32` vs `map/setup/page.tsx:86,90` |
| F8 | Raw `response.json()` in the setup flow; a non-JSON failure throws into a generic catch that reports `"Unable to create floor plan"` with no detail. | `map/setup/page.tsx:33,43` |

### 1.2 Booking from the public plan is impossible

| # | Defect | Evidence |
|---|---|---|
| B1 | **Lifecycle mismatch.** The public map renders for `PUBLISHED \| BOOKING_OPEN \| BOOKING_CLOSED`, but holds require *exactly* `BOOKING_OPEN`. On a published-but-not-open exhibition, clicking a stall navigates to a page that instantly errors "Stall is not available". | `(public)/…/page.tsx:14` vs `hold/route.ts:19` |
| B2 | **The editor never creates bookable stalls.** `addStall()` writes a `mapElements` doc only; the `stalls` doc must be created separately at `/dashboard/stalls`. Skip that and the public map draws rectangles with **no `stallId`** — clicking does nothing at all, silently. | `map/edit/page.tsx:104-112`; `viewer.tsx:27`; `inventory.tsx:27` |
| B3 | **A visitor can only ever attempt once.** Holds require `status:"AVAILABLE"` and a unique partial index blocks a second active hold. Reload / back / lost tab ⇒ 409 and a 15-minute lockout, with no way to resume your own hold. | `hold/route.ts:21`, `lib/db/indexes.ts:42` |
| B4 | Holds are **anonymous** — nothing ties a hold to a visitor, so "your reservation" is unenforceable and unrecoverable. | `models/booking.ts:4` (no visitor field) |
| B5 | Element↔stall links **break across plan versions**: elements come from the published plan, stalls are matched by `hallId` only. Publishing a new version makes every stall vanish from the map. | `(public)/…/page.tsx:21-23,50` |
| B6 | `PENDING` stalls are **clickable** (only `BOOKED`/`BLOCKED` are disabled) and always 409. | `viewer.tsx:27,88` |
| B7 | `PENDING` is **absent from the legend** and shares the same red as `BOOKED`, so unavailability is unexplained. | `viewer.tsx:10-15`, `status-badge.tsx:6-7` |
| B8 | Non-stall elements (entrance/exit/stage/walkway) render as **focusable buttons that do nothing**. | `viewer.tsx:84-102` |
| B9 | Hold expiry depends on an external cron (`JOB_SECRET`). If nothing calls it, stalls sit at `HELD` forever and the public map lies. The hold route only expires holds for the one stall being requested. | `expire-holds/route.ts:7`, `hold/route.ts:25-28` |
| B10 | The booking page **never shows what is being bought** — no stall number, hall, size, price, or total. Company details are demanded first. | `book/[stallId]/page.tsx:62-97` |
| B11 | `seconds` initialises to `0` and only updates on the first interval tick, so the submit button is dead for ~1s and an early submit reports "Reservation expired". | `book/[stallId]/page.tsx:13,32,46` |
| B12 | The booking route is **one 15-line-long line**; its catch-all maps every internal failure (including real 500s) to `409` and **leaks `error.message` to the public**. | `public/…/bookings/route.ts:31` |

### 1.3 Validation, errors and messaging

| # | Defect | Evidence |
|---|---|---|
| V1 | `requireOrganizationPermission` calls `notFound()`/`unauthorized()` **inside API routes**, which per the Next 16 docs "serves a 404 to the caller" — not JSON. Clients render permission failures as `"Request failed (404)"`. | `lib/auth/authorization.ts:8,17`; `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md:197` |
| V2 | Per-field Zod errors **are returned and never rendered**. Most routes return only an opaque string like `"Invalid hall details"`. | `stalls/route.ts:24`, `elements/route.ts:26`, `bookings/route.ts:19` vs every client |
| V3 | **16 client call sites** use raw `response.json()` instead of the `parseJsonResponse` helper that exists to prevent stuck spinners. | `dashboard/page.tsx:35,47`, `exhibitions/page.tsx:32,44,54`, `holds/page.tsx:43,55`, `bookings/page.tsx:38,50`, `inventory.tsx:16-19`, `map/setup/page.tsx:33,43`, `map/edit/page.tsx:41,45`, `publish-button.tsx:11` |
| V4 | **No toast/notification system.** Every message is a bespoke inline `<p>`; several are never cleared. | e.g. `exhibitions/page.tsx:106-107` |
| V5 | Client-side validation is `required`-only; slug format, date ordering and currency length surface as opaque server strings. The `endDate >= startDate` refine message is discarded. | `Form` at `exhibitions/page.tsx:190-204`; `exhibitionCreateSchema` refine |
| V6 | `exhibitorSchema` uses `z.string().email()`, deprecated in Zod 4 (installed: 4.4.3, `z.email` available). | `lib/validation/booking.ts:3` |

### 1.4 UI

| # | Defect | Evidence |
|---|---|---|
| U1 | **No shadcn/ui.** No `components.json`, no Radix, no CVA/clsx/tailwind-merge, no icon set. Four hand-rolled primitives total. | `package.json`; `components/ui/` |
| U2 | Dark mode is faked by **overriding Tailwind utility class names** in a media query — brittle, no `dark:` strategy, no toggle. | `app/globals.css:58-71` |
| U3 | No accessible dialog/sheet, no form-field component, no skeletons, no empty-state component; dashboard header is not responsive. | `dashboard/layout.tsx:13-25` and passim |
| U4 | Editor renders a raw 1600×2200 px canvas with no fit-to-screen, no background image, no alignment aids, no bulk placement. | `map/edit/page.tsx:252-262` |

## 2. Decisions

Confirmed with the product owner on 30 Aug 2026:

1. **Keep the blueprint/drafting identity, rebuilt on shadcn/ui.** shadcn is adopted for primitives and accessibility; the paper/ink/accent palette, corner registration marks, dimension-tick dividers and mono numerals are preserved and mapped onto shadcn's token names.
2. **Unified stall creation + one living floor plan per hall.** Placing a stall creates its bookable record atomically. One plan per hall, promoted `DRAFT → PUBLISHED` in place.
3. **Background images are optional, with a local-disk driver fallback** so the flow works with no cloud configuration.
4. **Spec → phased delivery with a checkpoint after each phase.**

Two decisions taken here, not asked, because the codebase already settles them:

5. **Route handlers stay the API surface; no migration to Server Actions.** The public booking API is consumed by the embeddable widget, needs an `Idempotency-Key` header, and is rate-limited by path in `proxy.ts`. Server Actions would fragment that. Client components keep fetching, through a hardened client.
6. **`stalls` stays its own collection.** Merging stalls into `mapElements` would invalidate every `bookings.stallId` and `reservationHolds.stallId` reference. Instead a 1:1 invariant is enforced by index and by transactional create/delete.

## 3. Architecture

### 3.1 Data model

**Floor plan — one per hall.**

```
floorPlans: {
  _id, organizationId, exhibitionId, hallId,     // hallId now UNIQUE
  status: "DRAFT" | "PUBLISHED",                  // ARCHIVED removed; no sibling docs to archive
  revision: number,                               // bumped on each publish, display/audit only
  canvasWidth, canvasHeight, gridSize,
  backgroundAssetId?,                             // optional
  publishedAt?, createdBy, createdAt, updatedAt
}
```

- New index: `floorPlans { hallId: 1 }` unique. Replaces `{ hallId, version: -1 }`.
- `version` is renamed `revision` and no longer selects between documents. Fixes F5, F6, B5 structurally — there is nothing left to orphan.
- Migration (§3.6) collapses existing multi-version halls.

**Stall ⟷ map element — 1:1, transactional.**

```
mapElements: { …unchanged… }        // STALL | ENTRANCE | EXIT | ZONE | STAGE | WALKWAY
stalls:      { …unchanged fields…, floorPlanElementId }   // now UNIQUE
```

- New index: `stalls { floorPlanElementId: 1 }` unique.
- A STALL element and its stall are created, updated and deleted in one `withTransaction`. Non-stall elements have no stall record.
- Deleting a stall that has an active hold or a non-terminal booking is refused with `409 STALL_IN_USE`.
- Fixes B2 (a placed stall is bookable by construction) and B5.

**Holds — identified and resumable.**

```
reservationHolds: { …unchanged…, visitorId: string }
```

- `visitorId` comes from a signed, httpOnly `oe_visitor` cookie (30 days), minted on first public page view. Fixes B4.
- Hold request semantics (fixes B3):
  - active non-expired hold on this stall **with the same `visitorId`** → return it, `200`, same expiry;
  - active non-expired hold held by **another** visitor → `409 STALL_HELD` with minutes remaining;
  - otherwise create a new hold.

**Derived availability.** A single `lib/stalls/availability.ts` function is the only place that answers "can this be booked", from stall status + live hold + live booking, returning `{ bookable, reason }` where reason ∈ `AVAILABLE | HELD_BY_OTHER | HELD_BY_YOU | PENDING_PAYMENT | BOOKED | BLOCKED | BOOKING_NOT_OPEN`. Consumed by the public page, the API and the viewer. Fixes B6, B7.

**Lazy hold expiry.** Every public read first runs one bulk sweep: `reservationHolds` where `status:"ACTIVE"` and `expiresAt <= now` → `EXPIRED`, then the affected non-`BLOCKED` stalls → `AVAILABLE`. The cron endpoint remains as a backstop, not the only mechanism. Fixes B9.

### 3.2 API changes

Errors get one shape everywhere, from `lib/http/responses.ts`:

```ts
{ error: string, code?: string, fieldErrors?: Record<string, string[]> }
```

built with `z.flattenError` (Zod 4) — fixes V2. Helpers: `ok`, `created`, `badRequest(zodError)`, `unauthorizedJson`, `forbiddenJson`, `notFoundJson`, `conflict(msg, code)`, `serverError()`. `serverError` logs the cause and returns a fixed public string — fixes B12's leak.

`lib/auth/authorization.ts` splits (fixes V1):

- `requireOrganizationPermission` — pages only, keeps `notFound()`/`unauthorized()`;
- `requireApiPermission` — returns `{ ok: true, context } | { ok: false, response }` so routes emit JSON `401`/`403`.

Floor-plan routes, replacing the versioned set:

| Method & path | Behaviour |
|---|---|
| `GET    …/halls/{hallId}/floor-plan` | The hall's plan with elements, stalls and background URL. `404` if none. |
| `POST   …/halls/{hallId}/floor-plan` | Idempotent ensure-exists. Canvas defaults derived from hall dimensions. Background optional. Returns existing plan if present. Fixes F1, F3, F5. |
| `PATCH  …/halls/{hallId}/floor-plan` | Canvas size, grid size, background (set or clear). |
| `POST   …/floor-plans/{planId}/stalls` | Creates element + stall atomically. Auto-suggests the next stall number. |
| `PATCH  …/floor-plans/{planId}/stalls/{stallId}` | Geometry and/or commercial fields in one call. |
| `DELETE …/floor-plans/{planId}/stalls/{stallId}` | Deletes both; `409 STALL_IN_USE` if held/booked. |
| `POST   …/floor-plans/{planId}/stalls/bulk` | Grid generator: rows × cols, size, gap, origin, numbering scheme, type, base price, currency. One transaction, all-or-nothing. |
| `POST   …/floor-plans/{planId}/elements` | Non-stall elements only (validated). |
| `POST   …/floor-plans/{planId}/publish` | Runs the readiness checklist, flips to `PUBLISHED`, bumps `revision`, writes audit. Rejects with the failing checks listed. |

Public routes:

| Method & path | Change |
|---|---|
| `GET  /api/public/exhibitions/{slug}` | Sweeps expired holds; returns `bookingOpen`, and per stall `{ bookable, reason, price, currency, type, area, amenities }`. |
| `GET  /api/public/exhibitions/{slug}/stalls/{stallId}` | **New.** Stall detail for the pre-booking sheet. |
| `POST /api/public/exhibitions/{slug}/stalls/{stallId}/hold` | Visitor-aware resume semantics; distinct codes for each refusal; `422 BOOKING_NOT_OPEN` instead of a misleading "not available". Fixes B1, B3. |
| `POST /api/public/exhibitions/{slug}/bookings` | Logic extracted to `lib/bookings/create.ts` as named steps; correct status codes; no leaked internals. Fixes B12. |

### 3.3 Floor-plan wizard — the headline flow

One route, four steps, at `/dashboard/exhibitions/{exhibitionId}/halls/{hallId}/plan`. Reachable from the hall card and from the exhibition detail page — fixes F2. `organizationId` comes from the org context provider, not a query string — fixes F4.

1. **Canvas.** Canvas size prefilled from the hall's own dimensions; grid size; **optional** background via drag-and-drop with "Continue without a background" as an equal-weight action. Creating the plan is idempotent, so re-entering this step never orphans work.

   The unit convention is fixed here to close F7: **hall `width`/`height` are metres; canvas coordinates are plan units at 20 units per metre.** So a 40 m × 25 m hall defaults to an 800 × 500 canvas, and a stall drawn 60 × 60 reads as 3 m × 3 m. Defaults are clamped to the existing `floorPlanSchema` ceiling of 100 000. The editor labels axes in metres so the organizer never has to think in plan units, and the properties panel shows both.
2. **Layout.** The editor: fit-to-screen and zoom controls, pan, background rendered beneath the grid, snap toggle, add one stall, **add a grid of stalls** (the main lever for "create a floor plan easily"), add entrance/exit/stage/walkway, multi-select with align and distribute, arrow-key nudge, undo/redo, and an inline properties panel carrying stall number, type, size, price, currency, amenities and visibility. Live validation flags out-of-canvas, overlapping and duplicate-numbered stalls. Autosave with an explicit saved/saving/failed indicator.
3. **Pricing & inventory.** Table of every stall in the hall with inline and bulk edit of price, type and visibility, and an explicit count of unpriced stalls.
4. **Review & publish.** Readiness checklist, a preview rendered with the *same* viewer component visitors see, then Publish — and, when the exhibition is only `PUBLISHED`, a follow-on "Open booking" action so the organizer cannot leave it in the state that causes B1.

Step position is derived from plan state; no separate wizard-state store.

### 3.4 Public booking flow

1. Public exhibition page shows a lifecycle banner: booking open, opening soon, or closed. Stalls are only interactive when booking is open **and** the stall is bookable; every other case renders its reason. Fixes B1, B6, B7, B8.
2. Clicking a bookable stall opens a **detail sheet** — number, hall, type, dimensions, area, amenities, price — with "Reserve for 15 minutes". Nothing is held until the visitor asks. Fixes B10.
3. Reserving creates or resumes the hold, then routes to a three-step booking flow: **Review** (stall + price breakdown), **Your details** (validated form, server field errors merged inline), **Submitted** — the booking is created as `PAYMENT_PENDING`, so this screen states exactly that: booking number, invoice number, the amount due, and that the organizer confirms once payment is received. It never claims the stall is confirmed. The countdown is persistent and derived from the hold's `expiresAt`, seeded synchronously from that timestamp so there is no dead first second. Fixes B11.

   The 15-minute hold window moves from a hard-coded constant to configuration (`HOLD_DURATION_MINUTES`, default 15) so an organizer-facing setting can be added later without touching the flow.
4. `/embed/*` reuses the same components with `bookingBasePath="/embed"`, so the widget and the public page cannot diverge.

### 3.5 UI system

New dependencies: `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `next-themes`, `sonner`, `react-hook-form`, `@hookform/resolvers`, and the Radix primitives shadcn wraps (`dialog`, `select`, `label`, `slot`, `tabs`, `tooltip`, `popover`, `separator`, `checkbox`, `switch`, `scroll-area`, `dropdown-menu`). Registry reachability confirmed.

`app/globals.css` is rewritten to declare shadcn's semantic tokens — `--background --foreground --card --popover --primary --secondary --muted --accent --destructive --border --input --ring --radius` — bound to the existing blueprint palette, plus `--status-*` tokens for availability colours. Dark mode moves to a `.dark` class driven by `next-themes`, and the utility-class-override block is deleted. Fixes U1, U2.

Components added under `components/ui/`: Button, Input, Textarea, Label, Field, Select, Checkbox, Switch, Card, Badge, Table, Dialog, Sheet, Tabs, Tooltip, Popover, Separator, Skeleton, Alert, EmptyState, Stepper, Toaster. The four existing primitives (`StatusBadge`, `StatCard`, `SectionEyebrow`, `DimensionDivider`) are kept and re-expressed on the new tokens so the identity survives. Fixes U3.

Forms use react-hook-form with `zodResolver` over the **same** `lib/validation/*` schemas the routes use, so client and server never disagree; API `fieldErrors` are merged into form state with `setError`. Every mutation raises a sonner toast. Fixes V4, V5.

`lib/http/client.ts` gains `apiRequest<T>()` returning `{ ok, status, data?, error?, code?, fieldErrors? }`, and all 16 raw `response.json()` call sites migrate to it. Fixes V3.

### 3.6 Storage

`lib/storage/index.ts` becomes a driver interface with three resolutions:

- **r2** when the `CLOUDFLARE_*` vars are set (current behaviour, unchanged);
- **local** otherwise — writes to `ASSET_STORAGE_DIR` (default `.uploads/`, git-ignored) and serves through a new `GET /api/assets/[...key]` handler with correct content type and immutable caching. Not `public/`, which is not writable at runtime in a production build;
- **explicit failure** with an actionable message if the local directory is unwritable.

Fixes F1's hard dependency while keeping R2 authoritative in production.

### 3.7 Migration

One idempotent script, `lib/db/migrations/2026-08-30-single-floor-plan.ts`, runnable via a guarded internal route:

1. For each hall with floor plans: keep the newest `PUBLISHED`, else the newest `DRAFT`. Re-point the kept plan's `revision` to the highest version seen.
2. Re-parent every `mapElement` of the discarded plans onto the kept plan **only if** the kept plan has no elements of its own (recovering work orphaned by F5); otherwise delete the discarded elements that no stall references, and report the rest.
3. Delete the discarded plan documents.
4. Report — never silently drop — any stall whose `floorPlanElementId` no longer resolves, and any element that would violate the new unique indexes, before creating them.

The script prints a dry-run summary first and requires an explicit `apply` flag.

## 4. Phases

Each phase ends with `npm test`, `npx tsc --noEmit`, `npm run lint` green, and a checkpoint for review.

| Phase | Delivers |
|---|---|
| **P1 — Design system & shell** | shadcn install, token rewrite, real dark mode + toggle, toaster, `responses.ts`, `requireApiPermission`, `apiRequest`, Field/Form plumbing, org context provider, responsive dashboard shell. Existing screens migrated to the new primitives. Fixes U1–U3, V1, V3, V4. |
| **P2 — Floor plan** | Model migration + indexes, new floor-plan/stall/bulk/publish APIs, storage drivers + asset route, the four-step wizard and rebuilt editor. Fixes F1–F8, B2, B5. |
| **P3 — Booking** | Derived availability, lazy expiry, visitor cookie + hold resume, stall detail sheet, three-step booking flow, booking-route extraction, embed parity, lifecycle banner. Fixes B1, B3, B4, B6–B12. |
| **P4 — Remaining screens** | Exhibition detail page with tabs, stalls inventory rebuilt as a bulk-edit surface, bookings and holds screens, auth screens, landing page, empty states and skeletons throughout. Fixes V5, V6 and the remaining messaging gaps. |
| **P5 — Hardening** | Tests (below), accessibility pass, error-contract audit across every route, migration dry-run on real data, README/env documentation. |

## 5. Testing

Vitest and `mongodb-memory-server` are already installed; the existing 13 tests are pure unit tests.

- **Unit** — validation schemas; the availability reducer and each `reason`; stall-number generation; grid generation geometry; overlap and canvas-fit checks; hold-resume decision as a pure function of `(hold, visitorId, now)`; booking state machine additions.
- **Integration** — against `mongodb-memory-server` started as a single-node **replica set** (transactions require one): hold resume for the same visitor, refusal for another, concurrent hold race resolving to exactly one winner, booking creation rollback on a mid-transaction failure, and delete-stall-in-use refusal. If replica-set startup proves unreliable in CI, the pure logic stays unit-tested and the gap is stated explicitly in the phase report rather than quietly skipped.
- **Not automated** — visual regression and full browser E2E. Manual verification steps are listed per phase instead.

## 6. Explicitly out of scope

Unchanged by this work, and still open afterwards: a real payment provider (the manual/mock adapter stays), Resend email templates and the outbox worker, invoice PDF generation beyond the current stub, auth-provider migration / password reset / MFA, and distributed rate limiting. These are tracked in the existing production-readiness roadmap.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The single-plan migration could lose layout work on halls that hit F5 repeatedly. | Dry-run first; re-parent orphaned elements rather than deleting; report anything ambiguous instead of guessing. |
| Adding the unique index on `stalls.floorPlanElementId` fails if duplicates exist. | Migration detects and reports duplicates before index creation. |
| Rewriting the token layer could regress the visual identity across every screen. | P1 migrates screens in the same phase as the token change, so drift is caught immediately rather than a phase later. |
| `mongodb-memory-server` replica-set startup is environment-sensitive. | Integration tests are additive; the unit layer covers the same logic. Failure is reported, not hidden. |
