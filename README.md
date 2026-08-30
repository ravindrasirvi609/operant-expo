# Operant Expo

Exhibition and stall-booking SaaS. Organizers design interactive hall floor plans, publish them, and
take stall reservations; visitors book from the public map or an embeddable widget.

Next.js 16 (App Router) · React 19 · TypeScript · MongoDB (native driver) · Zod · Tailwind 4 ·
shadcn/ui.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in MONGODB_URI
npm run dev
```

### MongoDB must be a replica set

Booking, publishing and stall creation run inside transactions, which MongoDB only supports on a
replica set. A standalone `mongod` will fail at the first write. Use Atlas, or run a single-node
replica set locally:

```bash
mongod --replSet rs0 --dbpath ./.mongo-data
mongosh --eval 'rs.initiate()'
# MONGODB_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0
```

### Environment

`.env.example` lists everything. Only `MONGODB_URI` is required to boot.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | Replica-set connection string. |
| `MONGODB_DB_NAME` | no | Defaults to `operant_expo`. |
| `JOB_SECRET` | for jobs | Shared secret for `/api/internal/jobs/*`, including the migration below. |
| `PAYMENT_WEBHOOK_SECRET` | for payments | Guards the manual payment webhook. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | no | Outbound email. Unset means email events queue but do not send. |
| `CLOUDFLARE_*`, `NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL` | no | R2 object storage for floor-plan backgrounds. |
| `ASSET_STORAGE_DIR` | no | Where uploads go when R2 is unconfigured. Defaults to `.uploads/`. |
| `HOLD_DURATION_MINUTES` | no | How long a visitor's stall reservation lasts. Defaults to 15. |

**Background images are optional.** With no R2 configuration, uploads fall back to the local
filesystem and are served from `/api/assets/*`; a floor plan can also be created with no background
at all and stalls placed directly on the grid.

## The organizer flow

1. **Exhibition** — create it (starts as a private draft) at `/dashboard/exhibitions`.
2. **Hall** — add at least one. Its width and depth are in **metres**.
3. **Floor plan** — `/dashboard/exhibitions/{exhibitionId}/halls/{hallId}/plan` is a four-step
   wizard: canvas → layout → inventory → publish. The grid generator creates a whole block of
   numbered, priced stalls in one action.
4. **Publish the plan** — refused until the readiness checklist passes, so a plan visitors cannot
   book from never reaches them.
5. **Open booking** — publishing the *exhibition* makes the map visible; opening booking is a
   separate step, and until it is taken visitors can browse stalls but not reserve them. The public
   page says which of those two states it is in rather than letting a click fail.

### How a visitor books

Selecting a stall opens a detail sheet — number, size, price, what is included — and reserves
nothing. "Reserve" then holds it for them, identified by an anonymous httpOnly cookie, and the
three-step flow (review → details → submitted) ends on a booking that is explicitly *awaiting
payment*, not confirmed.

Because the hold has an owner, reloading or coming back resumes the same reservation instead of
locking the visitor out of it; another visitor is told how long is left. Lapsed holds are swept on
every public read, so the map does not advertise stalls that are not really free.

### Units

Hall dimensions are metres. Floor-plan geometry is stored in **plan units at 20 units per metre**,
so a 40 × 25 m hall gets an 800 × 500 canvas and a 3 m stall is 60 units wide. The editor labels its
rulers in metres; nothing in the UI asks you to think in plan units.

### One floor plan per hall

A hall has exactly one plan, promoted `DRAFT → PUBLISHED` in place, and a stall is created together
with its rectangle in a single transaction. Deployments written by an earlier version may hold
several versioned plans per hall, or stalls pointing at elements from an old version. Collapse them
with the migration, which is a dry run by default:

```bash
curl -X POST localhost:3000/api/internal/jobs/migrate-floor-plans \
  -H "x-job-secret: $JOB_SECRET" -H 'content-type: application/json' -d '{}'
# review the reported actions, then:
curl -X POST localhost:3000/api/internal/jobs/migrate-floor-plans \
  -H "x-job-secret: $JOB_SECRET" -H 'content-type: application/json' -d '{"apply":true}'
```

It never deletes a stall. Anything it cannot resolve safely — two stalls claiming one rectangle, a
stall whose rectangle no longer exists — is reported for a human to decide. Restart the app
afterwards so the unique indexes can be created; until then boot logs a warning naming the blocker.

### Scheduled jobs

`POST /api/internal/jobs/expire-holds` releases lapsed reservations. Public reads also sweep expired
holds, so the map stays honest if the schedule lapses, but run it regularly in production.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` | Production build (also typechecks). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` | Vitest. |

## Where things live

```
app/api/                  Route handlers — the only API surface
app/dashboard/            Organizer screens
app/(public)/, app/embed/ Visitor-facing map and booking
components/ui/            shadcn primitives on the blueprint palette
components/floor-plan/    The plan wizard and its editor canvas
lib/floor-plans/          Geometry, units and the transactional plan service
lib/http/                 JSON response contract and the client that consumes it
lib/validation/           Zod schemas shared by forms and routes
lib/db/migrations/        Data migrations, dry-run by default
models/                   MongoDB document shapes
```

Conventions worth knowing before changing code: routes validate with Zod and answer through
`lib/http/responses.ts`; clients call `apiRequest` from `lib/http/client.ts`, which never throws;
forms share their route's schema via `useZodForm`. `AGENTS.md` covers the Next.js specifics.
