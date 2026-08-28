# Milestone 2: Owner Flow, Dashboard & Design System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner a complete, professional flow — create an organization, upload and finish a floor plan, publish it — and give the organization a real dashboard (map, bookings, live holds) instead of placeholders. Establish one consistent visual design system and apply it everywhere touched.

**Architecture:** No structural change to data flow — this milestone is UI + two small new read APIs (org summary stats, active holds list). Design tokens live in `app/globals.css`; shared presentational primitives live in a new `components/ui/` folder and are reused everywhere rather than re-implemented per page.

**Tech Stack:** Same as Milestone 1, plus `next/font/google` for Space Grotesk / Inter / IBM Plex Mono (replacing Geist).

**Spec:** `docs/superpowers/plans/2026-08-28-production-readiness-roadmap.md` workstreams 1.2 (map editor completion, partial — full undo/redo history and snapping land here; §Milestone 3 is not blocked on the rest), plus the user's explicit ask: owner creates org + uploads map, organization sees the map/bookings/holds, professional UI/UX, proper validation throughout.

## Global Constraints

- **Design tokens** (from the `frontend-design` skill pass): blueprint/drafting-table theme, grounded in the product's own domain (floor plans, stall coordinates, technical drawings) rather than generic SaaS indigo.
  - Light: `--paper:#F7F5EF` `--ink:#142B42` `--ink-soft:#4C6178` `--accent:#E2963C` `--line:#D9DEE6` `--available:#2F9E6E` `--held:#E2963C` `--booked:#C1502E` `--blocked:#8A94A6`
  - Dark: `--paper:#0E1A26` `--ink:#E8EDF3` `--ink-soft:#9FB0C3` `--accent:#F0AC52` `--line:#26374A` `--available:#3FBE84` `--held:#F0AC52` `--booked:#E2694A` `--blocked:#5B6B7F`
  - Fonts: Space Grotesk (display/headings, used with restraint), Inter (body/UI), IBM Plex Mono (stall numbers, prices, timestamps, codes — numeric/coordinate data reads as technical-drawing annotation, which is literally what it is here).
  - Signature element: thin blueprint corner-registration marks (⌐ ⌐ mirrored) on focused/selected cards, and "dimension-tick" divider rules (a hairline with small perpendicular ticks at both ends) in place of plain `<hr>`/border dividers. Used consistently, not on every element — restraint per the skill.
  - Never use decorative sequence numbers (no fake "01/02/03" on cards that aren't actually a sequence) — remove the existing one on the landing page.
- Every new page/component must be legible in both light and dark (the existing `@media (prefers-color-scheme: dark)` override block in `app/globals.css` stays the mechanism — extend it, don't replace it with a different theming approach).
- Existing data-fetching pattern (`"use client"` + `useState`/`useEffect` + `fetch`) stays as-is — this milestone does not introduce a data-fetching library or Server Actions.
- All new API routes go through `requireOrganizationPermission` exactly like existing ones.

---

### Task 1: Design system foundation

**Files:**
- Modify: `app/layout.tsx` (fonts, metadata)
- Modify: `app/globals.css` (tokens, dark-mode extension, grid-paper + corner-mark + dimension-divider utility classes)
- Create: `components/ui/section-eyebrow.tsx`
- Create: `components/ui/dimension-divider.tsx`
- Create: `components/ui/status-badge.tsx`
- Create: `components/ui/stat-card.tsx`

Build the shared vocabulary once so every later task consumes it instead of reinventing ad hoc classes.

`StatusBadge` centralizes the AVAILABLE/HELD/BOOKED/BLOCKED/PENDING color mapping (today duplicated ad hoc between `components/exhibition-map/viewer.tsx:8` and `app/dashboard/stalls/page.tsx`'s plain `<span>`), using the new `--available`/`--held`/`--booked`/`--blocked` tokens instead of raw Tailwind color utilities so light/dark stay correct from one definition.

`StatCard` replaces the repeated `<div className="rounded-xl border bg-white p-5">...` pattern seen in `app/dashboard/bookings/page.tsx` and will be reused on the new dashboard home page.

---

### Task 2: Landing page redesign

**Files:**
- Modify: `app/page.tsx`

Replace the generic indigo hero and the fake "01" sequence-numbered feature cards with the blueprint-grid hero (grid-paper background, Space Grotesk display headline, corner-mark accent on the live-map preview card) and un-numbered feature list (three cards, no ordinal labels — they are not a sequence). Keep the existing content structure (hero, live-map mockup, three features, CTA, footer) and copy's substance; rewrite the visual treatment and class names.

---

### Task 3: Fix the auth-form JSON-dump bug and redesign login/register

**Files:**
- Modify: `app/(auth)/login/page.tsx`
- Modify: `app/(auth)/register/page.tsx`

**Bug found while reading these files**: both are plain `<form action="/api/auth/login" method="post">` HTML posts. `app/api/auth/login/route.ts:18-20` and `app/api/auth/register/route.ts` (Task 3 of Milestone 1) only `redirect` when the request's `content-type` is *not* `application/json` — but on a validation or credential *error*, both routes return `NextResponse.json({ error })` regardless of content type. A plain form POST that fails renders raw `{"error":"..."}` JSON in the browser instead of the login/register page with an error message. Fix by converting both pages to client components using the same `fetch` + `useState` error pattern already used everywhere else in the app (e.g. `app/dashboard/organizations/new/page.tsx`), and redesign visually with the new tokens.

---

### Task 4: Org creation page redesign

**Files:**
- Modify: `app/dashboard/organizations/new/page.tsx`

Keep the existing `fetch` logic; apply the new visual language (Space Grotesk heading, dimension-divider under the intro, corner-marked form card).

---

### Task 5: Dashboard shell redesign

**Files:**
- Modify: `app/dashboard/layout.tsx`

Redesign the header/nav with the new palette and an active-route indicator (compare `usePathname()`... but this is a Server Component today — keep it a Server Component and use a small client `NavLinks` subcomponent for the active-state, since only that part needs client interactivity).

- [ ] Create `components/dashboard/nav-links.tsx` as a client component reading `usePathname()` to underline/highlight the current section.
- [ ] Update `app/dashboard/layout.tsx` to use it and the new token classes.

---

### Task 6: Dashboard home page with real stats

**Files:**
- Create: `app/api/organizations/[organizationId]/summary/route.ts`
- Modify: `app/dashboard/page.tsx`

The dashboard home is currently static placeholder text (`app/dashboard/page.tsx:1-3`). Add a real summary endpoint and render it.

```ts
// app/api/organizations/[organizationId]/summary/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "exhibition:view");
  const database = await getDatabase();
  const orgId = new ObjectId(organizationId);

  const [exhibitionCount, stallCounts, bookingAgg, activeHolds] = await Promise.all([
    database.collection("exhibitions").countDocuments({ organizationId: orgId }),
    database.collection("stalls").aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]).toArray(),
    database.collection("bookings").aggregate([
      { $match: { organizationId: orgId, status: { $in: ["PAYMENT_PENDING", "CONFIRMED"] } } },
      { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$commercialSnapshot.total" } } },
    ]).toArray(),
    database.collection("reservationHolds").countDocuments({ organizationId: orgId, status: "ACTIVE", expiresAt: { $gt: new Date() } }),
  ]);

  const stallsByStatus = Object.fromEntries(stallCounts.map((row) => [row._id, row.count]));
  const bookingsByStatus = Object.fromEntries(bookingAgg.map((row) => [row._id, { count: row.count, total: row.total }]));
  const totalStalls = stallCounts.reduce((sum, row) => sum + row.count, 0);
  const bookedStalls = stallsByStatus.BOOKED ?? 0;

  return NextResponse.json({
    exhibitionCount,
    totalStalls,
    occupancyRate: totalStalls ? Math.round((bookedStalls / totalStalls) * 100) : 0,
    stallsByStatus,
    activeHolds,
    pendingBookings: bookingsByStatus.PAYMENT_PENDING?.count ?? 0,
    confirmedBookings: bookingsByStatus.CONFIRMED?.count ?? 0,
    grossConfirmed: bookingsByStatus.CONFIRMED?.total ?? 0,
  });
}
```

Rewrite `app/dashboard/page.tsx` as a client component: load `/api/me/organizations`, then this summary endpoint for the first org (same pattern as every other dashboard page), and render `StatCard`s for exhibitions, stalls (available/held/booked breakdown via `StatusBadge`), occupancy rate, active holds, pending vs confirmed bookings, and gross confirmed value — plus quick links to Exhibitions/Stalls/Bookings/Holds.

---

### Task 7: Live holds dashboard (new)

**Files:**
- Create: `app/api/organizations/[organizationId]/holds/route.ts`
- Create: `app/dashboard/holds/page.tsx`
- Modify: `app/dashboard/layout.tsx` (nav link)
- Modify: `components/dashboard/nav-links.tsx` (nav link entry)

The user explicitly asked for the organization to "get all the bookings and holding information" — bookings already have a dashboard page; holds do not. Add one.

```ts
// app/api/organizations/[organizationId]/holds/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireOrganizationPermission } from "@/lib/auth/authorization";
import { getDatabase } from "@/lib/db/client";
import type { ReservationHoldDocument } from "@/models/booking";
import type { StallDocument } from "@/models/stall";
import type { ExhibitionDocument } from "@/models/exhibition";

export async function GET(_: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  await requireOrganizationPermission(organizationId, "booking:view");
  const database = await getDatabase();
  const holds = await database.collection<ReservationHoldDocument>("reservationHolds")
    .find({ organizationId: new ObjectId(organizationId), status: "ACTIVE" })
    .sort({ expiresAt: 1 })
    .limit(200)
    .toArray();
  const enriched = await Promise.all(holds.map(async (hold) => {
    const [stall, exhibition] = await Promise.all([
      database.collection<StallDocument>("stalls").findOne({ _id: hold.stallId }),
      database.collection<ExhibitionDocument>("exhibitions").findOne({ _id: hold.exhibitionId }),
    ]);
    return { ...hold, stall: stall ? { stallNumber: stall.stallNumber, basePrice: stall.basePrice, currency: stall.currency } : null, exhibition: exhibition ? { name: exhibition.name, slug: exhibition.slug } : null };
  }));
  return NextResponse.json({ holds: enriched });
}
```

`app/dashboard/holds/page.tsx`: client component, same org-selector pattern as `app/dashboard/bookings/page.tsx`, table of stall number / exhibition / live countdown (reuse the countdown math from `app/(public)/exhibitions/[exhibitionSlug]/book/[stallId]/page.tsx:9`) / expires-at. No release action in this milestone — releasing early is a Milestone-3-adjacent policy decision (does releasing refund/notify?) out of scope here; the expiry job already reclaims it automatically.

---

### Task 8: Bookings page — show exhibitor/stall detail, add invoice link, redesign

**Files:**
- Modify: `app/dashboard/bookings/page.tsx`

The API (`app/api/organizations/[organizationId]/bookings/route.ts`) already returns `exhibitor` and `stall` on every booking — the page's `Booking` type and table never surface them. Add columns for company name / contact / stall number, and a "Download invoice" link to `/api/organizations/{organizationId}/invoices/{invoiceId}` once an invoice exists (the bookings list endpoint does not currently return `invoiceId` — add it there too, joining `invoices` by `bookingId`). Apply the new visual system (`StatCard`, `StatusBadge`, dimension dividers).

---

### Task 9: Floor-plan upload UX

**Files:**
- Modify: `app/dashboard/exhibitions/[exhibitionId]/halls/[hallId]/map/setup/page.tsx`

Add drag-and-drop onto the file input, an image preview (for image MIME types; SVG shows an inline preview too since browsers render `<img src>` for SVG), and a visible upload progress state distinct from "creating floor plan" (currently one combined status string). Redesign visually.

---

### Task 10: Map editor — finish the interaction set

**Files:**
- Modify: `app/dashboard/exhibitions/[exhibitionId]/halls/[hallId]/map/edit/page.tsx`

Current editor (`Editor` component) only supports single-element drag-move and drag-resize. Add, in the existing client-state + PATCH-on-release pattern (no architecture change):

- **Multi-select**: shift-click toggles an element in/out of a `Set<string>` selection; plain click replaces the selection with just that element.
- **Delete**: `Delete`/`Backspace` key removes every selected element via the existing `DELETE /api/organizations/{organizationId}/floor-plans/{floorPlanId}/elements/{elementId}` route (already implemented, just never called from the UI) — call it once per selected id, then drop them from local state.
- **Snap-to-grid**: a toggle in the toolbar; when on, round `x`/`y` (and resize deltas) to the nearest 10 logical units before applying, both during drag and on release.
- **Rotate**: a second small handle (top-right) that changes `geometry.rotation` on drag, in 15° increments unless Shift is held (free rotation) — mirrors the existing resize-handle drag pattern.
- **Undo/redo**: a simple linear command stack (array of `{elements: Element[]}` snapshots) pushed on every completed drag/rotate/delete/add, with `Ctrl+Z`/`Ctrl+Shift+Z` (or `Cmd` on Mac) popping/repushing and calling PATCH for every element that differs from the current server state after the jump.
- **Arrow-key nudge**: with exactly one element selected and focus inside the canvas, arrow keys move it 1 logical unit (10 with Shift), saved on key-up via the existing `save()` PATCH helper.

Redesign the toolbar and property panel with the new tokens; the canvas grid becomes visible (faint grid lines at the snap interval) when snap-to-grid is on.

---

### Task 11: Map viewer polish

**Files:**
- Modify: `components/exhibition-map/viewer.tsx`

Replace the ad hoc `colors` map (`viewer.tsx:8`) with the shared `StatusBadge` token colors so the legend and the map render identical colors. Add a visible legend (today the public exhibition page has none — only the booking page's own status colors, undocumented). Add click-and-drag panning (currently only scrollbar panning via `overflow-auto`) using pointer events, without removing the existing zoom buttons.

---

### Task 12: Public exhibition + booking page redesign

**Files:**
- Modify: `app/(public)/exhibitions/[exhibitionSlug]/page.tsx`
- Modify: `app/(public)/exhibitions/[exhibitionSlug]/book/[stallId]/page.tsx`

Apply the same design tokens for visual consistency between the dashboard and the public-facing pages (the brief asks for one consistent look). Add the legend from Task 11 to the public page. On the booking page, add inline field-level validation (email format, required-field messages) before submit rather than relying solely on the server's Zod error, and make the countdown visually match the dimension/blueprint theme (e.g. styled like a technical timer readout in the mono face).

---

### Task 13: Verification pass

- [ ] `npm run lint` — no errors
- [ ] `npm run typecheck` — no errors
- [ ] `npm test` — all existing tests still pass (this milestone adds no new pure-logic units, so no new test files are expected; note that in the Self-Review)
- [ ] `npm run build` — succeeds
- [ ] Manual browser pass (`npm run dev` + Playwright) of: landing page, login/register error states, dashboard home, holds page, bookings page, map editor (multi-select/delete/undo), public exhibition page — screenshot each in light and dark to confirm the token system renders correctly in both.

## Execution Addendum (found during implementation)

A live browser test of the redesigned login page (submitting bad credentials with no MongoDB connection available in the dev sandbox) surfaced a real, pre-existing bug: `app/api/auth/login/route.ts` throws inside `getDatabase()` before it can produce a JSON body, so the client's `await response.json()` throws on the empty body, and — because none of the mutating fetch call sites across the app wrapped that parse in a try/catch — the submit button was left stuck on its "saving" label forever, with no error shown. Added `lib/http/client.ts`'s `parseJsonResponse()` (always returns a typed object with an `error` field, using a clear fallback message instead of throwing on an unparseable body) and applied it to every mutating fetch call site touched by this milestone: login, register, org creation, exhibition lifecycle transitions, stall create/update, map element save/add, and public hold/booking submission. Verified the fix live: the button now correctly re-enables and shows "Request failed (500). Please try again." instead of hanging.

## Self-Review Notes

- **Scope note**: this is a UI-heavy milestone; unlike Milestone 1, tasks above are specified at the file/behavior/interface level rather than as literal step-by-step code for every JSX line — the volume of markup involved makes a fully literal bite-sized breakdown impractical to author by hand without duplicating the entire implementation in the plan document itself. Each task still names exact files, exact new API contracts (Tasks 6–7), and exact interaction behavior (Task 10) so an implementer isn't guessing.
- **No new pure-logic test surface**: Tasks 1–12 are UI/API-glue; the two new routes (Task 6, 7) are thin aggregation/read endpoints without branching business logic worth unit-testing in isolation — they're covered by the Task 13 manual pass instead. If a bug surfaces in them later, add a regression test at that point.
